import { Router } from 'express';
import { ContactController } from '../controllers/ContactController';
import { authenticate, authorize, requirePermission } from '../middleware/auth';

const router = Router();
const controller = new ContactController();

/**
 * @swagger
 * tags:
 *   name: Contact
 *   description: Contact form messages
 */

// Public route to submit a contact message
/**
 * @swagger
 * /api/contact:
 *   post:
 *     summary: Submit a contact message
 *     tags: [Contact]
 *     responses:
 *       201:
 *         description: Message submitted
 */
router.post('/', controller.create);

// Admin routes to manage messages
/**
 * @swagger
 * /api/contact:
 *   get:
 *     summary: Get all contact messages
 *     tags: [Contact]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of messages
 */
router.get('/', authenticate, requirePermission('SETTINGS'), controller.getAll);

/**
 * @swagger
 * /api/contact/{id}/read:
 *   patch:
 *     summary: Mark message as read
 *     tags: [Contact]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Message marked as read
 */
router.patch('/:id/read', authenticate, requirePermission('SETTINGS'), controller.markAsRead);

/**
 * @swagger
 * /api/contact/{id}:
 *   delete:
 *     summary: Delete contact message
 *     tags: [Contact]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Message deleted
 */
router.delete('/:id', authenticate, requirePermission('SETTINGS'), controller.delete);

export default router;
