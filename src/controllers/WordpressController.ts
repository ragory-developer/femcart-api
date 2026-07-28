import { config } from '../config';
import { BaseController } from './BaseController';
/**
 * WordPress import controller — handles all /api/wordpress/* routes.
 */

import { Request, Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { isTaskRunning, isTaskQueued, requestCancelTask, startImportTask } from '../services/importQueue';
import { WCSetting, wordPressService } from '../services/wordpressService';
import { asyncHandler } from '../utils/helpers';

// Simple XOR-based obfuscation for stored credentials (good enough for local DB)
const CIPHER_KEY = config.wordpressCipherKey;

export function encrypt(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ CIPHER_KEY.charCodeAt(i % CIPHER_KEY.length));
  }
  return Buffer.from(result, 'binary').toString('base64');
}

export function decrypt(encoded: string): string {
  const text = Buffer.from(encoded, 'base64').toString('binary');
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ CIPHER_KEY.charCodeAt(i % CIPHER_KEY.length));
  }
  return result;
}

async function getActiveSetting(): Promise<WCSetting | null> {
  const row = await prisma.wordPressSetting.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!row) return null;
  return {
    siteUrl: row.siteUrl,
    consumerKey: decrypt(row.consumerKey),
    consumerSecret: decrypt(row.consumerSecret),
    apiVersion: row.apiVersion,
  };
}

export class WordPressController extends BaseController {
  /** Save / update WC connection settings */
  saveSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { siteUrl, consumerKey, consumerSecret, apiVersion } = req.body;
    if (!siteUrl || !consumerKey || !consumerSecret) {
      res.status(400).json({ success: false, message: 'siteUrl, consumerKey and consumerSecret are required' });
      return;
    }

    const existing = await prisma.wordPressSetting.findFirst({ orderBy: { updatedAt: 'desc' } });
    
    let finalConsumerKey = consumerKey;
    let finalConsumerSecret = consumerSecret;

    if (existing) {
      if (consumerKey.includes('***')) {
        finalConsumerKey = decrypt(existing.consumerKey);
      }
      if (consumerSecret.includes('***')) {
        finalConsumerSecret = decrypt(existing.consumerSecret);
      }
    }

    const data = {
      siteUrl: siteUrl.replace(/\/$/, ''),
      consumerKey: encrypt(finalConsumerKey),
      consumerSecret: encrypt(finalConsumerSecret),
      apiVersion: apiVersion ?? 'wc/v3',
    };

    const record = existing
      ? await prisma.wordPressSetting.update({ where: { id: existing.id }, data })
      : await prisma.wordPressSetting.create({ data });

