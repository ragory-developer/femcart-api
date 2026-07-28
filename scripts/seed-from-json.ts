import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

function extractPrice(priceStr) {
  if (!priceStr) return null;
  const match = priceStr.match(/[\d,.]+/);
  if (match) {
    return parseFloat(match[0].replace(/,/g, ''));
  }
  return null;
}

function assignCategory(name, categories) {
  const lowerName = name.toLowerCase();
  let matchedCat = categories.find(c => c.slug === 'uncategorized');

  if (lowerName.includes('bra')) {
    if (lowerName.includes('sports')) matchedCat = categories.find(c => c.slug.includes('sports-bra'));
    else if (lowerName.includes('push')) matchedCat = categories.find(c => c.slug.includes('push-up'));
    else if (lowerName.includes('nursing')) matchedCat = categories.find(c => c.slug.includes('nursing'));
    else if (lowerName.includes('seamless')) matchedCat = categories.find(c => c.slug.includes('seamless'));
    else if (lowerName.includes('cotton')) matchedCat = categories.find(c => c.slug.includes('cotton-bra'));
    else matchedCat = categories.find(c => c.slug.includes('non-padded') || c.slug.includes('bra'));
  } else if (lowerName.includes('panty') || lowerName.includes('panties') || lowerName.includes('brief')) {
    if (lowerName.includes('cotton')) matchedCat = categories.find(c => c.slug.includes('cotton-panty'));
    else if (lowerName.includes('period') || lowerName.includes('leak')) matchedCat = categories.find(c => c.slug.includes('period'));
    else matchedCat = categories.find(c => c.slug.includes('panties'));
  } else if (lowerName.includes('legging') || lowerName.includes('tight')) {
    matchedCat = categories.find(c => c.slug.includes('leggings') || c.slug.includes('hosiery'));
  } else if (lowerName.includes('bodysuit') || lowerName.includes('shape')) {
    matchedCat = categories.find(c => c.slug.includes('bodysuit') || c.slug.includes('shapewear'));
  } else if (lowerName.includes('sleep') || lowerName.includes('pajama') || lowerName.includes('robe') || lowerName.includes('lounge')) {
    matchedCat = categories.find(c => c.slug.includes('lounge') || c.slug.includes('pajama') || c.slug.includes('robe'));
  }

  return matchedCat || categories[Math.floor(Math.random() * categories.length)];
}

async function main() {
  console.log('Reading JSON file...');
  const data = JSON.parse(fs.readFileSync('C:\\Users\\ragory\\Desktop\\convertcsv.json', 'utf8'));
  
  console.log('Clearing existing products...');
  await prisma.product.deleteMany({});
  
  console.log('Fetching categories and brands...');
  const categories = await prisma.category.findMany();
  const brands = await prisma.brand.findMany();
  
  console.log(`Found ${categories.length} categories and ${brands.length} brands.`);
  
  const createdProducts = [];
  
  for (const item of data) {
    const name = item.title || item.name;
    if (!name || createdProducts.includes(name)) continue;
    createdProducts.push(name);
    
    let price = extractPrice(item.price) || extractPrice(item.sale_price) || parseFloat(faker.commerce.price({ min: 300, max: 3000 }));
    let specialPrice = extractPrice(item.sale_price);
    if (specialPrice >= price) specialPrice = null;
    
    let images = [];
    if (item.image_1) {
      images = item.image_1.split('\\n').map(u => u.trim()).filter(u => u);
    }
    if (images.length === 0 && item.image) images = [item.image];
    
    const category = assignCategory(name, categories);
    const brand = brands.length > 0 ? brands[Math.floor(Math.random() * brands.length)] : null;
    
    const description = item.description_1 || faker.commerce.productDescription();
    
    try {
      await prisma.product.create({
        data: {
          name: name,
          slug: faker.helpers.slugify(name).toLowerCase(),
          description: description,
          shortDescription: faker.lorem.sentence(),
          price: price,
          specialPrice: specialPrice,
          stock: faker.number.int({ min: 10, max: 200 }),
          image: item.image || faker.image.url(),
          images: JSON.stringify(images),
          unit: 'pcs',
          featured: faker.datatype.boolean(),
          averageRating: faker.number.float({ min: 3.5, max: 5.0, fractionDigits: 1 }),
          ratingCount: faker.number.int({ min: 5, max: 200 }),
          productType: 'SIMPLE',
          categories: category ? { connect: { id: category.id } } : undefined,
          brand: brand ? { connect: { id: brand.id } } : undefined,
        }
      });
      console.log(`Seeded: ${name}`);
    } catch (e) {
      console.error(`Failed to seed ${name}:`, e.message);
    }
  }
  
  console.log(`Successfully seeded ${createdProducts.length} products from JSON!`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
