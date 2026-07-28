import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import csv from 'csv-parser';

const prisma = new PrismaClient();

// Helper to convert "Tk 950.00 BDT" to 950.00
const parsePrice = (priceStr: string | undefined): number => {
  if (!priceStr) return 0;
  const match = priceStr.match(/[\d,.]+/);
  if (match) {
    return parseFloat(match[0].replace(/,/g, ''));
  }
  return 0;
};

// Helper to generate a slug from the name or link
const generateSlug = (name: string, link: string): string => {
  if (link) {
    const parts = link.split('/');
    if (parts.length > 0) {
      const slug = parts[parts.length - 1];
      if (slug && !slug.includes('?')) return slug.toLowerCase();
    }
  }
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
};

async function main() {
  console.log('Starting CSV Seed...');

  const csvFilePath = 'C:\\Users\\ragory\\Downloads\\femecart-com-2026-07-27-2.csv';
  if (!fs.existsSync(csvFilePath)) {
    console.error(`File not found: ${csvFilePath}`);
    process.exit(1);
  }

  const results: any[] = [];
  
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      console.log(`Parsed ${results.length} rows from CSV.`);
      
      let count = 0;
      for (const row of results) {
        try {
          const name = row.name || row.item_page_title || row.title;
          if (!name) continue;

          const price = parsePrice(row.price || row.sale_price || row.price_1);
          const slug = generateSlug(name, row.item_page_link);
          const description = row.description || row.product_description_short || row.description_1 || '';

          // Collect all non-empty image columns and split by newline
          const rawImages = [
            row.image, row.image_1, row.image_2, row.image_3, row.image_4
          ];
          const imageUrls = rawImages
            .filter(img => img && typeof img === 'string' && img.trim() !== '')
            .flatMap(img => img.split(/\r?\n/))
            .map(img => img.trim())
            .filter(img => img !== '');

          if (imageUrls.length === 0) continue;

          const mainImage = imageUrls[0];
          const galleryImages = imageUrls.slice(1);

          await prisma.product.upsert({
            where: { slug },
            update: {
              name,
              price,
              image: mainImage,
              images: JSON.stringify(galleryImages),
              description,
              stock: 100, // Default stock for testing
            },
            create: {
              name,
              slug,
              price,
              image: mainImage,
              images: JSON.stringify(galleryImages),
              description,
              stock: 100,
              productType: 'SIMPLE',
              unit: 'piece'
            }
          });
          count++;
        } catch (error) {
          console.error(`Error processing row: ${row.name || 'Unknown'}`, error);
        }
      }

      console.log('=============================================');
      console.log(`✅ Successfully seeded ${count} products from CSV!`);
      console.log('=============================================');
      await prisma.$disconnect();
    });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
