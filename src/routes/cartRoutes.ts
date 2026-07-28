import { Router } from 'express';
import { CartController } from '../controllers/CartController';
import { authenticate, authorize } from '../middleware/auth';
const router = Router();
const controller = new CartController();

// Public routes
/**
 * @swagger
 * tags:
 *   name: Cart
 *   description: Shopping cart management
 */

/**
 * @swagger
 * /api/cart/capture-abandoned:
 *   post:
 *     summary: Capture abandoned cart details
 *     tags: [Cart]
 *     responses:
 *       200:
 *         description: Abandoned cart captured
 */
router.post('/capture-abandoned', controller.captureAbandonedCart);

// Auth required routes
/**
 * @swagger
 * /api/cart:
 *   get:
 *     summary: Get user's cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart details
 *   delete:
 *     summary: Clear entire cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart cleared
 */
router.get('/', authenticate, controller.getCart);
router.delete('/', authenticate, controller.clearCart);

/**
 * @swagger
 * /api/cart/abandoned:
 *   get:
 *     summary: Get all abandoned carts (Admin only)
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of abandoned carts
 */
router.get('/abandoned', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), controller.getAbandonedCarts);

/**
 * @swagger
 * /api/cart/items:
 *   post:
 *     summary: Add item to cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Item added to cart
 */
router.post('/items', authenticate, controller.addItem);

/**
 * @swagger
 * /api/cart/sync:
 *   post:
 *     summary: Sync offline cart with user account
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart synced successfully
 */
router.post('/sync', authenticate, controller.syncCart);

/**
 * @swagger
 * /api/cart/items/{id}:
 *   put:
 *     summary: Update cart item quantity
 *     tags: [Cart]
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
 *         description: Item updated
 *   delete:
 *     summary: Remove item from cart
 *     tags: [Cart]
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
 *         description: Item removed
 */
router.put('/items/:id', authenticate, controller.updateItem);
router.delete('/items/:id', authenticate, controller.removeItem);

export default router;
