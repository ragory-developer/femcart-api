import { Request, Response } from 'express';
import prisma from '../config/database';

export const getTestimonials = async (req: Request, res: Response) => {
  try {
    const { limit = 10, page = 1, activeOnly = 'true' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const where = activeOnly === 'true' ? { isActive: true } : {};

    const [testimonials, total] = await Promise.all([
      prisma.testimonial.findMany({
        where,
        take: Number(limit),
        skip,
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.testimonial.count({ where }),
    ]);

    res.json({
      data: testimonials,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('[TestimonialController] getTestimonials error:', error);
    res.status(500).json({ message: 'Failed to fetch testimonials' });
  }
};

export const createTestimonial = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const testimonial = await prisma.testimonial.create({
      data,
    });
    res.status(201).json(testimonial);
  } catch (error) {
    console.error('[TestimonialController] createTestimonial error:', error);
    res.status(500).json({ message: 'Failed to create testimonial' });
  }
};

export const updateTestimonial = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const testimonial = await prisma.testimonial.update({
      where: { id: id as string },
      data,
    });
    res.json(testimonial);
  } catch (error) {
    console.error('[TestimonialController] updateTestimonial error:', error);
    res.status(500).json({ message: 'Failed to update testimonial' });
  }
};

export const deleteTestimonial = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.testimonial.delete({
      where: { id: id as string },
    });
    res.status(204).send();
  } catch (error) {
    console.error('[TestimonialController] deleteTestimonial error:', error);
    res.status(500).json({ message: 'Failed to delete testimonial' });
  }
};
