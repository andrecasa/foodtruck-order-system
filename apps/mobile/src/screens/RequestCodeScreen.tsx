import React, { useRef, useState } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, Text as RNText, TextInput, type ViewStyle, type TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Input } from '../components';
import { Button } from '../components/Button';
import { useTheme } from '../theme/ThemeProvider';
import { apiClient } from '../services/api-client';

/**
 * Tela de solicitação de código de verificação (fluxo "Esqueceu sua senha?").
 *
 * O usuário informa o e-mail e aciona "Enviar código". Chamamos
 * `apiClient.requestPasswordReset`, cuja resposta é sempre neutra
 * (Mensagem_Neutra) — não revelamos se o e-mail está cadastrado (R2.2).
 * Após o envio, exibimos a Mensagem_Neutra e navegamos para a tela de
 * redefinição, repassando o e-mail informado como parâmetro de rota.
 */
export function RequestCodeScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [message, setMessage] = useState('');
  const [requestError, setRequestError] = useState('');
  const [loading, setLoading] = useState(false);

  const emailRef = useRef<TextInput>(null);

  function validate(): boolean {
    if (!email.trim()) {
      setEmailError('E-mail é obrigatório');
      emailRef.current?.focus();
      return false;
    }
    setEmailError('');
    return true;
  }

  async function handleSubmit() {
    setRequestError('');
    setMessage('');

    if (!validate()) {
      return;
    }

    setLoading(true);

    try {
      await apiClient.requestPasswordReset(email.trim());

      // Resposta neutra: confirma o envio sem revelar se o e-mail existe.
      setMessage('Se o e-mail estiver cadastrado, enviamos instruções para redefinir a senha.');

      // Navega para a tela de redefinição, repassando o e-mail informado.
      router.push({ pathname: '/reset-password', params: { email: email.trim() } });
    } catch (err) {
      // Só falha de conexão chega aqui (o backend responde sempre de forma neutra).
      const errorMessage =
        err instanceof Error && err.message
          ? err.message
          : 'Não foi possível enviar a solicitação. Tente novamente.';
      setRequestError(errorMessage);
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

  return (
    <Screen padding={false}>
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
            <RNText style={titleStyle}>
              Esqueceu sua senha?
            </RNText>
            <RNText style={subtitleStyle}>
              Informe seu e-mail e enviaremos um código de verificação para redefinir a senha.
            </RNText>
          </View>

          <View style={cardStyle}>
            {message ? (
              <View style={messageContainerStyle}>
                <RNText style={messageTextStyle} testID="request-code-message">
                  {message}
                </RNText>
              </View>
            ) : null}

            {requestError ? (
              <View style={messageContainerStyle}>
                <RNText style={errorTextStyle} testID="request-code-error">
                  {requestError}
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
              testID="request-code-email-input"
              inputRef={emailRef}
            />

            <Button
              title="Enviar código"
              variant="primary"
              size="lg"
              fullWidth
              onPress={handleSubmit}
              loading={loading}
              disabled={loading}
              testID="request-code-submit-button"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
