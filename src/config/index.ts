import dotenv from 'dotenv';
import { expand } from 'dotenv-expand';
expand(dotenv.config());

const getJwtSecret = (secret: string | undefined, name: string): string => {
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`CRITICAL: Environment variable ${name} must be set in production!`);
    }
    return `dev-${name.toLowerCase()}-secret`;
  }
  return secret;
};

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  database: {
    url: process.env.DATABASE_URL || '',
  },
  jwt: {
    accessSecret: getJwtSecret(process.env.JWT_ACCESS_SECRET, 'JWT_ACCESS_SECRET'),
    refreshSecret: getJwtSecret(process.env.JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  allowedOrigins: process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(url => url.trim())
    : [process.env.FRONTEND_URL || 'http://localhost:3000'],
  allowAllOrigins: process.env.ALLOW_ALL_ORIGINS === 'true',
  apiUrl: process.env.API_URL || `http://localhost:${process.env.PORT || '5000'}`,
  sms: {
    gatewayUrl: process.env.SMS_GATEWAY_URL || 'https://smsmassdata.massdata.xyz/api/sms/send',
    apiKey: process.env.SMS_API_KEY || '',
    senderId: process.env.SMS_SENDER_ID || '',
    costPerSms: parseFloat(process.env.SMS_COST_PER_SMS || '0.40'),
  },
  orderDeductionAmount: parseFloat(process.env.ORDER_DEDUCTION_AMOUNT || '0'),
  adminAccessKey: process.env.ADMIN_ACCESS_KEY || 'ADMIN',
  wordpressCipherKey: process.env.CIPHER_KEY || 'femcart_wp_key_2025',
  woocommerce: {
    siteUrl: process.env.WORDPRESS_URL || '',
    consumerKey: process.env.WC_CONSUMER_KEY || '',
    consumerSecret: process.env.WC_CONSUMER_SECRET || '',
  },
  facebook: {
    pixelId: process.env.FB_PIXEL_ID || '',
    accessToken: process.env.FB_ACCESS_TOKEN || '',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromName: process.env.SMTP_FROM_NAME || 'Femcart',
    fromEmail: process.env.SMTP_FROM_EMAIL || 'noreply@femcart.com',
  }
};
