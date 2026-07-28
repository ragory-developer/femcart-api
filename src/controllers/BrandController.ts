import { Request, Response } from 'express';
import prisma, { basePrisma } from '../config/database';
import logger from '../utils/logger';
import { AuthRequest } from '../middleware/auth';
import { NotFoundError } from '../utils/errors';
import { asyncHandler, parsePagination, slugify } from '../utils/helpers';
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

export class BrandController extends BaseController {
  /** Get all brands */
  getAll = asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, skip } = parsePagination(req.query as any);
    const { search } = req.query;

    const where: any = {};
    if (search) {
      where.name = { contains: search as string };
    }

    // 1. Generate unique cache key
    const version = await CacheService.get<number>(KeyFactory.brandCacheVersion()) || 1;
    const queryHash = crypto.createHash('md5').update(`${page}-${limit}-${search || ''}`).digest('hex');
    const cacheKey = KeyFactory.brandList(`${version}:${queryHash}`);
    
    // 2. Try to serve from cache
    const cachedData = await CacheService.get<any>(cacheKey);
    if (cachedData) {
      res.json({
        success: true,
        data: cachedData.data,
        pagination: cachedData.pagination,
      });
      return;
    }

    const [brands, total] = await Promise.all([
      prisma.brand.findMany({
        where,
        include: { _count: { select: { products: true } } },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.brand.count({ where }),
    ]);

    const pagination = { page, limit, total, totalPages: Math.ceil(total / limit) };
    
    // 3. Save to cache
    await CacheService.set(cacheKey, { data: brands, pagination }, 3600 * 24); // 24 hours TTL fallback

    res.json({
      success: true,
      data: brands,
      pagination,
    });
  });

  /** Get all brand slugs (for ISR) */
  getSlugs = asyncHandler(async (_req: Request, res: Response) => {
    const brands = await prisma.brand.findMany({
      select: { slug: true }
    });
    res.json({ success: true, data: brands.map((b: any) => b.slug) });
  });

  /** Get single brand by slug */
  getBySlug = asyncHandler(async (req: Request, res: Response) => {
    const brand = await prisma.brand.findUnique({
      where: { slug: req.params.slug as string },
      include: { _count: { select: { products: true } } },
    });
    if (!brand) throw new NotFoundError('Brand not found');
    res.json({ success: true, data: brand });
  });

  create = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, logo, content, seoData } = req.body;
    let baseSlug = slugify(name as string);
    let slug = baseSlug;
    
    let counter = 1;
    while (await basePrisma.brand.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    const brand = await prisma.brand.create({
      data: { 
        name: name as string, 
        slug, 
        logo: logo as string,
        content: content as string,
        seoData: normalizeJsonField(seoData)
      } as any,
    });
    
    // Invalidate brand cache
    await CacheService.incr(KeyFactory.brandCacheVersion());
    
    res.status(201).json({ success: true, data: brand });
  });

  update = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, logo, content, seoData } = req.body;
    
    const data: any = {};
    
    if (name) {
      data.name = name;
      let baseSlug = slugify(name);
      let slug = baseSlug;
      let counter = 1;
      while (await basePrisma.brand.findFirst({ where: { slug, id: { not: req.params.id as string } } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
      data.slug = slug;
    }
    
    data.logo = logo === undefined ? undefined : logo;
    data.content = content === undefined ? undefined : content;
    data.seoData = seoData !== undefined ? normalizeJsonField(seoData) : undefined;

    const brand = await prisma.brand.update({
      where: { id: req.params.id as string },
      data,
    });
    
    // Invalidate brand cache
    await CacheService.incr(KeyFactory.brandCacheVersion());
    
    logger.info(`Brand ${req.params.id} updated successfully`);
    res.json({ success: true, data: brand });
  });

  /** Admin: delete a brand */
  delete = asyncHandler(async (req: AuthRequest, res: Response) => {
    await prisma.brand.delete({ where: { id: req.params.id as string } });
    
    // Invalidate brand cache
    await CacheService.incr(KeyFactory.brandCacheVersion());
    
    res.json({ success: true, message: 'Brand deleted successfully' });
  });
}
