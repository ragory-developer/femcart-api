import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.importStagingRow.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' }
  });
  
  console.log(JSON.stringify(rows.map(r => ({
    name: r.name,
    sku: r.sku,
    categories: r.categories,
    brandName: r.brandName
  })), null, 2));
}

main().finally(() => prisma.$disconnect());
