import { useEffect, useState } from 'react';
import {
  Card, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Stack, Chip, Switch,
  Avatar, Box, Typography, Alert, Tooltip,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import PageHeader from '../../components/common/PageHeader.jsx';
import DataState from '../../components/common/DataState.jsx';
import { listEmployees, createEmployee, updateEmployee, toggleActive } from '../../services/employee.service.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { ALL_ROLES, ROLE_COLORS, ROLE_LABELS } from '../../config/constants.js';
import { initials, formatDateTime } from '../../utils/format.js';

const EMPTY = { name: '', email: '', password: '', phone: '', role: 'accountant' };

/** Admin-only user management. The backend enforces the same restriction. */
export default function Users() {
  const { user: currentUser } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await listEmployees());
    } catch (err) {
      setError(err.displayMessage || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setForm(EMPTY);
    setEditingId(null);
    setOpen(true);
  };

  const openEdit = (row) => {
    setForm({ name: row.name, email: row.email, password: '', phone: row.phone ?? '', role: row.role });
    setEditingId(row.id);
    setOpen(true);
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      if (editingId) {
        const { email, password, ...rest } = form;
        await updateEmployee(editingId, password ? { ...rest, password } : rest);
      } else {
        await createEmployee(form);
      }
      setOpen(false);
      await load();
    } catch (err) {
      setError(err.displayMessage || 'Failed to save the user');
    } finally {
      setBusy(false);
    }
  };

  const flip = async (row) => {
    setError('');
    try {
      await toggleActive(row.id, !row.is_active);
      await load();
    } catch (err) {
      setError(err.displayMessage || 'Failed to update');
    }
  };

  const isRetired = (role) => !ALL_ROLES.includes(role);
  const passwordOk = editingId ? !form.password || form.password.length >= 8 : form.password.length >= 8;

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Admins have full access; accountants cannot reach Users or Settings"
        action={
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreate}>
            Add User
          </Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Card>
        <DataState loading={loading} error={null} empty={!loading && rows.length === 0} emptyLabel="No users yet" onRetry={load}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Phone</TableCell>
                  <TableCell>Last Login</TableCell>
                  <TableCell align="center">Active</TableCell>
                  <TableCell align="center">Edit</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} hover sx={{ opacity: row.is_active ? 1 : 0.55 }}>
                    <TableCell>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Avatar sx={{ width: 34, height: 34, bgcolor: ROLE_COLORS[row.role] || '#64748b', fontSize: 14 }}>
                          {initials(row.name)}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {row.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {row.email}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      {isRetired(row.role) ? (
                        <Tooltip title="This role was removed. Reassign the account to Admin or Accountant to re-enable it.">
                          <Chip size="small" variant="outlined" label={`${row.role} (retired)`} />
                        </Tooltip>
                      ) : (
                        <Chip
                          size="small"
                          color={row.role === 'admin' ? 'primary' : 'success'}
                          label={ROLE_LABELS[row.role] ?? row.role}
                        />
                      )}
                    </TableCell>
                    <TableCell>{row.phone || '—'}</TableCell>
                    <TableCell>{formatDateTime(row.last_login)}</TableCell>
                    <TableCell align="center">
                      <Switch
                        checked={Boolean(row.is_active)}
                        onChange={() => flip(row)}
                        disabled={row.id === currentUser?.id || isRetired(row.role)}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Button size="small" startIcon={<EditRoundedIcon />} onClick={() => openEdit(row)}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DataState>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Edit user' : 'Add user'}</DialogTitle>
        <DialogContent>
          <TextField
            label="Full name"
            fullWidth
            margin="normal"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <TextField
            label="Email"
            type="email"
            fullWidth
            margin="normal"
            disabled={Boolean(editingId)}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <TextField
            label={editingId ? 'New password (leave blank to keep)' : 'Temporary password'}
            type="password"
            fullWidth
            margin="normal"
            helperText="At least 8 characters"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              label="Phone"
              fullWidth
              margin="normal"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <TextField
              select
              label="Role"
              fullWidth
              margin="normal"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {ALL_ROLES.map((role) => (
                <MenuItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={busy || !form.name || !form.email || !passwordOk}>
            {busy ? 'Saving…' : editingId ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

