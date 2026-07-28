// @ts-ignore
import paypal from '@paypal/checkout-server-sdk';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class PayPalService {
  /**
   * Dynamically get the PayPal client using settings from DB or Env
   */
  private async getClient() {
    const settings = await prisma.setting.findMany({
      where: { key: { in: ['paypal_client_id', 'paypal_client_secret', 'paypal_is_live'] } }
    });
    
    let clientId = process.env.PAYPAL_CLIENT_ID || 'sandbox_client_id';
    let clientSecret = process.env.PAYPAL_CLIENT_SECRET || 'sandbox_client_secret';
    let isLive = process.env.NODE_ENV === 'production';
    
    for (const setting of settings) {
      if (setting.key === 'paypal_client_id' && setting.value) clientId = setting.value;
      if (setting.key === 'paypal_client_secret' && setting.value) clientSecret = setting.value;
      if (setting.key === 'paypal_is_live') isLive = setting.value === 'true';
    }
    
    const environment = isLive
      ? new paypal.core.LiveEnvironment(clientId, clientSecret)
      : new paypal.core.SandboxEnvironment(clientId, clientSecret);
      
    return new paypal.core.PayPalHttpClient(environment);
  }

  async validateKey(clientId: string, clientSecret: string, isLive: boolean) {
    const environment = isLive
      ? new paypal.core.LiveEnvironment(clientId, clientSecret)
      : new paypal.core.SandboxEnvironment(clientId, clientSecret);
      
    const client = new paypal.core.PayPalHttpClient(environment);
    try {
      // Create a dummy request to get an access token
      // The PayPalHttpClient automatically handles authorization for any API call.
      // Alternatively, we can manually create an Auth request
      const request = new paypal.core.AccessTokenRequest(environment);
      await client.execute(request);
      return true;
    } catch (e: any) {
      return false;
    }
  }

  /**
   * Create an Order in PayPal
   */
  async createOrder(orderId: string, amount: number, currency: string = 'USD') {
    const client = await this.getClient();
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: orderId,
          amount: {
            currency_code: currency,
            value: amount.toFixed(2), // PayPal expects string with 2 decimals
          },
          description: `Femcart Order #${orderId}`,
        },
      ],
    });

    try {
      const response = await client.execute(request);
      return {
        id: response.result.id, // PayPal Order ID
        status: response.result.status,
        links: response.result.links, // Used by frontend to approve
      };
    } catch (err: any) {
      console.error('Error creating PayPal Order:', err);
      throw new Error('Failed to create PayPal order');
    }
  }

  /**
   * Capture the funds after user approves
   */
  async capturePayment(paypalOrderId: string, femcartOrderId: string) {
    const client = await this.getClient();
    const request = new paypal.orders.OrdersCaptureRequest(paypalOrderId);
    request.requestBody({});

    try {
      const response = await client.execute(request);
      
      if (response.result.status === 'COMPLETED') {
        // Update local DB
        await prisma.order.update({
          where: { id: femcartOrderId },
          data: {
            paymentStatus: 'PAID',
            paymentMethod: 'PAYPAL',
            paymentId: paypalOrderId,
          },
        });
        return { success: true, captureId: response.result.id };
      }
      return { success: false, status: response.result.status };
    } catch (err: any) {
      console.error('Error capturing PayPal payment:', err);
      throw new Error('Failed to capture PayPal payment');
    }
  }
}

export const paypalService = new PayPalService();
