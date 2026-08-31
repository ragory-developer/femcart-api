import { Router } from 'express';
import adminRoleRoutes from './adminRoleRoutes';
import adminUsersRoutes from './adminUsersRoutes';
import authRoutes from './authRoutes';
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
import shopifyRoutes from './shopifyRoutes';
import bulkImportRoutes from './bulkImportRoutes';
import telemetryRoutes from './telemetryRoutes';
import searchRoutes from './searchRoutes';
import posRoutes from './posRoutes';
import apiKeyRoutes from './apiKeyRoutes';
import posRemoteImportRoutes from './posRemoteImportRoutes';
import inviWebhookRoutes from './inviWebhookRoutes';
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
router.use('/shopify', shopifyRoutes);
router.use('/bulk-import', bulkImportRoutes);
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
router.use('/testimonials', testimonialRoutes);
router.use('/reviews', reviewRoutes);
router.use('/tracking', trackingRoutes);
router.use('/facebook-ads', facebookAdsRoutes);
router.use('/contact', contactRoutes);
router.use('/sms', smsRoutes);
router.use('/telemetry', telemetryRoutes);

// Invi POS Inbound Webhook Routes (Secret verified from database settings or x-invi-signature)
router.use('/webhooks/invi', inviWebhookRoutes);
router.use('/webhook/invi', inviWebhookRoutes);
router.use('/webhooks', inviWebhookRoutes);
router.use('/webhook', inviWebhookRoutes);
router.use('/invi/v1', inviWebhookRoutes);
router.use('/invi-pos', inviWebhookRoutes);
router.use('/ecom', inviWebhookRoutes);
router.use('/pos', inviWebhookRoutes);

// Invi POS Integration Strict Routes (Primary: /invi-pos/*, Ecom Alias: /ecom/*, Versioned: /invi/v1/*, Legacy: /pos/v1/*)
router.use('/invi-pos', posRoutes);                      // Primary INVI POS API: /api/invi-pos/*
router.use('/ecom', posRoutes);                          // Native INVI E-Commerce API: /api/ecom/*
router.use('/invi/v1', posRoutes);                       // Versioned Inbound Invi API: /api/invi/v1/*
router.use('/pos/v1', posRoutes);                        // Backward-compatible POS API: /api/pos/v1/*
router.use('/pos', posRoutes);                           // POS API Alias: /api/pos/*
router.use('/admin/invi-connections', apiKeyRoutes);     // Admin API: Key generation & Whitelisting
router.use('/admin/pos-connections', apiKeyRoutes);      // Backward-compatible alias
router.use('/admin/invi-remote', posRemoteImportRoutes);  // Admin API: Invi Remote Importer Engine & Staging
router.use('/admin/pos-remote', posRemoteImportRoutes);  // Backward-compatible alias


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
