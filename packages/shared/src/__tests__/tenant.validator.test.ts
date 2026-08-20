import { describe, it, expect } from 'vitest';
import {
  themeConfigPartialSchema,
  tenantSchema,
  tenantBrandingResponseSchema,
} from '../validators/tenant.validator';

const validUuid = '550e8400-e29b-41d4-a716-446655440000';

// ─── Tenant ───────────────────────────────────────────────────────────────

describe('tenantSchema', () => {
  const validTenant = {
    id: validUuid,
    businessName: 'Pastel das Meninas',
    logoUrl: 'https://cdn.example.com/logo.png',
    theme: { colors: { primary: '#ff0000' } },
    timezone: 'America/Sao_Paulo',
    status: 'ativo' as const,
  };

  it('accepts a valid tenant', () => {
    expect(tenantSchema.safeParse(validTenant).success).toBe(true);
  });

  it('accepts null logoUrl and null theme', () => {
    const result = tenantSchema.safeParse({ ...validTenant, logoUrl: null, theme: null });
    expect(result.success).toBe(true);
  });

  it('rejects non-uuid id', () => {
    expect(tenantSchema.safeParse({ ...validTenant, id: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects empty businessName', () => {
    expect(tenantSchema.safeParse({ ...validTenant, businessName: '' }).success).toBe(false);
  });

  it('rejects businessName over 120 chars', () => {
    expect(tenantSchema.safeParse({ ...validTenant, businessName: 'a'.repeat(121) }).success).toBe(false);
  });

  it('rejects empty timezone', () => {
    expect(tenantSchema.safeParse({ ...validTenant, timezone: '' }).success).toBe(false);
  });

  it('accepts both valid statuses', () => {
    expect(tenantSchema.safeParse({ ...validTenant, status: 'ativo' }).success).toBe(true);
    expect(tenantSchema.safeParse({ ...validTenant, status: 'inativo' }).success).toBe(true);
  });

  it('rejects invalid status', () => {
    expect(tenantSchema.safeParse({ ...validTenant, status: 'suspenso' }).success).toBe(false);
  });
});

// ─── Theme (Partial<ThemeConfig>) ───────────────────────────────────────────

describe('themeConfigPartialSchema', () => {
  it('accepts an empty object (fully partial)', () => {
    expect(themeConfigPartialSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a partial theme with only some color tokens', () => {
    const result = themeConfigPartialSchema.safeParse({
      colors: { primary: '#123456', surface: '#ffffff' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts nested partial typography and spacing', () => {
    const result = themeConfigPartialSchema.safeParse({
      typography: { sizes: { md: 16 } },
      spacing: { sm: 8 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects wrong types for tokens', () => {
    expect(themeConfigPartialSchema.safeParse({ colors: { primary: 123 } }).success).toBe(false);
    expect(themeConfigPartialSchema.safeParse({ spacing: { sm: 'big' } }).success).toBe(false);
  });
});

// ─── TenantBrandingResponse ─────────────────────────────────────────────────

describe('tenantBrandingResponseSchema', () => {
  const validBranding = {
    tenantId: '11111111-1111-4111-8111-111111111111',
    businessName: 'Pastel das Meninas',
    logoUrl: 'https://cdn.example.com/logo.png',
    theme: { colors: { primary: '#ff0000' } },
  };

  it('accepts a valid branding response', () => {
    expect(tenantBrandingResponseSchema.safeParse(validBranding).success).toBe(true);
  });

  it('rejects missing tenantId', () => {
    const { tenantId, ...rest } = validBranding;
    expect(tenantBrandingResponseSchema.safeParse(rest).success).toBe(false);
  });

  it('accepts null logoUrl', () => {
    expect(tenantBrandingResponseSchema.safeParse({ ...validBranding, logoUrl: null }).success).toBe(true);
  });

  it('accepts an empty theme object', () => {
    expect(tenantBrandingResponseSchema.safeParse({ ...validBranding, theme: {} }).success).toBe(true);
  });

  it('rejects null theme (branding theme is not nullable)', () => {
    expect(tenantBrandingResponseSchema.safeParse({ ...validBranding, theme: null }).success).toBe(false);
  });

  it('rejects missing businessName', () => {
    const { businessName, ...rest } = validBranding;
    expect(tenantBrandingResponseSchema.safeParse(rest).success).toBe(false);
  });
});
