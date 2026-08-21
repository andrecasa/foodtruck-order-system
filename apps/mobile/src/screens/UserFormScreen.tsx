import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text as RNText,
  TextInput,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../theme';
import { Screen, Header } from '../components/Layout';
import { FormScreen } from '../components/FormScreen';
import { ErrorState } from '../components/ErrorState';
import { BottomNav } from '../components/BottomNav';
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

  // Visibility toggles for password fields
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

  const fieldContainerStyle: ViewStyle = {
    flexDirection: 'column',
    gap: 8,
  };

  const labelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.text,
  };

  const inputContainerStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    height: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  };

  const inputStyle: TextStyle = {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
    paddingVertical: 0,
    height: 48,
  };

  const visibilityIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    color: theme.colors.textSecondary,
  };

  const arrowIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    color: theme.colors.textSecondary,
  };

  const confirmButtonStyle: ViewStyle = {
    width: '100%',
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  };

  const confirmButtonTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.surface,
  };

  const cancelButtonStyle: ViewStyle = {
    width: '100%',
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  };

  const cancelButtonTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.error,
  };

  const deleteIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 18,
    color: theme.colors.error,
  };

  const errorTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.error,
    marginTop: 4,
  };

  const roleDropdownStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: 4,
    overflow: 'hidden',
  };

  const roleOptionStyle: ViewStyle = {
    height: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
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
        <BottomNav />
      </Screen>
    );
  }

  // ─── Error state (fetch error) ──────────────────────────────────────────────

  if (apiError && !name && !email && isEditMode) {
    return (
      <Screen padding={false}>
        <Header title="Usuário" onBack={() => router.back()} />
        <ErrorState message={apiError || 'Erro ao carregar dados'} onRetry={loadUser} />
        <BottomNav />
      </Screen>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <FormScreen
      title="Usuário"
      onBack={() => router.back()}
      contentContainerStyle={contentStyle}
      footer={<BottomNav />}
    >
        {/* Função Field (Role Selector) */}
        <View style={fieldContainerStyle}>
          <RNText style={labelStyle}>Função</RNText>
          <TouchableOpacity
            style={inputContainerStyle}
            onPress={() => setShowRolePicker(!showRolePicker)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={role ? ROLE_OPTIONS.find((r) => r.value === role)?.label || '' : 'Selecione uma função'}
            accessibilityHint="Toque para selecionar a função"
            testID="select-role"
          >
            <RNText
              style={
                role
                  ? { fontFamily: theme.typography.fontFamily, fontSize: 14, fontWeight: '400', color: theme.colors.text, flex: 1 }
                  : { fontFamily: theme.typography.fontFamily, fontSize: 14, fontWeight: '400', color: theme.colors.textSecondary, flex: 1 }
              }
            >
              {role ? ROLE_OPTIONS.find((r) => r.value === role)?.label : 'Selecione...'}
            </RNText>
            <RNText style={arrowIconStyle}>expand_more</RNText>
          </TouchableOpacity>
          {showRolePicker && (
            <View style={roleDropdownStyle}>
              {ROLE_OPTIONS.map((option, index) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    roleOptionStyle,
                    index === ROLE_OPTIONS.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => {
                    setRole(option.value);
                    setShowRolePicker(false);
                    if (errors.role) setErrors((prev) => ({ ...prev, role: undefined }));
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: role === option.value }}
                  accessibilityLabel={option.label}
                  testID={`role-${option.value}`}
                >
                  <RNText
                    style={{
                      fontFamily: theme.typography.fontFamily,
                      fontSize: 14,
                      fontWeight: '400',
                      color: role === option.value ? theme.colors.primary : theme.colors.text,
                    }}
                  >
                    {option.label}
                  </RNText>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {errors.role ? (
            <RNText style={errorTextStyle}>{errors.role}</RNText>
          ) : null}
        </View>

        {/* Nome Field */}
        <View style={fieldContainerStyle}>
          <RNText style={labelStyle}>Nome</RNText>
          <View style={inputContainerStyle}>
            <TextInput
              ref={nameRef}
              style={inputStyle}
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                if (apiError) setApiError('');
              }}
              placeholder="Nome completo do usuário"
              placeholderTextColor={theme.colors.textSecondary}
              accessibilityLabel="Nome"
              testID="input-name"
            />
          </View>
          {errors.name ? (
            <RNText style={errorTextStyle}>{errors.name}</RNText>
          ) : null}
        </View>

        {/* E-mail Field */}
        <View style={fieldContainerStyle}>
          <RNText style={labelStyle}>E-mail</RNText>
          <View style={inputContainerStyle}>
            <TextInput
              ref={emailRef}
              style={inputStyle}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                if (apiError) setApiError('');
              }}
              placeholder="usuario@email.com"
              placeholderTextColor={theme.colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="E-mail"
              testID="input-email"
            />
          </View>
          {errors.email ? (
            <RNText style={errorTextStyle}>{errors.email}</RNText>
          ) : null}
        </View>

        {/* Senha Field */}
        <View style={fieldContainerStyle}>
          <RNText style={labelStyle}>Senha</RNText>
          <View style={inputContainerStyle}>
            <TextInput
              ref={passwordRef}
              style={inputStyle}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
              }}
              placeholder="Mínimo 8 caracteres"
              placeholderTextColor={theme.colors.textSecondary}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Senha"
              testID="input-password"
            />
            <Pressable
              onPress={() => setShowPassword(!showPassword)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              testID="toggle-password-visibility"
            >
              <RNText style={visibilityIconStyle}>
                {showPassword ? 'visibility_off' : 'visibility'}
              </RNText>
            </Pressable>
          </View>
          {errors.password ? (
            <RNText style={errorTextStyle}>{errors.password}</RNText>
          ) : null}
        </View>

        {/* Confirmar Senha Field */}
        <View style={fieldContainerStyle}>
          <RNText style={labelStyle}>Confirmar Senha</RNText>
          <View style={inputContainerStyle}>
            <TextInput
              ref={confirmPasswordRef}
              style={inputStyle}
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
              }}
              placeholder="Mínimo 8 caracteres"
              placeholderTextColor={theme.colors.textSecondary}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Confirmar Senha"
              testID="input-confirm-password"
            />
            <Pressable
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              accessibilityRole="button"
              accessibilityLabel={showConfirmPassword ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'}
              testID="toggle-confirm-password-visibility"
            >
              <RNText style={visibilityIconStyle}>
                {showConfirmPassword ? 'visibility_off' : 'visibility'}
              </RNText>
            </Pressable>
          </View>
          {errors.confirmPassword ? (
            <RNText style={errorTextStyle}>{errors.confirmPassword}</RNText>
          ) : null}
        </View>

        {/* API Error */}
        {apiError ? (
          <RNText style={errorTextStyle}>{apiError}</RNText>
        ) : null}

        {/* Confirm Button */}
        <TouchableOpacity
          style={[confirmButtonStyle, (loading || deleting) && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={loading || deleting}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Salvar"
          testID="submit-user"
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.surface} size="small" />
          ) : (
            <RNText style={confirmButtonTextStyle}>
              Salvar
            </RNText>
          )}
        </TouchableOpacity>

        {/* Delete Button — only in edit mode */}
        {isEditMode && (
          <TouchableOpacity
            style={cancelButtonStyle}
            onPress={handleDeletePress}
            disabled={deleting || loading}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Excluir"
            testID="delete-user"
          >
            <RNText style={deleteIconStyle}>delete</RNText>
            <RNText style={cancelButtonTextStyle}>Excluir</RNText>
          </TouchableOpacity>
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
