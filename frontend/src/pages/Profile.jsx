import { useEffect, useState } from 'react';
import {
  Card, CardContent, Grid, TextField, Button, Typography, Snackbar, Alert, Box, Stack, Avatar, Divider, Chip,
} from '@mui/material';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import LockResetRoundedIcon from '@mui/icons-material/LockResetRounded';
import PageHeader from '../components/common/PageHeader.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchProfile, changePassword } from '../services/auth.service.js';
import { ROLE_COLORS, ROLE_LABELS } from '../config/constants.js';
import { initials } from '../utils/format.js';

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const accent = ROLE_COLORS[user?.role] || ROLE_COLORS.admin;

  const [form, setForm] = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState('');

  useEffect(() => {
    fetchProfile()
      .then((p) => setForm({ name: p.name || '', phone: p.phone || '' }))
      .catch(() => {});
  }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      await updateProfile({ name: form.name, phone: form.phone });
      setToast('Profile saved');
    } catch (err) {
      setError(err.displayMessage || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    setPwdError('');
    if (pwd.newPassword.length < 8) { setPwdError('New password must be at least 8 characters'); return; }
    if (pwd.newPassword !== pwd.confirm) { setPwdError('New password and confirmation do not match'); return; }
    setPwdSaving(true);
    try {
      await changePassword(pwd.currentPassword, pwd.newPassword);
      setPwd({ currentPassword: '', newPassword: '', confirm: '' });
      setToast('Password updated');
    } catch (err) {
      setPwdError(err.displayMessage || 'Failed to update password');
    } finally {
      setPwdSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="My Profile" subtitle="View and edit your account details" />
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
                <Avatar sx={{ bgcolor: accent, width: 64, height: 64, fontSize: 24 }}>{initials(form.name || user?.name)}</Avatar>
                <Box>
                  <Typography variant="h6">{form.name || user?.name}</Typography>
                  <Chip size="small" label={ROLE_LABELS[user?.role] || user?.role} sx={{ mt: 0.5 }} />
                </Box>
              </Stack>

              {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField label="Full name" fullWidth value={form.name} onChange={set('name')} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField label="Email" fullWidth value={user?.email || ''} disabled helperText="Email can't be changed" />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField label="Phone" fullWidth value={form.phone} onChange={set('phone')} />
                </Grid>
              </Grid>

              <Box sx={{ mt: 3 }}>
                <Button variant="contained" startIcon={<SaveRoundedIcon />} onClick={save} disabled={saving || !form.name.trim()}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Change Password</Typography>
              <Divider sx={{ mb: 2 }} />
              {pwdError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setPwdError('')}>{pwdError}</Alert>}
              <Stack spacing={2}>
                <TextField label="Current password" type="password" fullWidth value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} />
                <TextField label="New password" type="password" fullWidth value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} />
                <TextField label="Confirm new password" type="password" fullWidth value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} />
                <Button variant="outlined" startIcon={<LockResetRoundedIcon />} onClick={savePassword} disabled={pwdSaving || !pwd.currentPassword || !pwd.newPassword}>
                  {pwdSaving ? 'Updating…' : 'Update Password'}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Snackbar open={Boolean(toast)} autoHideDuration={2500} onClose={() => setToast('')}>
        <Alert severity="success" variant="filled">{toast}</Alert>
      </Snackbar>
    </>
  );
}
