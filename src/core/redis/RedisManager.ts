import Redis from 'ioredis';
import logger from '../../utils/logger';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    logger.warn(`Redis connection retrying... attempt ${times}`);
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

redis.on('connect', () => logger.info('Redis connection established successfully'));
redis.on('error', (err) => logger.error('Redis connection error:', err));
redis.on('ready', () => logger.info('Redis client is ready to receive commands'));
