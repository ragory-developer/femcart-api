import { Router } from 'express';
import { WordPressController } from '../controllers/WordpressController';
import { authenticate, authorize, requirePermission } from '../middleware/auth';

const router = Router();
const ctrl = new WordPressController();

router.use(authenticate, requirePermission('IMPORT'));

/**
 * @swagger
 * tags:
 *   name: WordPress
 *   description: WordPress/WooCommerce integration
 */

// Settings
/**
 * @swagger
 * /api/wordpress/settings:
 *   get:
 *     summary: Get WordPress settings
 *     tags: [WordPress]
 *     responses:
 *       200:
 *         description: WordPress settings
 *   post:
 *     summary: Save WordPress settings
 *     tags: [WordPress]
 *     responses:
 *       200:
 *         description: Settings saved
 */
router.get('/settings', ctrl.getSettings);
router.post('/settings', ctrl.saveSettings);

// Connection test
/**
 * @swagger
 * /api/wordpress/test:
 *   post:
 *     summary: Test WooCommerce connection
 *     tags: [WordPress]
 *     responses:
 *       200:
 *         description: Connection successful
 */
router.post('/test', ctrl.testConnection);

// Product preview from WC
/**
 * @swagger
 * /api/wordpress/products:
 *   get:
 *     summary: Preview WooCommerce products
 *     tags: [WordPress]
 *     responses:
 *       200:
 *         description: Product preview list
 */
router.get('/products', ctrl.previewProducts);

// Task operations
/**
 * @swagger
 * /api/wordpress/tasks/generate:
 *   post:
 *     summary: Generate sync tasks
 *     tags: [WordPress]
 *     responses:
 *       200:
 *         description: Tasks generated
 */
router.post('/tasks/generate', ctrl.generateTasks);

/**
 * @swagger
 * /api/wordpress/tasks:
 *   get:
 *     summary: Get all sync tasks
 *     tags: [WordPress]
 *     responses:
 *       200:
 *         description: List of tasks
 *   delete:
 *     summary: Clear all tasks
 *     tags: [WordPress]
 *     responses:
 *       200:
 *         description: Tasks cleared
 */
router.get('/tasks', ctrl.getTasks);
router.delete('/tasks', ctrl.clearTasks);

/**
 * @swagger
 * /api/wordpress/task/{id}/start:
 *   post:
 *     summary: Start sync task
 *     tags: [WordPress]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task started
 */
router.post('/task/:id/start', ctrl.startTask);

/**
 * @swagger
 * /api/wordpress/task/{id}/pause:
 *   post:
 *     summary: Pause sync task
 *     tags: [WordPress]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task paused
 */
router.post('/task/:id/pause', ctrl.pauseTask);

// Special arbitrary ID import
/**
 * @swagger
 * /api/wordpress/import/selected:
 *   post:
 *     summary: Import selected WooCommerce products
 *     tags: [WordPress]
 *     responses:
 *       200:
 *         description: Import started
 */
router.post('/import/selected', ctrl.importSelected);

export default router;
