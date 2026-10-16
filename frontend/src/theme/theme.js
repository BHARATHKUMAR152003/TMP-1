import { createTheme, alpha } from '@mui/material/styles';

/** Deep press-ink used for the app chrome (top bar, sidebar, login brand panel). */
export const INK = '#111a2e';
export const INK_LIGHT = '#1b2742';
/** Warm "paper stock" page background. */
export const PAPER = '#f5f3ee';

/** Process colours — used sparingly as a printer's registration strip. */
export const CMYK = {
  cyan: '#00a3e0',
  magenta: '#e6007e',
  yellow: '#ffd100',
  key: '#231f20',
};
export const CMYK_STRIPE = `linear-gradient(90deg, ${CMYK.cyan} 0 25%, ${CMYK.magenta} 25% 50%, ${CMYK.yellow} 50% 75%, ${CMYK.key} 75% 100%)`;

const TEXT_PRIMARY = '#1c2433';
const TEXT_SECONDARY = '#5e6778';
const BORDER = '#e4e0d8';

/**
 * Light "ink on paper" theme keyed on a role accent colour. Surfaces, type and
 * chrome stay constant so every role feels like the same product.
 */
export function buildTheme(accent = '#1d4ed8') {
  return createTheme({
    palette: {
      mode: 'light',
      primary: { main: accent },
      secondary: { main: CMYK.magenta },
      background: {
        default: PAPER,
        paper: '#ffffff',
      },
      text: {
        primary: TEXT_PRIMARY,
        secondary: TEXT_SECONDARY,
      },
      divider: BORDER,
      success: { main: '#15803d' },
      warning: { main: '#d97706' },
      error: { main: '#dc2626' },
      info: { main: '#0284c7' },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      h3: { fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontWeight: 800, letterSpacing: '-0.03em' },
      h4: { fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontWeight: 800, letterSpacing: '-0.02em' },
      h5: { fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontWeight: 700, letterSpacing: '-0.01em' },
      h6: { fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontWeight: 700 },
      subtitle1: { fontWeight: 600 },
      subtitle2: { fontWeight: 600 },
      button: { fontWeight: 600, textTransform: 'none', letterSpacing: '0.01em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: PAPER },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
          outlined: { borderColor: BORDER },
          elevation0: { border: `1px solid ${BORDER}` },
          elevation1: {
            border: `1px solid ${BORDER}`,
            boxShadow: '0 1px 2px rgba(17, 26, 46, 0.04), 0 4px 12px rgba(17, 26, 46, 0.04)',
          },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            border: `1px solid ${BORDER}`,
            boxShadow: '0 1px 2px rgba(17, 26, 46, 0.04), 0 6px 16px rgba(17, 26, 46, 0.05)',
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 8, paddingInline: 16 },
          containedPrimary: {
            boxShadow: `0 2px 8px ${alpha(accent, 0.25)}`,
            '&:hover': { boxShadow: `0 4px 14px ${alpha(accent, 0.35)}` },
          },
          outlined: { borderColor: BORDER },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: 'none', backgroundColor: INK, color: '#ffffff' },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: { backgroundColor: INK, color: '#ffffff', borderRight: 'none' },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: '#ffffff',
            '& .MuiOutlinedInput-notchedOutline': { borderColor: '#d6d1c6' },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#a8a295' },
          },
        },
      },
      MuiTableContainer: {
        styleOverrides: {
          root: { borderRadius: 10 },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderBottomColor: BORDER },
          head: {
            fontWeight: 700,
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: TEXT_SECONDARY,
            backgroundColor: '#faf8f4',
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&.MuiTableRow-hover:hover': { backgroundColor: alpha(accent, 0.04) },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 600, borderRadius: 6 },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 14 },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: { fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontWeight: 700 },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 600 },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { backgroundColor: INK, fontSize: 12 },
        },
      },
    },
  });
}
