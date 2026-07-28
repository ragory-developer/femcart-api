import { Job } from 'bullmq';
import { QueueManager } from '../core/queue/QueueManager';
import nodemailer from 'nodemailer';
import { config } from '../config';
import logger from '../utils/logger';

export interface EmailJobData {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export const EMAIL_QUEUE_NAME = 'femcart_queue_email';

// Create the Queue
export const emailQueue = QueueManager.createQueue(EMAIL_QUEUE_NAME);

// Create the Worker
export const emailWorker = QueueManager.createWorker(
  EMAIL_QUEUE_NAME,
  async (job: Job<EmailJobData>) => {
    const { to, subject, text, html } = job.data;
    const { host, port, user, pass, fromName, fromEmail } = config.smtp;

    if (!host || !user || !pass) {
      throw new Error('SMTP credentials are not fully configured');
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`[Email Success] Message sent to ${to}: ${info.messageId}`);
    return info;
  }
);
