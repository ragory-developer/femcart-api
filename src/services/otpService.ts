import { redis } from '../core/redis/RedisManager';
import { KeyFactory } from '../core/redis/KeyFactory';

export interface OtpData {
  code: string;
  attempts: number;
  blockedUntil: string | null; // ISO string if blocked
}

const OTP_TTL_SECONDS = 300; // 5 minutes
const BLOCK_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 3;

export class OtpService {
  /**
   * Save or update an OTP in Redis.
   */
  static async setOtp(phone: string, data: OtpData): Promise<void> {
    const key = KeyFactory.otp(phone);
    await redis.set(key, JSON.stringify(data), 'EX', OTP_TTL_SECONDS);
  }

  /**
   * Get OTP data from Redis.
   */
  static async getOtp(phone: string): Promise<OtpData | null> {
    const key = KeyFactory.otp(phone);
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Delete OTP from Redis.
   */
  static async clearOtp(phone: string): Promise<void> {
    const key = KeyFactory.otp(phone);
    await redis.del(key);
  }

  /**
   * Generate a new OTP code and save it, handling block logic.
   * Returns { code } if successful, throws if blocked.
   */
  static async generateAndSaveOtp(phone: string, isBlockable: boolean = true): Promise<string> {
    const existing = await this.getOtp(phone);
    let attempts = 0;
    let blockedUntil = null;

    if (existing) {
      if (existing.blockedUntil && new Date(existing.blockedUntil) > new Date()) {
        const waitMins = Math.ceil((new Date(existing.blockedUntil).getTime() - Date.now()) / (60 * 1000));
        throw new Error(`Too many requests. Please try again after ${waitMins} minutes.`);
      }

      attempts = existing.attempts + 1;
      if (isBlockable && attempts >= MAX_ATTEMPTS) {
        blockedUntil = new Date(Date.now() + BLOCK_DURATION_MS).toISOString();
      }
    } else {
      attempts = 1;
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    await this.setOtp(phone, { code, attempts, blockedUntil });
    
    return code;
  }
}
