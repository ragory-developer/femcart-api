import { Router } from 'express';
import { AdminRoleController } from '../controllers/AdminRoleController';
import { authenticate, authorize, requirePermission } from '../middleware/auth';

const router = Router();
const controller = new AdminRoleController();

// Only SUPER_ADMIN can manage roles
router.use(authenticate, requirePermission('SUPER_ADMIN'));

router.get('/', controller.getRoles);
router.post('/', controller.createRole);
router.patch('/:id', controller.updateRole);
router.delete('/:id', controller.deleteRole);

export default router;
