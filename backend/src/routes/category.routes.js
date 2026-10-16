import { Router } from 'express';
import { body } from 'express-validator';
import * as categoryController from '../controllers/category.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';

const router = Router();
router.use(authenticate);

const categoryRules = [
  body('name').trim().notEmpty().withMessage('Category name is required').isLength({ max: 120 }),
  body('status').optional().isIn(['active', 'inactive']),
];

// Any authenticated user can read categories (needed for order forms).
router.get('/', categoryController.list);
router.post('/', requireAdmin, validate(categoryRules), categoryController.create);
router.put('/:id', requireAdmin, categoryController.update);
router.delete('/:id', requireAdmin, categoryController.remove);

export default router;
