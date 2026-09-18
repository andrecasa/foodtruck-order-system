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
import { RoleBadge } from '../components/RoleBadge';
import { ErrorState } from '../components/ErrorState';
import { Modal } from '../components/Modal';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { apiClient } from '../services/api-client';
import type { UpdateUserInput, UserRole, User } from '../types/user';

// ─── Role options for the selector ─────────────────────────────────────────

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'atendente', label: 'Atendente' },
  { value: 'preparador', label: 'Preparador' },
];

// ─── Validation helpers ─────────────────────────────────────────────────────

interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  role?: string;
}

/**
 * User Detail Screen — pixel-perfect match to Penpot "Editar Usuário" design.
 *
 * Requirements: 3.1, 4.1, 4.2, 4.8, 5.1, 5.4, 5.7, 7.1, 7.5, 7.6
 */
export function UserDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();

  // User data (fetched)
  const [user, setUser] = useState<User | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showRolePicker, setShowRolePicker] = useState(false);

  // Refs for focus management
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState('');

  // Delete modal state
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ─── Load user data ─────────────────────────────────────────────────────────

  const loadUser = useCallback(async () => {
    if (!params.id) return;
    try {
      setFetchLoading(true);
      setApiError('');
      const userData = await apiClient.getUserById(params.id);
      setUser(userData);
      setName(userData.name);
      setEmail(userData.email);
      setRole(userData.role);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Erro ao carregar usuário');
    } finally {
      setFetchLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

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
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      newErrors.email = 'E-mail inválido';
      if (!firstErrorField) firstErrorField = 'email';
    }

    // Password: optional in edit mode, but if filled must be 8-72
    if (password) {
      if (password.length < 8) {
        newErrors.password = 'Senha deve ter no mínimo 8 caracteres';
        if (!firstErrorField) firstErrorField = 'password';
      } else if (password.length > 72) {
        newErrors.password = 'Senha deve ter no máximo 72 caracteres';
        if (!firstErrorField) firstErrorField = 'password';
      }
    }

    // Confirm password: must match if password is filled
    if (password && confirmPassword !== password) {
      newErrors.confirmPassword = 'Senhas não coincidem';
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
    if (!params.id) return;

    try {
      setLoading(true);

      // Update user data (name, email, role)
      const updateData: UpdateUserInput = {};
      if (name.trim() !== user?.name) updateData.name = name.trim();
      if (email.trim().toLowerCase() !== user?.email.toLowerCase()) updateData.email = email.trim();
      if (role && role !== user?.role) updateData.role = role as UserRole;

      // Only call updateUser if there are changes
      if (Object.keys(updateData).length > 0) {
        await apiClient.updateUser(params.id, updateData);
      }

      // If password was filled, reset password separately
      if (password) {
        await apiClient.resetPassword(params.id, password);
      }

      router.back();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar alterações';
      setApiError(message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
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

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const contentStyle: ViewStyle = {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 24,
    gap: 20,
  };

  // User Info Card — same style as list card (Penpot: badge + name + email + switch)
  const userInfoCardStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    height: 90,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  };

  const userInfoLeftStyle: ViewStyle = {
    flexDirection: 'column',
    gap: 2,
    flex: 1,
  };

  const userNameStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
    marginTop: 5,
  };

  const userEmailStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.textSecondary,
  };

  // Form fields
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

  const modalBodyTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
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

  if (apiError && !user) {
    return (
      <Screen padding={false}>
        <Header title="Usuário" onBack={() => router.back()} />
        <ErrorState message={apiError} onRetry={loadUser} />
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
        {/* User Info Card — same as list card with switch toggle */}
        {user && (
          <View style={userInfoCardStyle} testID="user-info-card">
            <View style={userInfoLeftStyle}>
              <RoleBadge role={user.role} />
              <RNText style={userNameStyle}>{user.name}</RNText>
              <RNText style={userEmailStyle}>{user.email}</RNText>
            </View>
            <ToggleSwitch
              value={user.status === 'ativo'}
              onValueChange={async () => {
                const newStatus = user.status === 'ativo' ? 'inativo' : 'ativo';
                try {
                  await apiClient.toggleUserStatus(params.id!, newStatus);
                  setUser({ ...user, status: newStatus });
                } catch {
                  // Silently fail
                }
              }}
              accessibilityLabel={`${user.name} está ${user.status === 'ativo' ? 'ativo' : 'inativo'}`}
              testID="toggle-user-status"
            />
          </View>
        )}

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
          disabled={loading}
          testID="submit-user"
        />

        {/* Danger Button — Excluir */}
        <Button
          title="Excluir"
          variant="outline"
          size="lg"
          fullWidth
          color={theme.colors.error}
          icon="delete"
          onPress={() => { setDeleteError(null); setDeleteModalVisible(true); }}
          disabled={deleting}
          testID="delete-user-button"
        />

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        onClose={() => setDeleteModalVisible(false)}
        title="Excluir Usuário"
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteModalVisible(false)}
        variant="danger"
        errorMessage={deleteError}
        loading={deleting}
        testID="delete-modal"
      >
        <View style={{ gap: 8 }}>
          <RNText style={modalBodyTextStyle}>
            Tem certeza que deseja excluir este usuário?
          </RNText>
          {user && (
            <View style={{ gap: 4 }}>
              <RNText style={[modalBodyTextStyle, { fontWeight: '500' }]}>
                {user.name}
              </RNText>
              <RNText style={[modalBodyTextStyle, { fontSize: 12, color: theme.colors.textSecondary }]}>
                {user.email}
              </RNText>
            </View>
          )}
        </View>
      </Modal>
    </FormScreen>
  );
}
