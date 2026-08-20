import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ThemeConfig } from '@order-system/shared';
import { defaultTheme, deepMergeTheme, fetchTenantBranding } from '../theme/theme.config';

/**
 * Web-specific coverage for per-tenant branding application and the neutral
 * platform fallback.
 *
 * Validates: Requirements 7.2, 7.3, 7.8, 11.2, 11.3, 11.5, 11.6, 11.7
 */

const API_URL = 'http://localhost:4000';
const TOKEN = 'test-token';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('neutral default theme (R11.2, R11.3)', () => {
  it('carries a generic platform businessName without any tenant brand', () => {
    expect(defaultTheme.businessName).toBe('Food Truck App');
    // No leftover tenant branding.
    expect(defaultTheme.businessName).not.toMatch(/pastel/i);
    expect(defaultTheme.logo).toBe('');
    // Neutral (non-burgundy) primary.
    expect(defaultTheme.colors.primary.toLowerCase()).not.toBe('#7b2d2d');
  });
});

describe('fetchTenantBranding — success (R7.2, R7.3, R11.3)', () => {
  it('merges the tenant theme override over the neutral base', async () => {
    const override: Partial<ThemeConfig> = {
      colors: { primary: '#123456' } as ThemeConfig['colors'],
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ businessName: 'Loja X', logoUrl: 'https://cdn/x.png', theme: override }),
      );

    const theme = await fetchTenantBranding(TOKEN, { apiUrl: API_URL, fetchImpl });

    // Overridden token wins.
    expect(theme.colors.primary).toBe('#123456');
    // Non-overridden tokens fall back to neutral (R11.5).
    expect(theme.colors.secondary).toBe(defaultTheme.colors.secondary);
    // businessName/logo folded in from the tenant branding.
    expect(theme.businessName).toBe('Loja X');
    expect(theme.logo).toBe('https://cdn/x.png');
  });

  it('sends the bearer token to the branding endpoint', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ businessName: 'Loja X', logoUrl: null, theme: {} }));

    await fetchTenantBranding(TOKEN, { apiUrl: API_URL, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe(`${API_URL}/api/tenant/branding`);
    expect(call[1].headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
    });
  });

  it('keeps the neutral businessName/logo when the tenant provides none', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ businessName: '', logoUrl: null, theme: {} }));

    const theme = await fetchTenantBranding(TOKEN, { apiUrl: API_URL, fetchImpl });

    expect(theme.businessName).toBe(defaultTheme.businessName);
    expect(theme.logo).toBe(defaultTheme.logo);
  });
});

describe('fetchTenantBranding — neutral fallback (R7.8, R11.7)', () => {
  it('returns the neutral theme on a non-2xx response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));

    const theme = await fetchTenantBranding(TOKEN, { apiUrl: API_URL, fetchImpl });

    expect(theme).toEqual(defaultTheme);
  });

  it('returns the neutral theme on a network error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));

    const theme = await fetchTenantBranding(TOKEN, { apiUrl: API_URL, fetchImpl });

    expect(theme).toEqual(defaultTheme);
  });

  it('returns the neutral theme on a malformed body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('invalid json');
      },
    } as unknown as Response);

    const theme = await fetchTenantBranding(TOKEN, { apiUrl: API_URL, fetchImpl });

    expect(theme).toEqual(defaultTheme);
  });

  it('returns the neutral theme when the request exceeds the timeout', async () => {
    // fetch that respects the AbortSignal: rejects when aborted.
    const fetchImpl = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init.signal;
          if (signal) {
            signal.addEventListener('abort', () => reject(new Error('aborted')));
          }
        }),
    );

    const theme = await fetchTenantBranding(TOKEN, {
      apiUrl: API_URL,
      fetchImpl,
      timeoutMs: 10,
    });

    expect(theme).toEqual(defaultTheme);
  });
});

describe('deepMergeTheme over neutral base', () => {
  it('is a no-op for an empty override', () => {
    expect(deepMergeTheme(defaultTheme, {})).toEqual(defaultTheme);
  });
});
