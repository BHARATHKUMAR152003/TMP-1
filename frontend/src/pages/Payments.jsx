import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Card, CardContent, Tabs, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Button, Stack, TextField, MenuItem, InputAdornment, Typography, IconButton,
  Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert, Box, Grid, Chip,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import AddCircleRoundedIcon from '@mui/icons-material/AddCircleRounded';
import PageHeader from '../components/common/PageHeader.jsx';
import DataState from '../components/common/DataState.jsx';
import OrderDetailDialog from '../components/common/OrderDetailDialog.jsx';
import DateRangeFilter from '../components/common/DateRangeFilter.jsx';
import { listPayments, listUnpaid, recordPayment } from '../services/payment.service.js';
import { downloadBill } from '../services/finance.service.js';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '../config/constants.js';
import { EMPTY_DATE_RANGE } from '../utils/dateRange.js';
import { formatCurrency, formatDate, formatMoney, formatNumber } from '../utils/format.js';

const METHOD_FILTERS = [{ value: '', label: 'All methods' }, ...PAYMENT_METHODS];

const todayIso = () => new Date().toISOString().slice(0, 10);

const EMPTY_PAYMENT = {
  orderId: '',
  amount: '',
  paymentMethod: 'cash',
  paymentDate: todayIso(),
  referenceNo: '',
  notes: '',
};

/**
 * Payments has two tabs:
 *   RECEIVED — every payment transaction, with the total collected.
 *   UNPAID   — invoices still carrying a balance (total − paid).
 * Both offer the tax-invoice download.
 */
