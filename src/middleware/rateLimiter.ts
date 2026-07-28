import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../core/redis/RedisManager';

/**
 * Standard API Rate Limiter
 * Limits each IP to 1000 requests per 15 minutes.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per `window`
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  passOnStoreError: true, // Allow request to bypass rate limit if Redis is down
  store: new RedisStore({
    // @ts-expect-error - Known issue with rate-limit-redis types and ioredis types
    sendCommand: (...args: string[]) => {
      if (redis.status !== 'ready') return Promise.reject(new Error('Redis not ready'));
      return redis.call(...(args as [string, ...string[]]));
    },
  }),
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes'
  }
});

/**
 * Strict Auth Rate Limiter
 * Limits each IP to 30 requests per 15 minutes.
 * Used for /login, /register, /send-otp
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 requests per `window`
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true, // Allow login if Redis is down instead of hanging forever
  store: new RedisStore({
    // @ts-expect-error - Known issue with rate-limit-redis types and ioredis types
    sendCommand: (...args: string[]) => {
      if (redis.status !== 'ready') return Promise.reject(new Error('Redis not ready'));
      return redis.call(...(args as [string, ...string[]]));
    },
  }),
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again after 15 minutes'
  }
});
