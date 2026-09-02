import React, { useRef, useState } from 'react';
import { View, ScrollView, Text as RNText, TextInput, Image, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Screen, Input } from '../components';
import { Button } from '../components/Button';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../hooks/useAuth';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

export function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { login } = useAuth();
  const keyboardHeight = useKeyboardHeight();

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
    } catch (err) {
      // Usa a mensagem do erro (ex.: falha de conexão vs. credenciais inválidas),
      // com fallback seguro caso o erro não tenha mensagem.
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'E-mail ou senha incorretos';
      setLoginError(message);
    } finally {
      setLoading(false);
    }
  }

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const containerStyle: ViewStyle = {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 50,
    paddingBottom: 24,
    gap: 24,
    backgroundColor: theme.colors.background,
  };

  const headerStyle: ViewStyle = {
    alignItems: 'center',
    gap: 8,
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

  const versionTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  };

  // App version, read from the Expo config (app.json → expo.version) so it
  // stays in sync with the release without a hardcoded string.
  const appVersion = Constants.expoConfig?.version ?? '';

  return (
    <Screen padding={false}>
      {/* Keyboard handling: track the keyboard height and apply it as paddingBottom
          so the ScrollView shrinks (activating scroll) and no field is hidden behind
          the keyboard. keyboardShouldPersistTaps keeps taps working while open. */}
      <View style={{ flex: 1, paddingBottom: keyboardHeight }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={containerStyle}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header with logo, title, subtitle */}
          <View style={headerStyle}>
            {/* Logo image from assets */}
            <Image
              source={require('../../assets/logo.png')}
              style={{ width: 150, height: 150, borderRadius: 12 } as ImageStyle}
              accessibilityLabel={`Logo ${theme.businessName}`}
              resizeMode="contain"
            />
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

          {/* App version — below the login card, uses theme colors */}
          {appVersion ? (
            <RNText style={versionTextStyle} testID="login-app-version">
              version {appVersion}
            </RNText>
          ) : null}
        </ScrollView>
      </View>
    </Screen>
  );
}
