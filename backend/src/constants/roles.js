/**
 * Canonical role identifiers. The application supports exactly two roles:
 * ADMIN (full access) and ACCOUNTANT (front desk: customers, orders, bills,
 * payments, inventory, reports — never user management or system settings).
 */
export const ROLES = Object.freeze({
  ADMIN: 'admin',
  ACCOUNTANT: 'accountant',
});

export const ALL_ROLES = Object.freeze(Object.values(ROLES));

/** Roles that have full administrative visibility. */
export const ADMIN_ROLES = Object.freeze([ROLES.ADMIN]);

/** Internal staff. Both roles are staff now that the customer portal is gone. */
export const STAFF_ROLES = Object.freeze([...ALL_ROLES]);

/** Roles allowed to download bill / tax-invoice documents. */
export const DOC_DOWNLOAD_ROLES = Object.freeze([ROLES.ADMIN, ROLES.ACCOUNTANT]);

/**
 * Roles retired by the two-role simplification. Accounts still holding one of
 * these are deactivated by the migration instead of deleted, so historical
 * created_by_user_id / recorded_by_user_id references stay intact.
 */
export const RETIRED_ROLES = Object.freeze([
  'manager',
  'billing_staff',
  'designer',
  'operator_offset',
  'operator_digital',
  'delivery',
  'customer',
]);

export function isAdminRole(role) {
  return ADMIN_ROLES.includes(role);
}

export function isKnownRole(role) {
  return ALL_ROLES.includes(role);
}
