import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  Button, Stack, TextField, MenuItem, InputAdornment, Typography, Chip, IconButton, Tooltip,
  Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import AddCircleRoundedIcon from '@mui/icons-material/AddCircleRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import PageHeader from '../components/common/PageHeader.jsx';
import DataState from '../components/common/DataState.jsx';
import StatusChip from '../components/common/StatusChip.jsx';
import OrderDetailDialog from '../components/common/OrderDetailDialog.jsx';
import DateRangeFilter from '../components/common/DateRangeFilter.jsx';
import { listOrders, deleteOrder } from '../services/order.service.js';
import { downloadBill } from '../services/finance.service.js';
import { useAuth } from '../context/AuthContext.jsx';
import { PAYMENT_STATUS_META } from '../config/constants.js';
import { EMPTY_DATE_RANGE } from '../utils/dateRange.js';
import { formatDate, formatMoney } from '../utils/format.js';

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'billed', label: 'Invoiced' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PAYMENT_FILTERS = [
  { value: '', label: 'All payments' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
];

export default function Orders() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [search, setSearch] = useState(params.get('search') ?? '');
  const [debounced, setDebounced] = useState(params.get('search') ?? '');
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState(params.get('paymentStatus') ?? '');
  const [range, setRange] = useState(EMPTY_DATE_RANGE);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [toast, setToast] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Keep the URL in step so the header search box and dashboard links work.
  useEffect(() => {
    const next = new URLSearchParams();
    if (debounced) next.set('search', debounced);
    if (paymentStatus) next.set('paymentStatus', paymentStatus);
    setParams(next, { replace: true });
  }, [debounced, paymentStatus, setParams]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    listOrders({
      search: debounced || undefined,
      status: status || undefined,
      paymentStatus: paymentStatus || undefined,
      from: range.from || undefined,
      to: range.to || undefined,
      page: page + 1,
      limit,
    })
      .then(({ data, meta }) => {
        setRows(data);
        setTotal(meta?.total ?? data.length);
      })
      .catch((err) => setError(err.displayMessage || 'Failed to load orders'))
      .finally(() => setLoading(false));
  }, [debounced, status, paymentStatus, range.from, range.to, page, limit]);

  useEffect(load, [load]);

  const download = async (order) => {
    try {
      await downloadBill(order.id, order.order_number);
    } catch (err) {
      setToast(err.displayMessage || 'Failed to download the bill');
    }
  };

  const removeOrder = async () => {
    setDeleting(true);
    try {
      await deleteOrder(confirmDelete.id);
      setConfirmDelete(null);
      load();
    } catch (err) {
      setToast(err.displayMessage || 'Failed to delete the order');
    } finally {
      setDeleting(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setPaymentStatus('');
    setRange(EMPTY_DATE_RANGE);
    setPage(0);
  };

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="Every tax invoice raised, current and historical"
        action={
          <Button variant="contained" startIcon={<AddCircleRoundedIcon />} onClick={() => navigate('/orders/new')}>
            New Order
          </Button>
        }
      />

      <Card sx={{ p: 2, mb: 2 }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
            <TextField
              sx={{ flex: 2, minWidth: 220 }}
              placeholder="Invoice no., product or customer…"
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
            <TextField select sx={{ flex: 1, minWidth: 150 }} label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_FILTERS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              sx={{ flex: 1, minWidth: 150 }}
              label="Payment"
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
            >
              {PAYMENT_FILTERS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
            <Button onClick={clearFilters}>Clear</Button>
          </Stack>

          <DateRangeFilter
            value={range}
            onChange={(next) => {
              setRange(next);
              setPage(0);
            }}
          />
        </Stack>
      </Card>

      <Card>
        <DataState loading={loading} error={error} empty={rows.length === 0} emptyLabel="No orders match these filters" onRetry={load}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Invoice No.</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Product</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell align="right">Outstanding</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{row.order_number ?? '—'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(row.order_date)}</TableCell>
                    <TableCell>
                      <Typography variant="body2">{row.customer_company || row.customer_name || '—'}</Typography>
                      {row.customer_phone && (
                        <Typography variant="caption" color="text.secondary">
                          {row.customer_phone}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{row.product_name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {`Qty ${row.quantity} ${row.unit ?? ''}`.trim()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{formatMoney(row.total_amount)}</TableCell>
                    <TableCell align="right">
                      {Number(row.balance_amount) > 0 ? (
                        <Typography variant="body2" color="warning.main" sx={{ fontWeight: 600 }}>
                          {formatMoney(row.balance_amount)}
                        </Typography>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5}>
                        <StatusChip status={row.status} />
                        <Chip
                          size="small"
                          color={PAYMENT_STATUS_META[row.payment_status]?.color ?? 'default'}
                          label={PAYMENT_STATUS_META[row.payment_status]?.label ?? row.payment_status}
                        />
                      </Stack>
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" justifyContent="center">
                        <Tooltip title="View">
                          <IconButton size="small" onClick={() => setDetailId(row.id)}>
                            <VisibilityRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => navigate(`/orders/${row.id}/edit`)}>
                            <EditRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Download tax invoice">
                          <IconButton size="small" onClick={() => download(row)}>
                            <DownloadRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {isAdmin && (
                          <Tooltip title="Delete order">
                            <IconButton size="small" color="error" onClick={() => setConfirmDelete(row)}>
                              <DeleteRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
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
        </DataState>
      </Card>

      <OrderDetailDialog orderId={detailId} open={Boolean(detailId)} onClose={() => setDetailId(null)} onChanged={load} />

      <Dialog open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete this order?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmDelete?.order_number ?? 'This order'} and its tax invoice, design files and recorded payments will be
            removed permanently. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={removeOrder} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={4000} onClose={() => setToast('')}>
        <Alert severity="error" onClose={() => setToast('')}>
          {toast}
        </Alert>
      </Snackbar>
    </>
  );
}
