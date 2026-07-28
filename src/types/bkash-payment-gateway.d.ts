declare module 'bkash-payment-gateway' {
  export function init(config: { baseURL: string, key: string, secret: string, username: string, password: string }): void;
  export function createPayment(config: any): Promise<any>;
  export function executePayment(paymentID: string): Promise<any>;
}
