import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, Stack, Chip, IconButton, Tooltip, MenuItem,
  Box, Typography, InputAdornment, ToggleButton, ToggleButtonGroup, Snackbar, Alert,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import WarningRoundedIcon from '@mui/icons-material/WarningRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import PageHeader from '../components/common/PageHeader.jsx';
import DataState from '../components/common/DataState.jsx';
import {
  listInventory, createItem, updateItem, deleteItem, adjustItem,
  getTaxonomy, createGroup, deleteGroup, createCategory, deleteCategory, createType, deleteType,
} from '../services/inventory.service.js';
import { formatCurrency, formatNumber } from '../utils/format.js';

const EMPTY = { itemName: '', groupId: '', categoryId: '', typeId: '', quantity: 0, unit: '', minQuantity: 0, costPerUnit: 0, supplier: '' };

/** Small inline "type a name + Add" control used throughout the manage panel. */
function AddInline({ placeholder, onAdd, busy }) {
  const [value, setValue] = useState('');
  const submit = async () => {
    const name = value.trim();
    if (!name) return;
    await onAdd(name);
    setValue('');
  };
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <TextField
        size="small" placeholder={placeholder} value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
      />
      <Button size="small" startIcon={<AddRoundedIcon />} onClick={submit} disabled={busy || !value.trim()}>Add</Button>
    </Stack>
  );
}

