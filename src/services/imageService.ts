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
export async function downloadAndSaveImage(imageUrl: string, altText = ''): Promise<string> {
  const urlPath = new URL(imageUrl).pathname;
  const originalName = path.basename(urlPath);

  const existing = await prisma.media.findFirst({
    where: { originalName },
    select: { urlFull: true },
  });
  
  if (existing) {
    // Rely purely on the database cache since files live safely in the cloud
    console.log(`[Image] Record exists, returning cached S3 URL: ${existing.urlFull}`);
    return existing.urlFull;
  }

  console.log(`[Image] Downloading: ${imageUrl}`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); 
  
  try {
    const resp = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!resp.ok) throw new Error(`Image download failed (${resp.status}): ${imageUrl}`);
    const buffer = Buffer.from(await resp.arrayBuffer());
    console.log(`[Image] Downloaded: ${imageUrl} (${buffer.length} bytes)`);
    return await processAndUploadToS3(buffer, originalName, altText);
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error(`Image download timed out: ${imageUrl}`);
    throw err;
  }
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
