import { Router } from 'express';
import * as orderController from '../controllers/order.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { upload } from '../middleware/upload.middleware.js';
import { ROLES } from '../constants/roles.js';
import {
  createOrderRules,
  updateOrderRules,
  updateStatusRules,
  commentRules,
} from '../validators/order.validator.js';

const router = Router();

// Accept both design files and an optional payment screenshot on creation.
const orderUpload = upload.fields([
  { name: 'designFiles', maxCount: 10 },
  { name: 'paymentScreenshot', maxCount: 10 },
]);

router.use(authenticate);

// Both roles run the front desk, so both may read, create and edit orders.
const staff = authorize(ROLES.ACCOUNTANT);

router.get('/', staff, orderController.list);
router.get('/:id', staff, orderController.getOne);

router.post('/', staff, orderUpload, validate(createOrderRules), orderController.create);
router.put('/:id', staff, validate(updateOrderRules), orderController.update);
router.patch('/:id/status', staff, validate(updateStatusRules), orderController.updateStatus);
router.post('/:id/comments', staff, validate(commentRules), orderController.comment);
router.post(
  '/:id/files',
  staff,
  upload.fields([{ name: 'designFiles', maxCount: 10 }]),
  orderController.uploadFiles,
);

// Deleting wipes the invoice and its payments, so it is admin-only.
router.delete('/:id', authorize(ROLES.ADMIN), orderController.remove);

export default router;

