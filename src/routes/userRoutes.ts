import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { authenticate, authorize, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  createAddressSchema,
  requestPhoneChangeSchema,
  updateAddressSchema,
  updateProfileSchema,
  verifyPhoneChangeSchema,
} from '../validators/user.schema';
const router = Router();
const controller = new UserController();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management and profile endpoints
 */

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile details
 *   put:
 *     summary: Update user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.get('/profile', authenticate, controller.getProfile);
router.put('/profile', authenticate, validate(updateProfileSchema), controller.updateProfile);

router.put('/password', authenticate, controller.updatePassword);
router.put('/notifications', authenticate, controller.updateNotifications);
router.post('/avatar', authenticate, controller.updateAvatar);
router.get('/wallet', authenticate, controller.getWallet);
router.get('/wishlist', authenticate, controller.getWishlist);
router.get('/reviews', authenticate, controller.getReviews);

/**
 * @swagger
 * /api/users/request-phone-change:
 *   post:
 *     summary: Request to change phone number
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OTP sent to new phone
 */
router.post('/request-phone-change', authenticate, validate(requestPhoneChangeSchema), controller.requestPhoneChange);

/**
 * @swagger
 * /api/users/verify-phone-change:
 *   post:
 *     summary: Verify phone change OTP
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Phone number updated
 */
router.post('/verify-phone-change', authenticate, validate(verifyPhoneChangeSchema), controller.verifyPhoneChange);

/**
 * @swagger
 * /api/users/addresses:
 *   get:
 *     summary: Get user addresses
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of addresses
 *   post:
 *     summary: Create new address
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Address created
 */
router.get('/addresses', authenticate, controller.getAddresses);
router.post('/addresses', authenticate, validate(createAddressSchema), controller.createAddress);

/**
 * @swagger
 * /api/users/addresses/{id}:
 *   put:
 *     summary: Update an address
 *     tags: [Users]
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
 *         description: Address updated
 *   delete:
 *     summary: Delete an address
 *     tags: [Users]
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
 *         description: Address deleted
 */
router.put('/addresses/:id', authenticate, validate(updateAddressSchema), controller.updateAddress);
router.delete('/addresses/:id', authenticate, controller.deleteAddress);

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all users
 *   post:
 *     summary: Create user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: User created
 */
router.get('/', authenticate, requirePermission('USERS'), controller.getAllUsers);
router.post('/', authenticate, requirePermission('USERS'), controller.createUser);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user by ID (Admin only)
 *     tags: [Users]
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
 *         description: User details
 *   put:
 *     summary: Update user by ID (Admin only)
 *     tags: [Users]
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
 *         description: User updated
 */
router.get('/:id', authenticate, requirePermission('USERS'), controller.getUserById);
router.put('/:id', authenticate, requirePermission('USERS'), controller.updateCustomerAdmin);

export default router;
