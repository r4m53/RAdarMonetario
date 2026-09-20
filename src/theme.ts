import { alpha, createTheme } from "@mui/material/styles";

export const colors = {
  canvas: "#101820", surface: "#17222D", surfaceRaised: "#1D2A36", surfaceMuted: "#131E28",
  border: "#2B3945", borderStrong: "#3A4A57", text: "#F2F0EA", textMuted: "#AAB5BF",
  orange: "#F28C28", copper: "#D8893A", steel: "#6688A3", sage: "#739A83", terracotta: "#A85F52",
} as const;
export const orange = colors.orange;
export const chartColors = [colors.copper, colors.steel, colors.sage, colors.terracotta, "#A18AC2", "#D1AF62", "#6F9FA2", "#C47A89"];
export const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: colors.orange, light: "#F5A451", dark: "#C96C12", contrastText: colors.canvas },
    background: { default: colors.canvas, paper: colors.surface },
    text: { primary: colors.text, secondary: colors.textMuted },
    success: { main: colors.sage }, info: { main: colors.steel }, warning: { main: colors.copper }, error: { main: colors.terracotta },
    divider: colors.border,
  },
  typography: {
    fontFamily: '"IBM Plex Sans", Inter, system-ui, sans-serif',
    h1: { fontWeight: 720, letterSpacing: "-0.035em" },
    h2: { fontWeight: 700, letterSpacing: "-0.03em" },
    h3: { fontWeight: 680, letterSpacing: "-0.025em" },
    h4: { fontWeight: 670, letterSpacing: "-0.02em" },
    h5: { fontWeight: 650, letterSpacing: "-0.012em" },
    overline: { fontWeight: 750, letterSpacing: ".13em" },
    button: { fontWeight: 700, letterSpacing: ".02em" },
  },
  shape: { borderRadius: 7 },
  components: {
    MuiCssBaseline: { styleOverrides: { body: { backgroundColor: colors.canvas } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none", border: `1px solid ${colors.border}`, boxShadow: "0 12px 34px rgba(3, 10, 15, .16)" } } },
    MuiAppBar: { styleOverrides: { root: { backgroundColor: alpha(colors.canvas, .9), backgroundImage: "none", borderBottom: `1px solid ${colors.border}` } } },
    MuiButton: { styleOverrides: { root: { textTransform: "none", borderRadius: 6 }, containedPrimary: { boxShadow: "none" } } },
    MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: "3px 3px 0 0" } } },
    MuiTab: { styleOverrides: { root: { textTransform: "none", fontWeight: 650 } } },
    MuiTableCell: { styleOverrides: { root: { borderColor: colors.border, fontVariantNumeric: "tabular-nums" }, head: { color: colors.textMuted, backgroundColor: colors.surfaceMuted, fontWeight: 700 } } },
    MuiOutlinedInput: { styleOverrides: { notchedOutline: { borderColor: colors.borderStrong }, root: { backgroundColor: alpha(colors.canvas, .28) } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 6 } } },
    MuiDrawer: { styleOverrides: { paper: { backgroundColor: colors.surface, backgroundImage: "none", borderColor: colors.border } } },
  },
});
