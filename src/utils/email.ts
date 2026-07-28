import { emailQueue, EmailJobData } from '../queues/email.queue';
import logger from './logger';

interface EmailOptions extends EmailJobData {}

/**
 * Queue an email to be sent asynchronously by the BullMQ background worker.
 */
export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  try {
    // Push the job to Redis Queue
    const job = await emailQueue.add('send-email', options);
    logger.info(`[Email Queued] Job ID: ${job.id} for ${options.to}`);
    return true; // Return true indicating it was successfully queued
  } catch (error: any) {
    logger.error('[Email Queue Error] Failed to queue email:', error);
    return false;
  }
};
