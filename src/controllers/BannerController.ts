import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getBanners = async (req: Request, res: Response) => {
  try {
    const banners = await prisma.banner.findMany({
      orderBy: { sortOrder: 'asc' }
    });
    return res.status(200).json({ success: true, data: banners });
  } catch (error: any) {
    console.error("getBanners Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const createBanner = async (req: Request, res: Response) => {
  try {
    const { title, badgeText, description, imageSrc, ctaText, ctaUrl, position, sortOrder, isActive } = req.body;
    
    if (!imageSrc) {
      return res.status(400).json({ success: false, message: "imageSrc is required" });
    }

    const banner = await prisma.banner.create({
      data: { title, badgeText, description, imageSrc, ctaText, ctaUrl, position, sortOrder, isActive }
    });
    return res.status(201).json({ success: true, data: banner });
  } catch (error: any) {
    console.error("createBanner Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateBanner = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, badgeText, description, imageSrc, ctaText, ctaUrl, position, sortOrder, isActive } = req.body;
    
    const banner = await prisma.banner.update({
      where: { id },
      data: { title, badgeText, description, imageSrc, ctaText, ctaUrl, position, sortOrder, isActive }
    });
    return res.status(200).json({ success: true, data: banner });
  } catch (error: any) {
    console.error("updateBanner Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteBanner = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.banner.delete({ where: { id } });
    return res.status(200).json({ success: true, message: "Banner deleted" });
  } catch (error: any) {
    console.error("deleteBanner Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
