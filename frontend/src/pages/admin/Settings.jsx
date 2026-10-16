import { useEffect, useState } from 'react';
import {
  Card, CardContent, Grid, TextField, Button, Typography, Snackbar, Alert, Box, Stack, Divider, IconButton, Tooltip,
} from '@mui/material';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import PageHeader from '../../components/common/PageHeader.jsx';
import DataState from '../../components/common/DataState.jsx';
import SizeRatesDialog from '../../components/common/SizeRatesDialog.jsx';
import { getSettings, updateSettings, getPaymentSettings, updatePaymentAccounts, uploadPaymentQr } from '../../services/settings.service.js';
import { fileUrl } from '../../utils/format.js';

// Every value printed on the tax invoice, grouped the way it appears there.
const FIELD_GROUPS = [
  {
    title: 'Company profile',
    caption: 'Printed in the seller block at the top of every tax invoice.',
    fields: [
      { key: 'company_name', label: 'Company Name' },
      { key: 'company_phone', label: 'Phone' },
      { key: 'company_email', label: 'E-Mail' },
      { key: 'company_gst', label: 'GSTIN / UIN' },
      { key: 'company_state', label: 'State Name' },
      { key: 'company_state_code', label: 'State Code' },
      { key: 'company_address', label: 'Address', multiline: true },
    ],
  },
  {
    title: 'Invoicing',
    caption: 'Invoice numbers run as PREFIX/NNNN/YY-YY and restart each financial year (1 April – 31 March).',
    fields: [
      { key: 'invoice_prefix', label: 'Invoice Prefix', helper: 'e.g. TMP → TMP/0001/26-27' },
      { key: 'default_gst_rate', label: 'Default GST Rate (%)' },
      { key: 'default_hsn_code', label: 'Default HSN / SAC' },
      { key: 'currency', label: 'Currency' },
      { key: 'invoice_jurisdiction', label: 'Jurisdiction', helper: 'Shown as “SUBJECT TO … JURISDICTION”' },
      { key: 'invoice_declaration', label: 'Declaration', multiline: true },
    ],
  },
  {
    title: 'Bank details',
    caption: 'Printed in the “Company’s Bank Details” panel of the invoice.',
    fields: [
      { key: 'bank_account_name', label: "A/c Holder's Name" },
      { key: 'bank_name', label: 'Bank Name' },
      { key: 'bank_account_number', label: 'A/c No.' },
      { key: 'bank_branch_ifsc', label: 'Branch & IFS Code' },
    ],
  },
];

const ACCOUNT_FIELDS = [
  { key: 'label', label: 'Display Label (e.g. HDFC Current A/c)' },
  { key: 'bank_name', label: 'Bank Name' },
  { key: 'account_name', label: 'Account Holder' },
  { key: 'account_number', label: 'Account Number' },
  { key: 'ifsc', label: 'IFSC Code' },
  { key: 'upi_id', label: 'UPI ID' },
];

const newAccount = () => ({ id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: '', bank_name: '', account_name: '', account_number: '', ifsc: '', upi_id: '', qr_path: '' });

