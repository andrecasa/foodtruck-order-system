import { z } from 'zod';

// ─── Theme ────────────────────────────────────────────────────────────────
// A tenant's `theme` is a partial override of the full ThemeConfig, applied on
// top of the neutral platform theme. Every group of tokens is optional and,
// where present, its members are optional too (deep partial).

const themeColorsSchema = z
  .object({
    primary: z.string(),
    secondary: z.string(),
    background: z.string(),
    text: z.string(),
    success: z.string(),
    warning: z.string(),
    error: z.string(),
    aguardando: z.string(),
    preparando: z.string(),
    pronto: z.string(),
    entregue: z.string(),
    textSecondary: z.string(),
    surface: z.string(),
    divider: z.string(),
    received: z.string(),
    pending: z.string(),
    revenue: z.string(),
    surfacePrimary: z.string(),
    surfaceRevenue: z.string(),
    surfaceReceived: z.string(),
    surfacePending: z.string(),
  })
  .partial();

const themeTypographySchema = z
  .object({
    fontFamily: z.string(),
    sizes: z
      .object({
        xs: z.number(),
        sm: z.number(),
        md: z.number(),
        lg: z.number(),
        xl: z.number(),
        xxl: z.number(),
      })
      .partial(),
    weights: z
      .object({
        regular: z.number(),
        medium: z.number(),
        bold: z.number(),
      })
      .partial(),
  })
  .partial();

const themeSpacingSchema = z
  .object({
    xs: z.number(),
    sm: z.number(),
    md: z.number(),
    lg: z.number(),
    xl: z.number(),
  })
  .partial();

const themeBorderRadiusSchema = z
  .object({
    sm: z.number(),
    md: z.number(),
    lg: z.number(),
    full: z.number(),
  })
  .partial();

/** Zod schema for `Partial<ThemeConfig>` (deep partial override). */
export const themeConfigPartialSchema = z
  .object({
    businessName: z.string(),
    logo: z.string(),
    colors: themeColorsSchema,
    typography: themeTypographySchema,
    spacing: themeSpacingSchema,
    borderRadius: themeBorderRadiusSchema,
  })
  .partial();

// ─── Tenant ─────────────────────────────────────────────────────────────────

/** Zod schema for the Tenant data model. */
export const tenantSchema = z.object({
  id: z.string().uuid(),
  businessName: z.string().min(1, 'Nome do negócio é obrigatório').max(120, 'Nome do negócio deve ter entre 1 e 120 caracteres'),
  logoUrl: z.string().nullable(),
  theme: themeConfigPartialSchema.nullable(),
  timezone: z.string().min(1, 'Fuso horário é obrigatório'),
  status: z.enum(['ativo', 'inativo']),
});

/** Zod schema for the branding response returned after login. */
export const tenantBrandingResponseSchema = z.object({
  // Resolved tenant id — used by the front-end to scope realtime channels
  // to its own tenant (R12.7, R12.9).
  tenantId: z.string().uuid(),
  businessName: z.string().min(1).max(120),
  logoUrl: z.string().nullable(),
  theme: themeConfigPartialSchema,
});
