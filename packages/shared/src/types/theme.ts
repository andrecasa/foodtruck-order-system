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
    /** Text color for secondary/muted content. Defaults to #8B6B5A */
    textSecondary?: string;
    /** Card/surface background. Defaults to #FFFFFF */
    surface?: string;
    /** Border/separator color. Defaults to #E8DDD5 */
    divider?: string;
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
