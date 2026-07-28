import { Router } from 'express';
import { smsController } from '../controllers/SmsController';
import { authenticate, authorize, requirePermission } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: SMS
 *   description: SMS notifications and bulk messaging
 */

/**
 * @swagger
 * /api/sms/bulk:
 *   post:
 *     summary: Send bulk SMS (Admin only)
 *     tags: [SMS]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bulk SMS queued
 */
router.post('/bulk', authenticate, requirePermission('USERS'), smsController.sendBulk);

export default router;
