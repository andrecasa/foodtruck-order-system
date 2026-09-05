import React, { useRef, useState } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, Text as RNText, TextInput, Image, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';
import { Screen, Input } from '../components';
import { Button } from '../components/Button';
import { CustomerHeader } from '../components/customer/CustomerHeader';
import { useTheme } from '../theme/ThemeProvider';
import { apiClient } from '../services/api-client';
import { validateNewPassword } from '../services/password-reset-validation';

/**
 * Tela de redefinição de senha (fluxo "Esqueceu sua senha?").
 *
 * O usuário informa o código de verificação recebido por e-mail, a nova senha
 * e a confirmação. Antes de enviar, aplicamos a validação client-side
 * (`validateNewPassword`) que bloqueia o envio quando as senhas diferem ou o
 * comprimento está fora de 8–72 caracteres (R5.6, R7.4). Quando permitido,
 * chamamos `apiClient.confirmPasswordReset(email, code, newPassword)`. Em
 * sucesso, exibimos a confirmação e navegamos para `/login` (R5.5); em erro,
 * exibimos a mensagem em pt-BR retornada pelo backend.
 *
 * O e-mail é recebido como parâmetro de rota, repassado pela RequestCodeScreen.
 */
export function ResetPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = params.email ?? '';

  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const [codeError, setCodeError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [message, setMessage] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);

  const codeRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  function validate(): boolean {
    let valid = true;
    let firstErrorField: 'code' | 'password' | null = null;

    if (!code.trim()) {
      setCodeError('Código é obrigatório');
      valid = false;
      if (!firstErrorField) firstErrorField = 'code';
    } else {
      setCodeError('');
    }

    // Validação client-side de senha (comprimento 8–72 e coincidência).
    const passwordCheck = validateNewPassword(newPassword, confirmation);
    if (!passwordCheck.allowed) {
      setPasswordError(passwordCheck.error ?? 'Senha inválida');
      valid = false;
      if (!firstErrorField) firstErrorField = 'password';
    } else {
      setPasswordError('');
    }

    if (firstErrorField === 'code') {
      codeRef.current?.focus();
    } else if (firstErrorField === 'password') {
      passwordRef.current?.focus();
    }

    return valid;
  }

  async function handleSubmit() {
    setSubmitError('');
    setMessage('');

    if (!validate()) {
      return;
    }

    setLoading(true);

    try {
      await apiClient.confirmPasswordReset(email, code.trim(), newPassword);

      setMessage('Senha redefinida com sucesso.');

      // Sucesso: navega para o login.
      router.replace('/login');
    } catch (err) {
      // Mensagem em pt-BR vinda do backend (ex.: "Código inválido ou expirado")
      // ou falha de conexão, com fallback seguro.
      const errorMessage =
        err instanceof Error && err.message
          ? err.message
          : 'Não foi possível redefinir a senha. Tente novamente.';
      setSubmitError(errorMessage);
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
    textAlign: 'center',
  };

  const subtitleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  };

  const cardStyle: ViewStyle = {
    width: '100%',
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 24,
    gap: 16,
  };

  const messageContainerStyle: ViewStyle = {
    alignItems: 'center',
    marginBottom: 8,
  };

  const messageTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  };

  const errorTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.error,
    textAlign: 'center',
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
      <CustomerHeader title="Redefinir senha" onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={containerStyle}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={headerStyle}>
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
              Informe o código enviado para o seu e-mail e escolha uma nova senha.
            </RNText>
          </View>

          <View style={cardStyle}>
            {message ? (
              <View style={messageContainerStyle}>
                <RNText style={messageTextStyle} testID="reset-password-message">
                  {message}
                </RNText>
              </View>
            ) : null}

            {submitError ? (
              <View style={messageContainerStyle}>
                <RNText style={errorTextStyle} testID="reset-password-error">
                  {submitError}
                </RNText>
              </View>
            ) : null}

            <Input
              accessibilityLabel="Código de verificação"
              value={code}
              onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              autoCapitalize="none"
              icon="pin"
              error={codeError}
              testID="reset-password-code-input"
              inputRef={codeRef}
            />

            <Input
              accessibilityLabel="Nova senha"
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Nova senha"
              secureTextEntry
              icon="lock"
              error={passwordError}
              testID="reset-password-new-password-input"
              showPasswordToggle
              inputRef={passwordRef}
            />

            <Input
              accessibilityLabel="Confirmar nova senha"
              value={confirmation}
              onChangeText={setConfirmation}
              placeholder="Confirme a nova senha"
              secureTextEntry
              icon="lock"
              testID="reset-password-confirm-password-input"
              showPasswordToggle
            />

            <Button
              title="Redefinir senha"
              variant="primary"
              size="lg"
              fullWidth
              onPress={handleSubmit}
              loading={loading}
              disabled={loading}
              testID="reset-password-submit-button"
            />
          </View>

          {/* App version — below the card, uses theme colors */}
          {appVersion ? (
            <RNText style={versionTextStyle} testID="reset-password-app-version">
              version {appVersion}
            </RNText>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
