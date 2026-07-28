
export class SslCommerzService {
  /**
   * Retrieves the SSL Commerz Base URL dynamically based on environment
   */
  private static getBaseUrl(): string {
    const isProd = process.env.NODE_ENV === 'production';
    return isProd ? 'https://securepay.sslcommerz.com' : 'https://sandbox.sslcommerz.com';
  }

  /**
   * Retrieves environment variables or defaults
   */
  private static getCredentials() {
    return {
      store_id: process.env.SSL_STORE_ID || 'testbox',
      store_passwd: process.env.SSL_STORE_PASSWORD || 'qwerty',
    };
  }

  /**
   * Initializes session and gets redirect URL
   */
  public static async initPayment(
    amount: number, 
    userId: string, 
    tran_id: string, 
    success_url: string, 
    fail_url: string, 
    cancel_url: string
  ) {
    const creds = this.getCredentials();
    const url = `${this.getBaseUrl()}/gwprocess/v4/api.php`;

    // Must be application/x-www-form-urlencoded
    const params = new URLSearchParams();
    params.append('store_id', creds.store_id);
    params.append('store_passwd', creds.store_passwd);
    params.append('total_amount', amount.toFixed(2));
    params.append('currency', 'BDT');
    params.append('tran_id', tran_id);
    params.append('success_url', success_url);
    params.append('fail_url', fail_url);
    params.append('cancel_url', cancel_url);
    
    // Required customer info for SSL Commerz
    params.append('cus_name', 'System Admin');
    params.append('cus_email', 'admin@femcart.com');
    params.append('cus_add1', 'Dhaka');
    params.append('cus_add2', 'Dhaka');
    params.append('cus_city', 'Dhaka');
    params.append('cus_state', 'Dhaka');
    params.append('cus_postcode', '1000');
    params.append('cus_country', 'Bangladesh');
    params.append('cus_phone', '01711111111');
    params.append('cus_fax', '01711111111');
    
    // Shipping info required
    params.append('shipping_method', 'NO');
    params.append('num_of_item', '1');
    params.append('product_name', 'Wallet Top Up');
    params.append('product_profile', 'general');
    params.append('product_category', 'Digital service');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data: any = await response.json();

    if (data.status === 'SUCCESS' && data.GatewayPageURL) {
      return {
        GatewayPageURL: data.GatewayPageURL,
      };
    }

    throw new Error(`SSL Commerz Init Failed: ${data.failedreason || JSON.stringify(data)}`);
  }

  /**
   * Validates an IPN or Success Callback
   */
  public static async validateIPN(val_id: string) {
    const creds = this.getCredentials();
    const url = `${this.getBaseUrl()}/validator/api/validationserverAPI.php?val_id=${val_id}&store_id=${creds.store_id}&store_passwd=${creds.store_passwd}&v=1&format=json`;

    const response = await fetch(url);
    const data: any = await response.json();

    if (data.status === 'VALID' || data.status === 'VALIDATED') {
      return data;
    }
    
    throw new Error('SSL Validation Failed');
  }
}
