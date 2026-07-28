import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { sendFacebookEvent } from '../utils/facebook-capi';
import { asyncHandler } from '../utils/helpers';
import { BaseController } from './BaseController';

export class TrackingController extends BaseController {
  trackFacebookEvent = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { eventName, eventId, eventSourceUrl, customData, userData: clientUserData } = req.body;

    if (!eventName) {
      return res.status(400).json({ success: false, message: 'eventName is required' });
    }

    const clientIp = req.ip || req.headers['x-forwarded-for']?.toString();
    const userAgent = req.headers['user-agent'];

    let email = clientUserData?.email;
    let phone = clientUserData?.phone;
    let externalId = clientUserData?.externalId || req.user?.userId;

    // If user is authenticated, we might fetch their email/phone from DB if not provided
    if (req.user?.userId && (!email || !phone)) {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { email: true, phone: true }
      });
      if (user) {
        if (!email) email = user.email;
        if (!phone) phone = user.phone;
      }
    }

    // Call CAPI helper asynchronously
    sendFacebookEvent({
      eventName,
      eventId,
      eventSourceUrl: eventSourceUrl || `${req.protocol}://${req.get('host')}${req.originalUrl}`,
      userData: {
        email,
        phone,
        clientIpAddress: clientIp,
        userAgent,
        externalId,
      },
      customData
    }).catch(err => console.error('[FB-CAPI] Execution error in tracking controller:', err));

    // Return immediately to not block the client
    res.status(202).json({ success: true, message: 'Event received' });
  });
}
