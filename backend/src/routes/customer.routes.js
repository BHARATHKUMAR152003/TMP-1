import { Router } from 'express';
import { body } from 'express-validator';
import * as customerController from '../controllers/customer.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { ROLES } from '../constants/roles.js';

const router = Router();
router.use(authenticate);

const customerRules = [
  body('name').trim().notEmpty().withMessage('Customer name is required').isLength({ max: 120 }),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('Enter a valid email'),
  body('phone').optional({ values: 'falsy' }).isLength({ max: 20 }).withMessage('Phone is too long'),
];

// Both roles manage the customer directory.
const staff = authorize(ROLES.ACCOUNTANT);

router.get('/', staff, customerController.list);
// Type-ahead used by the order form to avoid creating duplicates.
router.get('/search', staff, customerController.search);
router.get('/:id', staff, customerController.getOne);
router.post('/', staff, validate(customerRules), customerController.create);
router.put('/:id', staff, customerController.update);
// Deleting takes the customer's orders and invoices with it, so it is admin-only.
router.delete('/:id', authorize(ROLES.ADMIN), customerController.remove);

export default router;

