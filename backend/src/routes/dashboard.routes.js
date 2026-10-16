import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(authenticate);

// The admin dashboard adds user/inventory management tiles; the accountant
// dashboard is the same figures without them.
router.get('/admin', authorize(), dashboardController.admin);
router.get('/accountant', authorize(ROLES.ACCOUNTANT), dashboardController.accountant);

export default router;

