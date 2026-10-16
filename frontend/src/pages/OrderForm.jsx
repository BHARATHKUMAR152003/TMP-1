import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Card, CardContent, Grid, TextField, MenuItem, Button, Typography, Stack, Box, Divider,
  Autocomplete, Alert, Chip, InputAdornment, CircularProgress,
} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import PageHeader from '../components/common/PageHeader.jsx';
import DataState from '../components/common/DataState.jsx';
import SizeRatesDialog, { priceForQuantity } from '../components/common/SizeRatesDialog.jsx';
import { createOrder, getOrder, updateOrder } from '../services/order.service.js';
import { searchCustomers, getCustomer } from '../services/customer.service.js';
import { listCategories } from '../services/category.service.js';
import { listInventory } from '../services/inventory.service.js';
import { getSettings, getSizeRates } from '../services/settings.service.js';
import {
  PRODUCTION_TYPES, PRIORITIES, UNITS, INDIAN_STATES, STATE_CODES, DEFAULT_STATE,
} from '../config/constants.js';
import { formatMoney } from '../utils/format.js';

const EMPTY = {
  customerId: '',
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  customerAddress: '',
  companyName: '',
  gstNumber: '',
  state: DEFAULT_STATE,
  stateCode: STATE_CODES[DEFAULT_STATE],
  categoryId: '',
  productName: '',
  productionType: 'digital',
  quantity: 1,
  unit: 'Nos',
  size: '',
  priority: 'normal',
  specialInstructions: '',
  hsnCode: '',
  gstRate: 18,
  wastageItemId: '',
  wastageQuantity: '',
  deliveryCharge: '',
  cuttingCharge: '',
  dispatchedThrough: '',
  totalAmount: '',
  paymentAmount: '',
  paymentMethod: 'cash',
  referenceNo: '',
};

/** Mirrors backend utils/gst.js so the preview matches the printed invoice. */
function previewGst(total, gstRate, quantity) {
  const grand = Number(total) || 0;
  const rate = Number(gstRate) || 0;
  const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
  const taxable = round2(grand / (1 + rate / 100));
  const tax = round2(grand - taxable);
  const cgst = round2(tax / 2);
  const qty = Number(quantity) > 0 ? Number(quantity) : 1;
  return {
    taxable,
    ratePerUnit: round2(taxable / qty),
    cgst,
    sgst: round2(tax - cgst),
    tax,
    grand,
    halfRate: round2(rate / 2),
  };
}

/**
 * Create / edit an order. Creating one issues the tax invoice immediately, so
 * the customer must be resolved first: search picks an existing record, and
 * only a genuinely new name creates one.
 */
