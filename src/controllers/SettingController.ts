import { Request, Response } from 'express';
import { stripeService } from '../services/stripeService';
import { paypalService } from '../services/paypalService';
import { sslcommerzService } from '../services/sslcommerzService';
import { nagadService } from '../services/nagadService';
import { bkashService } from '../services/bkashService';
import prisma from '../config/database';
import { asyncHandler } from '../utils/helpers';
import { defaultHomePageConfig } from '../utils/homePageDefault';
import { BaseController } from './BaseController';
import { CacheService } from '../core/redis/CacheService';
import { KeyFactory } from '../core/redis/KeyFactory';

export class SettingController extends BaseController {
  /** Get all settings (Public - sensitive keys filtered) */
  getAll = asyncHandler(async (req: Request, res: Response) => {
    const cacheKey = KeyFactory.globalSettings();
    const cachedSettings = await CacheService.get(cacheKey);
    if (cachedSettings) {
      return res.json({ success: true, data: cachedSettings });
    }

    const settings = await prisma.setting.findMany();
    
    const sensitiveKeys = ['stripe_secret_key', 'stripe_webhook_secret', 'paypal_client_secret', 'sslcz_store_password', 'nagad_private_key', 'bkash_app_key', 'bkash_app_secret', 'bkash_username', 'bkash_password'];
    
    // Convert to a key-value object for easier frontend consumption
    const settingsMap = settings.reduce((acc: any, item: any) => {
      if (!sensitiveKeys.includes(item.key)) {
        acc[item.key] = item.value;
      }
      return acc;
    }, {});
    
    // Cache for 24 hours (86400 seconds) since we have targeted invalidation
    await CacheService.set(cacheKey, settingsMap, 86400);

    res.json({ success: true, data: settingsMap });
  });

  /** Get all settings (Admin - includes secrets) */
  getAllAdmin = asyncHandler(async (req: Request, res: Response) => {
    const settings = await prisma.setting.findMany();
    // Convert to a key-value object for easier frontend consumption
    const settingsMap = settings.reduce((acc: any, item: any) => {
      acc[item.key] = item.value;
      return acc;
    }, {});
    
    res.json({ success: true, data: settingsMap });
  });

  /** Update or create settings */
  update = asyncHandler(async (req: Request, res: Response) => {
    const { settings } = req.body; // Expecting { key: value, ... }
    
    if (!settings || typeof settings !== 'object') {
      res.status(400).json({ success: false, message: 'Invalid settings format' });
      return;
    }

    const updates = Object.entries(settings).map(([key, value]) => 
      prisma.setting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) }
      })
    );

    await prisma.$transaction(updates);
    
    // Invalidate global settings cache
    await CacheService.del(KeyFactory.globalSettings());
    
    res.json({ success: true, message: 'Settings updated successfully' });
  });

  /** Get Home Page Configuration */
  getHomePage = asyncHandler(async (req: Request, res: Response) => {
    const setting = await prisma.setting.findUnique({
      where: { key: 'HOME_PAGE_CONFIG' }
    });
    
    let config = defaultHomePageConfig;
    if (setting && setting.value) {
      try {
        config = JSON.parse(setting.value);
      } catch (e) {
        console.error('Failed to parse home page config', e);
      }
    }
    
    res.json({ success: true, data: config });
  });

  /** Update Home Page Configuration */
  updateHomePage = asyncHandler(async (req: Request, res: Response) => {
    const { config } = req.body;
    
    if (!config || typeof config !== 'object') {
      res.status(400).json({ success: false, message: 'Invalid configuration format' });
      return;
    }

    const valueStr = JSON.stringify(config);
    
    await prisma.setting.upsert({
      where: { key: 'HOME_PAGE_CONFIG' },
      update: { value: valueStr },
      create: { key: 'HOME_PAGE_CONFIG', value: valueStr }
    });

    // Invalidate global settings cache
    await CacheService.del(KeyFactory.globalSettings());

    res.json({ success: true, message: 'Home page configuration updated successfully' });
  });

  /** Validate Stripe Credentials */
  validateStripe = asyncHandler(async (req: Request, res: Response) => {
    const { secretKey } = req.body;
    
    if (!secretKey || typeof secretKey !== 'string') {
      res.status(400).json({ success: false, message: 'secretKey is required' });
      return;
    }

    const isValid = await stripeService.validateKey(secretKey);
    res.json({ success: true, valid: isValid });
  });

  validatePayPal = asyncHandler(async (req: Request, res: Response) => {
    const { clientId, secret, isLive } = req.body;
    if (!clientId || !secret) return res.status(400).json({ success: false, message: 'Missing credentials' });
    const isValid = await paypalService.validateKey(clientId, secret, isLive === 'true' || isLive === true);
    res.json({ success: true, valid: isValid });
  });

  validateSSLCZ = asyncHandler(async (req: Request, res: Response) => {
    const { storeId, storePassword, isLive } = req.body;
    if (!storeId || !storePassword) return res.status(400).json({ success: false, message: 'Missing credentials' });
    const isValid = await sslcommerzService.validateKey(storeId, storePassword, isLive === 'true' || isLive === true);
    res.json({ success: true, valid: isValid });
  });

  validateNagad = asyncHandler(async (req: Request, res: Response) => {
    const { merchantID, merchantNumber, pubKey, privKey, isLive } = req.body;
    if (!merchantID || !merchantNumber || !pubKey || !privKey) return res.status(400).json({ success: false, message: 'Missing credentials' });
    const isValid = await nagadService.validateKey(merchantID, merchantNumber, pubKey, privKey, isLive === 'true' || isLive === true);
    res.json({ success: true, valid: isValid });
  });

  validateBKash = asyncHandler(async (req: Request, res: Response) => {
    const { appKey, appSecret, username, password, isLive } = req.body;
    if (!appKey || !appSecret || !username || !password) return res.status(400).json({ success: false, message: 'Missing credentials' });
    const isValid = await bkashService.validateKey(appKey, appSecret, username, password, isLive === 'true' || isLive === true);
    res.json({ success: true, valid: isValid });
  });
}
