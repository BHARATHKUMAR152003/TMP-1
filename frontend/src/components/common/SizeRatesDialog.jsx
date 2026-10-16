import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, IconButton, MenuItem, Alert, Typography, Stack, Box,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import { getSizeRates, updateSizeRates } from '../../services/settings.service.js';
import { PRODUCTION_TYPES } from '../../config/constants.js';

const SUGGESTED_SIZES = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'Legal', 'Letter'];

const blankRate = () => ({
  id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  size: '',
  productionType: 'digital',
  firstPrice: '',
  nextPrice: '',
});

/** Price for `quantity` copies: the first copy, then the repeat rate. */
export function priceForQuantity(rate, quantity) {
  const qty = Math.floor(Number(quantity));
  if (!rate || !(qty > 0)) return 0;
  const total = Number(rate.firstPrice) + (qty - 1) * Number(rate.nextPrice);
  return Math.round(total * 100) / 100;
}

/**
 * The size rate card. The first copy of a digital job carries the setup cost, so
 * each size holds two prices: the first copy and every copy after it.
 */
export default function SizeRatesDialog({ open, onClose, onSaved }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setLoading(true);
    getSizeRates()
      .then((data) => setRows((data ?? []).map((r) => ({ ...r, nextPrice: r.nextPrice ?? '' }))))
      .catch((err) => setError(err.displayMessage || 'Failed to load the rate card'))
      .finally(() => setLoading(false));
  }, [open]);

  const set = (id, key) => (e) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: e.target.value } : r)));

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      const saved = await updateSizeRates(rows.filter((r) => String(r.size).trim()));
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err.displayMessage || 'Failed to save the rate card');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Print rates by size</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The first copy carries the setup cost; every copy after it uses the repeat rate. Leave the
          repeat rate blank to charge the same price for every copy.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 140 }}>Size</TableCell>
              <TableCell sx={{ minWidth: 130 }}>Printing</TableCell>
              <TableCell align="right" sx={{ minWidth: 130 }}>First copy (₹)</TableCell>
              <TableCell align="right" sx={{ minWidth: 130 }}>Each after (₹)</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <TextField
                    select
                    size="small"
                    fullWidth
                    value={SUGGESTED_SIZES.includes(row.size) ? row.size : '__custom'}
                    onChange={(e) => {
                      const value = e.target.value;
                      setRows((prev) => prev.map((r) => (r.id === row.id
                        ? { ...r, size: value === '__custom' ? '' : value }
                        : r)));
                    }}
                  >
                    {SUGGESTED_SIZES.map((s) => (
                      <MenuItem key={s} value={s}>{s}</MenuItem>
                    ))}
                    <MenuItem value="__custom">Other…</MenuItem>
                  </TextField>
                  {!SUGGESTED_SIZES.includes(row.size) && (
                    <TextField
                      size="small"
                      fullWidth
                      sx={{ mt: 1 }}
                      placeholder="Size name"
                      value={row.size}
                      onChange={set(row.id, 'size')}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <TextField select size="small" fullWidth value={row.productionType} onChange={set(row.id, 'productionType')}>
                    {PRODUCTION_TYPES.map((p) => (
                      <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
                    ))}
                  </TextField>
                </TableCell>
                <TableCell>
                  <TextField size="small" type="number" fullWidth value={row.firstPrice} onChange={set(row.id, 'firstPrice')} />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    type="number"
                    fullWidth
                    placeholder="same"
                    value={row.nextPrice}
                    onChange={set(row.id, 'nextPrice')}
                  />
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}>
                    <DeleteRoundedIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                  No rates yet — add your first size below.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <Box sx={{ mt: 2 }}>
          <Button startIcon={<AddRoundedIcon />} onClick={() => setRows((prev) => [...prev, blankRate()])}>
            Add size
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Stack direction="row" spacing={1} sx={{ px: 1 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save rates'}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
