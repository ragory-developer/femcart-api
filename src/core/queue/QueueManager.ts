import { Queue, Worker, QueueOptions, WorkerOptions, Processor } from 'bullmq';
import { redis } from '../redis/RedisManager';
import logger from '../../utils/logger';

const defaultOptions = {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  }
};

export const QueueManager = {
  /**
   * Creates a new Queue instance utilizing the global Redis connection.
   */
  createQueue(name: string, options?: Partial<QueueOptions>): Queue {
    const queue = new Queue(name, {
      ...defaultOptions,
      ...options,
    });
    logger.info(`Queue [${name}] initialized`);
    return queue;
  },

  /**
   * Creates a new Worker instance utilizing the global Redis connection.
   */
  createWorker(name: string, processor: Processor, options?: Partial<WorkerOptions>): Worker {
    const worker = new Worker(name, processor, {
      connection: redis,
      ...options,
    });

    worker.on('completed', (job) => {
      logger.info(`Job ${job.id} completed successfully in queue [${name}]`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`Job ${job?.id} failed in queue [${name}]:`, err);
    });

    logger.info(`Worker [${name}] started`);
    return worker;
  }
};
