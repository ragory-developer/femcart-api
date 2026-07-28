import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.navbarItem.deleteMany({});
  
  const topItems = [
    { title: 'Home', url: '/', position: 'top', sortOrder: 1 },
    { title: 'Catalog', url: '/catalog', position: 'top', sortOrder: 2 },
    { title: 'About Us', url: '/about', position: 'top', sortOrder: 3 },
    { title: 'Contact Us', url: '/contact', position: 'top', sortOrder: 4 },
  ];
  
  await prisma.navbarItem.createMany({ data: topItems });

  const bottomItems = [
    {
      title: 'Lingerie', url: '/categories/lingerie', position: 'bottom', sortOrder: 1,
      children: [
        { title: 'Bras', url: '/categories/bras', position: 'bottom', sortOrder: 1 },
        { title: 'Panties', url: '/categories/panties', position: 'bottom', sortOrder: 2 },
        { title: 'Lingerie Sets', url: '/categories/lingerie-sets', position: 'bottom', sortOrder: 3 },
      ]
    },
    {
      title: 'Shapewear', url: '/categories/shapewear', position: 'bottom', sortOrder: 2,
      children: [
        { title: 'Bodysuits', url: '/categories/bodysuits', position: 'bottom', sortOrder: 1 },
        { title: 'Waist Cinchers', url: '/categories/waist-cinchers', position: 'bottom', sortOrder: 2 },
        { title: 'Control Briefs', url: '/categories/control-briefs', position: 'bottom', sortOrder: 3 },
      ]
    },
    {
      title: 'Activewear', url: '/categories/activewear', position: 'bottom', sortOrder: 3,
      children: [
        { title: 'Sports Bras', url: '/categories/sports-bras', position: 'bottom', sortOrder: 1 },
        { title: 'Leggings', url: '/categories/leggings', position: 'bottom', sortOrder: 2 },
      ]
    },
    {
      title: 'Loungewear & Sleepwear', url: '/categories/loungewear', position: 'bottom', sortOrder: 4,
      children: [
        { title: 'Pajamas', url: '/categories/pajamas', position: 'bottom', sortOrder: 1 },
        { title: 'Robes', url: '/categories/robes', position: 'bottom', sortOrder: 2 },
        { title: 'Nightgowns', url: '/categories/nightgowns', position: 'bottom', sortOrder: 3 },
      ]
    },
    {
      title: 'Swimwear', url: '/categories/swimwear', position: 'bottom', sortOrder: 5,
      children: [
        { title: 'Bikinis', url: '/categories/bikinis', position: 'bottom', sortOrder: 1 },
        { title: 'One-Piece', url: '/categories/one-piece', position: 'bottom', sortOrder: 2 },
      ]
    }
  ];

  for (const item of bottomItems) {
    await prisma.navbarItem.create({
      data: {
        title: item.title,
        url: item.url,
        position: item.position,
        sortOrder: item.sortOrder,
        children: {
          create: item.children.map(child => ({
            title: child.title,
            url: child.url,
            position: child.position,
            sortOrder: child.sortOrder
          }))
        }
      }
    });
  }
  console.log("Navbar items updated successfully!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
