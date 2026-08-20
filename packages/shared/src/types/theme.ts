export interface ThemeConfig {
  businessName: string;
  logo: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    success: string;
    warning: string;
    error: string;
    aguardando: string;
    preparando: string;
    pronto: string;
    /** Order status: entregue (delivered) */
    entregue: string;
    /** Text color for secondary/muted content */
    textSecondary: string;
    /** Card/surface background */
    surface: string;
    /** Thin separator/divider line (e.g. list separators, drawer divider) */
    divider: string;
    /** Default outline/border for inputs, cards, chips and other bordered controls */
    border: string;
    /** Background of disabled controls (buttons, toggles, inputs) */
    surfaceDisabled: string;
    /** Text/icon color for disabled or inactive content */
    textDisabled: string;
    /** Financial: received amount — dark green */
    received: string;
    /** Financial: pending amount — dark red */
    pending: string;
    /** Financial: revenue/faturamento — amber */
    revenue: string;
    /** Sub-card tinted background: primary tint */
    surfacePrimary: string;
    /** Sub-card tinted background: revenue/amber tint */
    surfaceRevenue: string;
    /** Sub-card tinted background: received/green tint */
    surfaceReceived: string;
    /** Sub-card tinted background: pending/red tint */
    surfacePending: string;
  };
  typography: {
    fontFamily: string;
    sizes: {
      xs: number;
      sm: number;
      md: number;
      lg: number;
      xl: number;
      xxl: number;
    };
    weights: {
      regular: number;
      medium: number;
      bold: number;
    };
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  borderRadius: {
    sm: number;
    md: number;
    lg: number;
    full: number;
  };
}
