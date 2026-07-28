import { Router } from 'express';
import multer from 'multer';
import { MediaController } from '../controllers/MediaController';
import { authenticate, authorize, requirePermission } from '../middleware/auth';

const router = Router();
const controller = new MediaController();

// Multer: store in memory for sharp processing
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

/**
 * @swagger
 * tags:
 *   name: Media
 *   description: Media and file uploads
 */

// Public routes
/**
 * @swagger
 * /api/media:
 *   get:
 *     summary: Get all media items
 *     tags: [Media]
 *     responses:
 *       200:
 *         description: List of media files
 */
router.get('/', controller.getAll);

/**
 * @swagger
 * /api/media/{id}:
 *   get:
 *     summary: Get media by ID
 *     tags: [Media]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Media details
 */
router.get('/:id', controller.getById);

// Admin routes (TODO: re-add authenticate + authorize after testing)
/**
 * @swagger
 * /api/media/upload:
 *   post:
 *     summary: Upload media file
 *     tags: [Media]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: File uploaded
 */
router.post('/upload', authenticate, requirePermission('MEDIA'), upload.single('image'), controller.upload);

/**
 * @swagger
 * /api/media/{id}:
 *   put:
 *     summary: Update media metadata
 *     tags: [Media]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Media updated
 *   delete:
 *     summary: Delete media
 *     tags: [Media]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Media deleted
 */
router.put('/:id', authenticate, requirePermission('MEDIA'), controller.update);
router.delete('/:id', authenticate, requirePermission('MEDIA'), controller.delete);

export default router;
