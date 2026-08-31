import { Router } from 'express';
import { apiKeyController } from '../controllers/ApiKeyController';
import { authenticate, authorize } from '../middleware/auth';
import { validate, validateQuery } from '../middleware/validate';
import { registerPosSchema, inventoryLogsQuerySchema } from '../validations/posValidation';

const router = Router();

// Only SUPER_ADMIN or ADMIN can manage POS connections and view audit logs
router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN'));

router.post('/settings/test-outbound', apiKeyController.testOutboundConnection);
router.get('/settings', apiKeyController.getInviSettings);
router.put('/settings', apiKeyController.updateInviSettings);
router.get('/', apiKeyController.listConnections);
router.post('/', validate(registerPosSchema), apiKeyController.registerConnection);
router.get('/logs', validateQuery(inventoryLogsQuerySchema), apiKeyController.getInventoryLogs);
router.patch('/:id/toggle', apiKeyController.toggleStatus);
router.put('/:id/approve', apiKeyController.approveConnection);
router.delete('/:id', apiKeyController.revokeConnection);
router.delete('/:id/force', apiKeyController.deleteConnection);

export default router;
