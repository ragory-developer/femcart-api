import cron from 'node-cron';
import prisma from '../config/database';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, S3_BUCKET_NAME } from '../config/s3';
import logger from '../utils/logger';

// Run every night at 3:00 AM
const mediaCleanupJob = cron.schedule('0 3 * * *', async () => {
  try {
    logger.info('[MediaCleanup] Starting orphaned media cleanup job...');
    
    // Fetch all media
    const allMedia = await prisma.media.findMany();
    
    // Fetch all used images across the database
    const products = await prisma.product.findMany({ select: { image: true, images: true } });
    const variants = await prisma.productVariant.findMany({ select: { image: true } });
    const categories = await prisma.category.findMany({ select: { image: true } });
    const brands = await prisma.brand.findMany({ select: { logo: true } });
    
    // Aggregate used URLs
    const usedUrls = new Set<string>();
    
    products.forEach((p: any) => {
      if (p.image) usedUrls.add(p.image);
      if (p.images) {
        try {
          const parsed = JSON.parse(p.images);
          if (Array.isArray(parsed)) parsed.forEach(img => usedUrls.add(img));
        } catch (e) {
            usedUrls.add(p.images);
        }
      }
    });
    
    variants.forEach((v: any) => { if (v.image) usedUrls.add(v.image); });
    categories.forEach((c: any) => { if (c.image) usedUrls.add(c.image); });
    brands.forEach((b: any) => { if (b.logo) usedUrls.add(b.logo); });

    let deletedCount = 0;

    for (const media of allMedia) {
      // Check if any of its URLs are in the usedUrls set
      // Usually, the frontend stores urlFull or urlMedium in the database fields
      const isUsed = usedUrls.has(media.urlFull) || usedUrls.has(media.urlMedium) || usedUrls.has(media.urlThumbnail);
      
      if (!isUsed) {
        // It's orphaned! Delete from S3
        const urls = [media.urlThumbnail, media.urlMedium, media.urlFull];
        for (const url of urls) {
          if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            try {
              const parsed = new URL(url);
              const key = parsed.pathname.substring(1); 
              await s3Client.send(new DeleteObjectCommand({
                Bucket: S3_BUCKET_NAME,
                Key: key,
              }));
            } catch (s3Error: any) {
              logger.warn(`[MediaCleanup] Failed to delete object from S3: ${url}`, { error: s3Error.message });
            }
          }
        }
        
        // Delete from Database
        await prisma.media.delete({ where: { id: media.id } });
        deletedCount++;
      }
    }
    
    logger.info(`[MediaCleanup] Completed successfully. Deleted ${deletedCount} orphaned media objects.`);
  } catch (error) {
    logger.error('[MediaCleanup] Error during orphaned media cleanup:', { error });
  }
});

export default mediaCleanupJob;
