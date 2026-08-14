import React, { useState } from 'react';
import { useTheme } from '../theme';
import { Screen } from '../components';
import { PrototypeBanner } from '../components/PrototypeBanner';
import { useAuth } from '../hooks';

/**
 * Login page for the Preparador web app.
 *
 * Pixel-perfect match to Penpot "Login Preparador" (Web page) + App input pattern:
 * - Screen: bg #FDF8F4, centered
 * - Form card: bg #FFFFFF, borderRadius 16px, shadow 0 4px 16px rgba(0,0,0,0.08), padding 32px, gap 16px
 * - Inputs: bg #FFFFFF, border 1px solid #E8DDD5, focus border #7B2D2D, borderRadius 24px, height 52px
 * - Button: h44, borderRadius 22px, bg #7B2D2D, text 14px weight 400 white
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
    justifyContent: 'center',
    minHeight: '80vh',
    padding: '24px',
  };

  const formStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    backgroundColor: '#FFFFFF',
    padding: '32px',
    borderRadius: '16px',
    boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.08)',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
  };

  const iconStyle: React.CSSProperties = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: '48px',
    fontWeight: 400,
    color: theme.colors.primary,
  };

  const subtitleStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: '14px',
    fontWeight: 400,
    color: '#8B6B5A',
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
    backgroundColor: '#FFFFFF',
    border: `1px solid ${focused ? theme.colors.primary : '#E8DDD5'}`,
    borderRadius: '24px',
    height: '52px',
    padding: '0 16px',
    transition: 'border-color 0.15s ease',
  });

  const inputIconStyle: React.CSSProperties = {
    fontSize: '20px',
    fontWeight: 400,
    color: '#8B6B5A',
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
      <PrototypeBanner variant="login" />
      <div style={formContainerStyle}>
        <form onSubmit={handleSubmit} style={formStyle}>
          <div style={headerStyle}>
            <span style={iconStyle}>restaurant</span>
            <h2 style={{
              fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
              fontSize: '28px',
              fontWeight: 400,
              color: theme.colors.text,
              margin: 0,
            }}>
              {theme.businessName}
            </h2>
            <span style={subtitleStyle}>Tela do Preparador</span>
          </div>

          {/* Email input */}
          <div style={getInputWrapperStyle(emailFocused)}>
            <span className="material-symbols-outlined" style={inputIconStyle}>mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              placeholder="preparador@pastelaria.com"
              aria-label="E-mail"
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
              placeholder="••••••••"
              aria-label="Senha"
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
              backgroundColor: loading ? '#E8DDD5' : theme.colors.primary,
              color: loading ? '#9E9E9E' : '#FFFFFF',
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
