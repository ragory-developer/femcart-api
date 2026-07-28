import { config } from '../config';
import prisma from '../config/database';
import { WalletService } from '../services/walletService';

export const sendGlobalSms = async (phone: string, textBody: string, purpose: string = 'transactional') => {
  // 1. Fetch SMS Settings from the DB
  const settings = await prisma.setting.findMany({
    where: {
      key: { in: ['sms_gateway_url', 'sms_api_key', 'sms_sender_id'] }
    }
  });

  const configSettings: any = {};
  settings.forEach((s: any) => configSettings[s.key] = s.value);
  
  // Prioritize ENV if present
  if (config.sms.apiKey) configSettings.sms_api_key = config.sms.apiKey;
  if (config.sms.gatewayUrl) configSettings.sms_gateway_url = config.sms.gatewayUrl;

  console.log('[SMS] Starting Global SMS procedure');
  
  // Wallet Pre-flight Deduction (Skip for OTP)
  const cost = config.sms.costPerSms || 0.40;
  if (purpose !== 'OTP') {
    try {
      // Deduct FIRST to prevent race conditions bypassing the balance
      await WalletService.adjustGlobalBalance(-cost, 'DEDUCTION', `Pre-auth SMS cost for ${phone}`);
    } catch (e: any) {
      console.error(`[SMS] ABORTED: Insufficient global wallet balance for SMS to ${phone}.`);
      return false;
    }
  }
  
  // Try to send real SMS (SKIP IN DEVELOPMENT)
  const isDev = config.nodeEnv?.trim() === 'development' || !config.nodeEnv;
  if (!isDev && configSettings.sms_gateway_url && configSettings.sms_api_key) {
    try {
      const url = new URL(configSettings.sms_gateway_url);
      url.searchParams.append('apiKey', configSettings.sms_api_key);
      url.searchParams.append('contactNumbers', phone.startsWith('88') ? phone : `88${phone}`);
      url.searchParams.append('senderId', configSettings.sms_sender_id || config.sms.senderId || '8809617611020');
      url.searchParams.append('textBody', textBody);
      url.searchParams.append('type', 'text');
      url.searchParams.append('label', purpose);

      const loggedUrl = url.toString().replace(configSettings.sms_api_key, '********');
      console.log(`[SMS] Sending... Request URL: ${loggedUrl}`);

      const response = await fetch(url.toString());
      let result: any;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        result = await response.json();
      } else {
        result = await response.text();
      }
      
      console.log(`[SMS] Response State: ${response.status} ${response.statusText}`);
      
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
      
      // Known Gateway Error Codes
      const isErrorCode = resultStr.match(/520[1-9]/);
      const hasError = isErrorCode || resultStr.toLowerCase().includes('fail');
      
      if (!hasError) {
        // SMS successfully sent, balance already deducted
        console.log(`[SMS] Delivered to ${phone}`);
        return true;
      } else {
        const errorMap: any = {
          '5201': 'API not valid',
          '5202': 'API not Active',
          '5203': 'Sender Id not valid',
          '5204': 'Text Body not valid',
          '5205': 'Contact Numbers Not Valid',
          '5206': 'Insufficient Balance',
          '5207': 'Insufficient Balance of your seller',
          '5208': 'Account Not Active',
          '5209': 'Account Expired'
        };
        const errorCode = isErrorCode?.[0];
        const errorMessage = errorCode ? errorMap[errorCode] : 'Unknown gateway error';
        console.error(`[SMS] Gateway returned an error: ${errorCode} (${errorMessage}).`);
        
        // Refund the pre-deducted amount since delivery failed
        if (purpose !== 'OTP') {
          await WalletService.adjustGlobalBalance(cost, 'REFUND', `Refund failed SMS to ${phone}`);
        }
        return false;
      }
    } catch (error: any) {
      console.error(`[SMS] Request failed completely: ${error.message}`);
      // Refund the pre-deducted amount since request failed
      if (purpose !== 'OTP') {
        await WalletService.adjustGlobalBalance(cost, 'REFUND', `Refund failed SMS request to ${phone}`);
      }
      return false;
    }
  } else {
    // MOCK SMS PROVIDER 
    const reason = config.nodeEnv === 'development' ? 'DEVELOPMENT MODE' : 'Configuration Missing';
    console.log(`\n\n\n=== MOCK SMS API (${reason}) ===\nTO: ${phone}\nTEXT: ${textBody}\n====================\n\n\n`);
    return true; // Pretend it succeeded
  }
};
