import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchController } from '../controllers/SearchController';

// Mock database connection
vi.mock('../config/database', () => {
  const mockPrisma = {
    product: {
      findMany: vi.fn(),
    },
    category: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    brand: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    searchKeyword: {
      upsert: vi.fn().mockImplementation(() => ({
        catch: vi.fn()
      })),
      findMany: vi.fn().mockResolvedValue([]),
    }
  };
  return {
    default: mockPrisma,
  };
});

// Import prisma directly from the mocked module for assertions
import prisma from '../config/database';

// Mock asyncHandler helper to bypass Express wrapper so that the route handlers return their original promises in tests
vi.mock('../utils/helpers', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    asyncHandler: (fn: any) => fn,
  };
});

describe('SearchController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('search relevance scoring', () => {
    it('ranks exact matches higher than partial or contains matches', async () => {
      const mockProducts = [
        {
          id: 'p1',
          name: 'Green Apple',
          slug: 'green-apple',
          price: 10,
          categories: [{ name: 'Fruits' }],
          brand: { name: 'Fresh Farms' },
          variants: []
        },
        {
          id: 'p2',
          name: 'Apple Juice',
          slug: 'apple-juice',
          price: 5,
          categories: [{ name: 'Beverages' }],
          brand: { name: 'Juicy' },
          variants: []
        },
        {
          id: 'p3',
          name: 'Apple',
          slug: 'apple',
          price: 2,
          categories: [{ name: 'Fruits' }],
          brand: { name: 'Direct' },
          variants: []
        }
      ];

      (prisma.product.findMany as any).mockResolvedValue(mockProducts);

      const req: any = { query: { q: 'Apple', limit: '10' } };
      const res: any = {
        json: vi.fn()
      };
      const next: any = vi.fn();

      await searchController.search(req, res, next);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      
      expect(response.success).toBe(true);
      const results = response.data.products;
      expect(results).toHaveLength(3);
      
      // Top rank should be exact match "Apple"
      expect(results[0].name).toBe('Apple');
      expect(results[0].score).toBe(100);

      // Second rank should be starts-with match "Apple Juice"
      expect(results[1].name).toBe('Apple Juice');
      expect(results[1].score).toBe(50);

      // Third rank should be contains match "Green Apple"
      expect(results[2].name).toBe('Green Apple');
      expect(results[2].score).toBe(25);
    });

    it('logs search keyword frequency when search query length is >= 3', async () => {
      (prisma.product.findMany as any).mockResolvedValue([]);
      
      const req: any = { query: { q: 'Orange', limit: '10' } };
      const res: any = { json: vi.fn() };
      const next: any = vi.fn();

      await searchController.search(req, res, next);

      const sk = (prisma as any).searchKeyword;
      expect(sk.upsert).toHaveBeenCalledWith({
        where: { keyword: 'orange' },
        update: { frequency: { increment: 1 } },
        create: { keyword: 'orange', frequency: 1 }
      });
    });
  });

  describe('getTrending', () => {
    it('backfills with categories and brands if keyword history is sparse', async () => {
      const sk = (prisma as any).searchKeyword;
      sk.findMany.mockResolvedValue([]); // No trending keywords stored
      
      (prisma.category.findMany as any).mockResolvedValue([{ name: 'Organic Milk' }]);
      (prisma.brand.findMany as any).mockResolvedValue([{ name: 'Fresh Farms' }]);

      const req: any = {};
      const res: any = { json: vi.fn() };
      const next: any = vi.fn();

      await searchController.getTrending(req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.data).toContain('Organic Milk');
      expect(response.data).toContain('Fresh Farms');
    });
  });
});
