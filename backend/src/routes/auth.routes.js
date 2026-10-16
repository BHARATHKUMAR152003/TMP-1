import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { loginRules, changePasswordRules } from '../validators/auth.validator.js';

const router = Router();

// There is no public sign-up: an admin creates accounts from Users.
router.post('/login', validate(loginRules), authController.login);
router.get('/me', authenticate, authController.me);
router.patch('/me', authenticate, authController.updateMe);
router.patch('/change-password', authenticate, validate(changePasswordRules), authController.changePassword);

export default router;

