import { Router } from 'express';
import { ShopifyController } from '../controllers/ShopifyController';
import { authenticate, requirePermission } from '../middleware/auth';

const router = Router();
const ctrl = new ShopifyController();

router.use(authenticate, requirePermission('IMPORT'));

/**
 * @swagger
 * tags:
 *   name: Shopify
 *   description: Shopify integration
 */

router.get('/settings', ctrl.getSettings);
router.post('/settings', ctrl.saveSettings);
router.post('/test', ctrl.testConnection);
router.get('/products', ctrl.previewProducts);
router.post('/tasks/generate', ctrl.generateTasks);
router.get('/tasks', ctrl.getTasks);
router.delete('/tasks', ctrl.clearTasks);
router.post('/task/:id/start', ctrl.startTask);
router.post('/task/:id/pause', ctrl.pauseTask);

export default router;
