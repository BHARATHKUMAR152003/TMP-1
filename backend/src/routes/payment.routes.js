import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';
import { ROLES } from '../constants/roles.js';

const router = Router();
router.use(authenticate, authorize(ROLES.ACCOUNTANT));

// Proof screenshot(s) may be attached while recording a payment, so the
// endpoint accepts multipart as well as JSON.
const proofUpload = upload.fields([
  { name: 'paymentScreenshot', maxCount: 10 },
  { name: 'paymentScreenshots', maxCount: 10 },
]);

// RECEIVED tab.
router.get('/', paymentController.list);
// UNPAID tab: invoices with an outstanding balance.
router.get('/unpaid', paymentController.listUnpaid);
router.post('/', proofUpload, paymentController.record);

export default router;

