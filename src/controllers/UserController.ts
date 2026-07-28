import bcrypt from 'bcryptjs';
import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AuthService } from '../services/authService';
import { UserService } from '../services/userService';
import { BadRequestError, ConflictError, NotFoundError, ForbiddenError } from '../utils/errors';
import { asyncHandler } from '../utils/helpers';

const authService = new AuthService();
const userService = new UserService();

export class UserController {
  /** Get current user profile */
  getProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, name: true, phone: true, role: true, isGuest: true, address: true, city: true, area: true, gender: true, dateOfBirth: true, createdAt: true, avatar: true, notificationPrefs: true, permissions: true, adminRole: { select: { permissions: true } } },
    });
    if (!user) throw new NotFoundError('User not found');
    
    let mergedPermissions: string[] = [];
    if (user.permissions) mergedPermissions.push(...JSON.parse(user.permissions as any));
    if ((user as any).adminRole?.permissions) mergedPermissions.push(...JSON.parse((user as any).adminRole.permissions));
    mergedPermissions = Array.from(new Set(mergedPermissions));
    
    const { adminRole, ...userData } = user as any;
    res.json({ success: true, data: { ...userData, permissions: mergedPermissions } });
  
  });

  /** Update current user profile */
  updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, phone, address, city, area, gender, dateOfBirth } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { name, phone, address, city, area, gender, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null },
      select: { id: true, email: true, name: true, phone: true, role: true, isGuest: true, address: true, city: true, area: true, gender: true, dateOfBirth: true },
    });
    
    res.json({ success: true, data: user });
  
  });

  /** Admin: get all users */
  getAllUsers = asyncHandler(async (_req: AuthRequest, res: Response) => {
    const enrichedUsers = await userService.getCustomers();
    res.json({ success: true, data: enrichedUsers });
  });

  /** Admin: get user by ID */
  getUserById = asyncHandler(async (req: AuthRequest, res: Response) => {
    const u = await prisma.user.findUnique({
      where: { id: req.params.id as string },
      select: { 
        id: true, email: true, name: true, phone: true, role: true, isGuest: true, createdAt: true, rewardPoints: true,
        orders: { select: { deliveryArea: true, deliveryCity: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        addresses: { 
          select: { area: true, city: true, isDefault: true }, 
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
          take: 1 
        }
      },
    });
    if (!u) throw new NotFoundError('User not found');
    
    const { orders, addresses, ...rest } = u;
    const bestAddress = addresses[0];
    const latestOrder = orders[0];
    const area = bestAddress?.area || latestOrder?.deliveryArea || null;
    const city = bestAddress?.city || latestOrder?.deliveryCity || null;

    res.json({ success: true, data: { ...rest, area, city } });
  });

  /** Admin: create a new user/customer */
  createUser = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, email, phone, password, isGuest } = req.body;
    let hashedPassword = undefined;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 12);
    } else {
      const randomPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10).toUpperCase();
      hashedPassword = await bcrypt.hash(randomPassword, 12);
    }
    
    // Check constraints
    if (email) {
      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) throw new ConflictError('Email already registered');
    }
    if (phone) {
      const existingPhone = await prisma.user.findUnique({ where: { phone } });
      if (existingPhone) throw new ConflictError('Phone number already registered');
    }
    if (!name) throw new BadRequestError('Name is required');

    const newUser = await prisma.user.create({
      data: {
        name,
        email: email || undefined,
        phone: phone || undefined,
        password: hashedPassword,
        isGuest: isGuest ?? false,
        role: 'USER',
      },
      select: { id: true, email: true, name: true, phone: true, role: true, isGuest: true, createdAt: true },
    });

    // Cart is managed by Redis dynamically
    
    res.status(201).json({ success: true, data: newUser });
  });

  /** Admin: update customer profile/role */
  updateCustomerAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { name, role, password } = req.body;
    
    if (role && !['USER', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
      throw new BadRequestError('Invalid role');
    }
    
    if (role === 'SUPER_ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only a Super Admin can assign the Super Admin role');
    }
    
    const updateData: any = {};
    if (name) updateData.name = name;
    if (role) updateData.role = role;
    if (password) {
      updateData.password = await bcrypt.hash(password, 12);
    }
    
    const updatedUser = await prisma.user.update({
      where: { id: id as string },
      data: updateData,
      select: { id: true, email: true, name: true, phone: true, role: true, isGuest: true, createdAt: true },
    });
    
    res.json({ success: true, data: updatedUser });
  });

  /** Get current user's saved addresses */
  getAddresses = asyncHandler(async (req: AuthRequest, res: Response) => {
    const addresses = await prisma.userAddress.findMany({
      where: { userId: req.user!.userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ success: true, data: addresses });
  });

  /** Create a new address for current user */
  createAddress = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { label, address, city, area, state, stateId, cityId, areaId, isDefault, recipientName, recipientPhone } = req.body;
    if (!address) throw new Error('Address is required');

    // Count existing addresses to decide if this should auto be default
    const existingCount = await prisma.userAddress.count({ where: { userId: req.user!.userId } });
    const shouldBeDefault = isDefault || existingCount === 0; // first address is always default

    const newAddress = await prisma.$transaction(async (tx: any) => {
      // If this is set as default, unset others
      if (shouldBeDefault) {
        await tx.userAddress.updateMany({
          where: { userId: req.user!.userId },
          data: { isDefault: false },
        });
      }

      return await tx.userAddress.create({
        data: {
          userId: req.user!.userId,
          label: label || 'Home',
          address,
          city: city || '',
          area: area || '',
          state,
          stateId,
          cityId,
          areaId,
          isDefault: shouldBeDefault,
          recipientName: recipientName as string || null,
          recipientPhone: recipientPhone as string || null,
        },
      });
    });
    res.status(201).json({ success: true, data: newAddress });
  });

  /** Update an address */
  updateAddress = asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const { label, address, city, area, state, stateId, cityId, areaId, isDefault, recipientName, recipientPhone } = req.body;

    const updated = await prisma.$transaction(async (tx: any) => {
      if (isDefault) {
        await tx.userAddress.updateMany({
          where: { userId: req.user!.userId },
          data: { isDefault: false },
        });
      }

      return await tx.userAddress.update({
        where: { id, userId: req.user!.userId },
        data: { 
          label, 
          address, 
          city, 
          area, 
          state, 
          stateId, 
          cityId, 
          areaId, 
          isDefault, 
          recipientName: recipientName as string || null, 
          recipientPhone: recipientPhone as string || null 
        },
      });
    });
    res.json({ success: true, data: updated });
  });

  /** Delete an address */
  deleteAddress = asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    await prisma.userAddress.delete({ where: { id, userId: req.user!.userId } });
    res.json({ success: true, message: 'Address deleted successfully' });
  });

  /** Get user dashboard stats */
  getDashboardStats = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;

    const [orderCount, wishlistCount, walletSum, user, recentOrders] = await Promise.all([
      prisma.order.count({ where: { userId } }),
      prisma.wishlist.count({ where: { userId } }),
      prisma.walletTransaction.aggregate({
        where: { userId, status: 'COMPLETED' },
        _sum: { amount: true }
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { rewardPoints: true } }),
      prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 3,
        include: { items: { include: { product: { select: { name: true, image: true, slug: true } } } } }
      })
    ]);

    const rewardPoints = user?.rewardPoints || 0;

    // Define user groups (Standard tiers but unique naming)
    let userGroup = 'Bronze Member';
    if (orderCount >= 20) userGroup = 'Platinum Member';
    else if (orderCount >= 10) userGroup = 'Gold Member';
    else if (orderCount >= 3) userGroup = 'Silver Member';

    res.json({
      success: true,
      data: {
        orderCount,
        wishlistCount,
        rewardPoints,
        userGroup,
        recentOrders: recentOrders || [],
        walletBalance: Number(walletSum._sum.amount || 0),
        groups: [
          { name: 'Bronze Member', threshold: 0, icon: 'shield', color: 'orange' },
          { name: 'Silver Member', threshold: 3, icon: 'shield', color: 'slate' },
          { name: 'Gold Member', threshold: 10, icon: 'medal', color: 'yellow' },
          { name: 'Platinum Member', threshold: 20, icon: 'crown', color: 'blue' }
        ]
      }
    });
  });

  /** Request OTP for phone number change */
  requestPhoneChange = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { newPhone } = req.body;
    if (!newPhone) throw new BadRequestError('New phone number is required');

    // Check if phone is already taken
    const existing = await prisma.user.findUnique({ where: { phone: newPhone } });
    if (existing && existing.id !== req.user!.userId) {
      throw new ConflictError('This phone number is already registered with another account');
    }

    // Call the global SMS/OTP handler (this deducts the SMS cost from central wallet)
    await authService.sendOtp(newPhone);

    res.json({ success: true, message: 'OTP sent to your new phone number' });
  });

  /** Verify OTP and finalize phone number change */
  verifyPhoneChange = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { newPhone, code } = req.body;
    if (!newPhone || !code) throw new BadRequestError('Phone number and code are required');

    // Verify OTP using global handler
    await authService.verifyOnly(newPhone, code);

    // Update phone number
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { phone: newPhone },
      select: { id: true, name: true, phone: true }
    });

    res.json({ success: true, message: 'Phone number updated successfully', data: user });
  });

  /** Update Password */
  updatePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) throw new BadRequestError('Old and new passwords are required');

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user || !user.password) throw new BadRequestError('User has no password set');

    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) throw new BadRequestError('Invalid old password');

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { password: hashedPassword }
    });

    res.json({ success: true, message: 'Password updated successfully' });
  });

  /** Update Notification Preferences */
  updateNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
    const prefs = req.body;
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { notificationPrefs: prefs },
      select: { notificationPrefs: true }
    });
    res.json({ success: true, message: 'Preferences updated', data: user.notificationPrefs });
  });

  /** Update Avatar */
  updateAvatar = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { avatarUrl } = req.body;
    if (!avatarUrl) throw new BadRequestError('Avatar URL is required');

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { avatar: avatarUrl },
      select: { avatar: true }
    });
    res.json({ success: true, message: 'Avatar updated', data: user.avatar });
  });

  /** Get Wallet & Transactions */
  getWallet = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const transactions = await prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { rewardPoints: true } });
    
    const walletSum = await prisma.walletTransaction.aggregate({
      where: { userId, status: 'COMPLETED' },
      _sum: { amount: true }
    });

    res.json({ 
      success: true, 
      data: {
        transactions,
        rewardPoints: user?.rewardPoints || 0,
        balance: Number(walletSum._sum.amount || 0)
      }
    });
  });

  /** Get Wishlist items */
  getWishlist = asyncHandler(async (req: AuthRequest, res: Response) => {
    const items = await prisma.wishlist.findMany({
      where: { userId: req.user!.userId },
      include: { product: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: items });
  });

  /** Get User Reviews */
  getReviews = asyncHandler(async (req: AuthRequest, res: Response) => {
    const reviews = await prisma.review.findMany({
      where: { userId: req.user!.userId },
      include: { product: { select: { name: true, slug: true, image: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: reviews });
  });
}
