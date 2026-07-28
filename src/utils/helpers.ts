import { NextFunction, Request, Response } from 'express';

/**
 * Wraps async route handlers to catch errors and pass them to Express error handler.
 */
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/** Generate a URL-friendly slug from a string */
export const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/** Parse pagination params from query string */
export const parsePagination = (query: { page?: string; limit?: string }) => {
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const limit = Math.min(1000, Math.max(1, parseInt(query.limit || '12', 10)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

export const getActivePrice = (item: any): number => {
  if (!item) return 0;
  
  const now = new Date();
  const price = item.price || 0;
  const specialPrice = item.specialPrice;
  const start = item.specialPriceStart ? new Date(item.specialPriceStart) : null;
  const end = item.specialPriceEnd ? new Date(item.specialPriceEnd) : null;

  const isActive = 
    specialPrice !== undefined && 
    specialPrice !== null && 
    (start === null || start <= now) && 
    (end === null || end >= now);

  return isActive ? specialPrice : price;
};
