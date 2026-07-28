import { Router } from 'express';
import { SettingController } from '../controllers/SettingController';
import { authenticate, authorize, requirePermission } from '../middleware/auth';

const router = Router();
const controller = new SettingController();

/**
 * @swagger
 * tags:
 *   name: Settings
 *   description: Global app settings
 */

/**
 * @swagger
 * /api/global-settings/home-page:
 *   get:
 *     summary: Get home page settings
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: Home page settings
 *   put:
 *     summary: Update home page settings
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: Home page settings updated
 */
router.get('/home-page', controller.getHomePage);
router.put('/home-page', authenticate, requirePermission('SETTINGS'), controller.updateHomePage);

/**
 * @swagger
 * /api/global-settings:
 *   get:
 *     summary: Get all global settings
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: All settings
 *   post:
 *     summary: Update global settings
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: Settings updated
 */
router.get('/admin', authenticate, requirePermission('SETTINGS'), controller.getAllAdmin);
router.get('/', controller.getAll);
router.post('/', authenticate, requirePermission('SETTINGS'), controller.update);
router.post('/validate-stripe', authenticate, requirePermission('SETTINGS'), controller.validateStripe);
router.post('/validate-paypal', authenticate, requirePermission('SETTINGS'), controller.validatePayPal);
router.post('/validate-sslcz', authenticate, requirePermission('SETTINGS'), controller.validateSSLCZ);
router.post('/validate-nagad', authenticate, requirePermission('SETTINGS'), controller.validateNagad);
router.post('/validate-bkash', authenticate, requirePermission('SETTINGS'), controller.validateBKash);

export default router;
