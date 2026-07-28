import { redis } from './RedisManager';
import logger from '../../utils/logger';

export const CacheService = {
  /**
   * Get a parsed JSON value from Redis.
   * Returns null if cache miss or connection error (fail-open).
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redis.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error) {
      logger.error(`Cache GET Error for key ${key}:`, error);
      return null;
    }
  },

  /**
   * Set a JSON value in Redis with an optional TTL (Time To Live) in seconds.
   * Defaults to 3600 seconds (1 hour) if not specified.
   */
  async set(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
    try {
      const data = JSON.stringify(value);
      await redis.set(key, data, 'EX', ttlSeconds);
    } catch (error) {
      logger.error(`Cache SET Error for key ${key}:`, error);
    }
  },

  /**
   * Delete a key from Redis (used for targeted invalidation).
   */
  async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (error) {
      logger.error(`Cache DEL Error for key ${key}:`, error);
    }
  },

  /**
   * Increment a key's value (used for generation-based cache invalidation).
   * Returns the new value, or 0 if it fails (fail-open).
   */
  async incr(key: string): Promise<number> {
    try {
      return await redis.incr(key);
    } catch (error) {
      logger.error(`Cache INCR Error for key ${key}:`, error);
      return 0;
    }
  }
};
