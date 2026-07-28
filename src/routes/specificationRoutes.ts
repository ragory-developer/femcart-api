import { Router } from 'express';
import { authenticate, authorize, requirePermission } from '../middleware/auth';
import {
  createSpecification,
  createSpecificationValue,
  deleteSpecification,
  deleteSpecificationValue,
  getSpecifications,
  updateSpecification,
  updateSpecificationValue
} from '../controllers/SpecificationController';

const router = Router();

// --- Specifications ---
router.get('/', getSpecifications);
router.post('/', authenticate, requirePermission('SPECIFICATIONS'), createSpecification);
router.put('/:id', authenticate, requirePermission('SPECIFICATIONS'), updateSpecification);
router.delete('/:id', authenticate, requirePermission('SPECIFICATIONS'), deleteSpecification);

// --- Specification Values ---
router.post('/:specificationId/values', authenticate, requirePermission('SPECIFICATIONS'), createSpecificationValue);
router.put('/:specificationId/values/:valueId', authenticate, requirePermission('SPECIFICATIONS'), updateSpecificationValue);
router.delete('/:specificationId/values/:valueId', authenticate, requirePermission('SPECIFICATIONS'), deleteSpecificationValue);

export default router;
