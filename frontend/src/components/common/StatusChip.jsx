import { Chip } from '@mui/material';
import { STATUS_META, PRIORITY_META } from '../../config/constants.js';
import { humanize } from '../../utils/format.js';

/** Coloured chip for an order status. */
export function StatusChip({ status, size = 'small' }) {
  const meta = STATUS_META[status] || { label: humanize(status), color: 'default' };
  return <Chip size={size} label={meta.label} color={meta.color} variant="filled" sx={{ fontWeight: 600 }} />;
}

/** Coloured chip for an order priority. */
export function PriorityChip({ priority, size = 'small' }) {
  const meta = PRIORITY_META[priority] || { label: humanize(priority), color: 'default' };
  return <Chip size={size} label={meta.label} color={meta.color} variant="outlined" />;
}

export default StatusChip;