export default function Settings() {
  const [values, setValues] = useState({});
  const [accounts, setAccounts] = useState([]);
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [qrBusyId, setQrBusyId] = useState(null);
  const [ratesOpen, setRatesOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [settings, payment] = await Promise.all([getSettings(), getPaymentSettings()]);
      setValues(settings);
      setAccounts(payment.accounts || []);
      setInstructions(payment.instructions || '');
    } catch (err) {
      setError(err.displayMessage || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const setAccount = (idx, key) => (e) => {
    setAccounts((list) => list.map((a, i) => (i === idx ? { ...a, [key]: e.target.value } : a)));
  };
  const addAccount = () => setAccounts((list) => [...list, newAccount()]);
  const removeAccount = (idx) => setAccounts((list) => list.filter((_, i) => i !== idx));

  const onQrPick = (idx) => async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setQrBusyId(accounts[idx]?.id);
    try {
      const { path } = await uploadPaymentQr(file);
      setAccounts((list) => list.map((a, i) => (i === idx ? { ...a, qr_path: path } : a)));
    } catch (err) {
      setError(err.displayMessage || 'Failed to upload QR');
    } finally {
      setQrBusyId(null);
    }
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await updateSettings(values);
      const data = await updatePaymentAccounts({ accounts, instructions });
      setAccounts(data.accounts || []);
      setInstructions(data.instructions || '');
      setToast('Settings saved');
    } catch (err) {
      setError(err.displayMessage || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Company profile, invoice numbering and the details printed on every tax invoice"
        action={
          <Button variant="outlined" startIcon={<TuneRoundedIcon />} onClick={() => setRatesOpen(true)}>
            Print rates by size
          </Button>
        }
      />
      <SizeRatesDialog open={ratesOpen} onClose={() => setRatesOpen(false)} />
      <DataState loading={loading} error={error} onRetry={load}>
        <Stack spacing={3}>
          {FIELD_GROUPS.map((group) => (
            <Card key={group.title} sx={{ maxWidth: 900 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {group.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {group.caption}
                </Typography>
                <Grid container spacing={2}>
                  {group.fields.map((f) => (
                    <Grid key={f.key} size={{ xs: 12, sm: f.multiline ? 12 : 6 }}>
                      <TextField
                        fullWidth
                        label={f.label}
                        helperText={f.helper}
                        multiline={f.multiline}
                        rows={f.multiline ? 2 : 1}
                        value={values[f.key] || ''}
                        onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                      />
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          ))}

          <Card sx={{ maxWidth: 900 }}>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="h6">Payment Accounts</Typography>
                <Button size="small" variant="outlined" startIcon={<AddRoundedIcon />} onClick={addAccount}>Add account</Button>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Bank / UPI accounts used for collections. These are reference details for staff; the
                invoice itself prints the bank details configured above.
              </Typography>

              {accounts.length === 0 && (
                <Alert severity="info" sx={{ mb: 2 }}>No accounts yet. Click “Add account” to create one.</Alert>
              )}

              <Stack spacing={2}>
                {accounts.map((acc, idx) => (
                  <Card key={acc.id} variant="outlined">
                    <CardContent>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <AccountBalanceRoundedIcon color="primary" fontSize="small" />
                          <Typography variant="subtitle2">{acc.label || acc.bank_name || acc.upi_id || `Account ${idx + 1}`}</Typography>
                        </Stack>
                        <Tooltip title="Remove account">
                          <IconButton size="small" color="error" onClick={() => removeAccount(idx)}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      </Stack>
                      <Grid container spacing={2}>
                        {ACCOUNT_FIELDS.map((f) => (
                          <Grid key={f.key} size={{ xs: 12, sm: 6 }}>
                            <TextField size="small" fullWidth label={f.label} value={acc[f.key] || ''} onChange={setAccount(idx, f.key)} />
                          </Grid>
                        ))}
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <Stack direction="row" spacing={2} alignItems="center">
                            {acc.qr_path ? (
                              <Box component="img" src={fileUrl(acc.qr_path)} alt="QR" sx={{ width: 72, height: 72, objectFit: 'contain', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 0.5, bgcolor: '#fff' }} />
                            ) : (
                              <Box sx={{ width: 72, height: 72, display: 'grid', placeItems: 'center', border: '1px dashed', borderColor: 'divider', borderRadius: 1, color: 'text.secondary', fontSize: 11 }}>No QR</Box>
                            )}
                            <Button component="label" size="small" variant="outlined" startIcon={<UploadFileRoundedIcon />} disabled={qrBusyId === acc.id}>
                              {qrBusyId === acc.id ? 'Uploading…' : 'QR image'}
                              <input hidden type="file" accept="image/*" onChange={onQrPick(idx)} />
                            </Button>
                          </Stack>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                ))}
              </Stack>

              <Divider sx={{ my: 3 }} />
              <TextField
                fullWidth multiline rows={2} label="Payment Instructions / Note (shown to customers)"
                value={instructions} onChange={(e) => setInstructions(e.target.value)}
              />
            </CardContent>
          </Card>

          <Box>
            <Button variant="contained" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </Box>
        </Stack>
      </DataState>
      <Snackbar open={Boolean(toast)} autoHideDuration={2500} onClose={() => setToast('')}>
        <Alert severity="success" variant="filled">{toast}</Alert>
      </Snackbar>
    </>
  );
}
