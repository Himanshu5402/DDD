import { createTheme } from '@mui/material/styles';

/**
 * ITSYBIZZ design system — minimalist light.
 *
 * Principles: white surfaces on a barely-gray canvas, hairline borders instead
 * of shadows, generous whitespace, color used sparingly (small dots, chips and
 * numbers — never big blocks). Component overrides here do the heavy lifting
 * so pages stay clean.
 */

const BORDER = '#ECEFF4';
const CANVAS = '#F7F8FA';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#4F46E5', dark: '#4338CA', light: '#6366F1' },
    secondary: { main: '#0EA5E9' },
    background: { default: CANVAS, paper: '#FFFFFF' },
    divider: BORDER,
    text: { primary: '#111827', secondary: '#6B7280', disabled: '#9CA3AF' },
    success: { main: '#059669' },
    warning: { main: '#D97706' },
    error: { main: '#DC2626' },
    info: { main: '#0284C7' },
    action: { hover: '#F5F7FA' },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontWeight: 700, letterSpacing: '-0.02em' },
    h6: { fontWeight: 700, letterSpacing: '-0.01em' },
    subtitle2: { fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 600 },
    overline: { fontWeight: 700, letterSpacing: '0.08em' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: { body: { backgroundColor: CANVAS } },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { backgroundImage: 'none' } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10, paddingLeft: 16, paddingRight: 16 },
      },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 8, fontWeight: 600 } },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: '#F1F4F8', padding: '13px 16px' },
        head: {
          color: '#6B7280',
          fontWeight: 700,
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          backgroundColor: 'transparent',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          border: `1px solid ${BORDER}`,
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.14)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: { paper: { borderRadius: 0 } },
    },
    MuiLinearProgress: {
      styleOverrides: { root: { borderRadius: 99, backgroundColor: '#EEF1F5' } },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          border: `1px solid ${BORDER}`,
          boxShadow: '0 12px 32px rgba(15, 23, 42, 0.10)',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: '#111827', borderRadius: 8, fontSize: 12 },
      },
    },
    MuiTabs: {
      styleOverrides: { root: { minHeight: 44 } },
    },
    MuiTab: {
      styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44 } },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 10, backgroundColor: '#FFFFFF' },
        notchedOutline: { borderColor: BORDER },
      },
    },
    MuiListSubheader: {
      styleOverrides: {
        root: {
          fontWeight: 700,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: '#9CA3AF',
        },
      },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 12 } },
    },
  },
});

export default theme;
