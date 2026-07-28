import { Response } from 'express';
import { ApiError } from '../utils/errors';
import logger from '../utils/logger';

export abstract class BaseController {
  /**
   * Send a standard success response
   */
  protected handleSuccess(res: Response, data?: any, statusCode: number = 200): void {
    res.status(statusCode).json({
      success: true,
      data,
    });
  }

  /**
   * Send a standard created response
   */
  protected handleCreated(res: Response, data?: any): void {
    this.handleSuccess(res, data, 201);
  }

  /**
   * Handle errors explicitly (though global error handler is preferred)
   */
  protected handleError(error: any, res: Response, context?: string): void {
    logger.error(`Error in ${context || 'BaseController'}:`, error);

    if (error instanceof ApiError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
}
