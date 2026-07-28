import { Router } from 'express';
import { FacebookAdsController } from '../controllers/FacebookAdsController';
import { authenticate, authorize, requirePermission } from '../middleware/auth';

const router = Router();
const controller = new FacebookAdsController();

/**
 * @swagger
 * tags:
 *   name: Facebook Ads
 *   description: Facebook Ads API Integration
 */

// All routes require SUPER_ADMIN or SETTINGS permission
router.use(authenticate);
router.use(requirePermission('SETTINGS'));

/**
 * @swagger
 * /api/facebook-ads/dashboard:
 *   get:
 *     summary: Get Ads Dashboard stats
 *     tags: [Facebook Ads]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard stats
 */
router.get('/dashboard', controller.getDashboard);

/**
 * @swagger
 * /api/facebook-ads/campaigns:
 *   get:
 *     summary: Get all active campaigns
 *     tags: [Facebook Ads]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of campaigns
 */
router.get('/campaigns', controller.getCampaigns);

/**
 * @swagger
 * /api/facebook-ads/health:
 *   get:
 *     summary: Get Ad Account health status
 *     tags: [Facebook Ads]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Health status
 */
router.get('/health', controller.getAccountHealth);

/**
 * @swagger
 * /api/facebook-ads/create:
 *   post:
 *     summary: Create new campaign
 *     tags: [Facebook Ads]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Campaign created
 */
router.post('/create', controller.createCampaign);

export default router;
