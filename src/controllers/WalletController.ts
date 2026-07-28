import crypto from 'crypto';
import { Response } from 'express';
import prisma from '../config/database';
import { config } from '../config/index';
import { AuthRequest } from '../middleware/auth';
import { WalletService } from '../services/walletService';
import { asyncHandler } from '../utils/helpers';
import { SslCommerzService } from '../utils/sslcommerz';
import { BaseController } from './BaseController';

export class WalletController extends BaseController {
  /** Get global wallet balance */
  getBalance = asyncHandler(async (req: AuthRequest, res: Response) => {
    const balance = await WalletService.getGlobalBalance();
    res.json({ success: true, data: balance });
  });

  /** Top up wallet balance */
  topUp = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const { amount, note } = req.body;

    const host = config.apiUrl;
    const success_url = `${host}/api/wallet/ssl/success`;
    const fail_url = `${host}/api/wallet/ssl/fail`;
    const cancel_url = `${host}/api/wallet/ssl/cancel`;
    
    // Call SslCommerzService
    try {
      const tran_id = `TXN_${crypto.randomUUID()}`;
      const paymentResponse = await SslCommerzService.initPayment(amount, userId, tran_id, success_url, fail_url, cancel_url);
      
      // Store pending status so we know what they requested
      await prisma.walletTransaction.create({
        data: {
          id: tran_id, // Store transaction ID for easy lookup during callback execution
          userId,
          amount,
          type: 'TOPUP',
          note: `SSL Commerz Top Up Init - ${note || ''}`,
          status: 'PENDING'
        }
      });

      return res.json({
        success: true,
        message: 'Redirecting to SSL Commerz Gateway',
        data: {
          paymentUrl: paymentResponse.GatewayPageURL,
          requiresRedirect: true
        }
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: e.message });
    }
  });

  /** Handle SSL Gateway Success */
  sslSuccess = asyncHandler(async (req: any, res: Response) => {
    const { tran_id, status, val_id } = req.body;
    const frontendUrl = config.frontendUrl;
    const redirectTarget = `${frontendUrl}/admin/settings`; 

    if (!val_id || (status !== 'VALID' && status !== 'VALIDATED')) {
      return res.redirect(`${redirectTarget}?status=failed&message=Payment Failed Validation`);
    }

    try {
      // Validate IPN directly with SSL Commerz to prevent spoofing
      const validationData = await SslCommerzService.validateIPN(val_id);

      const transactionCheck = await prisma.walletTransaction.findUnique({ where: { id: tran_id } });
      if (!transactionCheck || transactionCheck.status === 'COMPLETED') {
         return res.redirect(`${redirectTarget}?status=failed&message=Transaction Already Processed`);
      }

      // Add balance!
      await WalletService.adjustGlobalBalance(
         transactionCheck.amount,
         'TOPUP',
         'SSL Commerz Top Up Success',
         transactionCheck.userId || undefined
      );

      // Mark transaction as fully paid
      await prisma.walletTransaction.update({
         where: { id: tran_id },
         data: { status: 'COMPLETED' }
      });

      return res.redirect(`${redirectTarget}?status=success`);
    } catch (e: any) {
      console.error(e);
      return res.redirect(`${redirectTarget}?status=failed&message=Execution Failed`);
    }
  });

  /** Handle SSL Gateway Fail */
  sslFail = asyncHandler(async (req: any, res: Response) => {
    const frontendUrl = config.frontendUrl;
    return res.redirect(`${frontendUrl}/admin/settings?status=failed&message=Payment Failed`);
  });

  /** Handle SSL Gateway Cancel */
  sslCancel = asyncHandler(async (req: any, res: Response) => {
    const frontendUrl = config.frontendUrl;
    return res.redirect(`${frontendUrl}/admin/settings?status=failed&message=Payment Cancelled`);
  });

  /** Get transaction history (last 100) */
  getHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
    const history = await WalletService.getTransactions();
    res.json({ success: true, data: history });
  });
}
