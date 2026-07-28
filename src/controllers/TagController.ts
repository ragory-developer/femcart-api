import { Request, Response } from 'express';
import prisma from '../config/database';
import { slugify } from '../utils/helpers';

export const getTags = async (_req: Request, res: Response) => {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: tags });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch tags', error });
  }
};

export const createTag = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

    const slug = slugify(name);
    // Check if tag exists
    let tag = await prisma.tag.findUnique({ where: { slug } });
    
    if (!tag) {
      tag = await prisma.tag.create({
        data: { name, slug }
      });
    }

    res.status(201).json({ success: true, data: tag });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create tag', error });
  }
};

export const updateTag = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

    const slug = slugify(name);
    const tag = await prisma.tag.update({
      where: { id: req.params.id as string },
      data: { name, slug }
    });
    res.json({ success: true, data: tag });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update tag', error });
  }
};

export const deleteTag = async (req: Request, res: Response) => {
  try {
    await prisma.tag.delete({
      where: { id: req.params.id as string }
    });
    res.json({ success: true, message: 'Tag deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete tag', error });
  }
};
