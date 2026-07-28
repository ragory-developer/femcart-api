import { PrismaClient } from '@prisma/client';
import { categories } from './realistic-scraped-data';

const prisma = new PrismaClient();

async function main() {
  console.log('Test category seeding...');
  const createdCats: Record<string, string> = {};
  
  // First pass: parent categories
  for (const cat of categories.filter((c: any) => !c.parent)) {
    console.log(`Creating parent: ${cat.name} (${cat.slug})`);
    // We do a dry-run check or insert
    const created = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: { name: cat.name, slug: cat.slug }
    });
    createdCats[cat.slug] = created.id;
  }
  
  // Second pass: child categories
  for (const cat of categories.filter((c: any) => c.parent)) {
    console.log(`Processing child: ${cat.name} (${cat.slug}) - Parent: ${cat.parent}`);
    console.log(`  Parent ID resolved in map: ${createdCats[cat.parent]}`);
    if (createdCats[cat.parent]) {
      try {
        const created = await prisma.category.upsert({
          where: { slug: cat.slug },
          update: { parentId: createdCats[cat.parent] },
          create: { name: cat.name, slug: cat.slug, parentId: createdCats[cat.parent] }
        });
        createdCats[cat.slug] = created.id;
        console.log(`  Created successfully!`);
      } catch (err: any) {
        console.error(`  Error creating child category ${cat.name}:`, err.message);
      }
    } else {
      console.log(`  Warning: Parent ${cat.parent} not in createdCats map yet!`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
