import NagadGateway from 'nagad-payment-gateway';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class NagadService {
  private async getCredentials() {
    const settings = await prisma.setting.findMany({
      where: { key: { in: ['nagad_merchant_id', 'nagad_merchant_number', 'nagad_public_key', 'nagad_private_key', 'nagad_is_live'] } }
    });
    
    let merchantID = process.env.NAGAD_MERCHANT_ID || '';
    let merchantNumber = process.env.NAGAD_MERCHANT_NUMBER || '';
    let pubKey = process.env.NAGAD_PUBLIC_KEY || '';
    let privKey = process.env.NAGAD_PRIVATE_KEY || '';
    let isLive = false;

    settings.forEach((s: any) => {
      if (s.key === 'nagad_merchant_id') merchantID = s.value;
      if (s.key === 'nagad_merchant_number') merchantNumber = s.value;
      if (s.key === 'nagad_public_key') pubKey = s.value;
      if (s.key === 'nagad_private_key') privKey = s.value;
      if (s.key === 'nagad_is_live') isLive = s.value === 'true';
    });

    return { merchantID, merchantNumber, pubKey, privKey, isLive };
  }

  async validateKey(merchantID: string, merchantNumber: string, pubKey: string, privKey: string, isLive: boolean) {
    const nagad = new NagadGateway({
      baseURL: isLive ? 'https://api.mynagad.com' : 'http://sandbox.mynagad.com:10080',
      merchantID,
      merchantNumber,
      pubKey,
      privKey,
      callbackURL: 'http://localhost/callback',
      apiVersion: 'v-0.2.0',
      isPath: false
    });

    try {
      // The crypto layer will throw if keys are malformed. 
      // The API will throw if merchantID/number is wrong.
      await nagad.createPayment({
        amount: '1',
        orderId: 'TEST_VALIDATE_' + Date.now(),
        productDetails: { 'item': 'test' },
        ip: '127.0.0.1',
        clientType: 'PC_WEB'
      });
      return true;
    } catch (error) {
      // It might throw due to test data being invalid in production,
      // but usually crypto errors or 401s are the main cause of failure.
      return false;
    }
  }

  async initPayment(orderId: string, amount: number) {
    const { merchantID, merchantNumber, pubKey, privKey, isLive } = await this.getCredentials();
    
    const API_URL = process.env.API_URL || 'http://localhost:5000';
    
    const nagad = new NagadGateway({
      baseURL: isLive ? 'https://api.mynagad.com' : 'http://sandbox.mynagad.com:10080',
      merchantID,
      merchantNumber,
      pubKey,
      privKey,
      callbackURL: `${API_URL}/api/orders/payment/nagad/callback`,
      apiVersion: 'v-0.2.0',
      isPath: false
    });

    try {
      const paymentUrl = await nagad.createPayment({
        amount: String(amount),
        orderId: orderId,
        productDetails: { 'item': 'order' },
        ip: '127.0.0.1',
        clientType: 'PC_WEB'
      });
      return { url: paymentUrl };
    } catch (error) {
      console.error('Nagad Init Error:', error);
      throw new Error('Payment initialization failed');
    }
  }

  async verifyPayment(paymentRefId: string): Promise<any> {
    const { merchantID, merchantNumber, pubKey, privKey, isLive } = await this.getCredentials();
    
    const nagad = new NagadGateway({
      baseURL: isLive ? 'https://api.mynagad.com' : 'http://sandbox.mynagad.com:10080',
      merchantID,
      merchantNumber,
      pubKey,
      privKey,
      callbackURL: '', // not needed for verification
      apiVersion: 'v-0.2.0',
      isPath: false
    });
    
    try {
      const verification = await nagad.verifyPayment(paymentRefId);
      return verification;
    } catch (error) {
      console.error('Nagad Verification Error:', error);
      throw new Error('Payment verification failed');
    }
  }
}

export const nagadService = new NagadService();
