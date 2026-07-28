import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import prisma, { basePrisma } from '../config/database';
import { ConflictError, ForbiddenError, TooManyRequestsError, UnauthorizedError } from '../utils/errors';
import { sendGlobalSms } from '../utils/sms';
import { sendEmail } from '../utils/email';
import { OtpService } from './otpService';
import { SessionService } from './sessionService';

export class AuthService {
  /** Register a new user */
  async register(data: { email: string; password: string; name: string; phone?: string }) {
    const existing = await basePrisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      if (existing.deletedAt) throw new ConflictError('This email is currently in the Trash. Please restore it or permanently delete it first.');
      throw new ConflictError('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);
    
    let user;
    if (data.phone) {
      const existingPhone = await basePrisma.user.findUnique({ where: { phone: data.phone } });
      if (existingPhone) {
        if (existingPhone.deletedAt) throw new ConflictError('This phone number is currently in the Trash. Please restore it or permanently delete it first.');
        if (!existingPhone.isGuest) {
          throw new ConflictError('Phone number already registered');
        } else {
          // Upgrade the existing guest account
          user = await prisma.user.update({
            where: { id: existingPhone.id },
            data: {
              email: data.email,
              password: hashedPassword,
              name: data.name,
              isGuest: false,
            },
            select: { id: true, email: true, name: true, role: true, permissions: true },
          });
        }
      }
    }

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: data.email,
          password: hashedPassword,
          name: data.name,
          phone: data.phone,
        },
        select: { id: true, email: true, name: true, role: true, permissions: true },
      });
      // Create an empty cart for the new user
      // Cart is managed by Redis dynamically
    }

    const tokens = this.generateTokens(user.id, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return { user, ...tokens };
  }

  /** Setup first super admin */
  async setupSuperAdmin(data: { email: string; password: string; name: string; adminAccessKey: string }) {
    const superAdminCount = await prisma.user.count({ where: { role: 'SUPER_ADMIN' } });
    if (superAdminCount > 0) {
      throw new ForbiddenError('A super admin already exists. This route is disabled.');
    }

    if (data.adminAccessKey !== config.adminAccessKey) {
      throw new UnauthorizedError('Invalid admin access key');
    }

    const existing = await basePrisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      if (existing.deletedAt) throw new ConflictError('This email is currently in the Trash. Please restore it or permanently delete it first.');
      throw new ConflictError('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);
    
    // Create the admin user
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        role: 'SUPER_ADMIN',
        isGuest: false,
      },
      select: { id: true, email: true, name: true, role: true, permissions: true },
    });

    const tokens = this.generateTokens(user.id, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return { user, ...tokens };
  }

  /** Complete registration — called after OTP verification. */
  async completeRegistration(data: { phone?: string; name: string; email?: string; password: string }) {
    let stub;
    if (data.email && data.email.trim() !== '') {
      stub = await basePrisma.user.findUnique({ where: { email: data.email } });
    } else if (data.phone && data.phone.trim() !== '') {
      stub = await basePrisma.user.findUnique({ where: { phone: data.phone } });
    }

    if (!stub) {
      throw new UnauthorizedError('Account not verified. Please start over.');
    }

    if (stub.deletedAt) {
      throw new ConflictError('This account is currently in the Trash. Please restore it or contact support.');
    }

    if (data.email && data.email.trim() !== '') {
      const emailUser = await basePrisma.user.findUnique({ where: { email: data.email } });
      if (emailUser && emailUser.id !== stub.id) {
        if (emailUser.deletedAt) throw new ConflictError('This email address is currently in the Trash. Please restore it or permanently delete it first.');
        throw new ConflictError('Email address is already registered with another account.');
      }
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.update({
      where: { id: stub.id },
      data: {
        name: data.name,
        email: data.email || null,
        password: hashedPassword,
        isGuest: false,
      },
    });

    const tokens = this.generateTokens(user.id, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        isGuest: user.isGuest,
        permissions: Array.from(new Set([
          ...(user.permissions ? JSON.parse(user.permissions as any) : []),
          ...((user as any).adminRole?.permissions ? JSON.parse((user as any).adminRole.permissions as any) : [])
        ])),
      },
      ...tokens,
    };
  }

  /** Login with email and password */
  async login(email: string, password: string) {
    const user = await basePrisma.user.findUnique({ where: { email }, include: { adminRole: true } });
    if (user && user.deletedAt) {
      throw new UnauthorizedError('This account has been deactivated or deleted. Please contact support.');
    }
    if (!user || !user.password) {
      throw new UnauthorizedError('Invalid login credentials');
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const tokens = this.generateTokens(user.id, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        isGuest: user.isGuest,
        permissions: Array.from(new Set([
          ...(user.permissions ? JSON.parse(user.permissions as any) : []),
          ...((user as any).adminRole?.permissions ? JSON.parse((user as any).adminRole.permissions as any) : [])
        ])),
      },
      ...tokens,
    };
  }

  /** Login with phone number and password */
  async loginWithPhone(phone: string, password: string) {
    const user = await basePrisma.user.findUnique({ where: { phone }, include: { adminRole: true } });
    if (user && user.deletedAt) {
      throw new UnauthorizedError('This account has been deactivated or deleted. Please contact support.');
    }
    if (!user || !user.password) {
      throw new UnauthorizedError('Invalid phone number or password');
    }
    if (user.isGuest) {
      throw new UnauthorizedError('This number has no registered account. Please sign up first.');
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new UnauthorizedError('Invalid phone number or password');
    }

    const tokens = this.generateTokens(user.id, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        isGuest: user.isGuest,
        permissions: Array.from(new Set([
          ...(user.permissions ? JSON.parse(user.permissions as any) : []),
          ...((user as any).adminRole?.permissions ? JSON.parse((user as any).adminRole.permissions as any) : [])
        ])),
      },
      ...tokens,
    };
  }

  /** Refresh access token using a valid refresh token */
  async refresh(refreshToken: string) {
    try {
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret as any) as { userId: string; role: string };
      
      const sessionUserId = await SessionService.getSession(refreshToken);
      if (!sessionUserId || sessionUserId !== decoded.userId) {
        throw new UnauthorizedError('Invalid refresh token');
      }

      const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
      if (!user) {
        throw new UnauthorizedError('Invalid user');
      }

      const tokens = this.generateTokens(user.id, user.role);
      
      // Rotate the refresh token
      await SessionService.deleteSession(refreshToken);
      await this.saveRefreshToken(user.id, tokens.refreshToken);

      return tokens;
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }

  /** Logout — clear the refresh token */
  async logout(refreshToken: string) {
    if (refreshToken) {
      await SessionService.deleteSession(refreshToken);
    }
  }

  /** Send OTP to a phone number */
  async sendOtp(phone: string) {
    try {
      const code = await OtpService.generateAndSaveOtp(phone);
      
      // Check if user is already registered (not a guest)
      const user = await basePrisma.user.findFirst({ where: { phone } });
      if (user && user.deletedAt) {
        throw new ConflictError('This account is currently in the Trash. Please restore it or contact support.');
      }
      const exists = !!user;
      const isRegistered = !!(user && !user.isGuest);

      const message = `Your Femcart verification code is: ${code}`;
      const smsSuccess = await sendGlobalSms(phone, message, 'OTP');

      if (!smsSuccess) {
        console.warn(`[SMS] Failed to send OTP to ${phone}`);
      }

      return { exists, isRegistered };
    } catch (error: any) {
      if (error.message.includes('Too many requests')) {
        throw new TooManyRequestsError(error.message);
      }
      throw error;
    }
  }

  /** Verify OTP without login/registration logic */
  async verifyOnly(phone: string, code: string) {
    const existing = await OtpService.getOtp(phone);
    if (!existing) {
      throw new UnauthorizedError('No OTP request found for this number or it has expired');
    }

    if (existing.blockedUntil && new Date(existing.blockedUntil) > new Date()) {
      const waitMins = Math.ceil((new Date(existing.blockedUntil).getTime() - Date.now()) / (60 * 1000));
      throw new TooManyRequestsError(`Too many failed attempts. Please try again after ${waitMins} minutes.`);
    }

    if (existing.code !== code) {
      const attempts = existing.attempts + 1;
      let blockedUntil = null;
      if (attempts >= 5) {
        blockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins block
      }
      await OtpService.setOtp(phone, { code: existing.code, attempts, blockedUntil });
      throw new UnauthorizedError('Invalid OTP');
    }

    await OtpService.clearOtp(phone);
    return true;
  }

  /** Verify OTP and login/register the user */
  async verifyOtp(phone: string, code: string, name?: string) {
    await this.verifyOnly(phone, code);

    // Find if user already exists
    let user = await basePrisma.user.findFirst({ where: { phone } });
    if (user && user.deletedAt) {
      throw new ConflictError('This account is currently in the Trash. Please restore it or contact support.');
    }
    
    if (!user) {
      // Auto-create a real user account silently (tagged as guest)
      const randomPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10).toUpperCase();
      const hashedPassword = await bcrypt.hash(randomPassword, 10);
      
      user = await prisma.user.create({
        data: {
          name: name?.trim() || 'Guest User',
          phone,
          password: hashedPassword,
          isGuest: true,
          role: 'USER',
        },
      });
      // Cart is managed by Redis dynamically
    } else if (name?.trim() && user.isGuest && user.name === 'Guest User') {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name: name.trim() },
      });
    }

    const tokens = this.generateTokens(user.id, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        isGuest: user.isGuest,
        permissions: Array.from(new Set([
          ...(user.permissions ? JSON.parse(user.permissions as any) : []),
          ...((user as any).adminRole?.permissions ? JSON.parse((user as any).adminRole.permissions as any) : [])
        ])),
      },
      ...tokens,
    };
  }

  /** Send OTP to an email address */
  async sendEmailOtp(email: string) {
    const otpKey = `email:${email}`;
    try {
      const code = await OtpService.generateAndSaveOtp(otpKey);
      
      const user = await basePrisma.user.findFirst({ where: { email } });
      if (user && user.deletedAt) {
        throw new ConflictError('This account is currently in the Trash. Please restore it or contact support.');
      }
      const exists = !!user;
      const isRegistered = !!(user && !user.isGuest);

      const subject = 'Your Femcart Verification Code';
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
          <h2 style="color: #10b981; text-align: center;">Femcart Verification</h2>
          <p style="font-size: 16px; color: #333;">Hello,</p>
          <p style="font-size: 16px; color: #333;">Your verification code is:</p>
          <div style="background-color: #f3f4f6; padding: 15px; text-align: center; border-radius: 5px; margin: 20px 0;">
            <h1 style="margin: 0; font-size: 32px; letter-spacing: 5px; color: #111;">${code}</h1>
          </div>
          <p style="font-size: 14px; color: #666;">This code will expire in 5 minutes.</p>
          <p style="font-size: 14px; color: #666;">If you didn't request this code, you can safely ignore this email.</p>
        </div>
      `;

      const emailSuccess = await sendEmail({ to: email, subject, html });

      if (!emailSuccess) {
        console.warn(`[EMAIL] Failed to send OTP to ${email}`);
      }

      const isDev = config.nodeEnv?.trim() === 'development' || !config.nodeEnv;
      if (isDev) {
        console.log(`\n\n\n=== MOCK EMAIL OTP (DEVELOPMENT MODE) ===\nTO: ${email}\nCODE: ${code}\n====================\n\n\n`);
      }

      return { exists, isRegistered };
    } catch (error: any) {
      if (error.message.includes('Too many requests')) {
        throw new TooManyRequestsError(error.message);
      }
      throw error;
    }
  }

  /** Verify email OTP and login/register the user */
  async verifyEmailOtp(email: string, code: string, name?: string) {
    const otpKey = `email:${email}`;
    await this.verifyOnly(otpKey, code);

    // Find if user already exists by email
    let user = await basePrisma.user.findFirst({ where: { email } });
    if (user && user.deletedAt) {
      throw new ConflictError('This account is currently in the Trash. Please restore it or contact support.');
    }
    
    if (!user) {
      const randomPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10).toUpperCase();
      const hashedPassword = await bcrypt.hash(randomPassword, 10);
      
      user = await prisma.user.create({
        data: {
          name: name?.trim() || 'Guest User',
          email,
          password: hashedPassword,
          isGuest: true,
          role: 'USER',
        },
      });
      // Cart is managed by Redis dynamically
    } else if (name?.trim() && user.isGuest && user.name === 'Guest User') {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name: name.trim() },
      });
    }

    const tokens = this.generateTokens(user.id, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        isGuest: user.isGuest,
        permissions: Array.from(new Set([
          ...(user.permissions ? JSON.parse(user.permissions as any) : []),
          ...((user as any).adminRole?.permissions ? JSON.parse((user as any).adminRole.permissions as any) : [])
        ])),
      },
      ...tokens,
    };
  }

  /** Generate JWT access + refresh tokens */
  private generateTokens(userId: string, role: string) {
    const accessToken = jwt.sign({ userId, role }, config.jwt.accessSecret as any, {
      expiresIn: config.jwt.accessExpiresIn as any,
    });
    const refreshToken = jwt.sign({ userId, role }, config.jwt.refreshSecret as any, {
      expiresIn: config.jwt.refreshExpiresIn as any,
    });
    return { accessToken, refreshToken };
  }

  /** Persist the refresh token in Redis */
  private async saveRefreshToken(userId: string, refreshToken: string) {
    await SessionService.saveSession(userId, refreshToken);
  }
}
