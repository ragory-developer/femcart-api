import { redis } from './RedisManager';
import logger from '../../utils/logger';

// L1 In-Memory Cache to minimize remote Redis round-trip times during a request lifecycle
const memoryCache = new Map<string, { value: any; expiry: number }>();

export const CacheService = {
  /**
   * Get a parsed JSON value from Redis or L1 memory cache.
   * Returns null if cache miss or connection error (fail-open).
   */
  async get<T>(key: string): Promise<T | null> {
    // 1. Check L1 Memory Cache first
    const cachedLocal = memoryCache.get(key);
    if (cachedLocal && cachedLocal.expiry > Date.now()) {
      return cachedLocal.value as T;
    }

    // 2. Fail-open immediately if Redis client is not ready (prevents connection hangs)
    if (redis.status !== 'ready') {
      return null;
    }

    try {
      const data = await redis.get(key);
      if (!data) return null;
      const parsed = JSON.parse(data) as T;

      // Store in L1 cache for 10 seconds to avoid repeating remote round-trips for consecutive requests
      memoryCache.set(key, { value: parsed, expiry: Date.now() + 10000 });

      return parsed;
    } catch (error) {
      logger.error(`Cache GET Error for key ${key}:`, error);
      return null;
    }
  },

  /**
   * Set a JSON value in Redis and update L1 memory cache.
   * Defaults to 3600 seconds (1 hour) if not specified.
   */
  async set(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
    const expiry = Date.now() + 10000; // 10 seconds for L1 memory
    memoryCache.set(key, { value, expiry });

    if (redis.status !== 'ready') {
      return;
    }

    try {
      const data = JSON.stringify(value);
      await redis.set(key, data, 'EX', ttlSeconds);
    } catch (error) {
      logger.error(`Cache SET Error for key ${key}:`, error);
    }
  },

  /**
   * Delete a key from Redis and L1 memory cache.
   */
  async del(key: string): Promise<void> {
    memoryCache.delete(key);

    if (redis.status !== 'ready') {
      return;
    }

    try {
      await redis.del(key);
    } catch (error) {
      logger.error(`Cache DEL Error for key ${key}:`, error);
    }
  },

  /**
   * Increment a key's value.
   * Returns the new value, or 0 if it fails (fail-open).
   */
  async incr(key: string): Promise<number> {
    memoryCache.delete(key);

    if (redis.status !== 'ready') {
      return 0;
    }

    try {
      return await redis.incr(key);
    } catch (error) {
      logger.error(`Cache INCR Error for key ${key}:`, error);
      return 0;
    }
  }
};
