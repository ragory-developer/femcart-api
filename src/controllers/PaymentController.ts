import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { BadRequestError } from '../utils/errors';
import { asyncHandler } from '../utils/helpers';
import logger from '../utils/logger';
import { BaseController } from './BaseController';
import { stripeService } from '../services/stripeService';
import { paypalService } from '../services/paypalService';
import express from 'express';

/**
 * Mock payment controller.
 * Simulates payment processing without real gateway integration.
 */
export class PaymentController extends BaseController {
  processPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orderId, paymentMethod, amount } = req.body;

    if (!orderId || !amount) {
      throw new BadRequestError('Order ID and amount are required');
    }

    logger.info('Processing mock payment', { orderId, paymentMethod, amount, userId: req.user!.userId });

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Mock: 95% success rate
    const success = Math.random() > 0.05;

    if (success) {
      res.json({
        success: true,
        data: {
          transactionId: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
          status: 'SUCCESS',
          amount,
          paymentMethod: paymentMethod || 'CARD',
          paidAt: new Date().toISOString(),
        },
      });
    } else {
      res.status(402).json({
        success: false,
        message: 'Payment failed. Please try again.',
        data: { status: 'FAILED' },
      });
    }
  });

  // --- STRIPE ENDPOINTS ---

  createStripeSession = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orderId, amount } = req.body;
    if (!orderId || !amount) {
      throw new BadRequestError('Order ID and amount are required');
    }
    const session = await stripeService.createCheckoutSession(orderId, amount);
    res.json({ success: true, url: session.url, sessionId: session.sessionId });
  });

  stripeWebhook = async (req: express.Request, res: Response) => {
    // Stripe requires the raw body for signature verification.
    // In a real app, ensure express.raw() is applied to this route in index.ts or router.ts.
    const sig = req.headers['stripe-signature'] as string;
    try {
      await stripeService.handleWebhook(req.body, sig);
      res.status(200).send('Webhook handled');
    } catch (err: any) {
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  };

  // --- PAYPAL ENDPOINTS ---

  createPayPalOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orderId, amount } = req.body;
    if (!orderId || !amount) {
      throw new BadRequestError('Order ID and amount are required');
    }
    const order = await paypalService.createOrder(orderId, amount);
    res.json({ success: true, data: order });
  });

  capturePayPalOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { paypalOrderId, femcartOrderId } = req.body;
    if (!paypalOrderId || !femcartOrderId) {
      throw new BadRequestError('paypalOrderId and femcartOrderId are required');
    }
    const result = await paypalService.capturePayment(paypalOrderId, femcartOrderId);
    if (result.success) {
      res.json({ success: true, data: result });
    } else {
      res.status(400).json({ success: false, message: 'Failed to capture payment', data: result });
    }
  });
}
