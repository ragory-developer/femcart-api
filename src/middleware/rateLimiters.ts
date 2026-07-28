import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { redis } from "../core/redis/RedisManager";

// Helper function to create a new RedisStore with a specific prefix
const createRedisStore = (prefix: string) => {
  return new RedisStore({
    // @ts-expect-error - Known issue with rate-limit-redis types and ioredis types
    sendCommand: (...args: string[]) => redis.call(...args),
    prefix: prefix,
  });
};

// Strict rate limiter for login and authentication endpoints
// Limits each IP to 50 requests per 5 minutes
export const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50,
  store: createRedisStore("rl:auth:"),
  message: {
    success: false,
    message:
      "Too many authentication attempts from this IP, please try again after 5 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for checkout/order creation
// Limits each IP to 5 order creations per hour to prevent spam/botting
export const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  store: createRedisStore("rl:checkout:"),
  message: {
    success: false,
    message: "Too many orders created from this IP, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// General rate limiter for all other API endpoints
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Reasonable default for a single IP per 15 mins
  store: createRedisStore("rl:api:"),
  standardHeaders: true,
  legacyHeaders: false,
});