export default function Inventory() {
  const [rows, setRows] = useState([]);
  const [taxonomy, setTaxonomy] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [toast, setToast] = useState('');

  // Filters: group -> category -> type, plus free-text search and a low-stock view.
  const [group, setGroup] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [lowOnly, setLowOnly] = useState(false);

  // Quick stock adjustment.
  const [adjusting, setAdjusting] = useState(null);
  const [adjustQty, setAdjustQty] = useState('1');
  const [adjustNote, setAdjustNote] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [items, tree] = await Promise.all([
        listInventory({
          groupId: group || undefined,
          categoryId: category || undefined,
          typeId: type || undefined,
          search: debounced || undefined,
          lowOnly: lowOnly ? 'true' : undefined,
        }),
        getTaxonomy(),
      ]);
      setRows(items);
      setTaxonomy(tree);
    } catch (err) {
      setError(err.displayMessage || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [group, category, type, debounced, lowOnly]);

  useEffect(() => { load(); }, [load]);

  // Filter option lists, derived from the taxonomy and the current selection.
  const filterGroupNode = useMemo(() => taxonomy.find((g) => g.id === group), [taxonomy, group]);
  const filterCategories = filterGroupNode?.categories ?? [];
  const filterTypes = filterCategories.find((c) => c.id === category)?.types ?? [];

  const pickGroup = (next) => {
    setGroup(next ?? '');
    setCategory('');
    setType('');
  };
  const pickCategory = (next) => {
    setCategory(next ?? '');
    setType('');
  };

  const clearFilters = () => {
    setGroup('');
    setCategory('');
    setType('');
    setSearch('');
    setLowOnly(false);
  };

  const filtersActive = Boolean(group || category || type || search || lowOnly);

  // Cascading option lists derived from the fetched taxonomy.
  const groupNode = taxonomy.find((g) => g.id === form.groupId);
  const categoryOptions = groupNode?.categories || [];
  const categoryNode = categoryOptions.find((c) => c.id === form.categoryId);
  const typeOptions = categoryNode?.types || [];
  const canSave = Boolean(
    form.itemName.trim()
    && form.groupId
    && (categoryOptions.length === 0 || form.categoryId)
    && (typeOptions.length === 0 || form.typeId),
  );

  const openCreate = () => {
    setEditing(null);
    // Pre-fill from the current filter — additions usually happen while looking
    // at the group they belong to.
    setForm({ ...EMPTY, groupId: group || '', categoryId: category || '', typeId: type || '' });
    setOpen(true);
  };
  const openEdit = (i) => {
    setEditing(i);
    setForm({
      itemName: i.item_name,
      groupId: i.group_id || '',
      categoryId: i.category_id || '',
      typeId: i.type_id || '',
      quantity: i.quantity, unit: i.unit || '',
      minQuantity: i.min_quantity, costPerUnit: i.cost_per_unit, supplier: i.supplier || '',
    });
    setOpen(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        itemName: form.itemName,
        groupId: form.groupId || null,
        categoryId: form.categoryId || null,
        typeId: form.typeId || null,
        quantity: form.quantity, unit: form.unit,
        minQuantity: form.minQuantity, costPerUnit: form.costPerUnit, supplier: form.supplier,
      };
      if (editing) await updateItem(editing.id, payload);
      else await createItem(payload);
      setOpen(false);
      await load();
    } catch (err) {
      setError(err.displayMessage || 'Failed to save item');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this item?')) return;
    try {
      await deleteItem(id);
      await load();
    } catch (err) {
      setError(err.displayMessage || 'Failed to delete');
    }
  };

  /** One-tap -1 / +1 straight from the row — the most common daily action. */
  const bump = async (item, delta) => {
    // Applied optimistically so repeated taps feel instant.
    setRows((prev) => prev.map((r) => {
      if (r.id !== item.id) return r;
      const quantity = Number(r.quantity) + delta;
      return { ...r, quantity, is_low: quantity <= Number(r.min_quantity) };
    }));
    try {
      const updated = await adjustItem(item.id, delta);
      setRows((prev) => prev.map((r) => (r.id === item.id ? updated : r)));
    } catch (err) {
      setToast(err.displayMessage || 'Failed to update stock');
      load();
    }
  };

  const openAdjust = (item) => {
    setAdjusting(item);
    setAdjustQty('1');
    setAdjustNote('');
  };

  const submitAdjust = async (sign) => {
    const qty = Number(adjustQty);
    if (!(qty > 0)) return;
    setBusy(true);
    try {
      const updated = await adjustItem(adjusting.id, sign * qty, adjustNote || undefined);
      setRows((prev) => prev.map((r) => (r.id === adjusting.id ? updated : r)));
      setAdjusting(null);
    } catch (err) {
      setToast(err.displayMessage || 'Failed to update stock');
    } finally {
      setBusy(false);
    }
  };

  // --- taxonomy management (add / remove groups, categories, types) ---
  const runTaxonomy = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.displayMessage || 'Failed to update categories');
    } finally {
      setBusy(false);
    }
  };

  const addGroup = (name) => runTaxonomy(() => createGroup(name));
  const removeGroup = (g) => {
    if (!window.confirm(`Remove group "${g.name}" and all its categories/types? ${g.itemCount} item(s) will become unassigned.`)) return;
    runTaxonomy(() => deleteGroup(g.id));
  };
  const addCategory = (groupId, name) => runTaxonomy(() => createCategory(groupId, name));
  const removeCategory = (c) => {
    if (!window.confirm(`Remove category "${c.name}" and its types? ${c.itemCount} item(s) will become unassigned.`)) return;
    runTaxonomy(() => deleteCategory(c.id));
  };
  const addType = (categoryId, name) => runTaxonomy(() => createType(categoryId, name));
  const removeType = (t) => {
    if (!window.confirm(`Remove type "${t.name}"? ${t.itemCount} item(s) will become unassigned.`)) return;
    runTaxonomy(() => deleteType(t.id));
  };

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Search or pick a group, then use − / + to update stock"
        action={(
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" startIcon={<AccountTreeRoundedIcon />} onClick={() => setManageOpen(true)}>Manage Categories</Button>
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreate}>Add Item</Button>
          </Stack>
        )}
      />

      <Card sx={{ p: 2, mb: 2 }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
            <TextField
              sx={{ flex: 2, minWidth: 240 }}
              placeholder="Search item, supplier, group, category or type…"
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
              sx={{ flex: 1, minWidth: 180 }}
              label="Group"
              value={group}
              onChange={(e) => pickGroup(e.target.value)}
            >
              <MenuItem value="">All groups</MenuItem>
              {taxonomy.map((g) => (
                <MenuItem key={g.id} value={g.id}>{g.name} ({g.itemCount})</MenuItem>
              ))}
            </TextField>
            <ToggleButton
              value="low"
              selected={lowOnly}
              onChange={() => setLowOnly((v) => !v)}
              sx={{ textTransform: 'none', whiteSpace: 'nowrap', px: 2 }}
            >
              Low stock only
            </ToggleButton>
            {filtersActive && <Button onClick={clearFilters}>Clear</Button>}
          </Stack>

          {/* Categories inside the chosen group, then types inside the chosen category. */}
          {group !== '' && (
            <Box>
              <Typography variant="caption" color="text.secondary">Category</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                <Chip label="All" size="small" color={category === '' ? 'primary' : 'default'} onClick={() => pickCategory('')} />
                {filterCategories.map((c) => (
                  <Chip
                    key={c.id}
                    size="small"
                    label={`${c.name} (${c.itemCount})`}
                    color={category === c.id ? 'primary' : 'default'}
                    onClick={() => pickCategory(c.id)}
                  />
                ))}
                {filterCategories.length === 0 && (
                  <Typography variant="caption" color="text.secondary">No categories in this group yet.</Typography>
                )}
              </Stack>
            </Box>
          )}

          {category !== '' && filterTypes.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary">Type</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                <Chip label="All" size="small" color={type === '' ? 'primary' : 'default'} onClick={() => setType('')} />
                {filterTypes.map((t) => (
                  <Chip
                    key={t.id}
                    size="small"
                    label={`${t.name} (${t.itemCount})`}
                    color={type === t.id ? 'primary' : 'default'}
                    onClick={() => setType(t.id)}
                  />
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      </Card>

      <Card>
        <DataState
          loading={loading}
          error={error}
          empty={!loading && rows.length === 0}
          emptyLabel={filtersActive ? 'No items match these filters' : 'No inventory items'}
          onRetry={load}
        >
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Item</TableCell>
                  <TableCell>Group</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="center">Stock</TableCell>
                  <TableCell align="right">Min</TableCell>
                  <TableCell align="right">Cost / Unit</TableCell>
                  <TableCell>Supplier</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((i) => {
                  const low = Boolean(i.is_low);
                  return (
                    <TableRow key={i.id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          {low && (
                            <Tooltip title="Below minimum stock"><WarningRoundedIcon color="warning" fontSize="small" /></Tooltip>
                          )}
                          {i.item_name}
                        </Stack>
                      </TableCell>
                      <TableCell>{i.group_name || '—'}</TableCell>
                      <TableCell>{i.category_name || '—'}</TableCell>
                      <TableCell>{i.type_name || '—'}</TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
                          <Tooltip title="Remove one">
                            <span>
                              <IconButton size="small" color="warning" disabled={Number(i.quantity) <= 0} onClick={() => bump(i, -1)}>
                                <RemoveRoundedIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Add or remove a specific amount">
                            <Chip
                              size="small"
                              clickable
                              onClick={() => openAdjust(i)}
                              color={low ? 'warning' : 'default'}
                              variant={low ? 'filled' : 'outlined'}
                              label={`${formatNumber(i.quantity)} ${i.unit || ''}`.trim()}
                              sx={{ minWidth: 84 }}
                            />
                          </Tooltip>
                          <Tooltip title="Add one">
                            <IconButton size="small" color="success" onClick={() => bump(i, 1)}>
                              <AddRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                      <TableCell align="right">{formatNumber(i.min_quantity)}</TableCell>
                      <TableCell align="right">{formatCurrency(i.cost_per_unit)}</TableCell>
                      <TableCell>{i.supplier || '—'}</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => openEdit(i)}><EditRoundedIcon fontSize="small" /></IconButton>
                        <IconButton size="small" onClick={() => remove(i.id)}><DeleteRoundedIcon fontSize="small" /></IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </DataState>
      </Card>

      <Dialog open={Boolean(adjusting)} onClose={() => setAdjusting(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{adjusting?.item_name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            In stock now: <strong>{formatNumber(adjusting?.quantity)} {adjusting?.unit || ''}</strong>
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={adjustQty}
            onChange={(_e, v) => v && setAdjustQty(v)}
            sx={{ mb: 2, flexWrap: 'wrap' }}
          >
            {['1', '5', '10', '25', '50', '100'].map((n) => (
              <ToggleButton key={n} value={n} sx={{ px: 1.5 }}>{n}</ToggleButton>
            ))}
          </ToggleButtonGroup>
          <TextField
            label="Quantity"
            type="number"
            fullWidth
            value={adjustQty}
            onChange={(e) => setAdjustQty(e.target.value)}
            InputProps={{ endAdornment: <InputAdornment position="end">{adjusting?.unit || ''}</InputAdornment> }}
          />
          <TextField label="Note (optional)" fullWidth margin="normal" value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAdjusting(null)}>Cancel</Button>
          <Box sx={{ flex: 1 }} />
          <Button
            variant="outlined"
            color="warning"
            startIcon={<RemoveRoundedIcon />}
            disabled={busy || !(Number(adjustQty) > 0)}
            onClick={() => submitAdjust(-1)}
          >
            Remove
          </Button>
          <Button
            variant="contained"
            color="success"
            startIcon={<AddRoundedIcon />}
            disabled={busy || !(Number(adjustQty) > 0)}
            onClick={() => submitAdjust(1)}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Item' : 'Add Inventory Item'}</DialogTitle>
        <DialogContent>
          <TextField label="Item name" fullWidth margin="normal" value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} />
          <Stack direction="row" spacing={2}>
            <TextField select label="Group" fullWidth margin="normal" value={form.groupId}
              onChange={(e) => setForm({ ...form, groupId: e.target.value, categoryId: '', typeId: '' })}>
              <MenuItem value="">Select…</MenuItem>
              {taxonomy.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
            </TextField>
            <TextField select label="Category" fullWidth margin="normal" value={form.categoryId} disabled={!form.groupId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value, typeId: '' })}
              helperText={form.groupId && categoryOptions.length === 0 ? 'No categories yet — add some in Manage Categories' : ' '}>
              <MenuItem value="">Select…</MenuItem>
              {categoryOptions.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
            <TextField select label="Type" fullWidth margin="normal" value={form.typeId} disabled={!form.categoryId}
              onChange={(e) => setForm({ ...form, typeId: e.target.value })}
              helperText={form.categoryId && typeOptions.length === 0 ? 'No types yet — add some in Manage Categories' : ' '}>
              <MenuItem value="">Select…</MenuItem>
              {typeOptions.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
            </TextField>
          </Stack>
          <TextField label="Unit" fullWidth margin="normal" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          <Stack direction="row" spacing={2}>
            <TextField label="Quantity" type="number" fullWidth margin="normal" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            <TextField label="Min quantity" type="number" fullWidth margin="normal" value={form.minQuantity} onChange={(e) => setForm({ ...form, minQuantity: e.target.value })} />
            <TextField label="Cost / unit" type="number" fullWidth margin="normal" value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })} />
          </Stack>
          <TextField label="Supplier" fullWidth margin="normal" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={busy || !canSave}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={manageOpen} onClose={() => setManageOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Manage Inventory Categories</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Add or remove groups, categories and types. Removing a node also removes everything nested under it; any stock using it becomes unassigned.
          </Typography>
          <Box sx={{ mb: 2 }}>
            <AddInline placeholder="New group (e.g. Offset)" onAdd={addGroup} busy={busy} />
          </Box>
          {taxonomy.length === 0 && (
            <Typography variant="body2" color="text.secondary">No groups yet. Add your first group above.</Typography>
          )}
          {taxonomy.map((g) => (
            <Box key={g.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5, mb: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography fontWeight={700}>{g.name} <Typography component="span" variant="caption" color="text.secondary">({g.itemCount} items)</Typography></Typography>
                <IconButton size="small" onClick={() => removeGroup(g)}><DeleteRoundedIcon fontSize="small" /></IconButton>
              </Stack>
              <Box sx={{ pl: 2, mt: 1 }}>
                {g.categories.map((c) => (
                  <Box key={c.id} sx={{ mb: 1.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" fontWeight={600}>{c.name} <Typography component="span" variant="caption" color="text.secondary">({c.itemCount})</Typography></Typography>
                      <IconButton size="small" onClick={() => removeCategory(c)}><DeleteRoundedIcon fontSize="small" /></IconButton>
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ my: 1 }}>
                      {c.types.map((t) => (
                        <Chip key={t.id} size="small" label={t.name} onDelete={() => removeType(t)} />
                      ))}
                    </Stack>
                    <AddInline placeholder="New type" onAdd={(name) => addType(c.id, name)} busy={busy} />
                  </Box>
                ))}
                <AddInline placeholder="New category" onAdd={(name) => addCategory(g.id, name)} busy={busy} />
              </Box>
            </Box>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManageOpen(false)}>Done</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={4000} onClose={() => setToast('')}>
        <Alert severity="error" onClose={() => setToast('')}>{toast}</Alert>
      </Snackbar>
    </>
  );
}