export default function OrderForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(EMPTY);
  const [categories, setCategories] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [sizeRates, setSizeRates] = useState([]);
  const [ratesOpen, setRatesOpen] = useState(false);
  // Once the total is typed by hand the rate card stops overwriting it.
  const [manualTotal, setManualTotal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Customer type-ahead.
  const [customerInput, setCustomerInput] = useState('');
  const [options, setOptions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const setState = (e) => {
    const state = e.target.value;
    setForm((prev) => ({ ...prev, state, stateCode: STATE_CODES[state] ?? '' }));
  };

  const setTotal = (e) => {
    setManualTotal(true);
    setForm((prev) => ({ ...prev, totalAmount: e.target.value }));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [cats, settings, rates, stock] = await Promise.all([
        listCategories(),
        getSettings().catch(() => ({})),
        getSizeRates().catch(() => []),
        listInventory().catch(() => []),
      ]);
      setCategories(cats ?? []);
      setSizeRates(rates ?? []);
      setStockItems(stock ?? []);

      if (isEdit) {
        const order = await getOrder(id);
        setManualTotal(true);
        const delivery = Number(order.delivery_charge ?? 0);
        const cutting = Number(order.cutting_charge ?? 0);
        setForm({
          ...EMPTY,
          customerId: order.customer_id ?? '',
          categoryId: order.category_id ?? '',
          productName: order.product_name ?? '',
          productionType: order.production_type ?? 'digital',
          quantity: order.quantity ?? 1,
          unit: order.unit ?? 'Nos',
          size: order.size ?? '',
          priority: order.priority ?? 'normal',
          specialInstructions: order.special_instructions ?? '',
          hsnCode: order.hsn_code ?? '',
          gstRate: order.gst_rate ?? 18,
          wastageItemId: order.wastage_item_id ?? '',
          wastageQuantity: Number(order.wastage_quantity ?? 0) || '',
          deliveryCharge: delivery || '',
          cuttingCharge: cutting || '',
          dispatchedThrough: order.dispatched_through ?? '',
          // total_amount already includes delivery and cutting; the field prices the product.
          totalAmount: Math.max(0, Number(order.total_amount ?? 0) - delivery - cutting),
        });
        setSelected({
          id: order.customer_id,
          name: order.customer_name,
          company_name: order.customer_company,
          phone: order.customer_phone,
        });
        return;
      }

      setForm((prev) => ({
        ...prev,
        gstRate: Number(settings.default_gst_rate) || 18,
        hsnCode: settings.default_hsn_code || '',
      }));

      // Arriving from a customer page pre-selects that customer.
      const preset = params.get('customerId');
      if (preset) {
        const customer = await getCustomer(preset);
        applyCustomer(customer);
      }
    } catch (err) {
      setLoadError(err.displayMessage || 'Failed to load the form');
    } finally {
      setLoading(false);
    }
  }, [id, isEdit, params]);

  useEffect(() => {
    load();
  }, [load]);

  function applyCustomer(customer) {
    setSelected(customer);
    setForm((prev) => ({
      ...prev,
      customerId: customer.id,
      customerName: customer.name ?? '',
      customerPhone: customer.phone ?? '',
      customerEmail: customer.email ?? '',
      customerAddress: customer.address ?? '',
      companyName: customer.company_name ?? '',
      gstNumber: customer.gst_number ?? '',
      state: customer.state || DEFAULT_STATE,
      stateCode: customer.state_code || STATE_CODES[customer.state] || STATE_CODES[DEFAULT_STATE],
    }));
  }

  // Debounced customer search.
  useEffect(() => {
    if (isEdit || customerInput.trim().length < 2) {
      setOptions([]);
      return undefined;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      searchCustomers(customerInput.trim())
        .then((results) => setOptions(results ?? []))
        .catch(() => setOptions([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [customerInput, isEdit]);

  // Rates for the chosen printing method; a size priced only once is still offered.
  const sizeOptions = useMemo(
    () => sizeRates.filter((r) => !r.productionType || r.productionType === form.productionType),
    [sizeRates, form.productionType],
  );
  const activeRate = useMemo(
    () => sizeOptions.find((r) => r.size === form.size) ?? null,
    [sizeOptions, form.size],
  );
  const ratedTotal = activeRate ? priceForQuantity(activeRate, form.quantity) : 0;

  // Picking a size prices the job automatically until the total is typed over.
  useEffect(() => {
    if (!activeRate || manualTotal) return;
    setForm((prev) => ({ ...prev, totalAmount: String(priceForQuantity(activeRate, prev.quantity)) }));
  }, [activeRate, form.quantity, manualTotal]);

  const itemAmount = Number(form.totalAmount) || 0;
  const deliveryCharge = Number(form.deliveryCharge) || 0;
  const cuttingCharge = Number(form.cuttingCharge) || 0;
  const invoiceTotal = Math.round((itemAmount + deliveryCharge + cuttingCharge + Number.EPSILON) * 100) / 100;

  const gst = useMemo(
    () => previewGst(invoiceTotal, form.gstRate, form.quantity),
    [invoiceTotal, form.gstRate, form.quantity],
  );

  const wastageItem = useMemo(
    () => stockItems.find((i) => String(i.id) === String(form.wastageItemId)) ?? null,
    [stockItems, form.wastageItemId],
  );
  // On edit the previous booking is returned to stock first, so the item's own
  // wastage does not count against the available quantity.
  const availableStock = Number(wastageItem?.quantity ?? 0);
  const wastageQuantity = Number(form.wastageQuantity) || 0;
  const wastageExceedsStock = Boolean(wastageItem) && wastageQuantity > availableStock;

  const advance = Number(form.paymentAmount) || 0;
  const outstanding = Math.max(0, gst.grand - advance);
  const canSave =
    Boolean(form.customerId || form.customerName.trim()) &&
    invoiceTotal > 0 &&
    !wastageExceedsStock &&
    !saving;

  const submit = async () => {
    setError('');
    if (advance > gst.grand) {
      setError('The amount collected cannot be more than the invoice total.');
      return;
    }
    if (wastageExceedsStock) {
      setError(`Only ${availableStock} ${wastageItem?.unit ?? 'units'} of ${wastageItem?.item_name} left in stock.`);
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await updateOrder(id, {
          categoryId: form.categoryId || null,
          productName: form.productName,
          productionType: form.productionType,
          quantity: form.quantity,
          unit: form.unit,
          size: form.size,
          priority: form.priority,
          specialInstructions: form.specialInstructions,
          hsnCode: form.hsnCode,
          gstRate: form.gstRate,
          wastageItemId: form.wastageItemId || null,
          wastageQuantity: form.wastageItemId ? wastageQuantity : 0,
          deliveryCharge,
          cuttingCharge,
          dispatchedThrough: form.dispatchedThrough,
          totalAmount: form.totalAmount,
        });
        navigate('/orders');
        return;
      }
      const created = await createOrder({
        ...form,
        wastageItemId: form.wastageItemId || undefined,
        wastageQuantity: form.wastageItemId ? wastageQuantity : undefined,
        deliveryCharge,
        cuttingCharge,
        customerId: form.customerId || undefined,
        categoryId: form.categoryId || undefined,
      });
      navigate(`/customers/${created.customer_id}`);
    } catch (err) {
      setError(err.displayMessage || 'Failed to save the order');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate('/orders')} sx={{ mb: 1 }}>
        Back to orders
      </Button>

      <PageHeader
        title={isEdit ? 'Edit order' : 'New order'}
        subtitle={
          isEdit
            ? 'The invoice number and date cannot be changed once issued'
            : 'Saving issues the tax invoice and its TMP/NNNN/YY-YY number straight away'
        }
      />

      <DataState loading={loading} error={loadError} onRetry={load}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Customer
                </Typography>

                {isEdit ? (
                  <Alert severity="info" icon={false}>
                    {selected?.company_name || selected?.name}
                    {selected?.phone ? ` · ${selected.phone}` : ''} — the customer cannot be changed after invoicing.
                  </Alert>
                ) : (
                  <>
                    <Autocomplete
                      freeSolo
                      options={options}
                      value={selected}
                      loading={searching}
                      filterOptions={(x) => x}
                      getOptionLabel={(option) =>
                        typeof option === 'string' ? option : `${option.name}${option.phone ? ` (${option.phone})` : ''}`
                      }
                      isOptionEqualToValue={(option, value) => option.id === value?.id}
                      onInputChange={(_e, value) => setCustomerInput(value)}
                      onChange={(_e, value) => {
                        if (value && typeof value !== 'string') applyCustomer(value);
                        else setForm((prev) => ({ ...prev, customerId: '', customerName: value ?? '' }));
                      }}
                      renderOption={(props, option) => (
                        <li {...props} key={option.id}>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {option.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {[option.company_name, option.phone].filter(Boolean).join(' · ')}
                            </Typography>
                          </Box>
                        </li>
                      )}
                      renderInput={(inputParams) => (
                        <TextField
                          {...inputParams}
                          label="Search existing customer, or type a new name"
                          required
                          helperText="Always search first — picking an existing customer keeps their history together."
                          InputProps={{
                            ...inputParams.InputProps,
                            endAdornment: (
                              <>
                                {searching ? <CircularProgress size={18} /> : null}
                                {inputParams.InputProps.endAdornment}
                              </>
                            ),
                          }}
                        />
                      )}
                    />

                    {form.customerId ? (
                      <Chip
                        color="success"
                        variant="outlined"
                        sx={{ mt: 1.5 }}
                        label={`Using existing customer #${form.customerId}`}
                        onDelete={() => {
                          setSelected(null);
                          setForm((prev) => ({ ...prev, ...EMPTY, categoryId: prev.categoryId, gstRate: prev.gstRate }));
                        }}
                      />
                    ) : (
                      <Grid container spacing={2} sx={{ mt: 0.5 }}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <TextField label="Phone" fullWidth value={form.customerPhone} onChange={set('customerPhone')} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <TextField label="Email" fullWidth value={form.customerEmail} onChange={set('customerEmail')} />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                          <TextField
                            label="Address"
                            fullWidth
                            multiline
                            rows={2}
                            value={form.customerAddress}
                            onChange={set('customerAddress')}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <TextField label="Company name" fullWidth value={form.companyName} onChange={set('companyName')} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <TextField label="GST number" fullWidth value={form.gstNumber} onChange={set('gstNumber')} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 8 }}>
                          <TextField select label="State" fullWidth value={form.state} onChange={setState}>
                            {INDIAN_STATES.map((s) => (
                              <MenuItem key={s.code} value={s.name}>
                                {s.name}
                              </MenuItem>
                            ))}
                          </TextField>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                          <TextField
                            label="State code"
                            fullWidth
                            value={form.stateCode}
                            slotProps={{ input: { readOnly: true } }}
                          />
                        </Grid>
                      </Grid>
                    )}
                  </>
                )}

                <Divider sx={{ my: 3 }} />

                <Typography variant="h6" gutterBottom>
                  Product
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField select label="Category" fullWidth value={form.categoryId} onChange={set('categoryId')}>
                      <MenuItem value="">None</MenuItem>
                      {categories.map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Product / description"
                      fullWidth
                      value={form.productName}
                      onChange={set('productName')}
                      helperText="Printed on the invoice. Defaults to the category name."
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField select label="Production type" fullWidth value={form.productionType} onChange={set('productionType')}>
                      {PRODUCTION_TYPES.map((o) => (
                        <MenuItem key={o.value} value={o.value}>
                          {o.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <TextField
                      label="Quantity"
                      type="number"
                      fullWidth
                      value={form.quantity}
                      onChange={set('quantity')}
                      inputProps={{ min: 1 }}
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <TextField select label="Unit" fullWidth value={form.unit} onChange={set('unit')}>
                      {UNITS.map((u) => (
                        <MenuItem key={u} value={u}>
                          {u}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    {sizeOptions.length > 0 ? (
                      <TextField
                        select
                        label="Size"
                        fullWidth
                        value={activeRate ? form.size : '__custom'}
                        onChange={(e) => {
                          const value = e.target.value;
                          setManualTotal(value === '__custom');
                          setForm((prev) => ({ ...prev, size: value === '__custom' ? '' : value }));
                        }}
                        helperText={
                          activeRate
                            ? `${formatMoney(activeRate.firstPrice)} first, then ${formatMoney(activeRate.nextPrice)} each`
                            : 'Pick a size to price the job automatically'
                        }
                      >
                        {sizeOptions.map((r) => (
                          <MenuItem key={r.id} value={r.size}>
                            {r.size}
                          </MenuItem>
                        ))}
                        <MenuItem value="__custom">Other / price manually…</MenuItem>
                      </TextField>
                    ) : (
                      <TextField
                        label="Size"
                        fullWidth
                        value={form.size}
                        onChange={set('size')}
                        helperText="No rates set up yet — add them with Print rates"
                      />
                    )}
                    {sizeOptions.length > 0 && !activeRate && (
                      <TextField label="Size" fullWidth sx={{ mt: 1 }} value={form.size} onChange={set('size')} />
                    )}
                    <Button size="small" startIcon={<TuneRoundedIcon />} onClick={() => setRatesOpen(true)} sx={{ mt: 0.5 }}>
                      Print rates
                    </Button>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField select label="Priority" fullWidth value={form.priority} onChange={set('priority')}>
                      {PRIORITIES.map((o) => (
                        <MenuItem key={o.value} value={o.value}>
                          {o.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField label="HSN / SAC" fullWidth value={form.hsnCode} onChange={set('hsnCode')} />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      label="Special instructions"
                      fullWidth
                      multiline
                      rows={2}
                      value={form.specialInstructions}
                      onChange={set('specialInstructions')}
                    />
                  </Grid>
                </Grid>

                <Divider sx={{ my: 3 }} />

                <Typography variant="h6" gutterBottom>
                  Wastage, delivery &amp; dispatch
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 5 }}>
                    <Autocomplete
                      options={stockItems}
                      value={wastageItem}
                      getOptionLabel={(option) => option.item_name ?? ''}
                      isOptionEqualToValue={(option, value) => option.id === value?.id}
                      onChange={(_e, value) =>
                        setForm((prev) => ({
                          ...prev,
                          wastageItemId: value?.id ?? '',
                          wastageQuantity: value ? prev.wastageQuantity : '',
                        }))
                      }
                      renderOption={(props, option) => (
                        <li {...props} key={option.id}>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {option.item_name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {[option.group_name, option.category_name, option.type_name].filter(Boolean).join(' › ')}
                              {` · ${option.quantity} ${option.unit ?? ''} in stock`}
                            </Typography>
                          </Box>
                        </li>
                      )}
                      renderInput={(inputParams) => (
                        <TextField
                          {...inputParams}
                          label="Wastage item"
                          helperText="Stock consumed as wastage — saving deducts it from inventory."
                        />
                      )}
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField
                      label="Wastage qty"
                      type="number"
                      fullWidth
                      disabled={!wastageItem}
                      value={form.wastageQuantity}
                      onChange={set('wastageQuantity')}
                      inputProps={{ min: 0, step: 'any' }}
                      error={wastageExceedsStock}
                      InputProps={
                        wastageItem?.unit
                          ? { endAdornment: <InputAdornment position="end">{wastageItem.unit}</InputAdornment> }
                          : undefined
                      }
                      helperText={
                        wastageItem
                          ? wastageExceedsStock
                            ? `Only ${availableStock} ${wastageItem.unit ?? 'units'} in stock`
                            : `${availableStock} ${wastageItem.unit ?? 'units'} in stock`
                          : 'Pick an item first'
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <TextField
                      label="Delivery charges"
                      type="number"
                      fullWidth
                      value={form.deliveryCharge}
                      onChange={set('deliveryCharge')}
                      inputProps={{ min: 0, step: 'any' }}
                      InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                      helperText="Added to the invoice total."
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <TextField
                      label="Cutting charges"
                      type="number"
                      fullWidth
                      value={form.cuttingCharge}
                      onChange={set('cuttingCharge')}
                      inputProps={{ min: 0, step: 'any' }}
                      InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                      helperText="Added to the invoice total."
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 8 }}>
                    <TextField
                      label="Dispatched through"
                      fullWidth
                      value={form.dispatchedThrough}
                      onChange={set('dispatchedThrough')}
                      inputProps={{ maxLength: 120 }}
                      helperText="Courier / transport / vehicle — printed on the tax invoice."
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, lg: 4 }}>
            <Card sx={{ position: { lg: 'sticky' }, top: 88 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Billing
                </Typography>
                <Stack spacing={2}>
                  <TextField
                    label="Product amount (incl. GST)"
                    type="number"
                    required
                    value={form.totalAmount}
                    onChange={setTotal}
                    InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                    helperText={
                      activeRate && !manualTotal
                        ? `${activeRate.size} × ${form.quantity}: ${formatMoney(activeRate.firstPrice)} + ${Math.max(0, Number(form.quantity) - 1)} × ${formatMoney(activeRate.nextPrice)}`
                        : 'Enter the round figure for the job; delivery and cutting are added on top.'
                    }
                  />
                  {activeRate && manualTotal && Number(form.totalAmount) !== ratedTotal && (
                    <Button size="small" onClick={() => { setManualTotal(false); setForm((p) => ({ ...p, totalAmount: String(ratedTotal) })); }}>
                      Use rate card total ({formatMoney(ratedTotal)})
                    </Button>
                  )}
                  <TextField
                    label="GST rate"
                    type="number"
                    value={form.gstRate}
                    onChange={set('gstRate')}
                    InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                  />

                  <Box sx={{ bgcolor: 'background.default', borderRadius: 2, p: 2 }}>
                    {[
                      ['Product amount', formatMoney(itemAmount)],
                      ['Delivery charges', formatMoney(deliveryCharge)],
                      ['Cutting charges', formatMoney(cuttingCharge)],
                      ['Taxable value', formatMoney(gst.taxable)],
                      [`CGST @ ${gst.halfRate}%`, formatMoney(gst.cgst)],
                      [`SGST/UTGST @ ${gst.halfRate}%`, formatMoney(gst.sgst)],
                      ['Rate per unit', formatMoney(gst.ratePerUnit)],
                    ].map(([label, value]) => (
                      <Stack key={label} direction="row" justifyContent="space-between" sx={{ py: 0.4 }}>
                        <Typography variant="body2" color="text.secondary">
                          {label}
                        </Typography>
                        <Typography variant="body2">{value}</Typography>
                      </Stack>
                    ))}
                    <Divider sx={{ my: 1 }} />
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="subtitle2">Grand total</Typography>
                      <Typography variant="subtitle2">{formatMoney(gst.grand)}</Typography>
                    </Stack>
                  </Box>

                  {!isEdit && (
                    <>
                      <Divider />
                      <Typography variant="subtitle2">Payment collected now (optional)</Typography>
                      <TextField
                        label="Amount received"
                        type="number"
                        value={form.paymentAmount}
                        onChange={set('paymentAmount')}
                        InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                      />
                      <TextField select label="Method" value={form.paymentMethod} onChange={set('paymentMethod')}>
                        {['cash', 'upi', 'bank_transfer', 'cheque', 'card', 'other'].map((m) => (
                          <MenuItem key={m} value={m}>
                            {m.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField label="Reference / UTR" value={form.referenceNo} onChange={set('referenceNo')} />
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">
                          Outstanding after this
                        </Typography>
                        <Typography variant="body2" color={outstanding > 0 ? 'warning.main' : 'success.main'} sx={{ fontWeight: 700 }}>
                          {formatMoney(outstanding)}
                        </Typography>
                      </Stack>
                    </>
                  )}

                  <Button
                    variant="contained"
                    size="large"
                    startIcon={<SaveRoundedIcon />}
                    onClick={submit}
                    disabled={!canSave}
                  >
                    {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create order & invoice'}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </DataState>

      <SizeRatesDialog
        open={ratesOpen}
        onClose={() => setRatesOpen(false)}
        onSaved={(rates) => setSizeRates(rates ?? [])}
      />
    </>
  );
}
