import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import prisma from '../config/database';
import { asyncHandler } from '../utils/helpers';

export class SearchController extends BaseController {
  
  /**
   * Search for products, categories, and brands
   * GET /api/search?q=query&limit=10
   */
  public search = asyncHandler(async (req: Request, res: Response) => {
    const startTime = Date.now();
    const { q, limit = 10 } = req.query;

    if (!q || typeof q !== 'string') {
      res.json({ success: true, data: { products: [], categories: [], brands: [], timeTakenMs: 0 } });
      return;
    }

    const trimmedQ = q.trim().toLowerCase();
    
    // Log search keyword frequency asynchronously (only log if keyword is >= 3 chars to avoid single-letter prefix pollution)
    if (trimmedQ && trimmedQ.length >= 3) {
      try {
        const sk = (prisma as any).searchKeyword;
        if (sk) {
          sk.upsert({
            where: { keyword: trimmedQ },
            update: { frequency: { increment: 1 } },
            create: { keyword: trimmedQ, frequency: 1 }
          }).catch((err: any) => console.error("Failed to update search keyword frequency", err));
        }
      } catch (e) {
        console.warn("SearchKeyword model not generated yet");
      }
    }

    const query = q as string;
    const parsedLimit = parseInt((limit as string) || '10', 10);
    
    if (!query || query.trim() === '') {
      res.json({
        success: true,
        data: {
          products: [],
          categories: [],
          brands: [],
          timeTakenMs: 0
        }
      });
      return;
    }

    const searchTerms = query.trim().split(/\s+/);
    
    // Create an advanced OR condition for Prisma
    // We try to match name, brand name, category name, and sku.
    // Excluded 'description' to massively improve TiDB query latency.
    const searchConditions = searchTerms.map(term => ({
      OR: [
        { name: { contains: term } },
        { brand: { name: { contains: term } } },
        { categories: { some: { name: { contains: term } } } },
        { variants: { some: { sku: { contains: term } } } }
      ]
    }));

    // Fetch products
    const products = await prisma.product.findMany({
      where: {
        AND: searchConditions
      },
      include: {
        brand: { select: { name: true } },
        categories: { select: { name: true } },
        variants: { select: { sku: true, price: true, specialPrice: true } }
      },
      take: parsedLimit * 2 // Fetch more to do in-memory scoring
    });

    // In-memory scoring and highlighting for "advanced" feel
    const scoredProducts = products.map((product: any) => {
      let score = 0;
      const lowerQuery = query.toLowerCase();
      const lowerName = product.name.toLowerCase();
      
      // Escape special characters for regex
      const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedQuery = escapeRegExp(query);
      
      // Highlighting mock
      let highlightedName = product.name;
      let highlightedBrand = product.brand?.name || '';
      
      // Exact match gets highest boost
      if (lowerName === lowerQuery) {
        score += 100;
        highlightedName = `<mark>${product.name}</mark>`;
      } 
      // Starts with gets medium boost
      else if (lowerName.startsWith(lowerQuery)) {
        score += 50;
        const regex = new RegExp(`^(${escapedQuery})`, 'i');
        highlightedName = product.name.replace(regex, '<mark>$1</mark>');
      }
      // Contains gets lower boost
      else if (lowerName.includes(lowerQuery)) {
        score += 25;
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        highlightedName = product.name.replace(regex, '<mark>$1</mark>');
      }
      
      // Check Brand match
      if (product.brand?.name?.toLowerCase().includes(lowerQuery)) {
        score += 15;
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        highlightedBrand = product.brand.name.replace(regex, '<mark>$1</mark>');
      }

      // Format for frontend
      return {
        id: product.id,
        slug: product.slug,
        name: product.name,
        image: product.image,
        price: product.price,
        specialPrice: product.specialPrice,
        score,
        brandName: product.brand?.name || '',
        categoryNames: product.categories.map((c: any) => c.name).join(', '),
        highlights: {
          name: [highlightedName],
          brandName: [highlightedBrand]
        }
      };
    });

    // Sort by relevance score
    scoredProducts.sort((a: any, b) => b.score - a.score);
    
    // Slice to limit
    const finalProducts = scoredProducts.slice(0, parsedLimit);

    const end = Date.now();

    res.json({
      success: true,
      data: {
        products: finalProducts,
        categories: [],
        brands: [],
        timeTakenMs: end - startTime
      }
    });
  });

  /**
   * Dummy endpoint to prevent 404s if the frontend calls it.
   */
  public reindexAll = asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      message: `Reindexing is not required for Prisma-based search.`
    });
  });

  /**
   * Get trending search terms (combines top categories and brands)
   * GET /api/search/trending
   */
  public getTrending = asyncHandler(async (req: Request, res: Response) => {
    try {
      // 1. Fetch top searches from SearchKeyword table
      let topKeywords: any[] = [];
      const sk = (prisma as any).searchKeyword;
      if (sk) {
        topKeywords = await sk.findMany({
          orderBy: { frequency: 'desc' },
          take: 6,
          select: { keyword: true }
        });
      }

      let trendingTerms = topKeywords.map((k: any) => k.keyword);

      // 2. If we have less than 6 trending searches, backfill with top categories and brands
      if (trendingTerms.length < 6) {
        const categories = await prisma.category.findMany({ take: 4, select: { name: true } });
        const brands = await prisma.brand.findMany({ take: 3, select: { name: true } });

        const fallbacks = [
          ...categories.map((c: any) => c.name),
          ...brands.map((b: any) => b.name)
        ].filter(Boolean);
        
        // Merge without duplicates, preserving order
        trendingTerms = Array.from(new Set([...trendingTerms, ...fallbacks])).slice(0, 6);
      }

      res.json({
        success: true,
        data: trendingTerms
      });
    } catch (error) {
      // Fallback if db is empty or fails
      res.json({
        success: true,
        data: ['Organic Milk', 'Fresh Tomatoes', 'Beef', 'Chicken', 'Apple', 'Rice']
      });
    }
  });
}

export const searchController = new SearchController();
