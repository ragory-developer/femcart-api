import { redis } from '../core/redis/RedisManager';
import { KeyFactory } from '../core/redis/KeyFactory';

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export class SessionService {
  /**
   * Save a refresh token session in Redis.
   */
  static async saveSession(userId: string, refreshToken: string): Promise<void> {
    const key = KeyFactory.session(refreshToken);
    await redis.set(key, userId, 'EX', SESSION_TTL_SECONDS);
  }

  /**
   * Get the userId associated with a refresh token.
   */
  static async getSession(refreshToken: string): Promise<string | null> {
    const key = KeyFactory.session(refreshToken);
    return await redis.get(key);
  }

  /**
   * Delete a session from Redis (Logout).
   */
  static async deleteSession(refreshToken: string): Promise<void> {
    const key = KeyFactory.session(refreshToken);
    await redis.del(key);
  }
}
