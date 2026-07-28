import { Response } from 'express';
import { config } from '../config';
import { AuthRequest } from '../middleware/auth';
import { WalletService } from '../services/walletService';
import { BadRequestError } from '../utils/errors';
import { asyncHandler } from '../utils/helpers';
import { sendGlobalSms } from '../utils/sms';

class SmsController {
  /**
   * Bulk send SMS messages
   * Pre-calculates the cost and checks global wallet balance before initiating.
   * Route: POST /api/sms/bulk
   * Access: ADMIN
   */
  sendBulk = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { payloads } = req.body as { payloads: { phone: string; message: string }[] };

    if (!payloads || !Array.isArray(payloads) || payloads.length === 0) {
      throw new BadRequestError('Payloads array is required and must not be empty.');
    }

    const costPerSms = config.sms.costPerSms || 0.40;
    const totalCost = payloads.length * costPerSms;

    // Check balance
    const balance = await WalletService.getGlobalBalance();
    
    if (balance < totalCost) {
      return res.status(402).json({
        success: false,
        message: `Insufficient wallet balance. Total cost is ৳${totalCost.toFixed(2)}, but you only have ৳${balance.toFixed(2)}.`,
        requiredCost: totalCost,
        currentBalance: balance
      });
    }

    // Process all payloads
    // We do them concurrently (Promise.all), but if the list is huge, we might want to batch.
    // For general use-cases here, Promise.all is fine up to a few hundred.
    const results = await Promise.allSettled(
      payloads.map(p => sendGlobalSms(p.phone, p.message, 'bulk_marketing'))
    );

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
    const failCount = payloads.length - successCount;

    res.status(200).json({
      success: true,
      message: `Bulk SMS processing completed. ${successCount} sent successfully.`,
      stats: {
        totalAttempted: payloads.length,
        success: successCount,
        failed: failCount,
        costDeducted: successCount * costPerSms
      }
    });
  });
}

export const smsController = new SmsController();
