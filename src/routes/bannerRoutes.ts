import { Router } from 'express';
import { authenticate, authorize, requirePermission } from '../middleware/auth';
import { createBanner, deleteBanner, getBanners, updateBanner } from '../controllers/BannerController';

const router = Router();

// Publicly readable banners
router.get('/', getBanners);

// Protected routes for admin
router.post('/', authenticate, requirePermission('SETTINGS'), createBanner);
router.put('/:id', authenticate, requirePermission('SETTINGS'), updateBanner);
router.delete('/:id', authenticate, requirePermission('SETTINGS'), deleteBanner);

export default router;
