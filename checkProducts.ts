import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const products = await prisma.product.findMany({
    include: {
      categories: true,
      brand: true
    },
    take: 5
  });
  console.log(JSON.stringify(products.map(p => ({
    name: p.name,
    categories: p.categories.map(c => c.name),
    brand: p.brand?.name
  })), null, 2));
}
main().finally(() => prisma.$disconnect());
