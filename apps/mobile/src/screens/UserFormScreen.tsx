import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text as RNText,
  ActivityIndicator,
  type TextInput,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../theme';
import { Screen, Header } from '../components/Layout';
import { FormScreen } from '../components/FormScreen';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import { ErrorState } from '../components/ErrorState';
import { Modal } from '../components/Modal';
import { Text } from '../components/Typography';
import { apiClient } from '../services/api-client';
import type { CreateUserInput, UpdateUserInput, UserRole } from '../types/user';

// ─── Role options for the selector ─────────────────────────────────────────

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'atendente', label: 'Atendente' },
  { value: 'preparador', label: 'Preparador' },
];

// ─── Validation helpers ─────────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  role?: string;
}

/**
 * User Form Screen — pixel-perfect match to Penpot "Novo Usuário" / "Editar Usuário" design.
 *
 * Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.9, 3.1, 3.8, 3.9
 */
export function UserFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();

  const isEditMode = Boolean(params.id);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [showRolePicker, setShowRolePicker] = useState(false);

  // Refs for focus management
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState('');
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ─── Load user data in edit mode ────────────────────────────────────────────

  const loadUser = useCallback(async () => {
    if (!params.id) return;
    try {
      setFetchLoading(true);
      const user = await apiClient.getUserById(params.id);
      setName(user.name);
      setEmail(user.email);
      setRole(user.role);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Erro ao carregar usuário');
    } finally {
      setFetchLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (isEditMode) {
      loadUser();
    }
  }, [isEditMode, loadUser]);

  // ─── Validation ─────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    let firstErrorField: 'role' | 'name' | 'email' | 'password' | 'confirmPassword' | null = null;

    // Role: required
    if (!role) {
      newErrors.role = 'Função é obrigatória';
      if (!firstErrorField) firstErrorField = 'role';
    }

    // Name: 1-100 chars, not only spaces
    const trimmedName = name.trim();
    if (!trimmedName) {
      newErrors.name = 'Nome é obrigatório';
      if (!firstErrorField) firstErrorField = 'name';
    } else if (trimmedName.length > 100) {
      newErrors.name = 'Nome deve ter no máximo 100 caracteres';
      if (!firstErrorField) firstErrorField = 'name';
    } else if (/^\s+$/.test(name)) {
      newErrors.name = 'Nome não pode conter apenas espaços';
      if (!firstErrorField) firstErrorField = 'name';
    }

    // Email: valid format, ≤254 chars
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      newErrors.email = 'E-mail é obrigatório';
      if (!firstErrorField) firstErrorField = 'email';
    } else if (trimmedEmail.length > 254) {
      newErrors.email = 'E-mail deve ter no máximo 254 caracteres';
      if (!firstErrorField) firstErrorField = 'email';
    } else if (!isValidEmail(trimmedEmail)) {
      newErrors.email = 'E-mail inválido';
      if (!firstErrorField) firstErrorField = 'email';
    }

    // Password: 8-72 chars (required in creation, optional in edit)
    if (!isEditMode) {
      if (!password) {
        newErrors.password = 'Senha é obrigatória';
        if (!firstErrorField) firstErrorField = 'password';
      } else if (password.length < 8) {
        newErrors.password = 'Senha deve ter no mínimo 8 caracteres';
        if (!firstErrorField) firstErrorField = 'password';
      } else if (password.length > 72) {
        newErrors.password = 'Senha deve ter no máximo 72 caracteres';
        if (!firstErrorField) firstErrorField = 'password';
      }
    } else if (password) {
      // In edit mode, only validate if filled
      if (password.length < 8) {
        newErrors.password = 'Senha deve ter no mínimo 8 caracteres';
        if (!firstErrorField) firstErrorField = 'password';
      } else if (password.length > 72) {
        newErrors.password = 'Senha deve ter no máximo 72 caracteres';
        if (!firstErrorField) firstErrorField = 'password';
      }
    }

    // Confirm password: must match
    if (password && confirmPassword !== password) {
      newErrors.confirmPassword = 'Senhas não coincidem';
      if (!firstErrorField) firstErrorField = 'confirmPassword';
    } else if (!isEditMode && !confirmPassword) {
      newErrors.confirmPassword = 'Confirmação de senha é obrigatória';
      if (!firstErrorField) firstErrorField = 'confirmPassword';
    }

    setErrors(newErrors);

    // Focus on the first field with error
    if (firstErrorField === 'role') {
      setShowRolePicker(true);
    } else if (firstErrorField === 'name') {
      nameRef.current?.focus();
    } else if (firstErrorField === 'email') {
      emailRef.current?.focus();
    } else if (firstErrorField === 'password') {
      passwordRef.current?.focus();
    } else if (firstErrorField === 'confirmPassword') {
      confirmPasswordRef.current?.focus();
    }

    return Object.keys(newErrors).length === 0;
  };

  // ─── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setApiError('');
    if (!validate()) return;

    try {
      setLoading(true);

      if (isEditMode && params.id) {
        const updateData: UpdateUserInput = {};
        if (name.trim()) updateData.name = name.trim();
        if (email.trim()) updateData.email = email.trim();
        if (role) updateData.role = role as UserRole;

        await apiClient.updateUser(params.id, updateData);
      } else {
        const createData: CreateUserInput = {
          name: name.trim(),
          email: email.trim(),
          password,
          role: role as UserRole,
        };
        await apiClient.createUser(createData);
      }

      router.back();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar usuário';
      setApiError(message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Delete ─────────────────────────────────────────────────────────────────

  const handleDeletePress = () => {
    setDeleteError(null);
    setDeleteModalVisible(true);
  };

  const handleConfirmDelete = async () => {
    if (!params.id) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      await apiClient.deleteUser(params.id);
      setDeleteModalVisible(false);
      router.back();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao excluir usuário';
      setDeleteError(message);
    } finally {
      setDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setDeleteModalVisible(false);
  };

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const contentStyle: ViewStyle = {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 24,
    gap: 20,
  };

  const errorTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.error,
    marginTop: 4,
  };

  const centeredContainerStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  };

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (fetchLoading) {
    return (
      <Screen padding={false}>
        <Header title="Usuário" onBack={() => router.back()} />
        <View style={centeredContainerStyle}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <RNText
            style={{
              fontFamily: theme.typography.fontFamily,
              fontSize: 14,
              color: theme.colors.textSecondary,
              marginTop: 8,
            }}
          >
            Carregando dados...
          </RNText>
        </View>
      </Screen>
    );
  }

  // ─── Error state (fetch error) ──────────────────────────────────────────────

  if (apiError && !name && !email && isEditMode) {
    return (
      <Screen padding={false}>
        <Header title="Usuário" onBack={() => router.back()} />
        <ErrorState message={apiError || 'Erro ao carregar dados'} onRetry={loadUser} />
      </Screen>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <FormScreen
      title="Usuário"
      onBack={() => router.back()}
      contentContainerStyle={contentStyle}
    >
        {/* Função Field (Role Selector) */}
        <Select
          label="Função"
          value={role}
          options={ROLE_OPTIONS}
          onChange={(value) => {
            setRole(value);
            if (errors.role) setErrors((prev) => ({ ...prev, role: undefined }));
          }}
          error={errors.role}
          open={showRolePicker}
          onOpenChange={setShowRolePicker}
          testID="select-role"
          optionTestID={(value) => `role-${value}`}
          accessibilityHint="Toque para selecionar a função"
        />

        {/* Nome Field */}
        <Input
          label="Nome"
          accessibilityLabel="Nome"
          value={name}
          onChangeText={(text) => {
            setName(text);
            if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
            if (apiError) setApiError('');
          }}
          placeholder="Nome completo do usuário"
          error={errors.name}
          inputRef={nameRef}
          testID="input-name"
        />

        {/* E-mail Field */}
        <Input
          label="E-mail"
          accessibilityLabel="E-mail"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
            if (apiError) setApiError('');
          }}
          placeholder="usuario@email.com"
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          inputRef={emailRef}
          testID="input-email"
        />

        {/* Senha Field */}
        <Input
          label="Senha"
          accessibilityLabel="Senha"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
          }}
          placeholder="Mínimo 8 caracteres"
          error={errors.password}
          showPasswordToggle
          autoCapitalize="none"
          autoCorrect={false}
          inputRef={passwordRef}
          testID="input-password"
        />

        {/* Confirmar Senha Field */}
        <Input
          label="Confirmar Senha"
          accessibilityLabel="Confirmar Senha"
          value={confirmPassword}
          onChangeText={(text) => {
            setConfirmPassword(text);
            if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
          }}
          placeholder="Mínimo 8 caracteres"
          error={errors.confirmPassword}
          showPasswordToggle
          autoCapitalize="none"
          autoCorrect={false}
          inputRef={confirmPasswordRef}
          testID="input-confirm-password"
        />

        {/* API Error */}
        {apiError ? (
          <RNText style={errorTextStyle}>{apiError}</RNText>
        ) : null}

        {/* Confirm Button */}
        <Button
          title="Salvar"
          variant="primary"
          size="lg"
          fullWidth
          onPress={handleSubmit}
          loading={loading}
          disabled={loading || deleting}
          testID="submit-user"
        />

        {/* Delete Button — only in edit mode */}
        {isEditMode && (
          <Button
            title="Excluir"
            variant="outline"
            size="lg"
            fullWidth
            color={theme.colors.error}
            icon="delete"
            onPress={handleDeletePress}
            disabled={deleting || loading}
            testID="delete-user"
          />
        )}
        {/* Delete Confirmation Modal */}
        <Modal
          visible={deleteModalVisible}
          onClose={handleCancelDelete}
          title="Excluir usuário"
          confirmLabel="Excluir"
          cancelLabel="Cancelar"
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
          variant="danger"
          errorMessage={deleteError}
          loading={deleting}
          testID="delete-user-modal"
        >
          <Text size="md">
            Deseja excluir o usuário{' '}
            <Text size="md" weight="bold">
              {name}
            </Text>
            ? Esta ação não pode ser desfeita.
          </Text>
        </Modal>
    </FormScreen>
  );
}
