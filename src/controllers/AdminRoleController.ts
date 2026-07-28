import { Request, Response } from 'express';
import prisma from '../config/database';

export class AdminRoleController {
  
  // Get all roles
  async getRoles(req: Request, res: Response) {
    try {
      const roles = await prisma.adminRole.findMany({
        include: {
          _count: {
            select: { users: true }
          }
        },
        orderBy: { createdAt: 'asc' }
      });

      // Transform _count to userCount for frontend convenience
      const formattedRoles = roles.map((r: any) => ({
        ...r,
        permissions: JSON.parse(r.permissions || '[]'),
        userCount: r._count?.users || 0,
        _count: undefined
      }));

      res.status(200).json({ success: true, data: formattedRoles });
    } catch (error: unknown) {
      const err = error as Error;
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // Create new role
  async createRole(req: Request, res: Response) {
    try {
      const { name, description, permissions } = req.body;
      
      if (!name) {
        return res.status(400).json({ success: false, message: 'Role name is required' });
      }

      const newRole = await prisma.adminRole.create({
        data: {
          name,
          description,
          permissions: JSON.stringify(permissions || []),
          isSystem: false
        }
      });

      res.status(201).json({ 
        success: true, 
        data: {
          ...newRole,
          permissions: JSON.parse(newRole.permissions)
        } 
      });
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'P2002') {
        return res.status(400).json({ success: false, message: 'A role with this name already exists.' });
      }
      res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
    }
  }

  // Update existing role
  async updateRole(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, permissions } = req.body;

      const existing = await prisma.adminRole.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Role not found' });
      }

      const updateData: Record<string, string | boolean> = {};
      if (name) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (permissions) updateData.permissions = JSON.stringify(permissions);

      const updatedRole = await prisma.adminRole.update({
        where: { id },
        data: updateData
      });

      res.status(200).json({ 
        success: true, 
        data: {
          ...updatedRole,
          permissions: JSON.parse(updatedRole.permissions)
        } 
      });
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'P2002') {
        return res.status(400).json({ success: false, message: 'A role with this name already exists.' });
      }
      res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
    }
  }

  // Delete a role
  async deleteRole(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const role = await prisma.adminRole.findUnique({ where: { id } });
      if (!role) {
        return res.status(404).json({ success: false, message: 'Role not found' });
      }

      if (role.isSystem) {
        return res.status(403).json({ success: false, message: 'System roles cannot be deleted' });
      }

      await prisma.adminRole.delete({ where: { id } });

      res.status(200).json({ success: true, message: 'Role deleted successfully' });
    } catch (error: unknown) {
      const err = error as Error;
      res.status(500).json({ success: false, message: err.message });
    }
  }
}
