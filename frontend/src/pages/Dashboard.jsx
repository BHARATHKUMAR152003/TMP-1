import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, CardContent, Grid, Typography, Box, Stack, Chip, Button, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import PeopleRoundedIcon from '@mui/icons-material/PeopleRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import AddCircleRoundedIcon from '@mui/icons-material/AddCircleRounded';
import PageHeader from '../components/common/PageHeader.jsx';
import DataState from '../components/common/DataState.jsx';
import StatCard from '../components/common/StatCard.jsx';
import StatusChip from '../components/common/StatusChip.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getDashboard } from '../services/dashboard.service.js';
import { ROLES, PAYMENT_METHOD_LABELS } from '../config/constants.js';
import { formatCurrency, formatDate, formatMoney, formatNumber } from '../utils/format.js';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabel(value) {
  const [year, month] = String(value ?? '').split('-');
  const index = Number(month) - 1;
  return MONTH_LABELS[index] ? `${MONTH_LABELS[index]} ${String(year).slice(-2)}` : value;
}

/**
 * The single dashboard for both roles. Admins additionally see the inventory
 * tiles; every figure is a link into the filtered list behind it.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === ROLES.ADMIN;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState('today');
  const isToday = range === 'today';

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getDashboard(isAdmin ? 'admin' : 'accountant', range)
      .then(setData)
      .catch((err) => setError(err.displayMessage || 'Failed to load the dashboard'))
      .finally(() => setLoading(false));
  }, [isAdmin, range]);

  useEffect(load, [load]);

  const stats = data?.stats ?? {};
  const chartData = (data?.salesTrend ?? []).map((row) => ({
    month: monthLabel(row.month),
    Sales: Number(row.revenue ?? 0),
    Collected: Number(row.collected ?? 0),
  }));

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0] || 'there'}`}
        subtitle={
          isToday
            ? `Today · ${formatDate(data?.date ?? new Date())}`
            : data?.financialYear
              ? `Financial year ${data.financialYear.label} · ${formatDate(data.financialYear.from)} to ${formatDate(data.financialYear.to)}`
              : 'Business overview'
        }
        action={
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
            <ToggleButtonGroup
              size="small"
              exclusive
              value={range}
              onChange={(_e, next) => next && setRange(next)}
            >
              <ToggleButton value="today">Today</ToggleButton>
              <ToggleButton value="all">All time</ToggleButton>
            </ToggleButtonGroup>
            <Button variant="contained" startIcon={<AddCircleRoundedIcon />} onClick={() => navigate('/orders/new')}>
              New Order
            </Button>
          </Stack>
        }
      />

      <DataState loading={loading} error={error} onRetry={load}>
        <Grid container spacing={2.5}>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
            <StatCard
              label={isToday ? 'New Customers' : 'Total Customers'}
              value={formatNumber(stats.totalCustomers)}
              icon={PeopleRoundedIcon}
              color="info"
              onClick={() => navigate('/customers')}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
            <StatCard
              label={isToday ? "Today's Orders" : 'Total Orders'}
              value={formatNumber(stats.totalOrders)}
              hint={isToday ? undefined : `${formatNumber(stats.today?.totalOrders)} today`}
              icon={ReceiptLongRoundedIcon}
              color="primary"
              onClick={() => navigate('/orders')}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
            <StatCard
              label={isToday ? "Today's Sales" : 'Total Sales'}
              value={formatCurrency(stats.totalSales)}
              hint={isToday ? undefined : `${formatCurrency(stats.today?.totalSales)} today`}
              icon={TrendingUpRoundedIcon}
              color="secondary"
              onClick={() => navigate('/bills')}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
            <StatCard
              label={isToday ? "Today's Received" : 'Total Received'}
              value={formatCurrency(stats.totalReceived)}
              hint={isToday ? undefined : `${formatCurrency(stats.today?.totalReceived)} today`}
              icon={PaymentsRoundedIcon}
              color="success"
              onClick={() => navigate('/payments')}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
            <StatCard
              label={isToday ? "Today's Outstanding" : 'Total Outstanding'}
              value={formatCurrency(stats.totalOutstanding)}
              hint={`${formatNumber(stats.unpaidCount)} unpaid invoices`}
              icon={AccountBalanceWalletRoundedIcon}
              color="warning"
              onClick={() => navigate('/payments?tab=unpaid')}
            />
          </Grid>

          {isAdmin && (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
              <StatCard
                label="Inventory Items"
                value={formatNumber(stats.inventoryItems)}
                icon={Inventory2RoundedIcon}
                color="info"
                onClick={() => navigate('/inventory')}
              />
            </Grid>
          )}
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
            <StatCard
              label="Low Stock Items"
              value={formatNumber(stats.lowStock)}
              icon={WarningAmberRoundedIcon}
              color="error"
              onClick={() => navigate('/inventory')}
            />
          </Grid>
        </Grid>

        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Sales vs collections{data?.financialYear ? ` · FY ${data.financialYear.label}` : ''}
            </Typography>
            {chartData.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                No invoices raised in this financial year yet.
              </Typography>
            ) : (
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
            )}
          </CardContent>
        </Card>

        <Grid container spacing={3} sx={{ mt: 0 }}>
          <Grid size={{ xs: 12, lg: 7 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="h6" sx={{ flex: 1 }}>
                    {isToday ? "Today's orders" : 'Recent orders'}
                  </Typography>
                  <Button size="small" onClick={() => navigate('/orders')}>
                    View all
                  </Button>
                </Stack>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Invoice</TableCell>
                        <TableCell>Customer</TableCell>
                        <TableCell align="right">Amount</TableCell>
                        <TableCell align="right">Due</TableCell>
                        <TableCell>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(data?.recentOrders ?? []).map((order) => (
                        <TableRow
                          key={order.id}
                          hover
                          sx={{ cursor: 'pointer' }}
                          onClick={() => navigate(`/orders?search=${encodeURIComponent(order.order_number ?? '')}`)}
                        >
                          <TableCell sx={{ fontFamily: 'monospace' }}>{order.order_number ?? '—'}</TableCell>
                          <TableCell>{order.customer_company || order.customer_name || '—'}</TableCell>
                          <TableCell align="right">{formatMoney(order.total_amount)}</TableCell>
                          <TableCell align="right">
                            {Number(order.balance_amount) > 0 ? (
                              <Typography variant="body2" color="warning.main">
                                {formatMoney(order.balance_amount)}
                              </Typography>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusChip status={order.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                      {(data?.recentOrders ?? []).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                            {isToday ? 'No orders today' : 'No orders yet'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, lg: 5 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="h6" sx={{ flex: 1 }}>
                    {isToday ? "Today's payments" : 'Recent payments'}
                  </Typography>
                  <Button size="small" onClick={() => navigate('/payments')}>
                    View all
                  </Button>
                </Stack>
                <Stack divider={<Divider flexItem />} spacing={0}>
                  {(data?.recentPayments ?? []).map((payment) => (
                    <Stack key={payment.id} direction="row" alignItems="center" spacing={1} sx={{ py: 1.2 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                          {payment.customer_name || '—'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                          {payment.order_number ?? '—'} · {formatDate(payment.payment_date)}
                        </Typography>
                      </Box>
                      <Stack alignItems="flex-end">
                        <Typography variant="body2" color="success.main" sx={{ fontWeight: 700 }}>
                          {formatMoney(payment.amount)}
                        </Typography>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={PAYMENT_METHOD_LABELS[payment.payment_method] || payment.payment_method || '—'}
                        />
                      </Stack>
                    </Stack>
                  ))}
                  {(data?.recentPayments ?? []).length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                      {isToday ? 'No payments recorded today' : 'No payments recorded yet'}
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12 }}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="h6" sx={{ flex: 1 }}>
                    Low stock
                  </Typography>
                  <Button size="small" onClick={() => navigate('/inventory')}>
                    Manage inventory
                  </Button>
                </Stack>
                {(data?.lowStockItems ?? []).length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    Every item is above its minimum level.
                  </Typography>
                ) : (
                  <Stack direction="row" flexWrap="wrap" gap={1}>
                    {data.lowStockItems.map((item) => (
                      <Chip
                        key={item.id}
                        color="warning"
                        variant="outlined"
                        icon={<WarningAmberRoundedIcon />}
                        label={`${item.item_name}: ${formatNumber(item.quantity)} / ${formatNumber(item.min_quantity)} ${item.unit ?? ''}`}
                      />
                    ))}
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </DataState>
    </>
  );
}
