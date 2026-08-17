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
    /** Text color for secondary/muted content */
    textSecondary: string;
    /** Card/surface background */
    surface: string;
    /** Border/separator color */
    divider: string;
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
