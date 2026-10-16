import { ROLES } from './roles.js';

export * from './roles.js';
export * from './orderStatus.js';

/** Notification event types raised as orders and payments are processed. */
export const NOTIFICATION_EVENTS = Object.freeze({
  ORDER_CREATED: 'order_created',
  BILL_CREATED: 'bill_created',
  STATUS_CHANGED: 'status_changed',
  PAYMENT_RECORDED: 'payment_recorded',
  LOW_STOCK: 'low_stock',
});

/**
 * Which portals (roles) receive each notification event in their own feed. One
 * notification row is stored per recipient role so every portal keeps its own
 * history and unread state.
 */
const BOTH = [ROLES.ADMIN, ROLES.ACCOUNTANT];

export const NOTIFICATION_RECIPIENTS = Object.freeze({
  [NOTIFICATION_EVENTS.ORDER_CREATED]: BOTH,
  [NOTIFICATION_EVENTS.BILL_CREATED]: BOTH,
  [NOTIFICATION_EVENTS.STATUS_CHANGED]: BOTH,
  [NOTIFICATION_EVENTS.PAYMENT_RECORDED]: BOTH,
  [NOTIFICATION_EVENTS.LOW_STOCK]: BOTH,
});

/** Fallback recipients for any event without an explicit mapping. */
export const DEFAULT_NOTIFICATION_RECIPIENTS = Object.freeze([ROLES.ADMIN]);

/** Inventory groups seeded by default. */
export const PRODUCTION_GROUP = Object.freeze({
  OFFSET: 'offset',
  PLATE: 'plate',
  DIGITAL: 'digital',
});

export const PRODUCTION_GROUPS = Object.freeze(Object.values(PRODUCTION_GROUP));

/**
 * Suggested material types per group for the inventory panel. Staff may add
 * any material manually; these are only UI hints / seed defaults.
 */
export const INVENTORY_MATERIALS = Object.freeze({
  [PRODUCTION_GROUP.OFFSET]: ['Paper', 'Ink', 'Chemical'],
  [PRODUCTION_GROUP.PLATE]: ['Plate', 'Chemical'],
  [PRODUCTION_GROUP.DIGITAL]: ['Paper'],
});

export const PAYMENT_METHODS = Object.freeze([
  'cash', 'upi', 'bank_transfer', 'cheque', 'card', 'other',
]);
export const PAYMENT_TYPES = Object.freeze(['advance', 'partial', 'full', 'refund']);

/** Default invoice numbering prefix: TMP/0001/26-27. */
export const INVOICE_PREFIX_DEFAULT = 'TMP';
