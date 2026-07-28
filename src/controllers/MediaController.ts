import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { asyncHandler, parsePagination } from '../utils/helpers';
import { BaseController } from './BaseController';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, S3_BUCKET_NAME } from '../config/s3';
import logger from '../utils/logger';




// --- Size configs ---
const SIZES = {
  thumb: { width: 150, quality: 75 },
  medium: { width: 500, quality: 78 },
  full: { width: 1200, quality: 80 },
};

export class MediaController extends BaseController {
  /**
   * Upload & process an image into 3 WebP sizes
   */
  upload = asyncHandler(async (req: AuthRequest, res: Response) => {
    const file = (req as any).file as Express.Multer.File;
    if (!file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    const cuid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    
    // SEO optimization: Include the original filename in the generated filename
    const originalName = file.originalname;
    const safeName = path.parse(originalName).name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const baseName = safeName ? `${safeName}-${cuid}` : cuid;

    // Get original image metadata
    let metadata;
    try {
      metadata = await sharp(file.buffer).metadata();
    } catch (error) {
      throw new BadRequestError('Invalid image format or corrupted file');
    }
    
    const origWidth = metadata.width || 1200;
    const origHeight = metadata.height || 800;

    // Process each size
    const results: Record<string, { path: string; size: number }> = {};

    const region = process.env.AWS_REGION || 'us-east-1';

    const processedSizes = await Promise.all(
      Object.entries(SIZES).map(async ([sizeName, config]) => {
        const targetWidth = Math.min(config.width, origWidth);
        const fileName = `${baseName}-${sizeName}.webp`;
        const s3Key = `media/${sizeName}/${fileName}`;

        const processed = await sharp(file.buffer)
          .resize(targetWidth, null, { withoutEnlargement: true })
          .webp({ quality: config.quality })
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
          logger.error(`[MediaUpload] FULL S3 ERROR:`, { error: s3Error });
          throw new Error(`S3 upload failed for ${s3Key}: ${s3Error.message}`);
        }

        return { sizeName, path: finalUrl, size: processed.length };
      })
    );

    for (const res of processedSizes) {
      results[res.sizeName] = {
        path: res.path,
        size: res.size,
      };
    }

    // Extract title from original filename
    const titleFromFile = path.parse(originalName).name.replace(/[-_]/g, ' ');

    // Create database record
    const media = await prisma.media.create({
      data: {
        fileName: `${baseName}.webp`,
        originalName,
        fileType: 'image/webp',
        fileSize: results.full.size,
        title: titleFromFile,
        altText: titleFromFile,
        width: origWidth,
        height: origHeight,
        urlThumbnail: results.thumb.path,
        urlMedium: results.medium.path,
        urlFull: results.full.path,
      },
    });

    res.status(201).json({ success: true, data: media });
  });

  /**
   * Get all media with pagination and search
   */
  getAll = asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, skip } = parsePagination(req.query as any);
    const { search } = req.query;

    const where: any = {};
    if (search) {
      where.OR = [
        { title: { contains: search as string } },
        { altText: { contains: search as string } },
        { originalName: { contains: search as string } },
      ];
    }

    const [media, total] = await Promise.all([
      prisma.media.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.media.count({ where }),
    ]);

    res.json({
      success: true,
      data: media,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });

  /**
   * Get single media by ID
   */
  getById = asyncHandler(async (req: Request, res: Response) => {
    const media = await prisma.media.findUnique({
      where: { id: req.params.id as string },
    });
    if (!media) throw new NotFoundError('Media not found');
    res.json({ success: true, data: media });
  });

  /**
   * Update media attributes (alt text, title, caption, description)
   */
  update = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { altText, title, caption, description } = req.body;
    const media = await prisma.media.update({
      where: { id: req.params.id as string },
      data: { altText, title, caption, description },
    });
    res.json({ success: true, data: media });
  });

  /**
   * Delete media — removes files from disk + DB record
   */
  delete = asyncHandler(async (req: AuthRequest, res: Response) => {
    const media = await prisma.media.findUnique({
      where: { id: req.params.id as string },
    });
    if (!media) throw new NotFoundError('Media not found');

    const urls = [media.urlThumbnail, media.urlMedium, media.urlFull];
    for (const url of urls) {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        try {
          const parsed = new URL(url);
          const key = parsed.pathname.substring(1); // Remove leading slash to get the S3 Key
          await s3Client.send(new DeleteObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: key,
          }));
        } catch (s3Error: any) {
          logger.warn(`Failed to delete object from S3: ${url}`, { error: s3Error.message });
        }
      }
    }

    await prisma.media.delete({ where: { id: req.params.id as string } });
    res.json({ success: true, message: 'Media deleted successfully' });
  });
}
