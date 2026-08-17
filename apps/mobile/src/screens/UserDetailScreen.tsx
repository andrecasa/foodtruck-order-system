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
import { withOpacity } from '../utils/color';
import { Screen, ScrollContainer } from '../components/Layout';
import { Modal } from '../components/Modal';
import { BottomNav } from '../components/BottomNav';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { apiClient } from '../services/api-client';
import type { UpdateUserInput, UserRole, User } from '../types/user';

// ─── Role options for the selector ─────────────────────────────────────────

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'atendente', label: 'Atendente' },
  { value: 'preparador', label: 'Preparador' },
];

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  atendente: 'Atendente',
  preparador: 'Preparador',
};

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

  const ROLE_BADGE_COLORS: Record<UserRole, string> = {
    admin: theme.colors.primary,
    atendente: theme.colors.preparando,
    preparador: theme.colors.success,
  };

  // User data (fetched)
  const [user, setUser] = useState<User | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
  const [fetchLoading, setFetchLoading] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState('');

  // Delete modal state
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
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
    try {
      setDeleting(true);
      await apiClient.deleteUser(params.id);
      setDeleteModalVisible(false);
      router.back();
    } catch (err) {
      setDeleteModalVisible(false);
      const message = err instanceof Error ? err.message : 'Erro ao excluir usuário';
      setApiError(message);
    } finally {
      setDeleting(false);
    }
  };

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const appBarStyle: ViewStyle = {
    height: 56,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    alignItems: 'center',
    boxShadow: '0px 1px 3px 0px rgba(0, 0, 0, 0.06)',
    elevation: 2,
  };

  const backIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: theme.colors.textSecondary,
  };

  const titleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 18,
    fontWeight: '400',
    color: theme.colors.text,
    flex: 1,
    textAlign: 'center',
  };

  const contentStyle: ViewStyle = {
    paddingHorizontal: 16,
    paddingVertical: 24,
    gap: 20,
  };

  // User Info Card — same style as list card (Penpot: badge + name + email + switch)
  const userInfoCardStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.divider,
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

  const roleBadgeStyle = (badgeRole: UserRole): ViewStyle => ({
    backgroundColor: withOpacity(ROLE_BADGE_COLORS[badgeRole], 0.12),
    borderRadius: 10,
    paddingHorizontal: 8,
    height: 15,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
  });

  const roleBadgeTextStyle = (badgeRole: UserRole): TextStyle => ({
    fontFamily: theme.typography.fontFamily,
    fontSize: 8,
    fontWeight: '400',
    color: ROLE_BADGE_COLORS[badgeRole],
  });

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
    borderColor: theme.colors.divider,
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

  // Danger button (Excluir) — Penpot "Editar Usuário" spec
  const dangerButtonStyle: ViewStyle = {
    width: '100%',
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.error,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'center',
  };

  const dangerIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    color: theme.colors.error,
  };

  const dangerTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
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
    borderColor: theme.colors.divider,
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

  const modalBodyTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
  };

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (fetchLoading) {
    return (
      <Screen padding={false} hasHeader={false}>
        <View style={appBarStyle} accessibilityRole="header">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            testID="back-button"
          >
            <RNText style={backIconStyle}>arrow_back</RNText>
          </Pressable>
          <RNText style={titleStyle}>Usuário</RNText>
          <View style={{ width: 24 }} />
        </View>
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

  if (apiError && !user) {
    return (
      <Screen padding={false} hasHeader={false}>
        <View style={appBarStyle} accessibilityRole="header">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            testID="back-button"
          >
            <RNText style={backIconStyle}>arrow_back</RNText>
          </Pressable>
          <RNText style={titleStyle}>Usuário</RNText>
          <View style={{ width: 24 }} />
        </View>
        <View style={centeredContainerStyle}>
          <RNText
            style={{
              fontFamily: theme.typography.fontFamily,
              fontSize: 14,
              color: theme.colors.error,
              textAlign: 'center',
            }}
          >
            {apiError}
          </RNText>
          <TouchableOpacity
            style={{ marginTop: 16 }}
            onPress={loadUser}
            accessibilityRole="button"
            accessibilityLabel="Tentar novamente"
          >
            <RNText
              style={{
                fontFamily: theme.typography.fontFamily,
                fontSize: 14,
                color: theme.colors.primary,
              }}
            >
              Tentar novamente
            </RNText>
          </TouchableOpacity>
        </View>
        <BottomNav />
      </Screen>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <Screen padding={false} hasHeader={false}>
      {/* AppBar */}
      <View style={appBarStyle} accessibilityRole="header">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          testID="back-button"
        >
          <RNText style={backIconStyle}>arrow_back</RNText>
        </Pressable>
        <RNText style={titleStyle}>Usuário</RNText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollContainer padding={false} style={contentStyle}>
        {/* User Info Card — same as list card with switch toggle */}
        {user && (
          <View style={userInfoCardStyle} testID="user-info-card">
            <View style={userInfoLeftStyle}>
              <View style={roleBadgeStyle(user.role)}>
                <RNText style={roleBadgeTextStyle(user.role)}>
                  {ROLE_LABELS[user.role]}
                </RNText>
              </View>
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
                  : { fontFamily: theme.typography.fontFamily, fontSize: 14, fontWeight: '400', color: 'rgba(139, 107, 90, 0.6)', flex: 1 }
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
              placeholderTextColor="rgba(139, 107, 90, 0.6)"
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
              placeholderTextColor="rgba(139, 107, 90, 0.6)"
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
              placeholderTextColor="rgba(139, 107, 90, 0.6)"
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
              placeholderTextColor="rgba(139, 107, 90, 0.6)"
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
          style={[confirmButtonStyle, loading && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Salvar"
          testID="submit-user"
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.surface} size="small" />
          ) : (
            <RNText style={confirmButtonTextStyle}>Salvar</RNText>
          )}
        </TouchableOpacity>

        {/* Danger Button — Excluir */}
        <Pressable
          style={[dangerButtonStyle, deleting && { opacity: 0.5 }]}
          onPress={() => setDeleteModalVisible(true)}
          disabled={deleting}
          accessibilityRole="button"
          accessibilityLabel="Excluir"
          testID="delete-user-button"
        >
          <RNText style={dangerIconStyle}>delete</RNText>
          <RNText style={dangerTextStyle}>Excluir</RNText>
        </Pressable>
      </ScrollContainer>

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

      {/* Bottom Navigation */}
      <BottomNav />
    </Screen>
  );
}
