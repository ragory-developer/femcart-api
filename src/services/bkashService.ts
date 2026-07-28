const { BkashGateway } = require('bkash-payment-gateway');
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class BkashService {
  private async getGateway(config?: { key: string, secret: string, username: string, password: string, is_live: boolean }) {
    let bkash_app_key = config?.key || process.env.BKASH_APP_KEY || '';
    let bkash_app_secret = config?.secret || process.env.BKASH_APP_SECRET || '';
    let bkash_username = config?.username || process.env.BKASH_USERNAME || '';
    let bkash_password = config?.password || process.env.BKASH_PASSWORD || '';
    let is_live = config?.is_live || false;

    if (!config) {
      const settings = await prisma.setting.findMany({
        where: { key: { in: ['bkash_app_key', 'bkash_app_secret', 'bkash_username', 'bkash_password', 'bkash_is_live'] } }
      });
      settings.forEach((s: any) => {
        if (s.key === 'bkash_app_key') bkash_app_key = s.value;
        if (s.key === 'bkash_app_secret') bkash_app_secret = s.value;
        if (s.key === 'bkash_username') bkash_username = s.value;
        if (s.key === 'bkash_password') bkash_password = s.value;
        if (s.key === 'bkash_is_live') is_live = s.value === 'true';
      });
    }

    const bkashConfig = {
      baseURL: is_live ? 'https://checkout.pay.bka.sh/v1.2.0-beta' : 'https://checkout.sandbox.bka.sh/v1.2.0-beta',
      key: bkash_app_key,
      secret: bkash_app_secret,
      username: bkash_username,
      password: bkash_password,
    };
    
    return new BkashGateway(bkashConfig);
  }

  async validateKey(appKey: string, appSecret: string, username: string, password: string, is_live: boolean) {
    try {
      const bkash = await this.getGateway({ key: appKey, secret: appSecret, username, password, is_live });
      // To validate, we can just try to hit an endpoint that requires auth, or rely on internal auth fetch
      // But creating a payment fails early if auth fails. We can pass fake data to see if it fails auth or validation
      await bkash.createPayment({
        amount: '1',
        currency: 'BDT',
        intent: 'sale',
        merchantInvoiceNumber: 'TEST_VALIDATE_' + Date.now(),
        callbackURL: 'http://localhost/callback',
      });
      return true;
    } catch (error: any) {
      // If it throws Invalid Configuration or Authentication failed
      return false;
    }
  }

  async createPayment(orderId: string, amount: number) {
    const bkash = await this.getGateway();
    const API_URL = process.env.API_URL || 'http://localhost:5000';
    
    try {
      const response = await bkash.createPayment({
        amount: String(amount),
        currency: 'BDT',
        intent: 'sale',
        merchantInvoiceNumber: orderId,
        callbackURL: `${API_URL}/api/orders/payment/bkash/callback`,
      });
      return { url: response.bkashURL, paymentID: response.paymentID };
    } catch (error) {
      console.error('bKash Init Error:', error);
      throw new Error('Payment initialization failed');
    }
  }

  async executePayment(paymentID: string) {
    const bkash = await this.getGateway();
    
    try {
      const response = await bkash.executePayment(paymentID);
      return response;
    } catch (error) {
      console.error('bKash Execute Error:', error);
      throw new Error('Payment execution failed');
    }
  }
}

export const bkashService = new BkashService();
