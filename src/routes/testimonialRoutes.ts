import { Router } from 'express';
import { createTestimonial, deleteTestimonial, getTestimonials, updateTestimonial } from '../controllers/TestimonialController';
import { authenticate, authorize, requirePermission } from '../middleware/auth';

const router = Router();

// Public routes
router.get('/', getTestimonials);

// Admin only routes
router.use(authenticate);
router.use(requirePermission('SETTINGS'));

router.post('/', createTestimonial);
router.put('/:id', updateTestimonial);
router.delete('/:id', deleteTestimonial);

export default router;
