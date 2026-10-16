import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Stack, InputAdornment,
  Typography, Alert, Grid, IconButton, Tooltip, Snackbar,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import PersonAddRoundedIcon from '@mui/icons-material/PersonAddRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import PageHeader from '../components/common/PageHeader.jsx';
import DataState from '../components/common/DataState.jsx';
import { listCustomers, createCustomer, deleteCustomer } from '../services/customer.service.js';
import { useAuth } from '../context/AuthContext.jsx';
import { formatCurrency, formatNumber } from '../utils/format.js';

const EMPTY = {
  name: '', phone: '', email: '', address: '',
  companyName: '', gstNumber: '', state: '', stateCode: '',
};

/** Shared add/edit form body, also used by the customer detail page. */
export function CustomerFields({ value, onChange }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  return (
    <Grid container spacing={2} sx={{ mt: 0 }}>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField label="Customer name" required fullWidth autoFocus value={value.name} onChange={set('name')} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField label="Phone" fullWidth value={value.phone} onChange={set('phone')} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField label="Email" type="email" fullWidth value={value.email} onChange={set('email')} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField label="Company name" fullWidth value={value.companyName} onChange={set('companyName')} />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <TextField label="Address" fullWidth multiline rows={2} value={value.address} onChange={set('address')} />
      </Grid>
      <Grid size={{ xs: 12, sm: 5 }}>
        <TextField label="GST number" fullWidth value={value.gstNumber} onChange={set('gstNumber')} />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <TextField label="State" fullWidth value={value.state} onChange={set('state')} />
      </Grid>
      <Grid size={{ xs: 12, sm: 3 }}>
        <TextField label="State code" fullWidth value={value.stateCode} onChange={set('stateCode')} />
      </Grid>
    </Grid>
  );
}

export default function Customers() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [duplicateId, setDuplicateId] = useState(null);

  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteWarning, setDeleteWarning] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState('');

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
    listCustomers({ search: debounced || undefined, page: page + 1, limit })
      .then(({ data, meta }) => {
        setRows(data);
        setTotal(meta?.total ?? data.length);
      })
      .catch((err) => setError(err.displayMessage || 'Failed to load customers'))
      .finally(() => setLoading(false));
  }, [debounced, page, limit]);

  useEffect(load, [load]);

  const openDialog = () => {
    setForm(EMPTY);
    setFormError('');
    setDuplicateId(null);
    setDialogOpen(true);
  };

  const askDelete = (row) => {
    setDeleteWarning('');
    setConfirmDelete(row);
  };

  // The API refuses with 409 while the customer still has orders; `force`
  // is the second, explicit confirmation that those orders should go too.
  const removeCustomer = async ({ force = false } = {}) => {
    setDeleting(true);
    try {
      await deleteCustomer(confirmDelete.id, { force });
      setConfirmDelete(null);
      load();
    } catch (err) {
      if (err.response?.status === 409) setDeleteWarning(err.displayMessage);
      else {
        setConfirmDelete(null);
        setToast(err.displayMessage || 'Failed to delete the customer');
      }
    } finally {
      setDeleting(false);
    }
  };

  const save = async ({ allowDuplicate = false } = {}) => {
    setFormError('');
    setSaving(true);
    try {
      const created = await createCustomer(form, { allowDuplicate });
      setDialogOpen(false);
      navigate(`/customers/${created.id}`);
    } catch (err) {
      // 409 means the details match an existing customer; offer to open it.
      setDuplicateId(err.response?.status === 409 ? err.response?.data?.details?.customerId ?? null : null);
      setFormError(err.displayMessage || 'Failed to save the customer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Search the directory, open a customer to see their full history"
        action={
          <Button variant="contained" startIcon={<PersonAddRoundedIcon />} onClick={openDialog}>
            Add Customer
          </Button>
        }
      />

      <Card sx={{ p: 2, mb: 2 }}>
        <TextField
          fullWidth
          placeholder="Search by name, phone, email, company or GST number…"
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
      </Card>

      <Card>
        <DataState loading={loading} error={error} empty={rows.length === 0} emptyLabel="No customers found" onRetry={load}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Customer</TableCell>
                  <TableCell>Phone</TableCell>
                  <TableCell>GST</TableCell>
                  <TableCell align="right">Orders</TableCell>
                  <TableCell align="right">Total Value</TableCell>
                  <TableCell align="right">Outstanding</TableCell>
                  {isAdmin && <TableCell align="center">Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/customers/${row.id}`)}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {row.name}
                      </Typography>
                      {row.company_name && (
                        <Typography variant="caption" color="text.secondary">
                          {row.company_name}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{row.phone || '—'}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{row.gst_number || '—'}</TableCell>
                    <TableCell align="right">{formatNumber(row.order_count)}</TableCell>
                    <TableCell align="right">{formatCurrency(row.total_spent)}</TableCell>
                    <TableCell align="right">
                      {Number(row.outstanding) > 0 ? (
                        <Typography variant="body2" color="warning.main" sx={{ fontWeight: 600 }}>
                          {formatCurrency(row.outstanding)}
                        </Typography>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell align="center" onClick={(e) => e.stopPropagation()} sx={{ cursor: 'default' }}>
                        <Tooltip title="Delete customer">
                          <IconButton size="small" color="error" onClick={() => askDelete(row)}>
                            <DeleteRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
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

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add customer</DialogTitle>
        <DialogContent>
          {formError && (
            <Alert
              severity={duplicateId ? 'warning' : 'error'}
              sx={{ mt: 1 }}
              action={
                duplicateId && (
                  <Stack direction="row" spacing={1}>
                    <Button color="inherit" size="small" onClick={() => navigate(`/customers/${duplicateId}`)}>
                      Open
                    </Button>
                    <Button color="inherit" size="small" onClick={() => save({ allowDuplicate: true })}>
                      Add anyway
                    </Button>
                  </Stack>
                )
              }
            >
              {formError}
            </Alert>
          )}
          <CustomerFields value={form} onChange={setForm} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => save()} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete {confirmDelete?.name}?</DialogTitle>
        <DialogContent>
          {deleteWarning ? (
            <Alert severity="warning">{deleteWarning}</Alert>
          ) : (
            <Typography variant="body2" color="text.secondary">
              This removes the customer from the directory permanently.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleting}
            onClick={() => removeCustomer({ force: Boolean(deleteWarning) })}
          >
            {deleting ? 'Deleting…' : deleteWarning ? 'Delete everything' : 'Delete'}
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
