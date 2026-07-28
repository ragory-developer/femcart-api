import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({ take: 10 });
  for (const product of products) {
    const discount = product.price * 0.15; // 15% off
    await prisma.product.update({
      where: { id: product.id },
      data: { specialPrice: product.price - discount }
    });
  }
  console.log(`Added specialPrice to ${products.length} products`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
