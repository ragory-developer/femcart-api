import { PrismaClient } from '@prisma/client';
import { createSoftDeleteExtension } from 'prisma-extension-soft-delete';

export const basePrisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

const prisma = basePrisma.$extends(
  createSoftDeleteExtension({
    models: {
      Product: true,
      Category: true,
      Brand: true,
      User: true,
      Order: true,
      Coupon: true,
    },
    defaultConfig: {
      field: 'deletedAt',
      createValue: (deleted) => {
        if (deleted) return new Date();
        return null;
      },
    },
  })
);

export default prisma;
