import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestIdMiddleware } from '../middleware/requestId';
import { authenticate } from '../middleware/auth';
import { catalogIntegrityService } from '../services/CatalogIntegrityService';
import { sendFacebookEvent } from '../utils/facebook-capi';
import logger from '../utils/logger';
import jwt from 'jsonwebtoken';
import { config } from '../config';

// Mock database connection
vi.mock('../config/database', () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
    },
    product: {
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    cart: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    cartItem: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    productVariant: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    orderItem: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    setting: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    wordPressSetting: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
  return {
    default: mockPrisma,
  };
});

// Import prisma directly from the mocked module for assertions
import prisma from '../config/database';

// Mock jwt
vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(),
  },
}));

// Mock logger to avoid flooding output
vi.mock('../utils/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    http: vi.fn(),
  },
}));

describe('Backend Production Fixes & Stability Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Request ID Middleware', () => {
    it('should attach a request UUID to req.id and set X-Request-Id header', () => {
      const req: any = { headers: {} };
      const res: any = { setHeader: vi.fn() };
      const next = vi.fn();

      requestIdMiddleware(req, res, next);

      expect(req.id).toBeDefined();
      expect(typeof req.id).toBe('string');
      expect(res.setHeader).toHaveBeenCalledWith('x-request-id', req.id);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('JWT User Existence Check Middleware', () => {
    it('should pass if user exists in the database', async () => {
      const req: any = { headers: { authorization: 'Bearer mock-token' } };
      const res: any = {};
      const next = vi.fn();

      // Mock JWT decode success
      (jwt.verify as any).mockReturnValue({ userId: 'user-123', role: 'USER' });
      // Mock user database hit
      (prisma.user.findUnique as any).mockResolvedValue({ id: 'user-123', role: 'USER' });

      await authenticate(req, res, next);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: { id: true, role: true, permissions: true, adminRole: { select: { permissions: true } } },
      });
      expect(req.user).toEqual({ userId: 'user-123', role: 'USER', permissions: [] });
      expect(next).toHaveBeenCalledWith();
    });

    it('should return 401 error if user is deleted (not found in database)', async () => {
      const req: any = { headers: { authorization: 'Bearer mock-token' } };
      const res: any = {};
      const next = vi.fn();

      (jwt.verify as any).mockReturnValue({ userId: 'deleted-user', role: 'USER' });
      (prisma.user.findUnique as any).mockResolvedValue(null); // Database returns null

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalled();
      const errorPassed = next.mock.calls[0][0];
      expect(errorPassed.statusCode).toBe(401);
      expect(errorPassed.message).toBe('User not found');
    });
  });

  describe('Catalog Integrity Service', () => {
    it('should report correct statistics and verify duplicate slugs/orphans', async () => {
      // Mock duplicates
      (prisma.product.groupBy as any).mockResolvedValue([
        { slug: 'conflict-slug', _count: { slug: 2 } },
      ]);
      (prisma.product.findMany as any).mockResolvedValueOnce([
        { id: 'prod-1' },
        { id: 'prod-2' },
      ]); // duplicate check queries findMany next

      // Mock products for orphaned check
      (prisma.product.findMany as any).mockResolvedValue([
        { id: 'prod-3', name: 'Orphaned Item', slug: 'orphaned-item', categories: [] },
      ]);

      const result = await catalogIntegrityService.checkIntegrity();

      expect(result.summary.hasErrors).toBe(true);
      expect(result.duplicateSlugs).toHaveLength(1);
      expect(result.duplicateSlugs[0].slug).toBe('conflict-slug');
      expect(result.orphanedProducts).toHaveLength(1);
      expect(result.orphanedProducts[0].name).toBe('Orphaned Item');
    });
  });

  describe('Facebook Conversions API Fallback', () => {
    it('should log a warning warning and skip gracefully if both db settings and env keys are missing', async () => {
      // Set config keys to empty
      config.facebook.pixelId = '';
      config.facebook.accessToken = '';

      // Mock setting queries returning empty
      (prisma.setting.findMany as any).mockResolvedValue([]);

      await sendFacebookEvent({
        eventName: 'PageView',
        userData: {},
      });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Missing Facebook Conversions API access token or pixel ID')
      );
    });
  });
});
