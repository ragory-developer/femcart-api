import { Router, Request, Response } from 'express';
import { InviWebhookService } from '../services/inviWebhookService';
import { getSetting, getSettingBool } from '../utils/settings';
import logger from '../utils/logger';

const router = Router();

/**
 * Health check & supported events diagnostic for INVI POS
 */
router.get(['/', '/webhook'], async (_req: Request, res: Response) => {
  const isMasterEnabled = await getSettingBool('invi_master_enabled', true);
  const isWebhookEnabled = await getSettingBool('invi_webhook_enabled', true);

  res.status(200).json({
    status: 'ok',
    service: 'INVI POS Webhook Receiver',
    masterEnabled: isMasterEnabled,
    webhookEnabled: isWebhookEnabled,
    supportedEvents: [
      'stock.changed',
      'inventory.updated',
      'product.stock_updated',
      'stock.batch_update',
      'inventory.bulk_sync',
      'order.status.changed',
      'order.status_updated',
      'order.shipped',
      'order.delivered',
      'order.cancelled',
      'order.returned',
      'order.created',
      'order.sell_created',
      'product.created',
      'product.updated',
      'product.price_changed',
      'product.deleted'
    ],
    timestamp: new Date().toISOString()
  });
});

/**
 * Public Webhook Receiver for INVI POS Server-to-Server Events
 * Header: x-invi-signature (HMAC-SHA256 of raw body with DB invi_webhook_secret)
 */
router.post(['/', '/webhook'], async (req: Request, res: Response) => {
  try {
    const isMasterEnabled = await getSettingBool('invi_master_enabled', true);
    if (!isMasterEnabled) {
      return res.status(403).json({
        success: false,
        error: 'INVI POS Integration is globally disabled.'
      });
    }

    const isWebhookEnabled = await getSettingBool('invi_webhook_enabled', true);
    if (!isWebhookEnabled) {
      return res.status(403).json({
        success: false,
        error: 'INVI Webhook Receiver is disabled in admin settings.'
      });
    }

    // Dynamic Secret from Database Settings
    const configuredSecret = await getSetting('invi_webhook_secret', process.env.INVI_WEBHOOK_SECRET || 'femcart_invi_webhook_secret_2026');
    const signature = (req.headers['x-invi-signature'] || req.headers['x-signature']) as string;

    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    if (configuredSecret && signature) {
      const isValid = InviWebhookService.verifySignature(rawBody, signature, configuredSecret);
      if (!isValid) {
        logger.warn('[InviWebhook] Invalid HMAC signature received', { signature });
        return res.status(401).json({
          success: false,
          error: 'Invalid webhook signature.'
        });
      }
    }

    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const result = await InviWebhookService.handleWebhookEvent(payload);

    return res.status(result.success ? 200 : 400).json(result);
  } catch (error: any) {
    logger.error('[InviWebhook] Error processing webhook:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error processing webhook.'
    });
  }
});

export default router;
