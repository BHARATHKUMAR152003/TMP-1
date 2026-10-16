import { body } from 'express-validator';

export const loginRules = [
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').isString().notEmpty().withMessage('Password is required'),
];

export const registerRules = [
  body('name').trim().isLength({ min: 2, max: 120 }).withMessage('Name must be 2-120 characters'),
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('phone').optional({ values: 'falsy' }).isMobilePhone('any').withMessage('Invalid phone number'),
  body('address').optional({ values: 'falsy' }).isString(),
  body('companyName').optional({ values: 'falsy' }).isString(),
  body('gstNumber').optional({ values: 'falsy' }).isString(),
];

export const changePasswordRules = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
];
