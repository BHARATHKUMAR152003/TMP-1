/**
 * Order lifecycle. The production workflow has been removed: an order is
 * created and invoiced in one step, then it is simply paid off.
 *
 *   new (draft, no invoice yet) -> billed (invoice issued) -> completed
 *
 * The legacy production statuses are still listed so orders created by the
 * previous workflow keep rendering correctly; they are never entered again.
 */
export const ORDER_STATUS = Object.freeze({
  NEW: 'new',
  BILLED: 'billed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

/** Statuses written by the old production pipeline, retained for old rows. */
export const LEGACY_ORDER_STATUSES = Object.freeze([
  'accountant_approved', 'designing', 'design_approved', 'plate_making',
  'printing', 'cutting', 'finishing', 'ready_for_delivery',
  'out_for_delivery', 'delivered', 'on_hold', 'rejected',
]);

export const ALL_ORDER_STATUSES = Object.freeze([
  ...Object.values(ORDER_STATUS),
  ...LEGACY_ORDER_STATUSES,
]);

/** The happy-path pipeline used to render progress timelines. */
export const ORDER_PIPELINE = Object.freeze([
  ORDER_STATUS.NEW,
  ORDER_STATUS.BILLED,
  ORDER_STATUS.COMPLETED,
]);

const CLOSE_OUT = Object.freeze([ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED]);

/** Allowed status transitions, enforced in the service layer. */
export const STATUS_TRANSITIONS = Object.freeze({
  [ORDER_STATUS.NEW]: [ORDER_STATUS.BILLED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.BILLED]: [...CLOSE_OUT],
  [ORDER_STATUS.COMPLETED]: [ORDER_STATUS.BILLED],
  [ORDER_STATUS.CANCELLED]: [],
  // Legacy production rows can only be closed out.
  ...Object.fromEntries(LEGACY_ORDER_STATUSES.map((status) => [status, [...CLOSE_OUT]])),
});

export function canTransition(from, to) {
  return (STATUS_TRANSITIONS[from] || []).includes(to);
}

export const ORDER_SOURCE = Object.freeze({
  COUNTER: 'counter',
  IMPORT: 'import',
});

export const ORDER_PRIORITY = Object.freeze({
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
});

export const PRIORITY_VALUES = Object.freeze(Object.values(ORDER_PRIORITY));

/**
 * "Production type" is retained purely as a descriptive attribute of the job,
 * printed on the order and the invoice. It no longer routes the order anywhere.
 */
export const PRODUCTION_TYPE = Object.freeze({
  OFFSET: 'offset',
  DIGITAL: 'digital',
});

export const PRODUCTION_TYPES = Object.freeze(Object.values(PRODUCTION_TYPE));

export const PAYMENT_STATUS = Object.freeze({
  UNPAID: 'unpaid',
  PARTIAL: 'partial',
  PAID: 'paid',
});

export const PAYMENT_STATUSES = Object.freeze(Object.values(PAYMENT_STATUS));
