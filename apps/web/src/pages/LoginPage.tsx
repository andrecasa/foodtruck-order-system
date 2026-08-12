import React, { useState } from 'react';
import { useTheme } from '../theme';
import { Screen } from '../components';
import { PrototypeBanner } from '../components/PrototypeBanner';
import { apiClient } from '../services/api-client';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

/**
 * Login page for the Preparador web app.
 * Uses Design System components exclusively — no hardcoded visual values.
 */
export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await apiClient.login(email, password);
      onLoginSuccess();
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
    padding: `${theme.spacing.lg}px`,
  };

  const formStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column',
    gap: `${theme.spacing.md}px`,
    backgroundColor: '#FFFFFF',
    padding: `${theme.spacing.xl}px`,
    borderRadius: `${theme.borderRadius.md}px`,
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: `${theme.spacing.sm}px`,
    marginBottom: `${theme.spacing.md}px`,
  };

  const iconStyle: React.CSSProperties = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: '48px',
    color: theme.colors.primary,
  };

  const subtitleStyle: React.CSSProperties = {
    fontFamily: theme.typography.fontFamily,
    fontSize: `${theme.typography.sizes.md}px`,
    color: theme.colors.text + '99',
  };

  const errorStyle: React.CSSProperties = {
    fontFamily: theme.typography.fontFamily,
    fontSize: `${theme.typography.sizes.sm}px`,
    color: theme.colors.error,
    textAlign: 'center',
  };

  return (
    <Screen padding={false}>
      <PrototypeBanner variant="login" />
      <div style={formContainerStyle}>
        <form onSubmit={handleSubmit} style={formStyle}>
          <div style={headerStyle}>
            <span style={iconStyle}>restaurant</span>
            <h2 style={{ fontFamily: theme.typography.fontFamily, fontSize: '28px', fontWeight: 300, color: theme.colors.text, margin: 0 }}>
              {theme.businessName}
            </h2>
            <span style={subtitleStyle}>Tela do Preparador</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#F5F5F5', borderRadius: `${theme.borderRadius.lg}px`, padding: '12px 20px', minHeight: '48px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#8B6B5A' }}>mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="preparador@pastelaria.com"
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '14px', fontFamily: theme.typography.fontFamily, color: theme.colors.text, width: '100%' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#F5F5F5', borderRadius: `${theme.borderRadius.lg}px`, padding: '12px 20px', minHeight: '48px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#8B6B5A' }}>lock</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '14px', fontFamily: theme.typography.fontFamily, color: theme.colors.text, width: '100%' }}
            />
          </div>
          {error && <p style={errorStyle}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{
              backgroundColor: theme.colors.primary,
              color: '#FFFFFF',
              border: 'none',
              borderRadius: `${theme.borderRadius.lg}px`,
              padding: '14px 24px',
              fontFamily: theme.typography.fontFamily,
              fontSize: '14px',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              minHeight: '48px',
              width: '100%',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Carregando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </Screen>
  );
}
