import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { ConflictError, ForbiddenError, NotFoundError } from '../utils/errors';

const AVAILABLE_PERMISSIONS = [
  'DASHBOARD', 'PRODUCTS', 'MEDIA', 'CATEGORIES', 'BRANDS',
  'SPECIFICATIONS', 'VARIATIONS', 'ORDERS', 'IMPORT', 'PAGES',
  'SETTINGS', 'USERS'
];

export class AdminUsersService {
  /** List all admin users (ADMIN + SUPER_ADMIN) */
  async listAdmins() {
    const users = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        permissions: true,
        adminRoleId: true,
        adminRole: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return users.map((u: any) => {
      let mergedPermissions: string[] = [];
      if (u.role === 'SUPER_ADMIN') {
        mergedPermissions = ['ALL'];
      } else {
        const rawPerms = u.permissions ? JSON.parse(u.permissions) : [];
        const rolePerms = u.adminRole?.permissions ? JSON.parse(u.adminRole.permissions) : [];
        mergedPermissions = [...new Set([...rawPerms, ...rolePerms])];
      }
      
      return {
        ...u,
        permissions: mergedPermissions,
      };
    });
  }

  /** Create a new admin with specific permissions */
  async createAdmin(data: {
    name: string;
    email: string;
    password: string;
    role: 'ADMIN' | 'SUPER_ADMIN';
    permissions?: string[];
    adminRoleId?: string | null;
  }) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new ConflictError('An account with this email already exists');
    }

    if (data.permissions) {
      this.validatePermissions(data.permissions, data.role);
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: data.role,
        permissions: data.permissions ? JSON.stringify(data.permissions) : '[]',
        adminRoleId: data.adminRoleId || null,
      },
      select: { id: true, name: true, email: true, role: true, permissions: true, adminRoleId: true, createdAt: true },
    });

    return { ...user, permissions: JSON.parse(user.permissions || '[]') };
  }

  /** Update an admin user's name, role, or permissions */
  async updateAdmin(id: string, requesterId: string, data: {
    name?: string;
    role?: 'ADMIN' | 'SUPER_ADMIN';
    permissions?: string[];
    adminRoleId?: string | null;
    password?: string;
  }) {
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || !['ADMIN', 'SUPER_ADMIN'].includes(target.role)) {
      throw new NotFoundError('Admin user not found');
    }

    // Cannot modify yourself
    if (id === requesterId) {
      throw new ForbiddenError('Cannot modify your own account via this endpoint');
    }

    if (data.permissions) {
      this.validatePermissions(data.permissions, data.role || target.role as any);
    }

    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.role) updateData.role = data.role;
    if (data.permissions !== undefined) updateData.permissions = JSON.stringify(data.permissions);
    if (data.adminRoleId !== undefined) updateData.adminRoleId = data.adminRoleId;
    if (data.password) updateData.password = await bcrypt.hash(data.password, 12);

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, permissions: true, adminRoleId: true, createdAt: true },
    });

    return { ...updated, permissions: JSON.parse(updated.permissions || '[]') };
  }

  /** Delete an admin user */
  async deleteAdmin(id: string, requesterId: string) {
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || !['ADMIN', 'SUPER_ADMIN'].includes(target.role)) {
      throw new NotFoundError('Admin user not found');
    }
    if (id === requesterId) {
      throw new ForbiddenError('Cannot delete your own account');
    }
    await prisma.user.delete({ where: { id } });
    return { message: 'Admin user deleted successfully' };
  }

  /** Get available permission list */
  getAvailablePermissions() {
    return AVAILABLE_PERMISSIONS;
  }

  private validatePermissions(permissions: string[], role: 'ADMIN' | 'SUPER_ADMIN') {
    // SUPER_ADMIN gets all permissions automatically
    if (role === 'SUPER_ADMIN') return;
    const invalid = permissions.filter(p => !AVAILABLE_PERMISSIONS.includes(p) && p !== 'ALL');
    if (invalid.length > 0) {
      throw new Error(`Invalid permissions: ${invalid.join(', ')}`);
    }
  }
}
