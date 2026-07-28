import { Response, Router } from 'express';
import { authenticate, authorize, AuthRequest, requirePermission } from '../middleware/auth';
import { AdminUsersService } from '../services/adminUsersService';

const router = Router();
const svc = new AdminUsersService();

/**
 * @swagger
 * tags:
 *   name: Admin Users
 *   description: Admin user management
 */

// All routes require authentication and SUPER_ADMIN role
router.use(authenticate, requirePermission('USERS'));

/**
 * @swagger
 * /api/admin-users:
 *   get:
 *     summary: List all admin users
 *     tags: [Admin Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of admins
 */
router.get('/', async (_req: AuthRequest, res: Response, next) => {
  try {
    const users = await svc.listAdmins();
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/admin-users/permissions:
 *   get:
 *     summary: List available permissions
 *     tags: [Admin Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available permissions
 */
router.get('/permissions', async (_req: AuthRequest, res: Response, next) => {
  try {
    res.json({ success: true, data: svc.getAvailablePermissions() });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/admin-users:
 *   post:
 *     summary: Create a new admin
 *     tags: [Admin Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Admin created
 */
router.post('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const { name, email, password, role = 'ADMIN', permissions = [] } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'name, email, and password are required' });
    }
    const user = await svc.createAdmin({ name, email, password, role, permissions });
    res.status(201).json({ success: true, data: user });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/admin-users/{id}:
 *   patch:
 *     summary: Update admin role/permissions
 *     tags: [Admin Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Admin updated
 */
router.patch('/:id', async (req: AuthRequest, res: Response, next) => {
  try {
    const requesterId = req.user!.userId;
    const user = await svc.updateAdmin(String(req.params.id), requesterId, req.body);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/admin-users/{id}:
 *   delete:
 *     summary: Delete an admin
 *     tags: [Admin Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Admin deleted
 */
router.delete('/:id', async (req: AuthRequest, res: Response, next) => {
  try {
    const requesterId = req.user!.userId;
    const result = await svc.deleteAdmin(String(req.params.id), requesterId);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

export default router;
