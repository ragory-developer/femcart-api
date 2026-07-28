import { Router } from 'express';
import { PaymentController } from '../controllers/PaymentController';
import { authenticate } from '../middleware/auth';

const router = Router();
const controller = new PaymentController();

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Payment processing
 */

/**
 * @swagger
 * /api/payments/process:
 *   post:
 *     summary: Process payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment processed
 */
router.post('/process', authenticate, controller.processPayment);

// Stripe
router.post('/stripe/create-session', authenticate, controller.createStripeSession);
// Webhook should not be authenticated via JWT, it uses Stripe Signature
router.post('/stripe/webhook', controller.stripeWebhook);

// PayPal
router.post('/paypal/create-order', authenticate, controller.createPayPalOrder);
router.post('/paypal/capture-order', authenticate, controller.capturePayPalOrder);

export default router;
