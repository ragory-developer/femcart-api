import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sanitizePosProduct, sanitizePosOrder, posService } from '../services/posService';
import { posAuth, PosRequest } from '../middleware/posAuth';

// Mock database connection
vi.mock('../config/database', () => {
  const mockPrisma = {
    apiKey: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    productVariant: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    order: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    orderNote: {
      create: vi.fn(),
    },
    brand: {
      findMany: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
    },
    inviSyncLog: {
      create: vi.fn().mockResolvedValue({ id: 'log-1' }),
    },
    $transaction: vi.fn(async (cb) => {
      return cb(mockPrisma);
    }),
  };
  return {
    default: mockPrisma,
    basePrisma: mockPrisma,
  };
});

import prisma from '../config/database';

describe('Invi POS & Webhook Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. posAuth Middleware', () => {
    it('should reject request when consumer key is missing', async () => {
      const req = { headers: {}, query: {} } as PosRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await posAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: expect.stringContaining('Missing x-consumer-key') })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject key that does not start with ck_live_', async () => {
      const req = {
        headers: { 'x-consumer-key': 'sk_test_12345' },
        query: {},
      } as unknown as PosRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await posAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('must start with "ck_live_"') })
      );
    });

    it('should reject key if not found in database', async () => {
      (prisma.apiKey.findUnique as any).mockResolvedValue(null);

      const req = {
        headers: { 'x-consumer-key': 'ck_live_not_found_123' },
        query: {},
      } as unknown as PosRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await posAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Invalid Consumer Key. Key not found.' })
      );
    });

    it('should reject inactive key', async () => {
      (prisma.apiKey.findUnique as any).mockResolvedValue({
        id: 'key-1',
        name: 'POS Inactive',
        consumerKey: 'ck_live_inactive_123',
        status: 'INACTIVE',
        allowedDomain: '*',
      });

      const req = {
        headers: { 'x-consumer-key': 'ck_live_inactive_123' },
        query: {},
      } as unknown as PosRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await posAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('INACTIVE') })
      );
    });

    it('should allow valid active key and attach req.pos', async () => {
      (prisma.apiKey.findUnique as any).mockResolvedValue({
        id: 'key-1',
        name: 'POS Active',
        consumerKey: 'ck_live_valid_key_123',
        status: 'ACTIVE',
        allowedDomain: '*',
      });
      (prisma.apiKey.update as any).mockResolvedValue({});

      const req = {
        headers: { 'x-consumer-key': 'ck_live_valid_key_123' },
        query: {},
      } as unknown as PosRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await posAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.pos).toEqual({
        id: 'key-1',
        name: 'POS Active',
        consumerKey: 'ck_live_valid_key_123',
        allowedDomain: '*',
      });
    });

    it('should accept Bearer token and query param formats', async () => {
      (prisma.apiKey.findUnique as any).mockResolvedValue({
        id: 'key-1',
        name: 'POS Active',
        consumerKey: 'ck_live_bearer_123',
        status: 'ACTIVE',
        allowedDomain: '*',
      });

      // Test Bearer Auth
      const reqBearer = {
        headers: { authorization: 'Bearer ck_live_bearer_123' },
        query: {},
      } as unknown as PosRequest;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
      const next = vi.fn();

      await posAuth(reqBearer, res, next);
      expect(next).toHaveBeenCalled();

      // Test Query Param
      const reqQuery = {
        headers: {},
        query: { consumer_key: 'ck_live_bearer_123' },
      } as unknown as PosRequest;
      const nextQuery = vi.fn();

      await posAuth(reqQuery, res, nextQuery);
      expect(nextQuery).toHaveBeenCalled();
    });
  });

  describe('2. posService Data Sanitization', () => {
    it('should sanitize product entities correctly', () => {
      const rawProduct = {
        id: 'prod-1',
        externalId: 'invi-101',
        name: 'Silk Bra',
        slug: 'silk-bra',
        sku: 'SILK-001',
        price: 1500,
        comparePrice: 1800,
        stock: 25,
        unit: 'piece',
        brand: { id: 'b-1', name: 'Femcart Luxe' },
        categories: [{ id: 'c-1', name: 'Bras', slug: 'bras' }],
        variants: [{ id: 'v-1', sku: 'SILK-001-34B', price: 1500, stock: 10, isDefault: true }],
        deletedAt: null,
        deletedBy: null,
        seoData: '{"keywords":"bra"}',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const sanitized = sanitizePosProduct(rawProduct);

      expect(sanitized).toBeDefined();
      expect(sanitized?.id).toBe('prod-1');
      expect(sanitized?.invi_pid).toBe('invi-101');
      expect(sanitized?.sku).toBe('SILK-001');
      expect(sanitized?.stock).toBe(25);
      expect(sanitized?.brand).toEqual({ id: 'b-1', name: 'Femcart Luxe' });
      expect(sanitized?.variants).toHaveLength(1);
      // Ensure internal SEO / soft-delete fields are excluded
      expect((sanitized as any).seoData).toBeUndefined();
      expect((sanitized as any).deletedAt).toBeUndefined();
    });

    it('should sanitize order entities correctly with relations', () => {
      const rawOrder = {
        id: 'ord-1',
        status: 'PROCESSING',
        paymentStatus: 'PAID',
        paymentMethod: 'COD',
        total: 3000,
        customerName: 'Ayesha Rahman',
        customerPhone: '01711111111',
        deliveryAddress: 'Banani, Dhaka',
        deliveryCity: 'Dhaka',
        trackingNumber: 'TRK-999',
        courierName: 'Steadfast',
        items: [
          {
            id: 'item-1',
            productId: 'prod-1',
            variantId: 'v-1',
            price: 1500,
            quantity: 2,
            product: { name: 'Silk Bra', sku: 'SILK-001' },
            variant: { sku: 'SILK-001-34B' },
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const sanitized = sanitizePosOrder(rawOrder);

      expect(sanitized).toBeDefined();
      expect(sanitized?.id).toBe('ord-1');
      expect(sanitized?.totalAmount).toBe(3000);
      expect(sanitized?.items[0].sku).toBe('SILK-001-34B');
      expect(sanitized?.items[0].total).toBe(3000);
    });
  });

  describe('3. posService Inventory Engine', () => {
    it('should update Product stock when SKU belongs to simple product', async () => {
      (prisma.productVariant.findFirst as any).mockResolvedValue(null);
      (prisma.product.findFirst as any).mockResolvedValue({
        id: 'prod-1',
        sku: 'SIMPLE-001',
        stock: 50,
      });
      (prisma.product.update as any).mockResolvedValue({
        id: 'prod-1',
        sku: 'SIMPLE-001',
        stock: 80,
      });

      const res = await posService.updateStock('SIMPLE-001', 80);

      expect(res.results.updated).toBe(1);
      expect(res.results.details[0].type).toBe('PRODUCT');
      expect(res.results.details[0].newStock).toBe(80);
      expect(res.results.details[0].delta).toBe(30);
    });

    it('should update ProductVariant stock and recalculate parent product aggregate stock', async () => {
      (prisma.productVariant.findFirst as any).mockResolvedValue({
        id: 'var-1',
        productId: 'prod-parent',
        sku: 'VAR-001',
        stock: 10,
      });
      (prisma.productVariant.update as any).mockResolvedValue({
        id: 'var-1',
        productId: 'prod-parent',
        sku: 'VAR-001',
        stock: 25,
      });
      (prisma.productVariant.findMany as any).mockResolvedValue([
        { stock: 25 },
        { stock: 15 },
      ]);
      (prisma.product.update as any).mockResolvedValue({
        id: 'prod-parent',
        stock: 40,
      });

      const res = await posService.updateStock('VAR-001', 25);

      expect(res.results.updated).toBe(1);
      expect(res.results.details[0].type).toBe('VARIANT');
      expect(res.results.details[0].newStock).toBe(25);
      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-parent' },
          data: { stock: 40 },
        })
      );
    });

    it('should batch update multiple SKUs and record InviSyncLog telemetry', async () => {
      (prisma.productVariant.findFirst as any).mockResolvedValue(null);
      (prisma.product.findFirst as any).mockResolvedValue({
        id: 'prod-1',
        sku: 'BATCH-001',
        stock: 10,
      });
      (prisma.product.update as any).mockResolvedValue({
        id: 'prod-1',
        sku: 'BATCH-001',
        stock: 30,
      });

      const res = await posService.batchUpdateStock([{ sku: 'BATCH-001', stock: 30 }]);

      expect(res.results.updated).toBe(1);
      expect(prisma.inviSyncLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'INBOUND_STOCK',
            status: 'SUCCESS',
            itemsCount: 1,
          }),
        })
      );
    });
  });

  describe('4. posService Order Lifecycle & Transactions', () => {
    it('should cancel order and automatically restore variant and product stock', async () => {
      const existingOrder = {
        id: 'ord-cancel-1',
        status: 'CONFIRMED',
        items: [
          { productId: 'prod-1', variantId: 'var-1', quantity: 2 },
          { productId: 'prod-2', variantId: null, quantity: 1 },
        ],
      };

      (prisma.order.findFirst as any).mockResolvedValue(existingOrder);
      (prisma.productVariant.update as any).mockResolvedValue({});
      (prisma.product.update as any).mockResolvedValue({});
      (prisma.order.update as any).mockResolvedValue({
        ...existingOrder,
        status: 'CANCELLED',
      });
      (prisma.orderNote.create as any).mockResolvedValue({});

      const result = await posService.cancelOrder('ord-cancel-1', 'Customer requested cancellation via POS');

      expect(result.success).toBe(true);
      expect(prisma.productVariant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'var-1' },
          data: { stock: { increment: 2 } },
        })
      );
      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-2' },
          data: { stock: { increment: 1 } },
        })
      );
      expect(prisma.orderNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: 'ord-cancel-1',
            isSystem: true,
          }),
        })
      );
    });
  });
});
