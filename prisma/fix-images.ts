import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany();
  for (const product of products) {
    if (product.image && product.image.includes('loremflickr')) {
      const newUrl = `https://placehold.co/600x600/F9F0F0/A05E5E?font=montserrat&text=${encodeURIComponent(product.name)}`;
      await prisma.product.update({
        where: { id: product.id },
        data: { 
          image: newUrl,
          images: JSON.stringify([newUrl])
        }
      });
    }
  }
  console.log("Images updated successfully!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
