import { Router } from 'express';
import { ReviewController } from '../controllers/ReviewController';
import { authenticate, authorize, requirePermission } from '../middleware/auth';

const router = Router();
const controller = new ReviewController();

/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: Product reviews
 */

/**
 * @swagger
 * /api/reviews:
 *   get:
 *     summary: Get all reviews
 *     tags: [Reviews]
 *     responses:
 *       200:
 *         description: List of reviews
 */
router.get('/', controller.getAll);

/**
 * @swagger
 * /api/reviews/product/{productId}:
 *   get:
 *     summary: Get reviews for a specific product
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of product reviews
 */
router.get('/product/:productId', controller.getByProductId);

// Unified Order Feedback (Auth required)
router.post('/order/:orderId', authenticate, controller.createOrderFeedback);

// Admin Review Moderation
router.get('/admin', authenticate, requirePermission('PRODUCTS'), controller.getAdminReviews);
router.put('/:id/status', authenticate, requirePermission('PRODUCTS'), controller.updateStatus);
router.delete('/:id', authenticate, requirePermission('PRODUCTS'), controller.deleteReview);
router.put('/:id/home-status', authenticate, requirePermission('PRODUCTS'), controller.updateShowInHome);

export default router;
