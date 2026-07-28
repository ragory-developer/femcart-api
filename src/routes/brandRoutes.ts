import { Router } from 'express';
import { BrandController } from '../controllers/BrandController';
import { validate } from '../middleware/validate';
import { createBrandSchema, updateBrandSchema } from '../validators/admin.schema';
import { authenticate, authorize, requirePermission } from '../middleware/auth';

const router = Router();
const controller = new BrandController();

/**
 * @swagger
 * tags:
 *   name: Brands
 *   description: Brand management
 */

/**
 * @swagger
 * /api/brands:
 *   get:
 *     summary: Get all brands
 *     tags: [Brands]
 *     responses:
 *       200:
 *         description: List of brands
 *   post:
 *     summary: Create brand
 *     tags: [Brands]
 *     responses:
 *       201:
 *         description: Brand created
 */
router.get('/', controller.getAll);
router.post('/', authenticate, requirePermission('BRANDS'), validate(createBrandSchema), controller.create);

/**
 * @swagger
 * /api/brands/slugs:
 *   get:
 *     summary: Get all brand slugs
 *     tags: [Brands]
 *     responses:
 *       200:
 *         description: List of brand slugs
 */
router.get('/slugs', controller.getSlugs);

/**
 * @swagger
 * /api/brands/{slug}:
 *   get:
 *     summary: Get brand by slug
 *     tags: [Brands]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Brand details
 */
router.get('/:slug', controller.getBySlug);

/**
 * @swagger
 * /api/brands/{id}:
 *   put:
 *     summary: Update brand
 *     tags: [Brands]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Brand updated
 *   delete:
 *     summary: Delete brand
 *     tags: [Brands]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Brand deleted
 */
router.put('/:id', authenticate, requirePermission('BRANDS'), validate(updateBrandSchema), controller.update);
router.delete('/:id', authenticate, requirePermission('BRANDS'), controller.delete);

export default router;
