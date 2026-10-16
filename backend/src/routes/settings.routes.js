import { Router } from 'express';
import * as settingsController from '../controllers/settings.controller.js';
import { authenticate, authorize, requireAdmin } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';
import { ROLES } from '../constants/roles.js';

const router = Router();
router.use(authenticate);

// Everyone can read settings (company name, currency…), only admins can change.
router.get('/', authorize(), settingsController.get);
router.put('/', requireAdmin, settingsController.update);

// Payment details are readable by any signed-in user so customers know where
// to pay; only admins can edit the accounts or upload a QR image.
router.get('/payment', settingsController.paymentSettings);
router.put('/payment-accounts', requireAdmin, settingsController.updatePaymentAccounts);
router.post(
  '/payment-qr',
  requireAdmin,
  upload.fields([{ name: 'qr', maxCount: 1 }, { name: 'file', maxCount: 1 }]),
  settingsController.uploadPaymentQr,
);

// The size rate card is a front-desk tool, so the accountant maintains it too.
router.get('/size-rates', authorize(ROLES.ACCOUNTANT), settingsController.sizeRates);
router.put('/size-rates', authorize(ROLES.ACCOUNTANT), settingsController.updateSizeRates);

export default router;
