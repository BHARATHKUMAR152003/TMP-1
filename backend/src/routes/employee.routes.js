import { Router } from 'express';
import { body } from 'express-validator';
import * as employeeController from '../controllers/employee.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { ALL_ROLES } from '../constants/roles.js';

const router = Router();

// User management is admin-only, enforced here rather than by hiding the menu.
router.use(authenticate, requireAdmin);

const createRules = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role').isIn(ALL_ROLES).withMessage('Role must be admin or accountant'),
];

router.get('/', employeeController.list);
router.get('/:id', employeeController.getOne);
router.post('/', validate(createRules), employeeController.create);
router.put('/:id', employeeController.update);
router.patch('/:id/active', employeeController.toggleActive);

export default router;

