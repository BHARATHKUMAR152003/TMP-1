import { Router } from 'express';
import * as importController from '../controllers/import.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

// Historical data migration is an administrative operation.
router.use(authenticate, requireAdmin);

router.get('/batches', importController.batches);
router.get('/template/:entity', importController.template);
router.post('/', importController.run);

export default router;
