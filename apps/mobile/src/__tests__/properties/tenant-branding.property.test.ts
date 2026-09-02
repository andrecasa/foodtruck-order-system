import * as fc from 'fast-check';
import type { ThemeConfig, TenantBrandingResponse } from '@order-system/shared';
import {
  defaultTheme,
  deepMergeTheme,
  applyBranding,
  fetchTenantTheme,
} from '../../theme/theme.config';

/**
 * Feature: multi-tenant-white-label — Correctness Property 9 (mobile).
 *
 * "Fallback de branding seguro": if fetching the tenant branding fails (network
 * error, non-2xx, malformed body, or timeout), the applied theme is EXACTLY the
 * neutral platform theme and the app remains usable.
 *
 * These tests exercise the mobile `fetchTenantTheme` resolver and the
 * `applyBranding` merge helper.
 *
 * **Validates: Requirements 7.8, 11.7**
 */

const TOKEN = 'mobile-test-token';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Arbitrary for a small partial theme override (colors only, to keep it focused). */
const partialThemeArb: fc.Arbitrary<Partial<ThemeConfig>> = fc.record(
  {
    colors: fc.record(
      {
        primary: fc.constantFrom('#111111', '#abcdef', '#0a0a0a'),
        secondary: fc.constantFrom('#222222', '#fedcba'),
      },
      { requiredKeys: [] },
    ),
  },
  { requiredKeys: [] },
) as fc.Arbitrary<Partial<ThemeConfig>>;

const brandingArb: fc.Arbitrary<TenantBrandingResponse> = fc.record({
  tenantId: fc.uuid(),
  businessName: fc.string({ minLength: 1, maxLength: 40 }),
  logoUrl: fc.option(fc.webUrl(), { nil: null }),
  slug: fc.option(fc.string({ minLength: 1, maxLength: 40 }), { nil: null }),
  theme: partialThemeArb,
});

describe('Property 9 (mobile): neutral fallback on branding failure', () => {
  it('returns exactly the neutral platform theme when there is no token', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        const theme = await fetchTenantTheme(async () => null);
        expect(theme).toEqual(defaultTheme);
      }),
      { numRuns: 20 },
    );
  });

  it('returns exactly the neutral platform theme on a non-2xx response', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 400, max: 599 }), async (status) => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({}, false, status));
        (globalThis as any).fetch = fetchImpl;

        const theme = await fetchTenantTheme(async () => TOKEN);
        expect(theme).toEqual(defaultTheme);
      }),
      { numRuns: 30 },
    );
  });

  it('returns exactly the neutral platform theme on a network error', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('network down'));
    (globalThis as any).fetch = fetchImpl;

    const theme = await fetchTenantTheme(async () => TOKEN);
    expect(theme).toEqual(defaultTheme);
  });

  it('returns exactly the neutral platform theme on a malformed body', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('invalid json');
      },
    } as unknown as Response);
    (globalThis as any).fetch = fetchImpl;

    const theme = await fetchTenantTheme(async () => TOKEN);
    expect(theme).toEqual(defaultTheme);
  });

  it('returns exactly the neutral platform theme when the request times out', async () => {
    // fetch that respects the AbortSignal: rejects when aborted.
    const fetchImpl = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init.signal;
          if (signal) {
            signal.addEventListener('abort', () => reject(new Error('aborted')));
          }
        }),
    );
    (globalThis as any).fetch = fetchImpl;

    const theme = await fetchTenantTheme(async () => TOKEN, 10);
    expect(theme).toEqual(defaultTheme);
  });
});

describe('Property 9 (mobile): tenant theme application on success', () => {
  it('applies the tenant branding merged over the neutral base for any valid branding', async () => {
    await fc.assert(
      fc.asyncProperty(brandingArb, async (branding) => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(branding));
        (globalThis as any).fetch = fetchImpl;

        const theme = await fetchTenantTheme(async () => TOKEN);
        const expected = applyBranding(branding);

        expect(theme).toEqual(expected);
      }),
      { numRuns: 50 },
    );
  });

  it('applyBranding never drops a neutral token that the tenant did not override', () => {
    fc.assert(
      fc.property(brandingArb, (branding) => {
        const merged = applyBranding(branding);
        // Any color the tenant did not provide must equal the neutral base.
        const overriddenColors = branding.theme?.colors ?? {};
        for (const key of Object.keys(defaultTheme.colors) as Array<keyof ThemeConfig['colors']>) {
          if (!(key in overriddenColors)) {
            expect(merged.colors[key]).toBe(defaultTheme.colors[key]);
          }
        }
        // Structural tokens always present.
        expect(merged.typography).toEqual(defaultTheme.typography);
        expect(merged.spacing).toEqual(defaultTheme.spacing);
        expect(merged.borderRadius).toEqual(defaultTheme.borderRadius);
      }),
      { numRuns: 50 },
    );
  });

  it('applyBranding folds businessName and logo from the tenant, falling back to neutral', () => {
    // Explicit example: tenant provides both.
    const withBoth = applyBranding({
      tenantId: '11111111-1111-4111-8111-111111111111',
      businessName: 'Loja X',
      logoUrl: 'https://cdn/x.png',
      slug: 'loja-x',
      theme: {},
    });
    expect(withBoth.businessName).toBe('Loja X');
    expect(withBoth.logo).toBe('https://cdn/x.png');
    expect(withBoth.slug).toBe('loja-x');

    // Tenant provides neither → neutral platform defaults.
    const withNeither = applyBranding({ tenantId: '11111111-1111-4111-8111-111111111111', businessName: '', logoUrl: null, slug: null, theme: {} });
    expect(withNeither.businessName).toBe(defaultTheme.businessName);
    expect(withNeither.logo).toBe(defaultTheme.logo);
    expect(withNeither.slug).toBeUndefined();
  });
});

describe('neutral default theme carries no tenant branding (R11.1)', () => {
  it('has a generic platform businessName and no burgundy brand color', () => {
    expect(defaultTheme.businessName).not.toMatch(/pastel/i);
    expect(defaultTheme.logo).toBe('');
    expect(defaultTheme.colors.primary.toLowerCase()).not.toBe('#7b2d2d');
  });

  it('deepMergeTheme is a no-op for an empty override', () => {
    expect(deepMergeTheme(defaultTheme, {})).toEqual(defaultTheme);
  });
});
