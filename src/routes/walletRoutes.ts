import { Router } from 'express';
import { WalletController } from '../controllers/WalletController';
import { authenticate } from '../middleware/auth';

const router = Router();
const controller = new WalletController();

/**
 * @swagger
 * tags:
 *   name: Wallet
 *   description: User wallet and balance management
 */

/**
 * @swagger
 * /api/wallet/balance:
 *   get:
 *     summary: Get user wallet balance
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet balance
 */
router.get('/balance', authenticate, controller.getBalance);

/**
 * @swagger
 * /api/wallet/top-up:
 *   post:
 *     summary: Initiate wallet top-up
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Top-up initiated
 */
router.post('/top-up', authenticate, controller.topUp);

/**
 * @swagger
 * /api/wallet/ssl/success:
 *   post:
 *     summary: SSLCommerz success callback
 *     tags: [Wallet]
 *     responses:
 *       200:
 *         description: Success callback processed
 */
router.post('/ssl/success', controller.sslSuccess);

/**
 * @swagger
 * /api/wallet/ssl/fail:
 *   post:
 *     summary: SSLCommerz fail callback
 *     tags: [Wallet]
 *     responses:
 *       200:
 *         description: Fail callback processed
 */
router.post('/ssl/fail', controller.sslFail);

/**
 * @swagger
 * /api/wallet/ssl/cancel:
 *   post:
 *     summary: SSLCommerz cancel callback
 *     tags: [Wallet]
 *     responses:
 *       200:
 *         description: Cancel callback processed
 */
router.post('/ssl/cancel', controller.sslCancel);

/**
 * @swagger
 * /api/wallet/history:
 *   get:
 *     summary: Get wallet transaction history
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Transaction history
 */
router.get('/history', authenticate, controller.getHistory);

export default router;
