import { Router } from 'express';
import multer from 'multer';
import { BulkImportController } from '../controllers/BulkImportController';
import { authenticate, requirePermission } from '../middleware/auth';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
});

router.use(authenticate, requirePermission('IMPORT'));

router.post('/products', upload.single('file'), BulkImportController.importProducts);
router.post('/orders', upload.single('file'), BulkImportController.importOrders);
router.post('/preview-headers', upload.single('file'), BulkImportController.getHeaders);
router.post('/validate', upload.single('file'), BulkImportController.validate);
router.get('/logs', BulkImportController.getLogs);

export default router;
