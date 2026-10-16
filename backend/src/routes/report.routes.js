import { Router } from 'express';
import * as reportController from '../controllers/report.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { ROLES } from '../constants/roles.js';

const router = Router();
router.use(authenticate, authorize(ROLES.ACCOUNTANT));

router.get('/summary', reportController.summary);
router.get('/export', reportController.exportOrders);

export default router;
