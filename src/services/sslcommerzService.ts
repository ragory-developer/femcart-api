import SSLCommerzPayment from 'sslcommerz-lts';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class SSLCommerzService {
  private async getCredentials() {
    const settings = await prisma.setting.findMany({
      where: { key: { in: ['sslcz_store_id', 'sslcz_store_password', 'sslcz_is_live'] } }
    });
    
    let store_id = process.env.STORE_ID || 'testbox';
    let store_passwd = process.env.STORE_PASSWORD || 'qwerty';
    let is_live = false;

    settings.forEach((s: any) => {
      if (s.key === 'sslcz_store_id') store_id = s.value;
      if (s.key === 'sslcz_store_password') store_passwd = s.value;
      if (s.key === 'sslcz_is_live') is_live = s.value === 'true';
    });

    return { store_id, store_passwd, is_live };
  }

  async validateKey(storeId: string, storePassword: string, isLive: boolean) {
    const sslcz = new SSLCommerzPayment(storeId, storePassword, isLive);
    const data = {
      total_amount: 1,
      currency: 'BDT',
      tran_id: 'TEST_VALIDATE_' + Date.now(),
      success_url: 'http://localhost/success',
      fail_url: 'http://localhost/fail',
      cancel_url: 'http://localhost/cancel',
      ipn_url: 'http://localhost/ipn',
      shipping_method: 'Courier',
      product_name: 'Test Validation',
      product_category: 'Electronic',
      product_profile: 'general',
      cus_name: 'Test User',
      cus_email: 'test@example.com',
      cus_add1: 'Dhaka',
      cus_add2: 'Dhaka',
      cus_city: 'Dhaka',
      cus_state: 'Dhaka',
      cus_postcode: '1000',
      cus_country: 'Bangladesh',
      cus_phone: '01711111111',
      cus_fax: '01711111111',
      ship_name: 'Test User',
      ship_add1: 'Dhaka',
      ship_add2: 'Dhaka',
      ship_city: 'Dhaka',
      ship_state: 'Dhaka',
      ship_postcode: 1000,
      ship_country: 'Bangladesh',
    };

    try {
      const apiResponse = await sslcz.init(data);
      if (apiResponse?.GatewayPageURL) {
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async initPayment(orderId: string, amount: number, currency: string = 'BDT', customerInfo: any) {
    const { store_id, store_passwd, is_live } = await this.getCredentials();
    
    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
    
    const API_URL = process.env.API_URL || 'http://localhost:5000';
    
    const data = {
      total_amount: amount,
      currency: currency,
      tran_id: orderId, // use unique tran_id for each api call
      success_url: `${API_URL}/api/orders/payment/sslcz/success`,
      fail_url: `${API_URL}/api/orders/payment/sslcz/fail`,
      cancel_url: `${API_URL}/api/orders/payment/sslcz/cancel`,
      ipn_url: `${API_URL}/api/orders/payment/sslcz/ipn`,
      shipping_method: 'Courier',
      product_name: `Order #${orderId}`,
      product_category: 'Electronic',
      product_profile: 'general',
      cus_name: customerInfo.name || 'Customer Name',
      cus_email: customerInfo.email || 'customer@example.com',
      cus_add1: customerInfo.address || 'Dhaka',
      cus_add2: 'Dhaka',
      cus_city: customerInfo.city || 'Dhaka',
      cus_state: customerInfo.state || 'Dhaka',
      cus_postcode: '1000',
      cus_country: 'Bangladesh',
      cus_phone: customerInfo.phone || '01711111111',
      cus_fax: '01711111111',
      ship_name: customerInfo.name || 'Customer Name',
      ship_add1: customerInfo.address || 'Dhaka',
      ship_add2: 'Dhaka',
      ship_city: customerInfo.city || 'Dhaka',
      ship_state: customerInfo.state || 'Dhaka',
      ship_postcode: 1000,
      ship_country: 'Bangladesh',
    };

    try {
      const apiResponse = await sslcz.init(data);
      // Redirect the user to payment gateway
      if (apiResponse?.GatewayPageURL) {
        return { url: apiResponse.GatewayPageURL };
      } else {
        throw new Error('Failed to generate SSL Commerz URL');
      }
    } catch (error) {
      console.error('SSL Commerz Init Error:', error);
      throw new Error('Payment initialization failed');
    }
  }

  async validatePayment(valId: string) {
    const { store_id, store_passwd, is_live } = await this.getCredentials();
    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
    
    try {
      const response = await sslcz.validate({ val_id: valId });
      return response;
    } catch (error) {
      console.error('SSL Commerz Validation Error:', error);
      throw new Error('Payment validation failed');
    }
  }
}

export const sslcommerzService = new SSLCommerzService();
