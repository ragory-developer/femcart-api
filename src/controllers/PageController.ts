import { Request, Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { NotFoundError } from '../utils/errors';
import { asyncHandler, parsePagination, slugify } from '../utils/helpers';
import { BaseController } from './BaseController';

export class PageController extends BaseController {
  getAll = asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, skip } = parsePagination(req.query as any);
    const { search, status, routed } = req.query;

    const where: any = {};
    if (search) {
      where.title = { contains: search as string };
    }
    if (status) {
      where.status = status;
    }

    if (routed !== undefined) {
      const navItems = await prisma.navbarItem.findMany({ select: { url: true } });
      const footerLinks = await prisma.footerLink.findMany({ select: { url: true } });
      const allUrls = [...navItems.map((n: any) => n.url), ...footerLinks.map(f => f.url)];
      const routedSlugs = allUrls.map(url => url.split('/').pop() as string).filter(Boolean);
      
      if (routed === 'true') {
        where.slug = { in: routedSlugs };
      } else if (routed === 'false') {
        where.slug = { notIn: routedSlugs };
      }
    }

    const [pages, total] = await Promise.all([
      prisma.page.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.page.count({ where }),
    ]);

    res.json({
      success: true,
      data: pages,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });

  getBySlug = asyncHandler(async (req: Request, res: Response) => {
    const slug = req.params.slug as string;
    const page = await prisma.page.findUnique({
      where: { slug }
    });
    if (!page) throw new NotFoundError('Page not found');
    res.json({ success: true, data: page });
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const page = await prisma.page.findUnique({
      where: { id }
    });
    if (!page) throw new NotFoundError('Page not found');
    res.json({ success: true, data: page });
  })

  create = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { title, slug, content, css, status, seoData } = req.body;
    const generatedSlug = slug || slugify(title as string);
    const page = await prisma.page.create({
      data: { 
        title: title as string, 
        slug: generatedSlug, 
        content: content as string | null,
        css: css as string | null,
        status: status || 'draft',
        seoData: typeof seoData === 'object' ? JSON.stringify(seoData) : seoData
      },
    });
    res.status(201).json({ success: true, data: page });
  });

  update = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { title, slug, content, css, status, seoData } = req.body;
    
    const data: any = {};
    
    if (title !== undefined) data.title = title;
    if (slug !== undefined) data.slug = slug;
    if (content !== undefined) data.content = content;
    if (css !== undefined) data.css = css;
    if (status !== undefined) data.status = status;
    if (seoData !== undefined) {
      data.seoData = typeof seoData === 'object' ? JSON.stringify(seoData) : seoData;
    }

    const page = await prisma.page.update({
      where: { id: req.params.id as string },
      data,
    });
    
    res.json({ success: true, data: page });
  });

  delete = asyncHandler(async (req: AuthRequest, res: Response) => {
    await prisma.page.delete({ where: { id: req.params.id as string } });
    res.json({ success: true, message: 'Page deleted successfully' });
  });
}
