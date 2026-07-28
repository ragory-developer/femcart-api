import { Router } from 'express';
import { PageController } from '../controllers/PageController';
import { authenticate, authorize, requirePermission } from '../middleware/auth';

const router = Router();
const controller = new PageController();

/**
 * @swagger
 * tags:
 *   name: Pages
 *   description: Dynamic page management
 */

// Public routes
/**
 * @swagger
 * /api/pages:
 *   get:
 *     summary: Get all pages
 *     tags: [Pages]
 *     responses:
 *       200:
 *         description: List of pages
 */
router.get('/', controller.getAll);

/**
 * @swagger
 * /api/pages/{slug}:
 *   get:
 *     summary: Get page by slug
 *     tags: [Pages]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Page details
 */
router.get('/:slug', controller.getBySlug);

// Admin routes (Authentication temporarily disabled to match products API until frontend login is finalized)
/**
 * @swagger
 * /api/pages:
 *   post:
 *     summary: Create new page
 *     tags: [Pages]
 *     responses:
 *       201:
 *         description: Page created
 */
router.post('/', authenticate, requirePermission('PAGES'), controller.create);

/**
 * @swagger
 * /api/pages/id/{id}:
 *   get:
 *     summary: Get page by ID
 *     tags: [Pages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Page details
 */
router.get('/id/:id', controller.getById);

/**
 * @swagger
 * /api/pages/{id}:
 *   put:
 *     summary: Update page
 *     tags: [Pages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Page updated
 *   delete:
 *     summary: Delete page
 *     tags: [Pages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Page deleted
 */
router.put('/:id', authenticate, requirePermission('PAGES'), controller.update);
router.delete('/:id', authenticate, requirePermission('PAGES'), controller.delete);

export default router;
