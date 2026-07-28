import { Request, Response } from 'express';
import prisma from '../config/database';
import { slugify } from '../utils/helpers';

// --- SPECIFICATIONS ---

export const getSpecifications = async (req: Request, res: Response) => {
  try {
    const specifications = await prisma.attribute.findMany({
      where: req.query.filter === 'true' ? { showOnFilter: true } : {},
      include: {
        values: { 
          where: req.query.filter === 'true' ? { showOnFilter: true } : {},
          orderBy: { value: 'asc' } 
        }
      },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: specifications });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch specifications', error });
  }
};

export const createSpecification = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

    const slug = slugify(name);
    // Check if specification exists
    let specification = await prisma.attribute.findUnique({ where: { slug } });
    
    if (!specification) {
      specification = await prisma.attribute.create({
        data: { name, slug, showOnFilter: req.body.showOnFilter ?? true }
      });
    } else {
      return res.status(400).json({ success: false, message: 'Specification already exists' });
    }

    // fetch it back with values (empty though)
    const result = await prisma.attribute.findUnique({
      where: { id: specification.id },
      include: { values: true }
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create specification', error });
  }
};

export const updateSpecification = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

    const slug = slugify(name);
    const specification = await prisma.attribute.update({
      where: { id: req.params.id as string },
      data: { 
        name, 
        slug, 
        showOnFilter: req.body.showOnFilter ?? true 
      },
      include: { values: true }
    });
    res.json({ success: true, data: specification });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update specification', error });
  }
};

export const deleteSpecification = async (req: Request, res: Response) => {
  try {
    await prisma.attribute.delete({
      where: { id: req.params.id as string }
    });
    res.json({ success: true, message: 'Specification deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete specification', error });
  }
};

// --- SPECIFICATION VALUES ---

export const createSpecificationValue = async (req: Request, res: Response) => {
  try {
    const { value } = req.body;
    const { specificationId } = req.params as { specificationId: string };

    if (!value || !specificationId) {
      return res.status(400).json({ success: false, message: 'Value and specificationId are required' });
    }

    // Make sure It doesn't exist
    const existing = await prisma.attributeValue.findFirst({
      where: { value, attributeId: specificationId as string }
    });

    if (existing) {
      return res.status(400).json({ success: false, message: 'Specification value already exists' });
    }

    const specificationValue = await prisma.attributeValue.create({
      data: { 
        value, 
        attributeId: specificationId as string,
        showOnFilter: req.body.showOnFilter ?? true
      }
    });

    res.status(201).json({ success: true, data: specificationValue });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create specification value', error });
  }
};

export const deleteSpecificationValue = async (req: Request, res: Response) => {
  try {
    await prisma.attributeValue.delete({
      where: { id: req.params.valueId as string }
    });
    res.json({ success: true, message: 'Specification value deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete specification value', error });
  }
};

export const updateSpecificationValue = async (req: Request, res: Response) => {
  try {
    const { value } = req.body;
    const { valueId, specificationId } = req.params as { valueId: string, specificationId: string };

    if (!value) return res.status(400).json({ success: false, message: 'Value is required' });

    // Ensure no complete duplicates
    const existing = await prisma.attributeValue.findFirst({
      where: { value, attributeId: specificationId, id: { not: valueId as string } }
    });

    if (existing) {
      return res.status(400).json({ success: false, message: 'This value already exists for the specification' });
    }

    const specificationValue = await prisma.attributeValue.update({
      where: { id: valueId as string },
      data: { 
        value,
        showOnFilter: req.body.showOnFilter ?? true
      }
    });
    res.json({ success: true, data: specificationValue });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update specification value', error });
  }
};
