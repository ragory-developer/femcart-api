import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/errors';
import logger from '../utils/logger';

/**
 * Global error handling middleware.
 * Catches ApiErrors and unknown errors, returns consistent JSON responses.
 */
export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) {
    logger.warn(`API Error: ${err.message}`, { statusCode: err.statusCode, path: req.path });
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  // Prisma known request errors
  if ((err as any).code === 'P2002') {
    return res.status(409).json({
      success: false,
      message: 'A record with this value already exists.',
    });
  }

  if ((err as any).code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'Record not found.',
    });
  }

  logger.error('Unhandled error', err);
  return res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
};
