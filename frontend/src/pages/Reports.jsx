import { useCallback, useEffect, useState } from 'react';
import {
  Card, CardContent, Grid, Typography, Stack, TextField, MenuItem, Button, Tabs, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Box, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, RadioGroup, FormControlLabel, Radio,
  Alert,
} from '@mui/material';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import PageHeader from '../components/common/PageHeader.jsx';
import DataState from '../components/common/DataState.jsx';
import StatCard from '../components/common/StatCard.jsx';
import DateRangeFilter from '../components/common/DateRangeFilter.jsx';
import { getReport, exportReport, listFinancialYears } from '../services/finance.service.js';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_META } from '../config/constants.js';
import { EMPTY_DATE_RANGE } from '../utils/dateRange.js';
import { formatCurrency, formatDate, formatMoney, formatNumber } from '../utils/format.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Download formats offered before the report is generated.
const EXPORT_FORMATS = [
  { value: 'pdf', label: 'PDF', hint: 'Printable A4 landscape table' },
  { value: 'excel', label: 'Excel', hint: 'Spreadsheet with every column, ready to total' },
  { value: 'csv', label: 'CSV', hint: 'Plain text, opens anywhere' },
];

const EXPORT_EXTENSIONS = { pdf: 'pdf', excel: 'xls', csv: 'csv' };

/** The backend reports "all time" as a window starting before any invoice. */
function rangeLabel(range) {
  if (!range) return 'Business reporting';
  if (range.from <= '1900-01-01') return 'All time';
  return `${formatDate(range.from)} – ${formatDate(range.to)}`;
}

function monthLabel(value) {
  const [year, month] = String(value ?? '').split('-');
  const index = Number(month) - 1;
  return MONTHS[index] ? `${MONTHS[index]} ${String(year).slice(-2)}` : value;
}

