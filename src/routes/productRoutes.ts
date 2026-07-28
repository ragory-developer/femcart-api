import { Router } from 'express';
import { ProductController } from '../controllers/ProductController';
import { validate } from '../middleware/validate';
import { createProductSchema, updateProductSchema } from '../validators/admin.schema';
import { authenticate, authorize, requirePermission } from '../middleware/auth';

const router = Router();
const controller = new ProductController();

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Product catalog and management
 */

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get all products
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: List of products
 */
router.get('/', controller.getAll);

/**
 * @swagger
 * /api/products/weekly-sale:
 *   get:
 *     summary: Get weekly sale products
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: List of weekly sale products
 */
router.get('/weekly-sale', controller.getWeeklySale);

/**
 * @swagger
 * /api/products/check-slug:
 *   get:
 *     summary: Check if product slug exists
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Slug availability
 */
router.get('/check-slug', controller.checkSlug);

/**
 * @swagger
 * /api/products/slugs:
 *   get:
 *     summary: Get all product slugs
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: List of slugs
 */
router.get('/slugs', controller.getSlugs);

/**
 * @swagger
 * /api/products/filters:
 *   get:
 *     summary: Get dynamic product filters and aggregations
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Faceted filter counts and ranges
 */
router.get('/filters', controller.getFilters);

/**
 * @swagger
 * /api/products/{slug}:
 *   get:
 *     summary: Get product by slug
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product details
 */
router.get('/:slug', controller.getBySlug);

/**
 * @swagger
 * /api/products/bulk-promotions:
 *   post:
 *     summary: Apply bulk promotions
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Promotions applied
 */
router.post('/bulk-promotions', authenticate, requirePermission('PRODUCTS'), controller.applyBulkPromotion);
router.post('/bulk-delete', authenticate, requirePermission('PRODUCTS'), controller.bulkDelete);

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Create new product
 *     tags: [Products]
 *     responses:
 *       201:
 *         description: Product created
 */
router.post('/', authenticate, requirePermission('PRODUCTS'), validate(createProductSchema), controller.create);

/**
 * @swagger
 * /api/products/{id}:
 *   put:
 *     summary: Update product
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product updated
 *   delete:
 *     summary: Delete product
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product deleted
 */
router.put('/:id', authenticate, requirePermission('PRODUCTS'), validate(updateProductSchema), controller.update);
router.delete('/:id', authenticate, requirePermission('PRODUCTS'), controller.delete);

export default router;
