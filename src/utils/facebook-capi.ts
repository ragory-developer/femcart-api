import crypto from 'crypto';
import prisma from '../config/database';
import logger from '../utils/logger';
import { config } from '../config';

/**
 * Hash data as per Facebook Conversions API requirements (SHA256)
 */
function hashData(data: string | null | undefined): string | null {
  if (!data) return null;
  return crypto
    .createHash('sha256')
    .update(data.trim().toLowerCase())
    .digest('hex');
}

interface FacebookCapiOptions {
  eventName: string;
  eventId?: string;
  eventTime?: number;
  eventSourceUrl?: string;
  userData: {
    email?: string;
    phone?: string;
    clientIpAddress?: string;
    userAgent?: string;
    externalId?: string;
  };
  customData?: {
    value?: number;
    currency?: string;
    contentIds?: string[];
    contentType?: string;
    orderId?: string;
  };
}

/**
 * Send event to Facebook Conversions API
 */
export async function sendFacebookEvent(options: FacebookCapiOptions) {
  try {
    // Fetch settings to get Token and Pixel ID
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: ['facebook_capi_token', 'facebook_pixel_id', 'facebook_test_event_code']
        }
      }
    });

    const settingsMap = settings.reduce((acc: any, item: any) => {
      acc[item.key] = item.value;
      return acc;
    }, {});

    const accessToken = settingsMap.facebook_capi_token || config.facebook.accessToken;
    const pixelId = settingsMap.facebook_pixel_id || config.facebook.pixelId;
    const testEventCode = settingsMap.facebook_test_event_code;

    if (!accessToken || !pixelId) {
      logger.warn('[FB-CAPI] Missing Facebook Conversions API access token or pixel ID. CAPI tracking is disabled.');
      return;
    }

    const payload = {
      data: [
        {
          event_name: options.eventName,
          event_time: options.eventTime || Math.floor(Date.now() / 1000),
          event_id: options.eventId,
          action_source: 'website',
          event_source_url: options.eventSourceUrl,
          user_data: {
            em: options.userData.email ? [hashData(options.userData.email)] : undefined,
            ph: options.userData.phone ? [hashData(options.userData.phone)] : undefined,
            client_ip_address: options.userData.clientIpAddress,
            client_user_agent: options.userData.userAgent,
            external_id: options.userData.externalId ? [hashData(options.userData.externalId)] : undefined,
          },
          custom_data: options.customData ? {
            value: options.customData.value,
            currency: options.customData.currency || 'BDT',
            content_ids: options.customData.contentIds,
            content_type: options.customData.contentType || 'product',
            order_id: options.customData.orderId,
          } : undefined,
          test_event_code: testEventCode || undefined,
        },
      ],
    };

    const response = await fetch(`https://graph.facebook.com/v17.0/${pixelId}/events?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    logger.debug('[FB-CAPI] Response: ' + JSON.stringify(result));
    return result;
  } catch (error) {
    logger.error('[FB-CAPI] Error sending event', error);
  }
}
