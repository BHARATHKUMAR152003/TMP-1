import { Stack, TextField, MenuItem, ToggleButton, ToggleButtonGroup, Box } from '@mui/material';
import { DATE_PRESETS, resolvePreset } from '../../utils/dateRange.js';

const QUICK = DATE_PRESETS.filter((p) => p.value !== 'custom');

/**
 * Shared date filter. Instead of making the user pick two dates every time, it
 * offers the periods they actually ask for — today, this week, this month, this
 * financial year — and only reveals From/To when "Custom range" is chosen.
 *
 * `value` is `{ preset, from, to }`; pages read `from`/`to` for the API call.
 */
export default function DateRangeFilter({ value, onChange, variant = 'chips', size = 'small' }) {
  const setPreset = (preset) => {
    if (!preset) return;
    onChange({ preset, ...resolvePreset(preset, value) });
  };

  const setDate = (key) => (e) => onChange({ ...value, preset: 'custom', [key]: e.target.value });

  const isCustom = value.preset === 'custom';

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} flexWrap="wrap" useFlexGap>
      {variant === 'select' ? (
        <TextField
          select
          size={size}
          label="Period"
          sx={{ minWidth: 190 }}
          value={value.preset}
          onChange={(e) => setPreset(e.target.value)}
        >
          {DATE_PRESETS.map((p) => (
            <MenuItem key={p.value} value={p.value}>
              {p.label}
            </MenuItem>
          ))}
        </TextField>
      ) : (
        <ToggleButtonGroup
          exclusive
          size={size}
          value={value.preset}
          onChange={(_e, next) => setPreset(next)}
          sx={{ flexWrap: 'wrap' }}
        >
          {QUICK.map((p) => (
            <ToggleButton key={p.value} value={p.value} sx={{ textTransform: 'none', px: 1.5 }}>
              {p.label}
            </ToggleButton>
          ))}
          <ToggleButton value="custom" sx={{ textTransform: 'none', px: 1.5 }}>
            Custom
          </ToggleButton>
        </ToggleButtonGroup>
      )}

      {isCustom && (
        <Box component={Stack} direction="row" spacing={1.5}>
          <TextField
            type="date"
            size={size}
            label="From"
            value={value.from ?? ''}
            onChange={setDate('from')}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            type="date"
            size={size}
            label="To"
            value={value.to ?? ''}
            onChange={setDate('to')}
            InputLabelProps={{ shrink: true }}
          />
        </Box>
      )}
    </Stack>
  );
}
