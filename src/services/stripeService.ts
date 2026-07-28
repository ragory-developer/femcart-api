import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class StripeService {
  /**
   * Dynamically fetch the Stripe client using credentials from DB or Env
   */
  private async getClient() {
    const setting = await prisma.setting.findUnique({
      where: { key: 'stripe_secret_key' }
    });
    const secret = setting?.value || process.env.STRIPE_SECRET_KEY || 'sk_test_default';
    return new Stripe(secret, { 
      apiVersion: '2023-10-16' as any,
      httpClient: Stripe.createNodeHttpClient()
    });
  }

  /**
   * Validate a Stripe Secret Key by attempting to retrieve balance
   */
  async validateKey(secretKey: string): Promise<boolean> {
    try {
      const stripe = new Stripe(secretKey, {
        apiVersion: '2023-10-16' as any,
        httpClient: Stripe.createNodeHttpClient(),
      });
      // A lightweight call that requires authentication
      await stripe.balance.retrieve();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create a Stripe Checkout Session for an Order (Legacy Redirect)
   */
  async createCheckoutSession(orderId: string, amount: number, currency: string = 'usd') {
    const stripe = await this.getClient();
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency,
              product_data: { name: `Femcart Order #${orderId}` },
              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/order-success?orderId=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout?canceled=true`,
        metadata: { orderId },
      });
      return { url: session.url, sessionId: session.id };
    } catch (error) {
      console.error('Error creating Stripe Checkout Session:', error);
      throw new Error('Failed to create payment session');
    }
  }

  /**
   * Create a PaymentIntent for native Elements integration
   */
  async createPaymentIntent(orderId: string, amount: number, currency: string = 'usd') {
    const stripe = await this.getClient();
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency,
        metadata: { orderId },
        automatic_payment_methods: { enabled: true },
      });
      return { clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id };
    } catch (error) {
      console.error('Error creating Stripe Payment Intent:', error);
      throw new Error('Failed to create payment intent');
    }
  }

  /**
   * Handle Webhooks from Stripe to update Order Status
   */
  async handleWebhook(body: any, signature: string) {
    const stripe = await this.getClient();
    const webhookSetting = await prisma.setting.findUnique({ where: { key: 'stripe_webhook_secret' } });
    const endpointSecret = webhookSetting?.value || process.env.STRIPE_WEBHOOK_SECRET || '';
    try {
      const event = stripe.webhooks.constructEvent(body, signature, endpointSecret);

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        if (orderId) {
          await prisma.order.update({
            where: { id: orderId },
            data: { paymentStatus: 'PAID', paymentMethod: 'STRIPE', paymentId: session.id },
          });
        }
      } else if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const orderId = paymentIntent.metadata?.orderId;
        if (orderId) {
          await prisma.order.update({
            where: { id: orderId },
            data: { paymentStatus: 'PAID', paymentMethod: 'STRIPE', paymentId: paymentIntent.id },
          });
        }
      }
      return { received: true };
    } catch (err: any) {
      console.error(`Webhook Error: ${err.message}`);
      throw new Error(`Webhook Error: ${err.message}`);
    }
  }
}

export const stripeService = new StripeService();
