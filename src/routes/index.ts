import { Router } from 'express';
import adminRoleRoutes from './adminRoleRoutes';
import adminUsersRoutes from './adminUsersRoutes';
import authRoutes from './authRoutes';
import bannerRoutes from './bannerRoutes';
import brandRoutes from './brandRoutes';

import cartRoutes from './cartRoutes';
import categoryRoutes from './categoryRoutes';
import contactRoutes from './contactRoutes';
import couponRoutes from './couponRoutes';
import facebookAdsRoutes from './facebookAdsRoutes';
import locationRoutes from './locationRoutes';
import mediaRoutes from './mediaRoutes';
import navigationRoutes from './navigationRoutes';
import newsletterRoutes from './newsletterRoutes';
import orderRoutes from './orderRoutes';
import pageRoutes from './pageRoutes';
import paymentRoutes from './paymentRoutes';
import productRoutes from './productRoutes';
import reviewRoutes from './reviewRoutes';
import settingRoutes from './settingRoutes';
import smsRoutes from './smsRoutes';
import specificationRoutes from './specificationRoutes';
import tagRoutes from './tagRoutes';
import testimonialRoutes from './testimonialRoutes';
import trackingRoutes from './trackingRoutes';
import trashRoutes from './trashRoutes';
import userRoutes from './userRoutes';
import variationRoutes from './variationRoutes';
import walletRoutes from './walletRoutes';
import wishlistRoutes from './wishlistRoutes';
import wordpressRoutes from './wordpressRoutes';
import telemetryRoutes from './telemetryRoutes';
import searchRoutes from './searchRoutes';
import { authenticate, authorize } from '../middleware/auth';
import { catalogIntegrityService } from '../services/CatalogIntegrityService';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/categories', categoryRoutes);
router.use('/brands', brandRoutes);
router.use('/products', productRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/wishlist', wishlistRoutes);
router.use('/media', mediaRoutes);
router.use('/tags', tagRoutes);
router.use('/specifications', specificationRoutes);
router.use('/variations', variationRoutes);
router.use('/wordpress', wordpressRoutes);
router.use('/global-settings', settingRoutes);
router.use('/pages', pageRoutes);
router.use('/wallet', walletRoutes);
router.use('/admin-users', adminUsersRoutes);
router.use('/admin-roles', adminRoleRoutes);
router.use('/newsletter', newsletterRoutes);
router.use('/locations', locationRoutes);
router.use('/coupons', couponRoutes);

router.use('/navigation', navigationRoutes);
router.use('/search', searchRoutes);
router.use('/trash', trashRoutes);
router.use('/banners', bannerRoutes);
router.use('/testimonials', testimonialRoutes);
router.use('/reviews', reviewRoutes);
router.use('/tracking', trackingRoutes);
router.use('/facebook-ads', facebookAdsRoutes);
router.use('/contact', contactRoutes);
router.use('/sms', smsRoutes);
router.use('/telemetry', telemetryRoutes);

router.get('/admin/catalog/integrity', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), async (_req, res, next) => {
  try {
    const result = await catalogIntegrityService.checkIntegrity();
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
