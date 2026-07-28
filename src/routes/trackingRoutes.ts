import { Router } from 'express';
import { TrackingController } from '../controllers/TrackingController';
import { optionalAuthenticate } from '../middleware/auth';

const router = Router();
const trackingController = new TrackingController();

/**
 * @swagger
 * tags:
 *   name: Tracking
 *   description: Tracking and analytics endpoints
 */

/**
 * @swagger
 * /api/tracking/facebook:
 *   post:
 *     summary: Track Facebook Pixel/CAPI event
 *     tags: [Tracking]
 *     responses:
 *       200:
 *         description: Event tracked
 */
router.post('/facebook', optionalAuthenticate, trackingController.trackFacebookEvent);

export default router;
