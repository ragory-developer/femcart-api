const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Fetching products...');
  const products = await prisma.product.findMany({
    include: { categories: true }
  });

  const categories = await prisma.category.findMany();
  const categoryMap = {};
  categories.forEach(c => {
    categoryMap[c.slug] = c.id;
  });

  let updatedCount = 0;

  for (const product of products) {
    if (product.categories.length === 0) {
      const name = product.name.toLowerCase();
      let assignedSlug = null;

      if (name.includes('sports bra') || name.includes('zip sports')) {
        assignedSlug = 'sports-bra-cat';
      } else if (name.includes('push up')) {
        assignedSlug = 'push-up-bra';
      } else if (name.includes('nursing') || name.includes('maternity')) {
        assignedSlug = 'nursing-bra';
      } else if (name.includes('cotton bra')) {
        assignedSlug = 'cotton-bra';
      } else if (name.includes('seamless')) {
        assignedSlug = 'seamless-bra';
      } else if (name.includes('non-padded') || name.includes('wing lace')) {
        assignedSlug = 'non-padded-bra';
      } else if (name.includes('bra')) {
        assignedSlug = 'bras';
      } else if (name.includes('shaper') || name.includes('slimming') || name.includes('shapewear') || name.includes('cincher')) {
        assignedSlug = 'shapewear';
      } else if (name.includes('period panty') || name.includes('leakproof')) {
        assignedSlug = 'period-panty';
      } else if (name.includes('cotton panty')) {
        assignedSlug = 'cotton-panty';
      } else if (name.includes('panty') || name.includes('panties') || name.includes('brief') || name.includes('thong')) {
        assignedSlug = 'panties';
      } else if (name.includes('legging') || name.includes('yoga')) {
        assignedSlug = 'leggings';
      } else {
        // default to accessories if completely unknown, or leave uncategorized
      }

      if (assignedSlug && categoryMap[assignedSlug]) {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            categories: {
              connect: [{ id: categoryMap[assignedSlug] }]
            }
          }
        });
        console.log(`Assigned "${product.name}" to category "${assignedSlug}"`);
        updatedCount++;
      }
    }
  }

  console.log(`Finished updating ${updatedCount} products.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
