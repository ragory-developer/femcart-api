import { Router } from 'express';
import { OrderController } from '../controllers/OrderController';
import { authenticate, authorize, optionalAuthenticate, requirePermission } from '../middleware/auth';
import { checkoutLimiter } from '../middleware/rateLimiters';

const router = Router();
const controller = new OrderController();

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Order processing and management
 */

/**
 * @swagger
 * /api/orders/calculate:
 *   post:
 *     summary: Calculate order totals before checkout
 *     tags: [Orders]
 *     responses:
 *       200:
 *         description: Calculated order totals
 */
router.post('/calculate', optionalAuthenticate, controller.calculate);

/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Create a new order (Checkout)
 *     tags: [Orders]
 *     responses:
 *       201:
 *         description: Order created successfully
 *   get:
 *     summary: Get all orders (Admin only)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all orders
 */
router.post('/', checkoutLimiter, optionalAuthenticate, controller.create);
router.get('/', authenticate, requirePermission('ORDERS'), controller.getAllOrders);
router.get('/returned-items', authenticate, requirePermission('ORDERS'), controller.getReturnedItems);
router.post('/returned-items/:orderItemId/triage', authenticate, requirePermission('ORDERS'), controller.triageReturnedItem);
router.get('/damaged-items', authenticate, requirePermission('ORDERS'), controller.getDamagedItems);
router.post('/damaged-items/:orderItemId/restock', authenticate, requirePermission('ORDERS'), controller.restockDamagedItem);
/**
 * @swagger
 * /api/orders/my:
 *   get:
 *     summary: Get current user's orders
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's orders
 */
router.get('/my', authenticate, controller.getMyOrders);

// Payment Webhooks & Callbacks
router.post('/payment/sslcz/success', controller.sslcommerzSuccess);
router.post('/payment/sslcz/fail', controller.sslcommerzFail);
router.post('/payment/sslcz/cancel', controller.sslcommerzCancel);
router.post('/payment/sslcz/ipn', controller.sslcommerzIpn);
router.get('/payment/nagad/callback', controller.nagadCallback);
router.get('/payment/bkash/callback', controller.bkashCallback);

/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     summary: Get order details by ID
 *     tags: [Orders]
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
 *         description: Order details
 */
router.get('/:id', authenticate, controller.getById);

/**
 * @swagger
 * /api/orders/{id}/pay:
 *   patch:
 *     summary: Mark order as paid
 *     tags: [Orders]
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
 *         description: Order paid
 */
router.patch('/:id/pay', authenticate, controller.pay);

/**
 * @swagger
 * /api/orders/{id}/status:
 *   put:
 *     summary: Update order status (Admin only)
 *     tags: [Orders]
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
 *         description: Order status updated
 */
router.put('/:id/status', authenticate, requirePermission('ORDERS'), controller.updateStatus);

/**
 * @swagger
 * /api/orders/{id}/return-items:
 *   post:
 *     summary: Process order return (Admin only)
 *     tags: [Orders]
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
 *         description: Return processed
 */
router.post('/:id/return-items', authenticate, requirePermission('ORDERS'), controller.processReturn);

/**
 * @swagger
 * /api/orders/{id}/notes:
 *   post:
 *     summary: Add note to order (Admin only)
 *     tags: [Orders]
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
 *         description: Note added
 */
router.post('/:id/notes', authenticate, requirePermission('ORDERS'), controller.addNote);

export default router;
