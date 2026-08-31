import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../config/database';
import { posService } from '../services/posService';

const router = Router();

// HMAC-SHA256 Signature Verifier
function verifyHmac(payload: Buffer | string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  try {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(payload).digest('hex');
    const digestBuf = Buffer.from(digest, 'hex');
    const sigBuf = Buffer.from(signature, 'hex');

    if (digestBuf.length !== sigBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(digestBuf, sigBuf);
  } catch {
    return false;
  }
}

// Health check
router.get(['/', '/webhook'], (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'INVI POS Webhook Receiver',
    supportedEvents: [
      'stock.changed',
      'inventory.updated',
      'order.status.changed',
      'order.status_updated',
      'order.sell_created',
      'product.created',
      'product.updated'
    ],
    timestamp: new Date().toISOString()
  });
});

// Webhook Receiver Endpoint
router.post(['/', '/webhook'], async (req: any, res: Response) => {
  const startTime = Date.now();
  let syncStatus = 'SUCCESS';
  let errorMessage: string | null = null;

  try {
    const signature = req.headers['x-invi-signature'] as string;
    const secret = process.env.INVI_WEBHOOK_SECRET || '';

    // Verify HMAC if secret is configured
    if (secret && signature) {
      const payloadToVerify = req.rawBody || JSON.stringify(req.body);
      const isValid = verifyHmac(payloadToVerify, signature, secret);
      if (!isValid) {
        return res.status(401).json({ success: false, error: 'Invalid HMAC signature' });
      }
    }

    const { event, data } = req.body;
    if (!event || !data) {
      return res.status(400).json({ success: false, error: 'Event and data required' });
    }

    // Process Invi Events
    switch (event) {
      case 'stock.changed':
      case 'inventory.updated': {
        const { sku, stock, id } = data;
        const target = sku || id;
        if (target && stock !== undefined) {
          const stockVal = Math.max(0, parseInt(String(stock), 10));
          await posService.updateStock(String(target), stockVal);
        }
        break;
      }

      case 'order.status.changed':
      case 'order.status_updated': {
        const { id, order_id, status } = data;
        const targetId = id || order_id;
        if (targetId && status) {
          await posService.updateOrderStatus(String(targetId), {
            status: String(status).toUpperCase(),
            notes: 'Status updated via Invi POS webhook'
          });
        }
        break;
      }

      case 'order.sell_created': {
        // Counter sales at POS - atomically decrement e-commerce inventory
        const items = data.items || [];
        for (const item of items) {
          const sku = item.sku || item.id;
          const qty = parseInt(String(item.qty || item.quantity || 1), 10);
          if (!sku || qty <= 0) continue;

          await prisma.$transaction(async (tx: any) => {
            const variant = await tx.productVariant.findFirst({ where: { sku } });
            if (variant) {
              const newVarStock = Math.max(0, variant.stock - qty);
              await tx.productVariant.update({
                where: { id: variant.id },
                data: { stock: newVarStock }
              });

              // Recalculate parent product stock
              const siblings = await tx.productVariant.findMany({
                where: { productId: variant.productId },
                select: { stock: true }
              });
              const aggStock = siblings.reduce((acc: number, s: any) => acc + s.stock, 0);
              await tx.product.update({
                where: { id: variant.productId },
                data: { stock: aggStock }
              });
            } else {
              const product = await tx.product.findFirst({
                where: { OR: [{ sku }, { id: sku }] }
              });
              if (product) {
                const newStock = Math.max(0, product.stock - qty);
                await tx.product.update({
                  where: { id: product.id },
                  data: { stock: newStock }
                });
              }
            }
          });
        }
        break;
      }
    }

    res.status(200).json({ success: true, message: `Event '${event}' processed successfully.` });
  } catch (err: any) {
    syncStatus = 'FAILED';
    errorMessage = err.message || 'Webhook processing failed';
    res.status(500).json({ success: false, error: errorMessage });
  } finally {
    // Record webhook event telemetry
    prisma.inviSyncLog.create({
      data: {
        type: 'WEBHOOK',
        status: syncStatus,
        itemsCount: 1,
        requestBody: req.body,
        errorMessage,
        durationMs: Date.now() - startTime
      }
    }).catch(() => {});
  }
});

export default router;
