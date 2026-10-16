import { useCallback, useEffect, useState } from 'react';
import {
  Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Button, Stack, TextField, MenuItem, InputAdornment, Typography, Grid,
  IconButton, Tooltip, Snackbar, Alert, Chip,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import PageHeader from '../components/common/PageHeader.jsx';
import DataState from '../components/common/DataState.jsx';
import OrderDetailDialog from '../components/common/OrderDetailDialog.jsx';
import { listBills, listFinancialYears, downloadBill } from '../services/finance.service.js';
import { PAYMENT_STATUS_META } from '../config/constants.js';
import { formatCurrency, formatDate, formatMoney } from '../utils/format.js';

const STATUS_FILTERS = [
  { value: '', label: 'All invoices' },
  { value: 'unpaid', label: 'With balance' },
  { value: 'paid', label: 'Fully paid' },
];

/** Every tax invoice ever raised, filterable by financial year. */
export default function Bills() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [financialYear, setFinancialYear] = useState('');
  const [years, setYears] = useState([]);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    listFinancialYears()
      .then((data) => setYears(data?.options ?? []))
      .catch(() => setYears([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    listBills({
      search: debounced || undefined,
      status: status || undefined,
      financialYear: financialYear || undefined,
      page: page + 1,
      limit,
    })
      .then(({ data, meta }) => {
        setRows(data);
        setSummary(meta?.summary ?? {});
        setTotal(meta?.total ?? data.length);
      })
      .catch((err) => setError(err.displayMessage || 'Failed to load bills'))
      .finally(() => setLoading(false));
  }, [debounced, status, financialYear, page, limit]);

  useEffect(load, [load]);

  const download = async (row) => {
    try {
      await downloadBill(row.id, row.order_number);
    } catch (err) {
      setToast(err.displayMessage || 'Failed to download the bill');
    }
  };

  return (
    <>
      <PageHeader title="Bills / Invoices" subtitle="Download the tax invoice for any order, from any financial year" />

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            {[
              ['Invoiced value', formatCurrency(summary.total_value), 'text.primary'],
              ['Received', formatCurrency(summary.total_paid), 'success.main'],
              ['Outstanding', formatCurrency(summary.total_outstanding), 'warning.main'],
            ].map(([label, value, color]) => (
              <Grid size={{ xs: 12, sm: 4, md: 3 }} key={label}>
                <Typography variant="h5" sx={{ color }}>
                  {value}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {label}
                </Typography>
              </Grid>
            ))}
          </Grid>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
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
            <TextField
              select
              sx={{ flex: 1, minWidth: 170 }}
              label="Financial year"
              value={financialYear}
              onChange={(e) => {
                setFinancialYear(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">All years</MenuItem>
              {years.map((y) => (
                <MenuItem key={y} value={y}>
                  {y}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              sx={{ flex: 1, minWidth: 150 }}
              label="Status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(0);
              }}
            >
              {STATUS_FILTERS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <DataState loading={loading} error={error} empty={rows.length === 0} emptyLabel="No invoices found" onRetry={load}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Invoice No.</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>FY</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell align="right">Outstanding</TableCell>
                  <TableCell>Payment</TableCell>
                  <TableCell align="center">Bill</TableCell>
                  <TableCell align="center">View</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{row.order_number ?? '—'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(row.order_date)}</TableCell>
                    <TableCell>{row.financial_year ?? '—'}</TableCell>
                    <TableCell>{row.company_name || row.customer_name || '—'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {formatMoney(row.total_amount)}
                    </TableCell>
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
                      <Chip
                        size="small"
                        color={PAYMENT_STATUS_META[row.payment_status]?.color ?? 'default'}
                        label={PAYMENT_STATUS_META[row.payment_status]?.label ?? row.payment_status}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Button size="small" startIcon={<DownloadRoundedIcon />} onClick={() => download(row)}>
                        Download
                      </Button>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="View order">
                        <IconButton size="small" onClick={() => setDetailId(row.id)}>
                          <VisibilityRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
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

      <Snackbar open={Boolean(toast)} autoHideDuration={4000} onClose={() => setToast('')}>
        <Alert severity="error" onClose={() => setToast('')}>
          {toast}
        </Alert>
      </Snackbar>
    </>
  );
}