function SimpleTable({ columns, rows, empty }) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            {columns.map((c) => (
              <TableCell key={c.label} align={c.align ?? 'left'}>
                {c.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={row.id ?? row.customer_id ?? index} hover>
              {columns.map((c) => (
                <TableCell key={c.label} align={c.align ?? 'left'}>
                  {c.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                {empty}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/**
 * Reports: sales, payments, outstanding, customers, orders, inventory and low
 * stock, all driven by one date / financial-year filter.
 */
export default function Reports() {
  const [range, setRange] = useState(EMPTY_DATE_RANGE);
  const [financialYear, setFinancialYear] = useState('');
  const [years, setYears] = useState([]);
  const [tab, setTab] = useState(0);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('pdf');
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    listFinancialYears()
      .then((res) => setYears(res?.options ?? []))
      .catch(() => setYears([]));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getReport({
      from: financialYear ? undefined : range.from || undefined,
      to: financialYear ? undefined : range.to || undefined,
      financialYear: financialYear || undefined,
    })
      .then(setData)
      .catch((err) => setError(err.displayMessage || 'Failed to load the report'))
      .finally(() => setLoading(false));
  }, [range.from, range.to, financialYear]);

  useEffect(load, [load]);

  // Picking a period clears the financial year, otherwise the year would keep
  // overriding it and the quick buttons would appear to do nothing.
  const changeRange = (next) => {
    setFinancialYear('');
    setRange(next);
  };

  const download = async () => {
    setExporting(true);
    setExportError('');
    try {
      const blob = await exportReport({
        from: financialYear ? undefined : range.from || undefined,
        to: financialYear ? undefined : range.to || undefined,
        financialYear: financialYear || undefined,
        format: exportFormat,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orders-report-${financialYear || range.from || 'all'}.${EXPORT_EXTENSIONS[exportFormat]}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setExportOpen(false);
    } catch (err) {
      setExportError(err.displayMessage || 'Failed to generate the report');
    } finally {
      setExporting(false);
    }
  };

  const totals = data?.totals ?? {};
  const chartData = (data?.monthly ?? []).map((row) => ({
    month: monthLabel(row.month),
    Sales: Number(row.sales ?? 0),
    Collected: Number(row.collected ?? 0),
  }));

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={rangeLabel(data?.range)}
        action={
          <Button startIcon={<DownloadRoundedIcon />} onClick={() => setExportOpen(true)}>
            Download report
          </Button>
        }
      />

      <Card sx={{ p: 2, mb: 2 }}>
        <Stack spacing={2}>
          <TextField
            select
            sx={{ minWidth: 180, maxWidth: 260 }}
            label="Financial year"
            value={financialYear}
            onChange={(e) => setFinancialYear(e.target.value)}
            helperText="Overrides the period below"
          >
            <MenuItem value="">Use the period below</MenuItem>
            {years.map((y) => (
              <MenuItem key={y} value={y}>
                {y}
              </MenuItem>
            ))}
          </TextField>

          <Box sx={{ opacity: financialYear ? 0.4 : 1 }}>
            <DateRangeFilter value={range} onChange={changeRange} />
          </Box>
        </Stack>
      </Card>

      <DataState loading={loading} error={error} onRetry={load}>
        <Grid container spacing={2.5}>
          <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
            <StatCard label="Orders" value={formatNumber(totals.orders)} color="primary" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
            <StatCard label="Sales" value={formatCurrency(totals.sales)} color="secondary" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
            <StatCard label="Collected" value={formatCurrency(totals.collected)} color="success" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
            <StatCard label="Outstanding" value={formatCurrency(totals.outstanding)} color="warning" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
            <StatCard label="Customers billed" value={formatNumber(totals.customers)} color="info" />
          </Grid>
        </Grid>

        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Sales report
            </Typography>
            <Box sx={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e0d8" />
                  <XAxis dataKey="month" stroke="#5e6778" fontSize={12} />
                  <YAxis stroke="#5e6778" fontSize={12} tickFormatter={(v) => formatCurrency(v)} width={90} />
                  <ReTooltip
                    formatter={(v) => formatMoney(v)}
                    contentStyle={{ background: '#ffffff', border: '1px solid #e4e0d8', borderRadius: 8, boxShadow: '0 6px 16px rgba(17,26,46,0.08)' }}
                  />
                  <Legend />
                  <Bar dataKey="Sales" fill="#00a3e0" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Collected" fill="#e6007e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ mt: 3 }}>
          <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tab label="Customers" />
            <Tab label="Outstanding" />
            <Tab label="Payments" />
            <Tab label="Orders by category" />
            <Tab label="Inventory" />
            <Tab label="Low stock" />
          </Tabs>

          {tab === 0 && (
            <SimpleTable
              empty="No customers billed in this period"
              rows={data?.topCustomers ?? []}
              columns={[
                { label: 'Customer', render: (r) => r.company_name || r.customer_name || '—' },
                { label: 'Orders', align: 'right', render: (r) => formatNumber(r.orders) },
                { label: 'Sales', align: 'right', render: (r) => formatMoney(r.sales) },
                { label: 'Paid', align: 'right', render: (r) => formatMoney(r.paid) },
                { label: 'Outstanding', align: 'right', render: (r) => formatMoney(r.outstanding) },
              ]}
            />
          )}

          {tab === 1 && (
            <SimpleTable
              empty="Nothing outstanding"
              rows={data?.outstandingByCustomer ?? []}
              columns={[
                { label: 'Customer', render: (r) => r.company_name || r.customer_name || '—' },
                { label: 'Phone', render: (r) => r.phone || '—' },
                { label: 'Invoices', align: 'right', render: (r) => formatNumber(r.invoices) },
                { label: 'Outstanding', align: 'right', render: (r) => formatMoney(r.outstanding) },
              ]}
            />
          )}

          {tab === 2 && (
            <SimpleTable
              empty="No payments in this period"
              rows={data?.paymentsByMethod ?? []}
              columns={[
                { label: 'Method', render: (r) => PAYMENT_METHOD_LABELS[r.payment_method] || r.payment_method || '—' },
                { label: 'Transactions', align: 'right', render: (r) => formatNumber(r.count) },
                { label: 'Amount', align: 'right', render: (r) => formatMoney(r.amount) },
              ]}
            />
          )}

          {tab === 3 && (
            <>
              <Box sx={{ px: 2, pt: 2 }}>
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  {(data?.byPaymentStatus ?? []).map((row) => (
                    <Chip
                      key={row.payment_status}
                      color={PAYMENT_STATUS_META[row.payment_status]?.color ?? 'default'}
                      label={`${PAYMENT_STATUS_META[row.payment_status]?.label ?? row.payment_status}: ${formatNumber(row.count)} · ${formatCurrency(row.value)}`}
                    />
                  ))}
                </Stack>
              </Box>
              <SimpleTable
                empty="No orders in this period"
                rows={data?.byCategory ?? []}
                columns={[
                  { label: 'Category', render: (r) => r.category },
                  { label: 'Orders', align: 'right', render: (r) => formatNumber(r.orders) },
                  { label: 'Sales', align: 'right', render: (r) => formatMoney(r.sales) },
                ]}
              />
            </>
          )}

          {tab === 4 && (
            <Grid container spacing={2.5} sx={{ p: 2 }}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <StatCard label="Stock items" value={formatNumber(data?.inventory?.totals?.items)} color="info" />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <StatCard label="Stock value" value={formatCurrency(data?.inventory?.totals?.stock_value)} color="secondary" />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <StatCard label="Low stock items" value={formatNumber(data?.inventory?.totals?.low_stock)} color="error" />
              </Grid>
            </Grid>
          )}

          {tab === 5 && (
            <SimpleTable
              empty="Every item is above its minimum level"
              rows={data?.inventory?.lowStock ?? []}
              columns={[
                { label: 'Item', render: (r) => r.item_name },
                { label: 'Group', render: (r) => [r.group_name, r.category_name, r.type_name].filter(Boolean).join(' › ') || '—' },
                { label: 'Quantity', align: 'right', render: (r) => `${formatNumber(r.quantity)} ${r.unit ?? ''}` },
                { label: 'Minimum', align: 'right', render: (r) => `${formatNumber(r.min_quantity)} ${r.unit ?? ''}` },
                { label: 'Supplier', render: (r) => r.supplier || '—' },
                { label: 'Status', render: () => <Chip size="small" color="warning" label="Low Stock" /> },
              ]}
            />
          )}
        </Card>
      </DataState>

      <Dialog open={exportOpen} onClose={() => setExportOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Download report</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {rangeLabel(data?.range)}
          </Typography>
          {exportError && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {exportError}
            </Alert>
          )}
          <RadioGroup value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}>
            {EXPORT_FORMATS.map((f) => (
              <FormControlLabel
                key={f.value}
                value={f.value}
                control={<Radio />}
                label={
                  <Box>
                    <Typography variant="body2">{f.label}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {f.hint}
                    </Typography>
                  </Box>
                }
              />
            ))}
          </RadioGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={download} disabled={exporting}>
            {exporting ? 'Generating…' : 'Download'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
