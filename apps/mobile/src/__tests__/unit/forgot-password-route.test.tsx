import React from 'react';
import { render } from '@testing-library/react-native';
import ForgotPasswordRoute from '../../../app/forgot-password';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

// The route must be reachable without an authenticated session (R1.3): it does
// not depend on useAuth. We do not provide an AuthProvider here on purpose —
// rendering must succeed regardless of authentication state.
jest.mock('../../services/api-client', () => ({
  apiClient: {
    requestPasswordReset: jest.fn(),
  },
}));

jest.mock('../../theme', () => ({
  ...require('../helpers/mockTheme').themeMocks,
  deepMergeTheme: (base: any) => base,
}));

jest.mock('../../theme/ThemeProvider', () => require('../helpers/mockTheme').themeMocks);

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('/forgot-password route', () => {
  // R1.3 — a tela de solicitação de código é uma rota acessível sem sessão
  // autenticada ativa. Renderiza o RequestCodeScreen sem exigir autenticação.
  it('renders the request-code screen without an authenticated session', () => {
    const { getByTestId } = render(<ForgotPasswordRoute />);

    expect(getByTestId('request-code-email-input')).toBeTruthy();
    expect(getByTestId('request-code-submit-button')).toBeTruthy();
  });
});
