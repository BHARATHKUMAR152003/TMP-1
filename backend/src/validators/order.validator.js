import { body } from 'express-validator';
import { ALL_ORDER_STATUSES, ORDER_PRIORITY, PRODUCTION_TYPES } from '../constants/orderStatus.js';

// Blank strings are treated as "not supplied": the form always posts every
// field, so an untouched optional input arrives as '' rather than undefined.
const optionalValue = { values: 'falsy' };

const moneyRules = [
  body('totalAmount').optional(optionalValue).isFloat({ min: 0 }).withMessage('Total must be a positive number'),
  body('paymentAmount').optional(optionalValue).isFloat({ min: 0 }).withMessage('Payment must be a positive number'),
  body('deliveryCharge').optional(optionalValue).isFloat({ min: 0 }).withMessage('Delivery charge must be a positive number'),
  body('cuttingCharge').optional(optionalValue).isFloat({ min: 0 }).withMessage('Cutting charge must be a positive number'),
  body('dispatchedThrough').optional(optionalValue).isString().isLength({ max: 120 }).withMessage('Dispatched through is too long'),
  body('gstRate').optional(optionalValue).isFloat({ min: 0, max: 100 }).withMessage('GST rate must be between 0 and 100'),
];

const wastageRules = [
  body('wastageItemId').optional(optionalValue).isInt({ min: 1 }).withMessage('Select a valid inventory item'),
  body('wastageQuantity').optional(optionalValue).isFloat({ min: 0 }).withMessage('Wastage must be a positive number'),
];

export const createOrderRules = [
  // Product name is optional: it falls back to the selected category name.
  body('productionType').optional(optionalValue).isIn(PRODUCTION_TYPES).withMessage('Production type must be Offset or Digital'),
  body('quantity').optional(optionalValue).isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('priority').optional(optionalValue).isIn(Object.values(ORDER_PRIORITY)).withMessage('Invalid priority'),
  body('hsnCode').optional(optionalValue).isLength({ max: 12 }).withMessage('HSN/SAC is too long'),
  ...moneyRules,
  ...wastageRules,
];

export const updateOrderRules = [
  body('productionType').optional(optionalValue).isIn(PRODUCTION_TYPES).withMessage('Production type must be Offset or Digital'),
  body('quantity').optional(optionalValue).isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('priority').optional(optionalValue).isIn(Object.values(ORDER_PRIORITY)).withMessage('Invalid priority'),
  ...moneyRules,
  ...wastageRules,
];

export const updateStatusRules = [
  body('status').isIn(ALL_ORDER_STATUSES).withMessage('Invalid order status'),
  body('note').optional({ values: 'falsy' }).isString().isLength({ max: 500 }),
];

export const commentRules = [
  body('comment').trim().notEmpty().withMessage('Comment cannot be empty').isLength({ max: 1000 }),
];

