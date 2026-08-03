import 'dotenv/config';
import prisma from './src/config/database';

async function main() {
  console.log('App Prisma Connected!');
  
  const pCount = await prisma.product.count();
  console.log(`Product count: ${pCount}`);
  
  const cCount = await prisma.category.count();
  console.log(`Category count: ${cCount}`);
  
  const bCount = await prisma.brand.count();
  console.log(`Brand count: ${bCount}`);
}

main().catch(console.error).finally(() => process.exit(0));
