import { Router } from 'express';
import { CouponController } from '../controllers/CouponController';
import { authenticate, authorize, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createCouponSchema, updateCouponSchema } from '../validators/admin.schema';

const router = Router();
const controller = new CouponController();

// Admin routes
router.use(authenticate);
router.use(requirePermission('SETTINGS'));

/**
 * @swagger
 * tags:
 *   name: Coupons
 *   description: Coupon management (Admin only)
 */

/**
 * @swagger
 * /api/coupons:
 *   get:
 *     summary: Get all coupons
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of coupons
 *   post:
 *     summary: Create coupon
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Coupon created
 */
router.get('/', controller.getAll);
router.post('/', validate(createCouponSchema), controller.create);

/**
 * @swagger
 * /api/coupons/{id}:
 *   put:
 *     summary: Update coupon
 *     tags: [Coupons]
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
 *         description: Coupon updated
 *   delete:
 *     summary: Delete coupon
 *     tags: [Coupons]
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
 *         description: Coupon deleted
 */
router.put('/:id', validate(updateCouponSchema), controller.update);
router.delete('/:id', controller.delete);

/**
 * @swagger
 * /api/coupons/{code}/report:
 *   get:
 *     summary: Get coupon usage report
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Coupon report
 */
router.get('/:code/report', controller.getReport);

export default router;
