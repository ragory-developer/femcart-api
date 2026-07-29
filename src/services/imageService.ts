/**
 * Image download + Sharp processing service for WordPress import.
 * Downloads remote images, converts to WebP in 3 sizes, uploads to AWS S3 directly, and upserts Media record.
 */

import { PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import prisma from '../config/database';
import { S3_BUCKET_NAME, s3Client } from '../config/s3';

const SIZES = {
  thumb:  { width: 150,  quality: 75 },
  medium: { width: 500,  quality: 78 },
  full:   { width: 1200, quality: 80 },
};

function generateBaseName(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Download a remote image URL and save it as WebP (3 sizes) to AWS S3.
 * Returns the DB Media record URL (full path to S3 object).
 * Deduplicates by checking originalName (derived from URL basename).
 */
export async function downloadAndSaveImage(
  imageUrl: string, 
  altText = '',
  strategy: 'LOCAL' | 'AWS_S3' = 'AWS_S3'
): Promise<string> {
  const urlPath = new URL(imageUrl).pathname;
  const originalName = path.basename(urlPath);

  const existing = await prisma.media.findFirst({
    where: { originalName },
    select: { urlFull: true },
  });
  
  if (existing) {
    console.log(`[Image] Record exists, returning cached URL: ${existing.urlFull}`);
    return existing.urlFull;
  }

  console.log(`[Image] Downloading: ${imageUrl}`);
  
  let buffer: Buffer | null = null;
  let lastError: any = null;
  
  // Retry logic: up to 3 attempts with exponential backoff
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); 
    
    try {
      const resp = await fetch(imageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!resp.ok) {
        if (resp.status === 404) throw new Error(`Image not found (404): ${imageUrl}`);
        throw new Error(`Download failed (${resp.status}): ${imageUrl}`);
      }
      buffer = Buffer.from(await resp.arrayBuffer());
      break;
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;
      if (err.message.includes('404')) throw err; // Don't retry 404
      console.log(`[Image] Attempt ${attempt} failed for ${imageUrl}: ${err.message}`);
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
  }

  if (!buffer) {
    throw new Error(`Failed to download ${imageUrl} after 3 attempts. Last error: ${lastError?.message}`);
  }

  console.log(`[Image] Downloaded: ${imageUrl} (${buffer.length} bytes)`);
  
  if (strategy === 'LOCAL') {
    return await processAndSaveLocal(buffer, originalName, altText);
  } else {
    return await processAndUploadToS3(buffer, originalName, altText);
  }
}

async function processAndSaveLocal(buffer: Buffer, originalName: string, altText: string): Promise<string> {
  const metadata = await sharp(buffer).metadata();
  const origWidth  = metadata.width  ?? 1200;
  const origHeight = metadata.height ?? 800;

  const baseName = generateBaseName();
  const results: Record<string, { path: string; size: number }> = {};
  
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'media');
  await fs.mkdir(uploadDir, { recursive: true });

  for (const [sizeName, cfg] of Object.entries(SIZES)) {
    const targetWidth = Math.min(cfg.width, origWidth);
    const fileName = `${baseName}-${sizeName}.webp`;
    const filePath = path.join(uploadDir, fileName);

    const processed = await sharp(buffer)
      .resize(targetWidth, null, { withoutEnlargement: true })
      .webp({ quality: cfg.quality })
      .toBuffer();

    await fs.writeFile(filePath, processed);
    results[sizeName] = { path: `/uploads/media/${fileName}`, size: processed.length };
  }

  const titleFromFile = path.parse(originalName).name.replace(/[-_]/g, ' ');

  await prisma.media.create({
    data: {
      fileName: `${baseName}.webp`,
      originalName,
      fileType: 'image/webp',
      fileSize: results.full.size,
      title: titleFromFile,
      altText: altText || titleFromFile,
      width: origWidth,
      height: origHeight,
      urlThumbnail: results.thumb.path,
      urlMedium: results.medium.path,
      urlFull: results.full.path,
    },
  });

  return results.full.path;
}

async function processAndUploadToS3(buffer: Buffer, originalName: string, altText: string): Promise<string> {
  // Process with sharp
  const metadata = await sharp(buffer).metadata();
  const origWidth  = metadata.width  ?? 1200;
  const origHeight = metadata.height ?? 800;

  const baseName = generateBaseName();
  const results: Record<string, { path: string; size: number }> = {};
  
  const region = process.env.AWS_REGION || 'us-east-1';

  for (const [sizeName, cfg] of Object.entries(SIZES)) {
    const targetWidth = Math.min(cfg.width, origWidth);
    const fileName = `${baseName}-${sizeName}.webp`;
    const s3Key = `media/${sizeName}/${fileName}`;

    const processed = await sharp(buffer)
      .resize(targetWidth, null, { withoutEnlargement: true })
      .webp({ quality: cfg.quality })
      .toBuffer();

    let finalUrl = '';
    try {
      // Upload to S3
      await s3Client.send(new PutObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: s3Key,
        Body: processed,
        ContentType: 'image/webp',
      }));
      finalUrl = `https://${S3_BUCKET_NAME}.s3.${region}.amazonaws.com/${s3Key}`;
    } catch (s3Error: any) {
      console.error(`[Image] S3 upload failed for ${s3Key}:`, s3Error);
      throw new Error(`S3 upload failed for ${s3Key}: ${s3Error.message}`);
    }
    results[sizeName] = { path: finalUrl, size: processed.length };
  }

  const titleFromFile = path.parse(originalName).name.replace(/[-_]/g, ' ');

  await prisma.media.create({
    data: {
      fileName: `${baseName}.webp`,
      originalName,
      fileType: 'image/webp',
      fileSize: results.full.size,
      title: titleFromFile,
      altText: altText || titleFromFile,
      width: origWidth,
      height: origHeight,
      urlThumbnail: results.thumb.path,
      urlMedium: results.medium.path,
      urlFull: results.full.path,
    },
  });

  return results.full.path;
}
