import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Card, CardContent, Grid, Typography, Button, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions,
  Tabs, Tab, Box, Chip, IconButton, Tooltip, Snackbar, Alert,
} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import AddCircleRoundedIcon from '@mui/icons-material/AddCircleRounded';
import PageHeader from '../components/common/PageHeader.jsx';
import DataState from '../components/common/DataState.jsx';
import StatCard from '../components/common/StatCard.jsx';
import StatusChip from '../components/common/StatusChip.jsx';
import { CustomerFields } from './Customers.jsx';
import { getCustomer, updateCustomer } from '../services/customer.service.js';
import { downloadBill } from '../services/finance.service.js';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_META } from '../config/constants.js';
import { formatCurrency, formatDate, formatMoney, formatNumber } from '../utils/format.js';

/**
 * Full customer record: the four headline totals plus the complete order and
 * payment history. Imported historical orders appear here alongside current
 * ones because they live in the same tables.
 */
export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);
  const [toast, setToast] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getCustomer(id)
      .then(setCustomer)
      .catch((err) => setError(err.displayMessage || 'Failed to load the customer'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  const openEdit = () => {
    setForm({
      name: customer.name ?? '',
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      address: customer.address ?? '',
      companyName: customer.company_name ?? '',
      gstNumber: customer.gst_number ?? '',
      state: customer.state ?? '',
      stateCode: customer.state_code ?? '',
    });
    setEditOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      setCustomer(await updateCustomer(id, form));
      setEditOpen(false);
      setToast('Customer updated');
    } catch (err) {
      setToast(err.displayMessage || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const download = async (order) => {
    try {
      await downloadBill(order.id, order.order_number);
    } catch (err) {
      setToast(err.displayMessage || 'Failed to download the bill');
    }
  };

  return (
    <>
      <Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate('/customers')} sx={{ mb: 1 }}>
        Back to customers
      </Button>

      <DataState loading={loading} error={error} onRetry={load}>
        {customer && (
          <>
            <PageHeader
              title={customer.company_name || customer.name}
              subtitle={[customer.company_name ? customer.name : null, customer.phone, customer.email]
                .filter(Boolean)
                .join(' · ')}
              action={
                <Stack direction="row" spacing={1}>
                  <Button startIcon={<EditRoundedIcon />} onClick={openEdit}>
                    Edit
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<AddCircleRoundedIcon />}
                    onClick={() => navigate(`/orders/new?customerId=${customer.id}`)}
                  >
                    New Order
                  </Button>
                </Stack>
              }
            />

            <Grid container spacing={2.5}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard label="Total Orders" value={formatNumber(customer.order_count)} color="primary" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard label="Total Order Value" value={formatCurrency(customer.total_spent)} color="secondary" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard label="Total Paid" value={formatCurrency(customer.total_paid)} color="success" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard label="Outstanding" value={formatCurrency(customer.outstanding)} color="warning" />
              </Grid>
            </Grid>

            <Card sx={{ mt: 3 }}>
              <CardContent sx={{ pb: 0 }}>
                <Grid container spacing={2}>
                  {[
                    ['Address', customer.address],
                    ['GST number', customer.gst_number],
                    ['State', customer.state ? `${customer.state} (${customer.state_code || '—'})` : null],
                  ].map(([label, value]) => (
                    <Grid size={{ xs: 12, sm: 4 }} key={label}>
                      <Typography variant="caption" color="text.secondary">
                        {label}
                      </Typography>
                      <Typography variant="body2">{value || '—'}</Typography>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>

              <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ px: 2, mt: 1, borderBottom: 1, borderColor: 'divider' }}>
                <Tab label={`Order history (${customer.orders?.length ?? 0})`} />
                <Tab label={`Payments (${customer.payments?.length ?? 0})`} />
              </Tabs>

              {tab === 0 && (
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Invoice No.</TableCell>
                        <TableCell>Date</TableCell>
                        <TableCell>Product</TableCell>
                        <TableCell align="right">Amount</TableCell>
                        <TableCell align="right">Paid</TableCell>
                        <TableCell align="right">Outstanding</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell align="center">Bill</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(customer.orders ?? []).map((order) => (
                        <TableRow key={order.id} hover>
                          <TableCell sx={{ fontFamily: 'monospace' }}>
                            {order.order_number ?? '—'}
                            {order.is_historical && (
                              <Chip size="small" label="Historical" variant="outlined" sx={{ ml: 1 }} />
                            )}
                          </TableCell>
                          <TableCell>{formatDate(order.order_date)}</TableCell>
                          <TableCell>{order.product_name}</TableCell>
                          <TableCell align="right">{formatMoney(order.total_amount)}</TableCell>
                          <TableCell align="right">{formatMoney(order.paid_amount)}</TableCell>
                          <TableCell align="right">
                            {Number(order.balance_amount) > 0 ? (
                              <Typography variant="body2" color="warning.main" sx={{ fontWeight: 600 }}>
                                {formatMoney(order.balance_amount)}
                              </Typography>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5}>
                              <StatusChip status={order.status} />
                              <Chip
                                size="small"
                                color={PAYMENT_STATUS_META[order.payment_status]?.color ?? 'default'}
                                label={PAYMENT_STATUS_META[order.payment_status]?.label ?? order.payment_status}
                              />
                            </Stack>
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip title="Download tax invoice">
                              <IconButton size="small" onClick={() => download(order)}>
                                <DownloadRoundedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                      {(customer.orders ?? []).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                            No orders yet
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              {tab === 1 && (
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Invoice</TableCell>
                        <TableCell>Method</TableCell>
                        <TableCell>Reference</TableCell>
                        <TableCell align="right">Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(customer.payments ?? []).map((payment) => (
                        <TableRow key={payment.id} hover>
                          <TableCell>{formatDate(payment.payment_date)}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace' }}>{payment.order_number ?? '—'}</TableCell>
                          <TableCell>
                            {PAYMENT_METHOD_LABELS[payment.payment_method] || payment.payment_method || '—'}
                          </TableCell>
                          <TableCell>{payment.reference_no || '—'}</TableCell>
                          <TableCell align="right" sx={{ color: 'success.main', fontWeight: 600 }}>
                            {formatMoney(payment.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(customer.payments ?? []).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                            No payments recorded
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
              <Box sx={{ height: 8 }} />
            </Card>
          </>
        )}
      </DataState>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit customer</DialogTitle>
        <DialogContent>{form && <CustomerFields value={form} onChange={setForm} />}</DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving || !form?.name?.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={4000} onClose={() => setToast('')}>
        <Alert severity="info" onClose={() => setToast('')}>
          {toast}
        </Alert>
      </Snackbar>
    </>
  );
}
