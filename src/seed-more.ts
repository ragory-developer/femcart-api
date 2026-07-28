import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding additional brands and categories...');

  // Create 30 Brands
  const brands = Array.from({ length: 30 }).map((_, i) => ({
    name: `Brand More ${i + 1}`,
    slug: `brand-more-${i + 1}-${Date.now()}`,
    logo: `https://picsum.photos/seed/brandmore${i}/150/150`,
  }));

  for (const brand of brands) {
    await prisma.brand.upsert({
      where: { slug: brand.slug },
      update: {},
      create: brand,
    });
  }
  console.log(`✅ Seeded ${brands.length} more brands`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('✅ Done seeding!');
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
