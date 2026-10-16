import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Grid, Typography, Divider,
  Stack, Chip, TextField, MenuItem, Box, Table, TableBody, TableCell, TableRow, Alert,
  List, ListItem, ListItemText, IconButton,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DataState from './DataState.jsx';
import StatusChip, { PriorityChip } from './StatusChip.jsx';
import OrderTimeline from './OrderTimeline.jsx';
import { getOrder, updateOrderStatus, addOrderComment } from '../../services/order.service.js';
import { downloadBill } from '../../services/finance.service.js';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_META, STATUS_OPTIONS } from '../../config/constants.js';
import { formatDate, formatDateTime, formatMoney } from '../../utils/format.js';

function Field({ label, value }) {
  return (
    <Grid size={{ xs: 6, sm: 4 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2">{value || '—'}</Typography>
    </Grid>
  );
}

/** Read-only order view with the GST breakdown, payments and status actions. */
export default function OrderDetailDialog({ orderId, open, onClose, onChanged }) {
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [status, setStatus] = useState('');
  const [comment, setComment] = useState('');

  const load = useCallback(() => {
    if (!orderId) return;
    setLoading(true);
    setError('');
    getOrder(orderId)
      .then((data) => {
        setOrder(data);
        setStatus('');
      })
      .catch((err) => setError(err.displayMessage || 'Failed to load the order'))
      .finally(() => setLoading(false));
  }, [orderId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const applyStatus = async () => {
    if (!status) return;
    setBusy(true);
    setActionError('');
    try {
      setOrder(await updateOrderStatus(order.id, status));
      setStatus('');
      onChanged?.();
    } catch (err) {
      setActionError(err.displayMessage || 'Could not change the status');
    } finally {
      setBusy(false);
    }
  };

  const postComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      setOrder(await addOrderComment(order.id, comment.trim()));
      setComment('');
    } catch (err) {
      setActionError(err.displayMessage || 'Could not add the note');
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    try {
      await downloadBill(order.id, order.order_number);
    } catch (err) {
      setActionError(err.displayMessage || 'Failed to download the bill');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap">
          <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>
            {order?.order_number ?? 'Order'}
          </Typography>
          {order && <StatusChip status={order.status} />}
          {order && (
            <Chip
              size="small"
              color={PAYMENT_STATUS_META[order.payment_status]?.color ?? 'default'}
              label={PAYMENT_STATUS_META[order.payment_status]?.label ?? order.payment_status}
            />
          )}
          {order?.is_historical && <Chip size="small" variant="outlined" label="Historical" />}
        </Stack>
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <DataState loading={loading} error={error} onRetry={load}>
          {order && (
            <>
              {actionError && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError('')}>
                  {actionError}
                </Alert>
              )}

              <OrderTimeline status={order.status} />

              <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>
                Customer
              </Typography>
              <Grid container spacing={2}>
                <Field label="Name" value={order.customer_name} />
                <Field label="Company" value={order.customer_company} />
                <Field label="Phone" value={order.customer_phone} />
                <Field label="Email" value={order.customer_email} />
                <Field label="GSTIN" value={order.customer_gst} />
                <Field label="Address" value={order.customer_address} />
              </Grid>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Order
              </Typography>
              <Grid container spacing={2}>
                <Field label="Invoice date" value={formatDate(order.order_date)} />
                <Field label="Financial year" value={order.financial_year} />
                <Field label="Product" value={order.product_name} />
                <Field label="Category" value={order.category_name} />
                <Field label="Quantity" value={`${order.quantity} ${order.unit ?? ''}`} />
                <Field label="Size" value={order.size} />
                <Field label="Production type" value={order.production_type} />
                <Field label="HSN / SAC" value={order.hsn_code} />
                {order.dispatched_through && <Field label="Dispatched through" value={order.dispatched_through} />}
                {order.wastage_item_name && Number(order.wastage_quantity) > 0 && (
                  <Field
                    label="Wastage"
                    value={`${order.wastage_item_name} · ${Number(order.wastage_quantity)} ${order.wastage_unit ?? ''}`}
                  />
                )}
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">
                    Priority
                  </Typography>
                  <Box>
                    <PriorityChip priority={order.priority} />
                  </Box>
                </Grid>
                {order.special_instructions && (
                  <Grid size={{ xs: 12 }}>
                    <Typography variant="caption" color="text.secondary">
                      Special instructions
                    </Typography>
                    <Typography variant="body2">{order.special_instructions}</Typography>
                  </Grid>
                )}
              </Grid>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Tax summary
              </Typography>
              <Table size="small" sx={{ maxWidth: 420 }}>
                <TableBody>
                  {[
                    ['Taxable value', formatMoney(order.taxableValue)],
                    [`CGST @ ${order.cgstRate ?? 0}%`, formatMoney(order.cgstAmount)],
                    [`SGST/UTGST @ ${order.sgstRate ?? 0}%`, formatMoney(order.sgstAmount)],
                    ['Delivery charges', formatMoney(order.delivery_charge)],
                    ['Cutting charges', formatMoney(order.cutting_charge)],
                    ['Grand total', formatMoney(order.grandTotal ?? order.total_amount)],
                    ['Paid', formatMoney(order.paid_amount)],
                    ['Outstanding', formatMoney(order.balance_amount)],
                  ].map(([label, value]) => (
                    <TableRow key={label}>
                      <TableCell sx={{ border: 0, color: 'text.secondary', py: 0.4 }}>{label}</TableCell>
                      <TableCell align="right" sx={{ border: 0, py: 0.4, fontWeight: 600 }}>
                        {value}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {order.payments?.length > 0 && (
                <>
                  <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                    Payments
                  </Typography>
                  <List dense disablePadding>
                    {order.payments.map((payment) => (
                      <ListItem key={payment.id} disableGutters>
                        <ListItemText
                          primary={`${formatMoney(payment.amount)} · ${PAYMENT_METHOD_LABELS[payment.payment_method] || payment.payment_method || '—'}`}
                          secondary={`${formatDate(payment.payment_date)}${payment.reference_no ? ` · Ref ${payment.reference_no}` : ''}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                </>
              )}

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Activity
              </Typography>
              <List dense disablePadding>
                {(order.comments ?? []).map((entry) => (
                  <ListItem key={entry.id} disableGutters>
                    <ListItemText
                      primary={entry.comment}
                      secondary={`${entry.author ?? 'System'} · ${formatDateTime(entry.created_at)}`}
                    />
                  </ListItem>
                ))}
                {(order.comments ?? []).length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    No notes yet.
                  </Typography>
                )}
              </List>

              <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Add a note…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <Button onClick={postComment} disabled={busy || !comment.trim()}>
                  Add
                </Button>
              </Stack>
            </>
          )}
        </DataState>
      </DialogContent>

      <DialogActions sx={{ gap: 1, flexWrap: 'wrap' }}>
        {order && (
          <>
            <TextField
              select
              size="small"
              label="Change status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              sx={{ minWidth: 180 }}
            >
              {STATUS_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
            <Button onClick={applyStatus} disabled={busy || !status}>
              Apply
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              startIcon={<EditRoundedIcon />}
              onClick={() => {
                onClose();
                navigate(`/orders/${order.id}/edit`);
              }}
            >
              Edit
            </Button>
            <Button variant="contained" startIcon={<DownloadRoundedIcon />} onClick={download}>
              Download Bill
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
