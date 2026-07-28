import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().optional(),
});

export const setupSuperAdminSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  adminAccessKey: z.string().min(1, 'Admin access key is required'),
});

export const completeRegistrationSchema = z.object({
  phone: z.string().min(10, 'Valid phone number is required').optional().or(z.literal('')),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const loginWithPhoneSchema = z.object({
  phone: z.string().min(10, 'Valid phone number is required'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const sendOtpSchema = z.object({
  phone: z.string().min(10, 'Valid phone number is required'),
});

export const verifyOtpSchema = z.object({
  phone: z.string().min(10, 'Valid phone number is required'),
  code: z.string().min(4, 'OTP code is required'),
});

export const sendEmailOtpSchema = z.object({
  email: z.string().email('Valid email address is required'),
});

export const verifyEmailOtpSchema = z.object({
  email: z.string().email('Valid email address is required'),
  code: z.string().min(4, 'OTP code is required'),
  name: z.string().optional(),
});
