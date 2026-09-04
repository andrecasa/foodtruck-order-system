import React from 'react';
import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { AuthProvider } from '../../hooks/useAuth';

// ─── Mocks ──────────────────────────────────────────────────────────────────
//
// This is a focused regression test for the auth gate (Portao_Autenticacao) in
// `useAuth.tsx`. The gate auto-redirects any route whose first segment is not in
// PUBLIC_GROUPS to `/login` when there is no authenticated session. The
// password-recovery routes (`forgot-password`, `reset-password`) must be
// treated as public and must NOT be bounced back to `/login` (R1.3, R1.5).
//
// Unlike the screen tests, we render the REAL AuthProvider so the actual
// redirect effect runs. Only the leaf dependencies are mocked.

const mockReplace = jest.fn();
const mockPush = jest.fn();

// `useSegments` is overridden per-test to simulate the current route.
// Prefixed with `mock` so jest.mock's factory is allowed to reference it.
let mockSegments: string[] = [];

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    back: jest.fn(),
  }),
  useSegments: () => mockSegments,
}));

// Token storage resolves to an UNAUTHENTICATED session: no token stored.
jest.mock('../../services/token-storage', () => ({
  tokenStorage: {
    isAuthenticated: jest.fn().mockResolvedValue(false),
    getAccessToken: jest.fn().mockResolvedValue(null),
    clear: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../services/api-client', () => ({
  apiClient: {
    login: jest.fn(),
    logout: jest.fn(),
  },
}));

jest.mock('../../services/theme-cache', () => ({
  themeCache: { clear: jest.fn().mockResolvedValue(undefined) },
}));

// Resolve tenant id is only reached for authenticated users; stub it anyway.
jest.mock('../../theme/theme.config', () => ({
  fetchTenantId: jest.fn().mockResolvedValue(null),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderWithSegments(segments: string[]) {
  mockSegments = segments;
  return render(
    <AuthProvider>
      <Text>child</Text>
    </AuthProvider>,
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('auth gate — public password-recovery routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSegments = [];
  });

  // R1.3 — a rota de solicitação de código é pública: sem sessão ativa, o
  // Portao_Autenticacao NÃO deve redirecionar `/forgot-password` para `/login`.
  it('does NOT redirect to /login on the forgot-password route when unauthenticated', async () => {
    const { findByText } = renderWithSegments(['forgot-password']);

    // Wait for the async session check (unauthenticated) to settle and render.
    await findByText('child');

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalledWith('/login');
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // R1.5 — a rota de redefinição de senha também é pública.
  it('does NOT redirect to /login on the reset-password route when unauthenticated', async () => {
    const { findByText } = renderWithSegments(['reset-password']);

    await findByText('child');

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalledWith('/login');
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // Positive control — a protected route MUST be redirected to /login when
  // there is no authenticated session. Confirms the gate is actually active.
  it('DOES redirect to /login on a protected route when unauthenticated', async () => {
    const { findByText } = renderWithSegments(['(tabs)']);

    await findByText('child');

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });
});
