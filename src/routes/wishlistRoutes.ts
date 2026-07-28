import { Router } from 'express';
import { WishlistController } from '../controllers/WishlistController';
import { authenticate } from '../middleware/auth';

const router = Router();
const controller = new WishlistController();

router.get('/', authenticate, controller.getWishlist);
router.post('/', authenticate, controller.add);
router.delete('/:productId', authenticate, controller.remove);

export default router;
