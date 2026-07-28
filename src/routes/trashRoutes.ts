import { Router } from 'express';
import { TrashController } from '../controllers/TrashController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
const trashController = new TrashController();

router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));

router.get('/', trashController.getTrash);
router.post('/restore/:model/:id', trashController.restoreItem);
router.delete('/purge/:model/:id', trashController.purgeItem);

export default router;
