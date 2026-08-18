import React, { useRef, useState } from 'react';
import { View, Text as RNText, TextInput, Image, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Input } from '../components';
import { Button } from '../components/Button';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../hooks/useAuth';

/**
 * Login screen — pixel-perfect match to Penpot design.
 *
 * Penpot specs:
 * - Full screen centered, bg #FDF8F4 (background), padding 24px, gap 24px
 * - Logo icon: Material Symbols "restaurant" 48px, color #7B2D2D (primary)
 * - Title: 24px weight 400, color #3D2020 (text)
 * - Subtitle: 14px weight 400, color #8B6B5A (textSecondary)
 * - Login Form card: bg #FFFFFF, border-radius 16px, shadow 0 2px 8px rgba(0,0,0,0.06), padding 24px, gap 16px
 * - Input fields: height 52px, border-radius 24px, bg #F5F5F5, padding 0 16px, gap 10px with icon
 * - Button "Entrar": height 44px, radius 22px, bg #7B2D2D (primary), text 14px weight 400, color white, full width
 */
export function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  // Refs for focus management
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  function validate(): boolean {
    let valid = true;
    let firstErrorField: 'email' | 'password' | null = null;

    if (!email.trim()) {
      setEmailError('E-mail é obrigatório');
      valid = false;
      if (!firstErrorField) firstErrorField = 'email';
    } else {
      setEmailError('');
    }

    if (!password.trim()) {
      setPasswordError('Senha é obrigatória');
      valid = false;
      if (!firstErrorField) firstErrorField = 'password';
    } else {
      setPasswordError('');
    }

    // Focus on the first field with error
    if (firstErrorField === 'email') {
      emailRef.current?.focus();
    } else if (firstErrorField === 'password') {
      passwordRef.current?.focus();
    }

    return valid;
  }

  async function handleLogin() {
    setLoginError('');

    if (!validate()) {
      return;
    }

    setLoading(true);

    try {
      await login(email.trim(), password);
      router.replace('/(tabs)');
    } catch {
      setLoginError('E-mail ou senha incorretos');
    } finally {
      setLoading(false);
    }
  }

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const containerStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 50,
    gap: 24,
    backgroundColor: theme.colors.background,
  };

  const headerStyle: ViewStyle = {
    alignItems: 'center',
    gap: 8,
  };

  const logoTextStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 48,
    color: theme.colors.primary,
  };

  const titleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 24,
    fontWeight: '400',
    color: theme.colors.text,
  };

  const subtitleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.textSecondary,
  };

  const cardStyle: ViewStyle = {
    width: '100%',
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 24,
    gap: 16,
  };

  const errorContainerStyle: ViewStyle = {
    alignItems: 'center',
    marginBottom: 8,
  };

  const errorTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.error,
  };

  return (
    <Screen padding={false}>
      <View style={containerStyle}>
        {/* Header with logo, title, subtitle */}
        <View style={headerStyle}>
          {/* Logo image from assets */}
          <Image
            source={require('../../assets/logo.png')}
            style={{ width: 80, height: 80, borderRadius: 12 } as ImageStyle}
            accessibilityLabel={`Logo ${theme.businessName}`}
            resizeMode="contain"
          />
          {/* Fallback icon (commented — kept for reference)
          <RNText style={logoTextStyle} accessibilityLabel="Logo restaurante">
            restaurant
          </RNText>
          */}
          <RNText style={titleStyle}>
            {theme.businessName}
          </RNText>
          <RNText style={subtitleStyle}>
            Faça login para continuar
          </RNText>
        </View>

        {/* Login Form Card */}
        <View style={cardStyle}>
          {loginError ? (
            <View style={errorContainerStyle}>
              <RNText style={errorTextStyle}>
                {loginError}
              </RNText>
            </View>
          ) : null}

          <Input
            accessibilityLabel="E-mail"
            value={email}
            onChangeText={setEmail}
            placeholder="seu@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            icon="mail"
            error={emailError}
            testID="login-email-input"
            inputRef={emailRef}
          />

          <Input
            accessibilityLabel="Senha"
            value={password}
            onChangeText={setPassword}
            placeholder="Sua senha"
            secureTextEntry
            icon="lock"
            error={passwordError}
            testID="login-password-input"
            showPasswordToggle
            inputRef={passwordRef}
          />

          <Button
            title="Entrar"
            variant="primary"
            size="lg"
            fullWidth
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
            testID="login-submit-button"
          />
        </View>
      </View>
    </Screen>
  );
}
