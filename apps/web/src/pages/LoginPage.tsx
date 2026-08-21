import React, { useState } from 'react';
import { useTheme } from '../theme';
import { Screen } from '../components';
import { useAuth } from '../hooks';

/**
 * Login page for the Preparador web app.
 *
 * Layout espelhado da tela de login do app (mobile) — LoginScreen.tsx:
 * - Header (logo 150, título 24px, subtítulo "Faça login para continuar") acima do card, alinhado ao topo
 * - Card separado contendo apenas o formulário (inputs + botão)
 * - Inputs: border 1px, focus border primary, borderRadius 24px, height 52px
 * - Cores/tipografia sempre do tema
 */
export function LoginPage() {
  const theme = useTheme();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
    } catch {
      setError('E-mail ou senha incorretos');
    } finally {
      setLoading(false);
    }
  };

  const formContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: '100vh',
    padding: '50px 24px 24px',
    gap: '24px',
  };

  const formStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    backgroundColor: theme.colors.surface,
    padding: '24px',
    borderRadius: '16px',
    boxShadow: 'none',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  };

  const subtitleStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: '14px',
    fontWeight: 400,
    color: theme.colors.textSecondary,
  };

  const errorStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: '12px',
    fontWeight: 400,
    color: theme.colors.error,
    textAlign: 'center',
    margin: 0,
  };

  const getInputWrapperStyle = (focused: boolean): React.CSSProperties => ({
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: theme.colors.surface,
    border: `1px solid ${focused ? theme.colors.primary : theme.colors.border}`,
    borderRadius: '24px',
    height: '52px',
    padding: '0 16px',
    transition: 'border-color 0.15s ease',
  });

  const inputIconStyle: React.CSSProperties = {
    fontSize: '20px',
    fontWeight: 400,
    color: theme.colors.textSecondary,
    flexShrink: 0,
  };

  const inputStyle: React.CSSProperties = {
    border: 'none',
    background: 'transparent',
    outline: 'none',
    fontSize: '14px',
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontWeight: 400,
    color: theme.colors.text,
    width: '100%',
    height: '100%',
  };

  const toggleBtnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  };

  return (
    <Screen padding={false}>
      <style>{`
        .login-input::placeholder {
          color: ${theme.colors.textSecondary};
          opacity: 1;
        }
      `}</style>
      <div style={formContainerStyle}>
        {/* Header (logo, título, subtítulo) — fora do card, igual ao app */}
        <div style={headerStyle}>
          <img
            src={theme.logo || '/assets/logo.png'}
            alt={theme.businessName}
            style={{ width: '150px', height: '150px', borderRadius: '12px', objectFit: 'contain' }}
          />
          <h2 style={{
            fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
            fontSize: '24px',
            fontWeight: 400,
            color: theme.colors.text,
            margin: 0,
          }}>
            {theme.businessName}
          </h2>
          <span style={subtitleStyle}>Faça login para continuar</span>
        </div>

        <form onSubmit={handleSubmit} style={formStyle}>
          {/* Email input */}
          <div style={getInputWrapperStyle(emailFocused)}>
            <span className="material-symbols-outlined" style={inputIconStyle}>mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              placeholder="seu@email.com"
              aria-label="E-mail"
              className="login-input"
              style={inputStyle}
            />
          </div>

          {/* Password input */}
          <div style={getInputWrapperStyle(passwordFocused)}>
            <span className="material-symbols-outlined" style={inputIconStyle}>lock</span>
            <input
              type={passwordVisible ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              placeholder="Sua senha"
              aria-label="Senha"
              className="login-input"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => setPasswordVisible(!passwordVisible)}
              style={toggleBtnStyle}
              aria-label={passwordVisible ? 'Ocultar senha' : 'Exibir senha'}
            >
              <span className="material-symbols-outlined" style={inputIconStyle}>
                {passwordVisible ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>

          {error && <p style={errorStyle}>{error}</p>}

          {/* Login button — Penpot: h44, radius 22, bg primary, text 14px weight 400 */}
          <button
            type="submit"
            disabled={loading}
            style={{
              backgroundColor: loading ? theme.colors.surfaceDisabled : theme.colors.primary,
              color: loading ? theme.colors.textDisabled : theme.colors.surface,
              border: 'none',
              borderRadius: '22px',
              height: '44px',
              padding: '0 20px',
              fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
              fontSize: '14px',
              fontWeight: 400,
              cursor: loading ? 'not-allowed' : 'pointer',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: loading ? 0.7 : 1,
              transition: 'opacity 0.15s ease',
            }}
          >
            {loading ? 'Carregando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </Screen>
  );
}
