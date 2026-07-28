import { Response } from 'express';
import prisma, { basePrisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { asyncHandler, parsePagination } from '../utils/helpers';
import { BaseController } from './BaseController';

export class CouponController extends BaseController {
  /** Get all coupons (Admin) */
  getAll = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page, limit, skip } = parsePagination(req.query as any);

    const [coupons, total] = await Promise.all([
      prisma.coupon.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.coupon.count(),
    ]);

    res.json({
      success: true,
      data: coupons,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  /** Create new coupon (Admin) */
  create = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { code, discount, type, minOrder, maxUses, expiresAt, active } = req.body;

    // Validate inputs
    if (!code || !discount) {
      throw new BadRequestError('Coupon code and discount are required');
    }

    // Check if code already exists
    const existing = await basePrisma.coupon.findUnique({ where: { code } });
    if (existing) {
      if (existing.deletedAt) throw new BadRequestError('Coupon code exists but is in the Trash. Please restore or permanently delete it first.');
      throw new BadRequestError('Coupon code already exists');
    }

    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase(),
        discount: parseFloat(discount),
        type: type || 'PERCENT',
        minOrder: parseFloat(minOrder) || 0,
        maxUses: parseInt(maxUses, 10) || 100,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        active: active !== undefined ? active : true,
      },
    });

    res.status(201).json({ success: true, data: coupon });
  });

  /** Update coupon (Admin) */
  update = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { code, discount, type, minOrder, maxUses, expiresAt, active } = req.body;
    const id = req.params.id as string;

    const coupon = await prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundError('Coupon not found');

    const updated = await prisma.coupon.update({
      where: { id },
      data: {
        code: code ? code.toUpperCase() : undefined,
        discount: discount ? parseFloat(discount) : undefined,
        type,
        minOrder: minOrder !== undefined ? parseFloat(minOrder) : undefined,
        maxUses: maxUses !== undefined ? parseInt(maxUses, 10) : undefined,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        active: active !== undefined ? active : undefined,
      },
    });

    res.json({ success: true, data: updated });
  });

  /** Delete coupon (Admin) */
  delete = asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    
    // Check if coupon exists
    const coupon = await prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundError('Coupon not found');

    await prisma.coupon.delete({ where: { id } });

    res.json({ success: true, message: 'Coupon deleted successfully' });
  });

  /** Get coupon report (Admin) */
  getReport = asyncHandler(async (req: AuthRequest, res: Response) => {
    const code = req.params.code as string;

    const coupon = await prisma.coupon.findUnique({ where: { code } });
    if (!coupon) throw new NotFoundError('Coupon not found');

    const ordersWithCoupon = await prisma.order.findMany({
      where: { couponCode: code },
      select: { discount: true }
    });

    const totalOrders = ordersWithCoupon.length;
    const totalDiscount = ordersWithCoupon.reduce((sum: any, order) => sum + order.discount, 0);

    res.json({
      success: true,
      data: {
        code,
        totalOrders,
        totalDiscount,
      }
    });
  });
}
