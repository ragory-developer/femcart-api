import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { BaseController } from './BaseController';

const prisma = new PrismaClient();

export class ReviewController extends BaseController {
  // Fetch reviews for a specific product
  public getByProductId = async (req: Request, res: Response) => {
    try {
      const { productId } = req.params;
      const { limit = 10, page = 1 } = req.query;

      const take = Number(limit);
      const skip = (Number(page) - 1) * take;

      const reviews = await prisma.review.findMany({
        where: { productId: productId as string, isApproved: true },
        take,
        skip,
        orderBy: { createdAt: 'desc' },
      });

      const total = await prisma.review.count({ where: { productId: productId as string, isApproved: true } });

      res.json({
        success: true,
        data: reviews,
        pagination: {
          total,
          page: Number(page),
          pages: Math.ceil(total / take),
        },
      });
    } catch (error) {
      console.error('Error fetching product reviews:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  };

  // Generic endpoint to fetch top reviews (e.g., for landing page)
  public getAll = async (req: Request, res: Response) => {
    try {
      const { limit = 10, featured } = req.query;

      let whereClause: any = { isApproved: true };
      if (featured === 'true') {
        whereClause.showInHome = true;
      }

      const reviews = await prisma.review.findMany({
        where: whereClause,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: { product: { select: { name: true } }, user: { select: { name: true, avatar: true } } }, // optionally include product & user info
      });

      res.json({ success: true, data: reviews });
    } catch (error) {
      console.error('Error fetching reviews:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  };

  // Submit feedback for a delivered order (unified delivery + product reviews)
  public createOrderFeedback = async (req: AuthRequest, res: Response) => {
    try {
      const { orderId } = req.params;
      const { delivery, products } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      // 1. Verify order belongs to user and is delivered
      const order = await prisma.order.findUnique({ 
        where: { id: orderId },
        include: { user: true, items: true }
      });
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      if (order.userId !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      if (order.status !== 'DELIVERED') {
        return res.status(400).json({ success: false, message: 'Order must be delivered to leave feedback' });
      }
      if (order.feedbackSubmitted) {
        return res.status(400).json({ success: false, message: 'Feedback already submitted for this order' });
      }

      const result = await prisma.$transaction(async (tx: any) => {
        // Update order with delivery feedback
        const updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: {
            deliveryRating: delivery?.rating,
            deliveryFeedback: delivery?.feedback,
            feedbackSubmitted: true,
          }
        });

        // Create product reviews
        if (products && Array.isArray(products)) {
          // Deduplicate products to avoid @@unique([productId, orderId]) constraint violation
          const uniqueProducts = new Map();
          
          // Verify that the product was actually in the order
          const orderedProductIds = new Set((order as any).items?.map((item: any) => item.productId) || []);

          for (const p of products) {
            if (orderedProductIds.has(p.productId) && !uniqueProducts.has(p.productId)) {
              uniqueProducts.set(p.productId, p);
            }
          }

          for (const prodReview of Array.from(uniqueProducts.values()) as any[]) {
            if (!prodReview.rating && !prodReview.content) continue; // Skip if empty
            await tx.review.create({
              data: {
                productId: prodReview.productId,
                orderId: orderId,
                userId: userId,
                rating: prodReview.rating || 5,
                content: prodReview.content || '',
                images: prodReview.images && prodReview.images.length ? JSON.stringify(prodReview.images) : null,
                isApproved: false,
                reviewer: (order as any).user?.name || 'Customer',
                reviewerEmail: (order as any).user?.email || null,
              }
            });
          }
        }

        return updatedOrder;
      });

      res.json({ success: true, data: result, message: 'Feedback submitted successfully' });
    } catch (error) {
      console.error('Error submitting feedback:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  };

  // Admin: Get all reviews (pending and approved)
  public getAdminReviews = async (req: AuthRequest, res: Response) => {
    try {
      const { limit = 20, page = 1, isApproved } = req.query;

      const take = Number(limit);
      const skip = (Number(page) - 1) * take;

      let where: any = {};
      if (isApproved !== undefined) {
        where.isApproved = isApproved === 'true';
      }

      const reviews = await prisma.review.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        include: { 
          product: { select: { name: true, image: true } },
          order: { select: { id: true, createdAt: true } },
          user: { select: { name: true, email: true } }
        },
      });

      const total = await prisma.review.count({ where });

      res.json({
        success: true,
        data: reviews,
        pagination: {
          total,
          page: Number(page),
          pages: Math.ceil(total / take),
        },
      });
    } catch (error) {
      console.error('Error fetching admin reviews:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  };

  // Admin: Update review approval status
  public updateStatus = async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { isApproved } = req.body;

      const review = await prisma.review.update({
        where: { id },
        data: { isApproved }
      });

      await this.updateProductRating(review.productId);

      res.json({ success: true, data: review, message: `Review ${isApproved ? 'approved' : 'rejected'} successfully` });
    } catch (error) {
      console.error('Error updating review status:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  };

  // Admin: Update review show in home status
  public updateShowInHome = async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { showInHome } = req.body;

      const review = await prisma.review.update({
        where: { id },
        data: { showInHome: Boolean(showInHome) }
      });

      res.json({ success: true, data: review, message: 'Review featured in home successfully' });
    } catch (error) {
      console.error('Error updating review showInHome status:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  };

  // Admin: Delete review
  public deleteReview = async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      const review = await prisma.review.findUnique({ where: { id } });
      if (!review) {
        return res.status(404).json({ success: false, message: 'Review not found' });
      }

      await prisma.review.delete({ where: { id } });
      
      if (review.isApproved) {
        await this.updateProductRating(review.productId);
      }

      res.json({ success: true, message: 'Review deleted successfully' });
    } catch (error) {
      console.error('Error deleting review:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  };

  private updateProductRating = async (productId: string) => {
    const agg = await prisma.review.aggregate({
      where: { productId, isApproved: true },
      _avg: { rating: true },
      _count: { rating: true }
    });
    
    await prisma.product.update({
      where: { id: productId },
      data: {
        averageRating: agg._avg.rating || 0,
        ratingCount: agg._count.rating || 0
      }
    });
  };
}
