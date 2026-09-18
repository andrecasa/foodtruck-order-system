import type React from 'react';
import { useState } from 'react';
import { useTheme } from '../theme';
import { Screen, Input, Button } from '../components';

/**
 * Login_Form (web) — réplica da interface da `LoginScreen` do app mobile, para
 * uso posterior (ainda não roteada nem integrada à autenticação).
 *
 * Estrutura fiel ao mobile: cabeçalho com logo + nome do negócio + "Faça login
 * para continuar"; card com os campos de e-mail (ícone `mail`) e senha (ícone
 * `lock` + toggle de visibilidade), botão "Entrar", link "Esqueceu sua senha?"
 * e a versão do app no rodapé. Reutiliza os componentes `Input`/`Button` (mesmo
 * padrão do mobile) e deriva os estilos do tema (`useTheme()`); elementos
 * interativos expõem `data-testid` e acessibilidade.
 *
 * Os handlers (`onSubmit`/`onForgotPassword`) são pontos de extensão: a
 * integração com o serviço de autenticação será feita quando a tela entrar em
 * uso. Por ora são opcionais e, na ausência, a submissão apenas valida os campos.
 */

/** Versão exibida no rodapé (via env do Vite, com fallback vazio). */
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.6.5';

/** Logomarca da marca, servida da pasta `public/` do Vite (URL raiz). */
const LOGO_SRC = '/assets/logo.png';

export interface LoginPageProps {
  /** Ação de submissão do login (recebe e-mail e senha já preenchidos). */
  onSubmit?: (credentials: { email: string; password: string }) => void;
  /** Ação do link "Esqueceu sua senha?". */
  onForgotPassword?: () => void;
  /** Mensagem de erro global (ex.: credenciais inválidas), exibida no topo do card. */
  errorMessage?: string;
  /** Estado de carregando (desabilita o botão e mostra o rótulo de envio). */
  loading?: boolean;
}

export function LoginPage({
  onSubmit,
  onForgotPassword,
  errorMessage,
  loading = false,
}: LoginPageProps) {
  const theme = useTheme();
  const fontFamily = `"${theme.typography.fontFamily}", -apple-system, sans-serif`;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    onSubmit?.({ email, password });
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: `${theme.spacing.lg}px`,
    padding: `${theme.spacing.xl}px ${theme.spacing.lg}px`,
    boxSizing: 'border-box',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: `${theme.spacing.sm}px`,
    textAlign: 'center',
  };

  const logoStyle: React.CSSProperties = {
    width: '150px',
    height: '150px',
    objectFit: 'contain',
    borderRadius: `${theme.borderRadius.md}px`,
  };

  const titleStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.xxl}px`,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    margin: 0,
  };

  const subtitleStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.lg}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.textSecondary,
    margin: 0,
  };

  const cardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: `${theme.spacing.md}px`,
    width: '100%',
    maxWidth: '380px',
    boxSizing: 'border-box',
    backgroundColor: theme.colors.surface,
    borderRadius: `${theme.borderRadius.md}px`,
    padding: `${theme.spacing.lg}px`,
  };

  const errorBoxStyle: React.CSSProperties = {
    backgroundColor: theme.colors.surfacePending,
    color: theme.colors.error,
    fontFamily,
    fontSize: `${theme.typography.sizes.sm}px`,
    borderRadius: `${theme.borderRadius.sm}px`,
    padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
    margin: 0,
  };

  const forgotWrapperStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
  };

  const forgotLinkStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.md}px`,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.primary,
    backgroundColor: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
  };

  const versionStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.sm}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.textSecondary,
    margin: 0,
  };

  return (
    <Screen padding={false}>
      <div style={containerStyle} data-testid="login-page">
        <div style={headerStyle}>
          <img src={LOGO_SRC} alt={`Logo ${theme.businessName}`} style={logoStyle} />
          <h1 style={titleStyle}>{theme.businessName}</h1>
          <p style={subtitleStyle}>Faça login para continuar</p>
        </div>

        <form style={cardStyle} onSubmit={handleSubmit} noValidate>
          {errorMessage ? (
            <p style={errorBoxStyle} role="alert" aria-live="polite" data-testid="login-error">
              {errorMessage}
            </p>
          ) : null}

          <Input
            label="E-mail"
            hideLabel
            value={email}
            onChangeText={setEmail}
            placeholder="seu@email.com"
            type="email"
            icon="mail"
            testId="login-email-input"
            autoComplete="email"
            inputMode="email"
            disableAutoCorrect
          />

          <Input
            label="Senha"
            hideLabel
            value={password}
            onChangeText={setPassword}
            placeholder="Sua senha"
            type="password"
            icon="lock"
            testId="login-password-input"
            autoComplete="current-password"
          />

          <Button
            type="submit"
            title="Entrar"
            loading={loading}
            loadingLabel="Entrando…"
            fullWidth
            testId="login-submit-button"
          />

          <div style={forgotWrapperStyle}>
            <button
              type="button"
              style={forgotLinkStyle}
              onClick={onForgotPassword}
              data-testid="login-forgot-password-link"
              aria-label="Esqueceu sua senha?"
            >
              Esqueceu sua senha?
            </button>
          </div>
        </form>

        {APP_VERSION ? (
          <p style={versionStyle} data-testid="login-app-version">
            version {APP_VERSION}
          </p>
        ) : null}
      </div>
    </Screen>
  );
}
