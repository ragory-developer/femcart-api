import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../utils/helpers';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { BaseController } from './BaseController';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

export class TrashController extends BaseController {
  
  getTrash = asyncHandler(async (req: Request, res: Response) => {
    const models = [
      { name: 'product', label: 'Product' },
      { name: 'category', label: 'Category' },
      { name: 'brand', label: 'Brand' },
      { name: 'user', label: 'User' },
      { name: 'order', label: 'Order' },
      { name: 'coupon', label: 'Coupon' }
    ];

    let allTrash: any[] = [];

    for (const model of models) {
      const deletedItems = await prisma.$queryRawUnsafe(`SELECT * FROM \`${model.name}\` WHERE deletedAt IS NOT NULL ORDER BY deletedAt DESC`);
      
      const mapped = (deletedItems as any[]).map(item => ({
        id: item.id,
        entityType: model.label,
        name: item.name || item.email || item.code || item.id,
        deletedAt: item.deletedAt,
        deletedBy: item.deletedBy || 'System'
      }));
      
      allTrash = [...allTrash, ...mapped];
    }

    allTrash.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());

    res.json({ success: true, data: allTrash });
  });

  restoreItem = asyncHandler(async (req: Request, res: Response) => {
    const { model, id } = req.params;
    const allowedModels = ['product', 'category', 'brand', 'user', 'order', 'coupon'];
    
    if (!allowedModels.includes(model.toLowerCase())) {
      throw new BadRequestError('Invalid model type');
    }

    await prisma.$executeRawUnsafe(`UPDATE \`${model.toLowerCase()}\` SET deletedAt = NULL, deletedBy = NULL WHERE id = ?`, id);

    res.json({ success: true, message: `${model} restored successfully` });
  });

  purgeItem = asyncHandler(async (req: Request, res: Response) => {
    const { model, id } = req.params;
    const allowedModels = ['product', 'category', 'brand', 'user', 'order', 'coupon'];
    
    if (!allowedModels.includes(model.toLowerCase())) {
      throw new BadRequestError('Invalid model type');
    }

    await prisma.$executeRawUnsafe(`DELETE FROM \`${model.toLowerCase()}\` WHERE id = ?`, id);

    res.json({ success: true, message: `${model} permanently deleted` });
  });
}