    res.json({
      success: true,
      data: {
        id: record.id,
        siteUrl: record.siteUrl,
        apiVersion: record.apiVersion,
        consumerKey: '***' + finalConsumerKey.slice(-4),
        consumerSecret: '***' + finalConsumerSecret.slice(-4),
      },
    });
  });

  /** Get current settings (masked keys) */
  getSettings = asyncHandler(async (_req: Request, res: Response) => {
    const row = await prisma.wordPressSetting.findFirst({ orderBy: { updatedAt: 'desc' } });
    if (!row) {
      res.json({ success: true, data: null });
      return;
    }
    const ck = decrypt(row.consumerKey);
    const cs = decrypt(row.consumerSecret);
    res.json({
      success: true,
      data: {
        id: row.id,
        siteUrl: row.siteUrl,
        apiVersion: row.apiVersion,
        consumerKey: '***' + ck.slice(-4),
        consumerSecret: '***' + cs.slice(-4),
      },
    });
  });

  /** Test WC connection */
  testConnection = asyncHandler(async (_req: Request, res: Response) => {
    const setting = await getActiveSetting();
    if (!setting) {
      res.status(400).json({ success: false, message: 'No WordPress settings configured yet' });
      return;
    }
    const result = await wordPressService.testConnection(setting);
    res.json({ success: result.ok, message: result.message });
  });

  /** Preview products from WC (paginated) */
  previewProducts = asyncHandler(async (req: Request, res: Response) => {
    const setting = await getActiveSetting();
    if (!setting) {
      res.status(400).json({ success: false, message: 'No WordPress settings configured' });
      return;
    }
    const page = parseInt((req.query.page as string) ?? '1', 10);
    const perPage = parseInt((req.query.per_page as string) ?? '20', 10);

    let products;
    let total;
    try {
      products = await wordPressService.fetchProducts(setting, page, perPage);
      total = await wordPressService.getTotalProductCount(setting);
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message || 'Failed to fetch products from WordPress' });
      return;
    }

    res.json({
      success: true,
      data: products.map((p: any) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        type: p.type,
        price: p.price,
        status: p.status,
        image: p.images?.[0]?.src ?? null,
        categories: (p.categories ?? []).map((c: any) => c.name),
        variationsCount: p.variations?.length ?? 0,
      })),
      pagination: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    });
  });

  /** Generate Tasks for All Products */
  generateTasks = asyncHandler(async (_req: Request, res: Response) => {
    const setting = await getActiveSetting();
    if (!setting) {
      res.status(400).json({ success: false, message: 'No WordPress settings configured' });
      return;
    }
    
    // Fetch total products to calculate batches
    let total = 0;
    try {
      total = await wordPressService.getTotalProductCount(setting);
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message || 'Failed to fetch products from WordPress' });
      return;
    }

    if (total === 0) {
      res.status(400).json({ success: false, message: 'No products found on WordPress' });
      return;
    }

    const perPage = 20;
    const totalPages = Math.ceil(total / perPage);

    // Prepare task records
    const taskData = [];
    for (let i = 1; i <= totalPages; i++) {
      const remainingItems = total - ((i - 1) * perPage);
      const itemsInThisBatch = Math.min(perPage, remainingItems);

      taskData.push({
        name: `Batch ${i} (Products ${(i - 1) * perPage + 1} - ${(i - 1) * perPage + itemsInThisBatch})`,
        status: 'pending' as const,
        pageNumber: i,
        perPage,
        totalItems: itemsInThisBatch,
        imported: 0,
        failed: 0,
        details: '[]',
      });
    }

    // Batch create for speed
    await (prisma.importTask as any).createMany({ data: taskData });

    res.json({ success: true, message: `Generated ${totalPages} import tasks successfully.` });
  });

  /** List all import tasks */
  getTasks = asyncHandler(async (req: Request, res: Response) => {
    const tasks = await prisma.importTask.findMany({
      orderBy: { createdAt: 'desc' },
    });
    
    // Enhance with live running status if needed
    for (const t of tasks) {
      if (t.status === 'running' && !isTaskRunning(t.id)) {
        // Recover crashed state
        await prisma.importTask.update({ where: { id: t.id }, data: { status: 'failed' } });
        t.status = 'failed';
      } else if (t.status === 'queued' && !isTaskQueued(t.id)) {
        // Recover stuck queued tasks (due to server restart/reload)
        await prisma.importTask.update({ where: { id: t.id }, data: { status: 'pending' } });
        t.status = 'pending';
      }
    }

    res.json({ success: true, data: tasks });
  });

  /** Start a specific task */
  startTask = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const setting = await getActiveSetting();
    if (!setting) {
      res.status(400).json({ success: false, message: 'No WordPress settings configured' });
      return;
    }

    try {
      if (isTaskRunning(id as string)) {
        res.status(400).json({ success: false, message: 'Task is already running' });
        return;
      }
      await startImportTask(setting, id as string);
      res.json({ success: true, message: 'Task started successfully' });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  });

  /** Pause a specific task */
  pauseTask = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!isTaskRunning(id as string)) {
      res.status(400).json({ success: false, message: 'Task is not running' });
      return;
    }
    requestCancelTask(id as string);
    res.json({ success: true, message: 'Pause requested. It will stop after the current product.' });
  });

  /** Clear all tasks (cleanup) */
  clearTasks = asyncHandler(async (_req: Request, res: Response) => {
    await prisma.importTask.deleteMany({});
    res.json({ success: true, message: 'All tasks cleared.' });
  });

  /** Import selected (manual fallback) */
  importSelected = asyncHandler(async (req: Request, res: Response) => {
    const { productIds } = req.body;
    if (!Array.isArray(productIds) || productIds.length === 0) {
      res.status(400).json({ success: false, message: 'productIds array is required' });
      return;
    }
    const setting = await getActiveSetting();
    if (!setting) return;

    // Create a special trackable task
    const task = await prisma.importTask.create({
      data: {
        name: `Selective Import (${productIds.length} items)`,
        status: 'pending',
        pageNumber: 0,
        totalItems: productIds.length,
        details: '[]'
      }
    });

    await startImportTask(setting, task.id, productIds.map(Number));
    res.json({ success: true, message: 'Selective import task created and started.' });
  });
}