export default function Payments() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') === 'unpaid' ? 1 : 0);

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [method, setMethod] = useState('');
  const [range, setRange] = useState(EMPTY_DATE_RANGE);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [detailId, setDetailId] = useState(null);
  const [toast, setToast] = useState(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_PAYMENT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setParams(tab === 1 ? { tab: 'unpaid' } : {}, { replace: true });
    setPage(0);
  }, [tab, setParams]);

  const query = useMemo(
    () => ({
      search: debounced || undefined,
      method: tab === 0 && method ? method : undefined,
      from: range.from || undefined,
      to: range.to || undefined,
      page: page + 1,
      limit,
    }),
    [debounced, method, range.from, range.to, page, limit, tab],
  );

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const request = tab === 0 ? listPayments(query) : listUnpaid(query);
    request
      .then(({ data, meta }) => {
        setRows(data);
        setSummary(meta?.summary ?? {});
        setTotal(meta?.total ?? data.length);
      })
      .catch((err) => setError(err.displayMessage || 'Failed to load payments'))
      .finally(() => setLoading(false));
  }, [tab, query]);

  useEffect(load, [load]);

  const applyRange = (next) => {
    setRange(next);
    setPage(0);
  };

  const clearFilters = () => {
    setSearch('');
    setMethod('');
    setRange(EMPTY_DATE_RANGE);
    setPage(0);
  };

  const download = async (orderId, ref) => {
    try {
      await downloadBill(orderId, ref);
    } catch (err) {
      setToast({ severity: 'error', message: err.displayMessage || 'Failed to download the bill' });
    }
  };

  const openRecord = (invoice) => {
    setForm({
      ...EMPTY_PAYMENT,
      orderId: invoice?.order_number ?? '',
      amount: invoice?.balance_amount ?? '',
    });
    setFormError('');
    setDialogOpen(true);
  };

  const submitPayment = async () => {
    setFormError('');
    setSaving(true);
    try {
      await recordPayment(form);
      setDialogOpen(false);
      setToast({ severity: 'success', message: 'Payment recorded' });
      load();
    } catch (err) {
      setFormError(err.displayMessage || 'Failed to record the payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Money received and what is still outstanding"
        action={
          <Button variant="contained" startIcon={<AddCircleRoundedIcon />} onClick={() => openRecord(null)}>
            Record Payment
          </Button>
        }
      />

      <Card sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Received" />
          <Tab label="Unpaid" />
        </Tabs>

        <CardContent>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            {tab === 0 ? (
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Box>
                  <Typography variant="h4" color="success.main">
                    {formatCurrency(summary.total_collected)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Collected
                  </Typography>
                </Box>
              </Grid>
            ) : (
              <>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Typography variant="h4" color="warning.main">
                    {formatCurrency(summary.total_outstanding)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Outstanding
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Typography variant="h4">{formatNumber(summary.count)}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Unpaid Invoices
                  </Typography>
                </Grid>
              </>
            )}
          </Grid>

          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
              <TextField
                sx={{ flex: 2, minWidth: 200 }}
                placeholder="Invoice no., customer or reference…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
              {tab === 0 && (
                <TextField select sx={{ flex: 1, minWidth: 150 }} label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {METHOD_FILTERS.map((o) => (
                    <MenuItem key={o.value} value={o.value}>
                      {o.label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <Button onClick={clearFilters}>Clear</Button>
            </Stack>

            <DateRangeFilter value={range} onChange={applyRange} />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <DataState
          loading={loading}
          error={error}
          empty={rows.length === 0}
          emptyLabel={tab === 0 ? 'No payments match these filters' : 'Nothing outstanding — everything is paid'}
          onRetry={load}
        >
          <TableContainer>
            <Table>
              <TableHead>
                {tab === 0 ? (
                  <TableRow>
                    <TableCell>Order / Invoice</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell>Method</TableCell>
                    <TableCell>Recorded By</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="center">Bill</TableCell>
                    <TableCell align="center">View</TableCell>
                  </TableRow>
                ) : (
                  <TableRow>
                    <TableCell>Order / Invoice</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell align="right">Total Amount</TableCell>
                    <TableCell align="right">Paid Amount</TableCell>
                    <TableCell align="right">Outstanding</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="center">Bill</TableCell>
                    <TableCell align="center">View</TableCell>
                  </TableRow>
                )}
              </TableHead>
              <TableBody>
                {tab === 0
                  ? rows.map((row) => (
                      <TableRow key={row.id} hover>
                        <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{row.order_number ?? '—'}</TableCell>
                        <TableCell>{row.customer_company || row.customer_name || '—'}</TableCell>
                        <TableCell align="right" sx={{ color: 'success.main', fontWeight: 600 }}>
                          {formatMoney(row.amount)}
                        </TableCell>
                        <TableCell>
                          <Chip size="small" variant="outlined" label={PAYMENT_METHOD_LABELS[row.payment_method] || row.payment_method || '—'} />
                        </TableCell>
                        <TableCell>{row.recorded_by || '—'}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(row.payment_date)}</TableCell>
                        <TableCell align="center">
                          <Button size="small" startIcon={<DownloadRoundedIcon />} onClick={() => download(row.order_id, row.order_number)}>
                            Download
                          </Button>
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title="View order">
                            <IconButton size="small" onClick={() => setDetailId(row.order_id)}>
                              <VisibilityRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                  : rows.map((row) => (
                      <TableRow key={row.id} hover>
                        <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{row.order_number ?? '—'}</TableCell>
                        <TableCell>{row.company_name || row.customer_name || '—'}</TableCell>
                        <TableCell align="right">{formatMoney(row.total_amount)}</TableCell>
                        <TableCell align="right">{formatMoney(row.paid_amount)}</TableCell>
                        <TableCell align="right" sx={{ color: 'warning.main', fontWeight: 700 }}>
                          {formatMoney(row.balance_amount)}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(row.order_date)}</TableCell>
                        <TableCell align="center">
                          <Button size="small" startIcon={<DownloadRoundedIcon />} onClick={() => download(row.id, row.order_number)}>
                            Download
                          </Button>
                        </TableCell>
                        <TableCell align="center">
                          <Stack direction="row" justifyContent="center">
                            <Tooltip title="View order">
                              <IconButton size="small" onClick={() => setDetailId(row.id)}>
                                <VisibilityRoundedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Record payment">
                              <IconButton size="small" color="primary" onClick={() => openRecord(row)}>
                                <AddCircleRoundedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </TableContainer>
          {tab === 0 && (
            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_e, next) => setPage(next)}
              rowsPerPage={limit}
              rowsPerPageOptions={[10, 25, 50, 100]}
              onRowsPerPageChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(0);
              }}
            />
          )}
        </DataState>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Record payment</DialogTitle>
        <DialogContent>
          {formError && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {formError}
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Order / invoice number"
              required
              value={form.orderId}
              onChange={(e) => setForm({ ...form, orderId: e.target.value })}
              placeholder="TMP/0001/26-27"
            />
            <TextField
              label="Amount"
              type="number"
              required
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
              helperText="Part payments are kept as separate transactions."
            />
            <TextField
              select
              label="Method"
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
            >
              {PAYMENT_METHODS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Payment date"
              type="date"
              value={form.paymentDate}
              onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Reference / UTR / cheque no."
              value={form.referenceNo}
              onChange={(e) => setForm({ ...form, referenceNo: e.target.value })}
            />
            <TextField label="Notes" multiline rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={submitPayment} disabled={saving || !form.orderId || !(Number(form.amount) > 0)}>
            {saving ? 'Saving…' : 'Record'}
          </Button>
        </DialogActions>
      </Dialog>

      <OrderDetailDialog orderId={detailId} open={Boolean(detailId)} onClose={() => setDetailId(null)} onChanged={load} />

      <Snackbar open={Boolean(toast)} autoHideDuration={4000} onClose={() => setToast(null)}>
        <Alert severity={toast?.severity ?? 'info'} onClose={() => setToast(null)}>
          {toast?.message}
        </Alert>
      </Snackbar>
    </>
  );
}
