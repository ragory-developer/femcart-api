import { Router } from 'express';
import { CategoryController } from '../controllers/CategoryController';
import { validate } from '../middleware/validate';
import { createCategorySchema, updateCategorySchema } from '../validators/admin.schema';
import { authenticate, authorize, requirePermission } from '../middleware/auth';

const router = Router();
const controller = new CategoryController();

/**
 * @swagger
 * tags:
 *   name: Categories
 *   description: Category management
 */

/**
 * @swagger
 * /api/categories:
 *   get:
 *     summary: Get all categories
 *     tags: [Categories]
 *     responses:
 *       200:
 *         description: List of categories
 *   post:
 *     summary: Create category
 *     tags: [Categories]
 *     responses:
 *       201:
 *         description: Category created
 */
router.get('/', controller.getAll);
router.post('/', authenticate, requirePermission('CATEGORIES'), validate(createCategorySchema), controller.create);

/**
 * @swagger
 * /api/categories/slugs:
 *   get:
 *     summary: Get all category slugs
 *     tags: [Categories]
 *     responses:
 *       200:
 *         description: List of category slugs
 */
router.get('/slugs', controller.getSlugs);

/**
 * @swagger
 * /api/categories/{slug}:
 *   get:
 *     summary: Get category by slug
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Category details
 */
router.get('/:slug', controller.getBySlug);

/**
 * @swagger
 * /api/categories/{id}:
 *   put:
 *     summary: Update category
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Category updated
 *   delete:
 *     summary: Delete category
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Category deleted
 */
router.put('/:id', authenticate, requirePermission('CATEGORIES'), validate(updateCategorySchema), controller.update);
router.delete('/:id', authenticate, requirePermission('CATEGORIES'), controller.delete);

export default router;
