import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AuthService } from '../services/authService';
import { asyncHandler } from '../utils/helpers';
import { BaseController } from './BaseController';

const authService = new AuthService();

export class AuthController extends BaseController {
  register = asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.register(req.body);
    this.handleCreated(res, result);
  });

  setupSuperAdmin = asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.setupSuperAdmin(req.body);
    this.handleCreated(res, result);
  });

  login = asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    this.handleSuccess(res, result);
  });

  loginWithPhone = asyncHandler(async (req: Request, res: Response) => {
    const { phone, password } = req.body;
    const result = await authService.loginWithPhone(phone, password);
    this.handleSuccess(res, result);
  });

  refresh = asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    const tokens = await authService.refresh(refreshToken);
    this.handleSuccess(res, tokens);
  });

  logout = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.user) {
      await authService.logout(req.user.userId);
    }
    this.handleSuccess(res, { message: 'Logged out successfully' });
  });

  sendOtp = asyncHandler(async (req: Request, res: Response) => {
    const { phone } = req.body;
    const result = await authService.sendOtp(phone);
    this.handleSuccess(res, result);
  });

  verifyOtp = asyncHandler(async (req: Request, res: Response) => {
    const { phone, code, name } = req.body;
    const result = await authService.verifyOtp(phone, code, name);
    this.handleSuccess(res, result);
  });

  completeRegistration = asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.completeRegistration(req.body);
    this.handleSuccess(res, result);
  });

  sendEmailOtp = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;
    const result = await authService.sendEmailOtp(email);
    this.handleSuccess(res, result);
  });

  verifyEmailOtp = asyncHandler(async (req: Request, res: Response) => {
    const { email, code, name } = req.body;
    const result = await authService.verifyEmailOtp(email, code, name);
    this.handleSuccess(res, result);
  });
}
