import { Request, Response } from 'express';
import prisma, { basePrisma } from '../config/database';
import logger from '../utils/logger';
import { AuthRequest } from '../middleware/auth';
import { NotFoundError } from '../utils/errors';
import { asyncHandler, slugify } from '../utils/helpers';
import { BaseController } from './BaseController';
import { CacheService } from '../core/redis/CacheService';
import { KeyFactory } from '../core/redis/KeyFactory';
import crypto from 'crypto';

const normalizeJsonField = (val: any): string | null => {
  if (val === undefined || val === null) return null;
  if (typeof val === 'object') {
    return JSON.stringify(val);
  }
  return val;
};

export class CategoryController extends BaseController {
  /** Get all categories (with optional tree structure) */
  getAll = asyncHandler(async (req: Request, res: Response) => {
    const search = req.query.search as string || '';
    
    // 1. Generate unique cache key
    const version = await CacheService.get<number>(KeyFactory.categoryCacheVersion()) || 1;
    const queryHash = crypto.createHash('md5').update(search).digest('hex');
    const cacheKey = KeyFactory.categoryList(`${version}:${queryHash}`);
    
    // 2. Try to serve from cache
    const cachedData = await CacheService.get<any>(cacheKey);
    if (cachedData) {
      res.json({ success: true, data: cachedData });
      return;
    }

    const categories = await prisma.category.findMany({
      include: { 
        children: {
          include: {
            children: {
              include: {
                _count: { select: { products: true } }
              }
            },
            _count: { select: { products: true } }
          }
        }, 
        _count: { select: { products: true } } 
      },
      where: { 
        parentId: null, 
        name: req.query.search ? { contains: req.query.search as string } : undefined 
      },
      orderBy: { name: 'asc' },
    });
    
    // 3. Save to cache
    await CacheService.set(cacheKey, categories, 3600 * 24); // 24 hours TTL fallback
    
    res.json({ success: true, data: categories });
  });

  /** Get all category slugs (for ISR) */
  getSlugs = asyncHandler(async (_req: Request, res: Response) => {
    const categories = await prisma.category.findMany({
      select: { slug: true }
    });
    res.json({ success: true, data: categories.map((c: any) => c.slug) });
  });

  /** Get single category by slug */
  getBySlug = asyncHandler(async (req: Request, res: Response) => {
    const category = await prisma.category.findUnique({
      where: { slug: req.params.slug as string },
      include: { 
        children: {
          include: {
            _count: { select: { products: true } }
          }
        }, 
        _count: { select: { products: true } } 
      },
    });
    if (!category) throw new NotFoundError('Category not found');
    res.json({ success: true, data: category });
  });

  create = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, image, parentId, content, seoData } = req.body;
    let baseSlug = slugify(name as string);
    let slug = baseSlug;
    
    let counter = 1;
    while (await basePrisma.category.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    const category = await prisma.category.create({
      data: { 
        name: name as string, 
        slug, 
        image: image as string, 
        parentId: parentId as string,
        content: content as string,
        seoData: normalizeJsonField(seoData)
      } as any,
    });
    
    // Invalidate category cache
    await CacheService.incr(KeyFactory.categoryCacheVersion());
    
    res.status(201).json({ success: true, data: category });
  });

  update = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, image, parentId, content, seoData } = req.body;
    
    // Build update object only with provided/valid fields
    const data: any = {};
    
    if (name) {
      data.name = name;
      let baseSlug = slugify(name);
      let slug = baseSlug;
      let counter = 1;
      while (await basePrisma.category.findFirst({ where: { slug, id: { not: req.params.id as string } } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
      data.slug = slug;
    }
    
    // Explicitly allow null if coming from frontend as null or empty string
    data.image = image === undefined ? undefined : image;
    data.parentId = parentId === "" || parentId === null ? null : (parentId === undefined ? undefined : parentId);
    data.content = content === undefined ? undefined : content;
    data.seoData = seoData !== undefined ? normalizeJsonField(seoData) : undefined;

    logger.debug(`Updating Category ${req.params.id}`, { data });
    
    const category = await prisma.category.update({
      where: { id: req.params.id as string },
      data,
    });
    
    // Invalidate category cache
    await CacheService.incr(KeyFactory.categoryCacheVersion());
    
    logger.info(`Category ${req.params.id} updated successfully`);
    res.json({ success: true, data: category });
  });

  /** Admin: delete a category */
  delete = asyncHandler(async (req: AuthRequest, res: Response) => {
    await prisma.category.delete({ where: { id: req.params.id as string } });
    
    // Invalidate category cache
    await CacheService.incr(KeyFactory.categoryCacheVersion());
    
    res.json({ success: true, message: 'Category deleted successfully' });
  });
}
