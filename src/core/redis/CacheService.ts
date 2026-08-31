import { redis } from './RedisManager';
import logger from '../../utils/logger';

// In-Memory cache map (L1) with TTL support - operates seamlessly even if Redis is disabled or offline
const memoryCache = new Map<string, { value: any; expiry: number }>();
const MAX_MEMORY_ITEMS = 3000;

function cleanupMemoryCache() {
  if (memoryCache.size > MAX_MEMORY_ITEMS) {
    const now = Date.now();
    for (const [k, v] of memoryCache.entries()) {
      if (v.expiry <= now) {
        memoryCache.delete(k);
      }
    }
    // If still oversized, delete oldest 20%
    if (memoryCache.size > MAX_MEMORY_ITEMS) {
      let count = 0;
      for (const k of memoryCache.keys()) {
        memoryCache.delete(k);
        count++;
        if (count > MAX_MEMORY_ITEMS * 0.2) break;
      }
    }
  }
}

export const CacheService = {
  clearMemory() {
    memoryCache.clear();
  },

  async flushAll(): Promise<void> {
    memoryCache.clear();
    if (process.env.REDIS_ENABLED === 'false' || redis?.status !== 'ready') return;
    try {
      await redis.flushdb();
    } catch (error) {
      logger.error('Cache FLUSHDB Error:', error);
    }
  },

  /**
   * Get a parsed JSON value from L1 in-memory cache or Redis.
   * Returns null if cache miss or connection error (fail-open).
   */
  async get<T>(key: string): Promise<T | null> {
    // 1. Check L1 Memory Cache first (sub-millisecond instant lookup)
    const cachedLocal = memoryCache.get(key);
    if (cachedLocal) {
      if (cachedLocal.expiry > Date.now()) {
        return cachedLocal.value as T;
      }
      memoryCache.delete(key);
    }

    // 2. If Redis is ready, query Redis
    if (process.env.REDIS_ENABLED !== 'false' && redis?.status === 'ready') {
      try {
        const data = await redis.get(key);
        if (!data) return null;
        const parsed = JSON.parse(data) as T;

        // Store back in L1 memory cache for 60 seconds
        memoryCache.set(key, { value: parsed, expiry: Date.now() + 60000 });
        return parsed;
      } catch (error) {
        logger.error(`Cache GET Error for key ${key}:`, error);
        return null;
      }
    }

    return null;
  },

  /**
   * Set a JSON value in L1 memory cache and Redis.
   * Defaults to 3600 seconds (1 hour) if not specified.
   */
  async set(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
    cleanupMemoryCache();
    const expiry = Date.now() + (ttlSeconds * 1000);
    memoryCache.set(key, { value, expiry });

    if (process.env.REDIS_ENABLED === 'false' || redis?.status !== 'ready') return;

    try {
      const data = JSON.stringify(value);
      await redis.set(key, data, 'EX', ttlSeconds);
    } catch (error) {
      logger.error(`Cache SET Error for key ${key}:`, error);
    }
  },

  /**
   * Delete a key from L1 memory cache and Redis.
   */
  async del(key: string): Promise<void> {
    memoryCache.delete(key);

    if (process.env.REDIS_ENABLED === 'false' || redis?.status !== 'ready') return;

    try {
      await redis.del(key);
    } catch (error) {
      logger.error(`Cache DEL Error for key ${key}:`, error);
    }
  },

  /**
   * Increment a key's value in memory and Redis.
   * Returns the new value.
   */
  async incr(key: string): Promise<number> {
    const current = memoryCache.get(key);
    const currentVal = typeof current?.value === 'number' ? current.value : (parseInt(String(current?.value || '0'), 10) || 0);
    const newVal = currentVal + 1;
    memoryCache.set(key, { value: newVal, expiry: Date.now() + 86400000 }); // 24h

    if (process.env.REDIS_ENABLED === 'false' || redis?.status !== 'ready') {
      return newVal;
    }

    try {
      const redisVal = await redis.incr(key);
      memoryCache.set(key, { value: redisVal, expiry: Date.now() + 86400000 });
      return redisVal;
    } catch (error) {
      logger.error(`Cache INCR Error for key ${key}:`, error);
      return newVal;
    }
  }
};
