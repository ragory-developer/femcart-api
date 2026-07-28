import { Router } from 'express';
import { authenticate, authorize, requirePermission } from '../middleware/auth';
import { createTag, deleteTag, getTags, updateTag } from '../controllers/TagController';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Tags
 *   description: Product tag management
 */

// Publicly readable tags
/**
 * @swagger
 * /api/tags:
 *   get:
 *     summary: Get all tags
 *     tags: [Tags]
 *     responses:
 *       200:
 *         description: List of tags
 */
router.get('/', getTags);

// Temporarily unprotected for admin UI building, just like category and brand routes
/**
 * @swagger
 * /api/tags:
 *   post:
 *     summary: Create new tag
 *     tags: [Tags]
 *     responses:
 *       201:
 *         description: Tag created
 */
router.post('/', authenticate, requirePermission('PRODUCTS'), createTag);

/**
 * @swagger
 * /api/tags/{id}:
 *   put:
 *     summary: Update tag
 *     tags: [Tags]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tag updated
 *   delete:
 *     summary: Delete tag
 *     tags: [Tags]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tag deleted
 */
router.put('/:id', authenticate, requirePermission('PRODUCTS'), updateTag);
router.delete('/:id', authenticate, requirePermission('PRODUCTS'), deleteTag);

export default router;
