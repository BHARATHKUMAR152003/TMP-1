import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import ShoppingCartRoundedIcon from '@mui/icons-material/ShoppingCartRounded';
import PeopleRoundedIcon from '@mui/icons-material/PeopleRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import BadgeRoundedIcon from '@mui/icons-material/BadgeRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';

/** The application has exactly two roles. */
export const ROLES = {
  ADMIN: 'admin',
  ACCOUNTANT: 'accountant',
};

export const ALL_ROLES = [ROLES.ADMIN, ROLES.ACCOUNTANT];

/** Accent colour per role — drives the whole theme for that session. */
export const ROLE_COLORS = {
  admin: '#1d4ed8',
  accountant: '#0f766e',
};

/** Portal label shown under the logo in the sidebar. */
export const ROLE_LABELS = {
  admin: 'Admin Portal',
  accountant: 'Accountant Portal',
};

// The accountant runs the front desk: everything except Users and Settings.
const SHARED_MENU = [
  { label: 'Dashboard', path: '/dashboard', icon: DashboardRoundedIcon },
  { label: 'Customers', path: '/customers', icon: PeopleRoundedIcon },
  { label: 'Orders', path: '/orders', icon: ShoppingCartRoundedIcon },
  { label: 'Inventory', path: '/inventory', icon: Inventory2RoundedIcon },
  { label: 'Payments', path: '/payments', icon: PaymentsRoundedIcon },
  { label: 'Bills / Invoices', path: '/bills', icon: ReceiptLongRoundedIcon },
  { label: 'Reports', path: '/reports', icon: InsightsRoundedIcon },
];

/** Sidebar navigation per role. Paths map 1:1 to routes in App.jsx. */
export const ROLE_MENUS = {
  accountant: SHARED_MENU,
  admin: [
    ...SHARED_MENU,
    { label: 'Users', path: '/users', icon: BadgeRoundedIcon },
    { label: 'Settings', path: '/settings', icon: SettingsRoundedIcon },
  ],
};

/**
 * Visual metadata for order statuses. The first four are the live workflow;
 * the rest are legacy production statuses kept so historical orders created by
 * the old pipeline still render with a sensible label.
 */
export const STATUS_META = {
  new: { label: 'Draft', color: 'default' },
  billed: { label: 'Invoiced', color: 'primary' },
  completed: { label: 'Completed', color: 'success' },
  cancelled: { label: 'Cancelled', color: 'error' },
  accountant_approved: { label: 'Approved', color: 'primary' },
  designing: { label: 'Designing', color: 'warning' },
  design_approved: { label: 'Design Approved', color: 'warning' },
  plate_making: { label: 'Plate Making', color: 'secondary' },
  printing: { label: 'Printing', color: 'secondary' },
  cutting: { label: 'Cutting', color: 'secondary' },
  finishing: { label: 'Finishing', color: 'secondary' },
  ready_for_delivery: { label: 'Ready', color: 'success' },
  out_for_delivery: { label: 'Dispatched', color: 'info' },
  delivered: { label: 'Delivered', color: 'success' },
  on_hold: { label: 'On Hold', color: 'warning' },
  rejected: { label: 'Rejected', color: 'error' },
};

/** Statuses an order can be moved to from the UI. */
export const STATUS_OPTIONS = [
  { value: 'completed', label: 'Mark completed' },
  { value: 'cancelled', label: 'Cancel order' },
];

/** Happy-path pipeline for order timelines. */
export const ORDER_PIPELINE = ['new', 'billed', 'completed'];

export const PRIORITY_META = {
  low: { label: 'Low', color: 'default' },
  normal: { label: 'Normal', color: 'info' },
  high: { label: 'High', color: 'warning' },
  urgent: { label: 'Urgent', color: 'error' },
};

export const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

/** Descriptive attribute of the job, printed on the invoice. */
export const PRODUCTION_TYPES = [
  { value: 'offset', label: 'Offset' },
  { value: 'digital', label: 'Digital' },
];

export const PRODUCTION_TYPE_META = {
  offset: { label: 'Offset', color: 'secondary' },
  digital: { label: 'Digital', color: 'info' },
};

export const PAYMENT_STATUS_META = {
  unpaid: { label: 'Unpaid', color: 'error' },
  partial: { label: 'Partial', color: 'warning' },
  paid: { label: 'Paid', color: 'success' },
};

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
];

export const PAYMENT_METHOD_LABELS = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.value, m.label]),
);

/** Units offered on the order form; free text is also accepted. */
export const UNITS = ['Nos', 'Pcs', 'Sets', 'Sheets', 'Boxes', 'Sq.Ft', 'Kg'];

/** GST state/UT codes (first two digits of a GSTIN). */
export const INDIAN_STATES = [
  { name: 'Jammu and Kashmir', code: '01' },
  { name: 'Himachal Pradesh', code: '02' },
  { name: 'Punjab', code: '03' },
  { name: 'Chandigarh', code: '04' },
  { name: 'Uttarakhand', code: '05' },
  { name: 'Haryana', code: '06' },
  { name: 'Delhi', code: '07' },
  { name: 'Rajasthan', code: '08' },
  { name: 'Uttar Pradesh', code: '09' },
  { name: 'Bihar', code: '10' },
  { name: 'Sikkim', code: '11' },
  { name: 'Arunachal Pradesh', code: '12' },
  { name: 'Nagaland', code: '13' },
  { name: 'Manipur', code: '14' },
  { name: 'Mizoram', code: '15' },
  { name: 'Tripura', code: '16' },
  { name: 'Meghalaya', code: '17' },
  { name: 'Assam', code: '18' },
  { name: 'West Bengal', code: '19' },
  { name: 'Jharkhand', code: '20' },
  { name: 'Odisha', code: '21' },
  { name: 'Chhattisgarh', code: '22' },
  { name: 'Madhya Pradesh', code: '23' },
  { name: 'Gujarat', code: '24' },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', code: '26' },
  { name: 'Maharashtra', code: '27' },
  { name: 'Karnataka', code: '29' },
  { name: 'Goa', code: '30' },
  { name: 'Lakshadweep', code: '31' },
  { name: 'Kerala', code: '32' },
  { name: 'Tamil Nadu', code: '33' },
  { name: 'Puducherry', code: '34' },
  { name: 'Andaman and Nicobar Islands', code: '35' },
  { name: 'Telangana', code: '36' },
  { name: 'Andhra Pradesh', code: '37' },
  { name: 'Ladakh', code: '38' },
  { name: 'Other Territory', code: '97' },
];

export const DEFAULT_STATE = 'Tamil Nadu';

export const STATE_CODES = Object.fromEntries(
  INDIAN_STATES.map((s) => [s.name, s.code]),
);

