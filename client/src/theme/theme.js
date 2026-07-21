import { createTheme } from "@mui/material/styles";

/**
 * ITSYBIZZ design system — modern, clean light theme.
 *
 * Principles: glassmorphism, gradients, smooth animations, subtle shadows,
 * generous whitespace, soft colors, modern typography.
 */

const BORDER = "#E5E7EB";
const CANVAS = "#F8F9FC";
const GLASS_LIGHT = "rgba(255, 255, 255, 0.7)";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#4F46E5",
      dark: "#4338CA",
      light: "#6366F1",
      50: "#F5F3FF",
      100: "#EDE9FE",
      200: "#DDD6FE",
      300: "#C4B5FD",
      400: "#A78BFA",
      500: "#8B5CF6",
      600: "#7C3AED",
      700: "#6D28D9",
    },
    secondary: {
      main: "#0EA5E9",
      dark: "#0284C7",
      light: "#06B6D4",
    },
    background: { default: CANVAS, paper: "#FFFFFF" },
    divider: BORDER,
    text: {
      primary: "#111827",
      secondary: "#6B7280",
      disabled: "#9CA3AF",
    },
    success: { main: "#10B981", light: "#6EE7B7" },
    warning: { main: "#F59E0B", light: "#FCD34D" },
    error: { main: "#EF4444", light: "#FCA5A5" },
    info: { main: "#3B82F6", light: "#93C5FD" },
    action: { hover: "#F3F4F6", disabled: "#E5E7EB" },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily:
      "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    h3: { fontWeight: 800, letterSpacing: "-0.02em" },
    h4: { fontWeight: 800, letterSpacing: "-0.02em" },
    h5: { fontWeight: 800, letterSpacing: "-0.02em" },
    h6: { fontWeight: 700, letterSpacing: "-0.01em" },
    subtitle1: { fontWeight: 700, letterSpacing: "-0.01em" },
    subtitle2: { fontWeight: 700 },
    body1: { fontWeight: 500 },
    body2: { fontWeight: 500 },
    button: { textTransform: "none", fontWeight: 600, letterSpacing: "0.01em" },
    caption: { fontWeight: 600, letterSpacing: "0.02em" },
    overline: { fontWeight: 700, letterSpacing: "0.08em" },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: CANVAS,
          backgroundImage:
            "radial-gradient(at 20% 80%, rgba(79, 70, 229, 0.05) 0px, transparent 50%),\
                             radial-gradient(at 80% 20%, rgba(14, 165, 233, 0.05) 0px, transparent 50%)",
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: "none",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 10,
          paddingLeft: 16,
          paddingRight: 16,
          fontWeight: 600,
          transition: "all 0.2s ease",
          textTransform: "none",
        },
        contained: {
          backgroundImage: "linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)",
          "&:hover": {
            backgroundImage:
              "linear-gradient(135deg, #4338CA 0%, #4F46E5 100%)",
            transform: "translateY(-2px)",
            boxShadow: "0 8px 24px rgba(79, 70, 229, 0.3)",
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 600 },
        filled: {
          backgroundImage:
            "linear-gradient(135deg, rgba(79, 70, 229, 0.1) 0%, rgba(99, 102, 241, 0.05) 100%)",
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: "#F3F4F6", padding: "13px 16px" },
        head: {
          color: "#6B7280",
          fontWeight: 700,
          fontSize: "0.72rem",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          backgroundColor: "transparent",
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          border: `1px solid ${BORDER}`,
          boxShadow: "0 24px 64px rgba(15, 23, 42, 0.12)",
          backgroundImage: `linear-gradient(135deg, ${GLASS_LIGHT} 0%, rgba(249, 250, 251, 0.5) 100%)`,
          backdropFilter: "blur(10px)",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: { paper: { borderRadius: 0, backgroundImage: "none" } },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 99,
          backgroundColor: "#EEF1F5",
          backgroundImage: "linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%)",
        },
        bar: {
          backgroundImage: "linear-gradient(135deg, #4F46E5 0%, #0EA5E9 100%)",
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          border: `1px solid ${BORDER}`,
          boxShadow: "0 12px 32px rgba(15, 23, 42, 0.10)",
          backgroundImage: `linear-gradient(135deg, ${GLASS_LIGHT} 0%, rgba(249, 250, 251, 0.5) 100%)`,
          backdropFilter: "blur(8px)",
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: "#111827",
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
        },
      },
    },
    MuiTabs: {
      styleOverrides: { root: { minHeight: 44 } },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          minHeight: 44,
          transition: "all 0.2s ease",
          "&.Mui-selected": {
            backgroundImage:
              "linear-gradient(135deg, rgba(79, 70, 229, 0.05) 0%, rgba(99, 102, 241, 0.05) 100%)",
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: "#FFFFFF",
          transition: "all 0.2s ease",
          "&:hover": {
            borderColor: "#4F46E5",
          },
          "&.Mui-focused": {
            borderColor: "#4F46E5",
            boxShadow: "0 0 0 3px rgba(79, 70, 229, 0.1)",
          },
        },
        notchedOutline: { borderColor: BORDER },
      },
    },
    MuiListSubheader: {
      styleOverrides: {
        root: {
          fontWeight: 700,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "#9CA3AF",
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          borderWidth: 1,
          borderStyle: "solid",
        },
        standardSuccess: {
          backgroundImage:
            "linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(110, 231, 183, 0.05) 100%)",
        },
        standardError: {
          backgroundImage:
            "linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(252, 165, 165, 0.05) 100%)",
        },
        standardWarning: {
          backgroundImage:
            "linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, rgba(252, 211, 77, 0.05) 100%)",
        },
        standardInfo: {
          backgroundImage:
            "linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(147, 197, 253, 0.05) 100%)",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        },
      },
    },
  },
});

export default theme;
