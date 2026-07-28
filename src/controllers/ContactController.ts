import { Request, Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler, parsePagination } from '../utils/helpers';
import { BaseController } from './BaseController';

export class ContactController extends BaseController {
  /** Create a new contact message from public storefront */
  create = asyncHandler(async (req: Request, res: Response) => {
    const { name, email, subject, message } = req.body;
    
    if (!name || !email || !subject || !message) {
      res.status(400).json({ success: false, message: 'All fields are required.' });
      return;
    }

    const contactMessage = await prisma.contactMessage.create({
      data: { name, email, subject, message }
    });

    res.status(201).json({ success: true, data: contactMessage });
  });

  /** Admin: Get all contact messages */
  getAll = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page, limit, skip } = parsePagination(req.query as any);
    const { search, isRead } = req.query;

    const where: any = {};
    if (search && typeof search === 'string') {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { subject: { contains: search } },
        { message: { contains: search } }
      ];
    }
    
    if (isRead !== undefined && isRead !== '') {
      where.isRead = isRead === 'true';
    }

    const [messages, total] = await Promise.all([
      prisma.contactMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.contactMessage.count({ where }),
    ]);

    res.json({
      success: true,
      data: messages,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });

  /** Admin: Mark message as read/unread */
  markAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { isRead } = req.body;

    const message = await prisma.contactMessage.update({
      where: { id: id as string },
      data: { isRead }
    });

    res.json({ success: true, data: message });
  });

  /** Admin: Delete message */
  delete = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    await prisma.contactMessage.delete({ where: { id: id as string } });
    res.json({ success: true, message: 'Message deleted successfully' });
  });
}
