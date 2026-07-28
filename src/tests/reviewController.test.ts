import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReviewController } from '../controllers/ReviewController';

// Mock express Request & Response
const mockReq = () => {
  const req: any = {
    params: {},
    query: {},
    body: {},
    user: { userId: 'user-1' }
  };
  return req;
};

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

// Mock Prisma Client
vi.mock('@prisma/client', () => {
  const mPrisma = {
    review: {
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn()
    },
    order: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    $transaction: vi.fn()
  };
  return { PrismaClient: class { constructor() { return mPrisma; } } };
});

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient() as any;

describe('ReviewController', () => {
  let controller: ReviewController;

  beforeEach(() => {
    controller = new ReviewController();
    vi.clearAllMocks();
  });

  describe('updateShowInHome', () => {
    it('should update showInHome status of a review', async () => {
      const req = mockReq();
      req.params.id = 'review-1';
      req.body.showInHome = true;

      const res = mockRes();

      prisma.review.update.mockResolvedValueOnce({
        id: 'review-1',
        showInHome: true,
      });

      // The method doesn't exist yet, it should fail
      await controller.updateShowInHome(req, res);

      expect(prisma.review.update).toHaveBeenCalledWith({
        where: { id: 'review-1' },
        data: { showInHome: true }
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { id: 'review-1', showInHome: true },
        message: 'Review featured in home successfully'
      });
    });

    it('should handle errors when updating showInHome status', async () => {
      const req = mockReq();
      req.params.id = 'review-1';
      req.body.showInHome = true;

      const res = mockRes();

      prisma.review.update.mockRejectedValueOnce(new Error('DB error'));

      await controller.updateShowInHome(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Internal server error'
      });
    });
  });

  describe('getAll with featured flag', () => {
    it('should filter reviews by showInHome when featured query param is passed', async () => {
      const req = mockReq();
      req.query.featured = 'true';
      const res = mockRes();

      prisma.review.findMany.mockResolvedValueOnce([{ id: 'review-1', showInHome: true }]);

      await controller.getAll(req, res);

      expect(prisma.review.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { showInHome: true, isApproved: true }
      }));
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [{ id: 'review-1', showInHome: true }]
      });
    });
  });
});
