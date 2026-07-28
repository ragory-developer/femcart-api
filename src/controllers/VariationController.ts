import { Request, Response } from 'express';
import prisma from '../config/database';
import { slugify } from '../utils/helpers';

// --- VARIATIONS ---

export const getVariations = async (_req: Request, res: Response) => {
  try {
    const variations = await prisma.variation.findMany({
      include: {
        values: { orderBy: { value: 'asc' } }
      },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: variations });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch variations', error });
  }
};

export const createVariation = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

    const slug = slugify(name);
    // Check if variation exists
    let variation = await prisma.variation.findUnique({ where: { slug } });
    
    if (!variation) {
      variation = await prisma.variation.create({
        data: { name, slug }
      });
    } else {
      return res.status(400).json({ success: false, message: 'Variation already exists' });
    }

    // fetch it back with values (empty though)
    const result = await prisma.variation.findUnique({
      where: { id: variation.id },
      include: { values: true }
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create variation', error });
  }
};

export const updateVariation = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

    const slug = slugify(name);
    const variation = await prisma.variation.update({
      where: { id: req.params.id as string },
      data: { name, slug },
      include: { values: true }
    });
    res.json({ success: true, data: variation });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update variation', error });
  }
};

export const deleteVariation = async (req: Request, res: Response) => {
  try {
    await prisma.variation.delete({
      where: { id: req.params.id as string }
    });
    res.json({ success: true, message: 'Variation deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete variation', error });
  }
};

// --- VARIATION VALUES ---

export const createVariationValue = async (req: Request, res: Response) => {
  try {
    const { value } = req.body;
    const { variationId } = req.params;

    if (!value || !variationId) {
      return res.status(400).json({ success: false, message: 'Value and variationId are required' });
    }

    // Make sure It doesn't exist
    const existing = await prisma.variationValue.findFirst({
      where: { value, variationId: variationId as string }
    });

    if (existing) {
      return res.status(400).json({ success: false, message: 'Variation value already exists' });
    }

    const variationValue = await prisma.variationValue.create({
      data: { value, variationId: variationId as string }
    });

    res.status(201).json({ success: true, data: variationValue });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create variation value', error });
  }
};

export const deleteVariationValue = async (req: Request, res: Response) => {
  try {
    await prisma.variationValue.delete({
      where: { id: req.params.valueId as string }
    });
    res.json({ success: true, message: 'Variation value deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete variation value', error });
  }
};

export const updateVariationValue = async (req: Request, res: Response) => {
  try {
    const { value } = req.body;
    const { valueId, variationId } = req.params;

    if (!value) return res.status(400).json({ success: false, message: 'Value is required' });

    // Ensure no complete duplicates
    const existing = await prisma.variationValue.findFirst({
      where: { value, variationId: variationId as string, id: { not: valueId as string } }
    });

    if (existing) {
      return res.status(400).json({ success: false, message: 'This value already exists for the variation' });
    }

    const variationValue = await prisma.variationValue.update({
      where: { id: valueId as string },
      data: { value }
    });
    res.json({ success: true, data: variationValue });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update variation value', error });
  }
};
