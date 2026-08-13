import React, { useCallback, useEffect, useState } from 'react';
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
import { Screen, ScrollContainer } from '../components/Layout';
import { BottomNav } from '../components/BottomNav';
import { createUser, updateUser, getUserById } from '../services/userService';
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

  // UI state
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState('');

  // ─── Load user data in edit mode ────────────────────────────────────────────

  const loadUser = useCallback(async () => {
    if (!params.id) return;
    try {
      setFetchLoading(true);
      const user = await getUserById(params.id);
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

    // Name: 1-100 chars, not only spaces
    const trimmedName = name.trim();
    if (!trimmedName) {
      newErrors.name = 'Nome é obrigatório';
    } else if (trimmedName.length > 100) {
      newErrors.name = 'Nome deve ter no máximo 100 caracteres';
    } else if (/^\s+$/.test(name)) {
      newErrors.name = 'Nome não pode conter apenas espaços';
    }

    // Email: valid format, ≤254 chars
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      newErrors.email = 'E-mail é obrigatório';
    } else if (trimmedEmail.length > 254) {
      newErrors.email = 'E-mail deve ter no máximo 254 caracteres';
    } else if (!isValidEmail(trimmedEmail)) {
      newErrors.email = 'E-mail inválido';
    }

    // Password: 8-72 chars (required in creation, optional in edit)
    if (!isEditMode) {
      if (!password) {
        newErrors.password = 'Senha é obrigatória';
      } else if (password.length < 8) {
        newErrors.password = 'Senha deve ter no mínimo 8 caracteres';
      } else if (password.length > 72) {
        newErrors.password = 'Senha deve ter no máximo 72 caracteres';
      }
    } else if (password) {
      // In edit mode, only validate if filled
      if (password.length < 8) {
        newErrors.password = 'Senha deve ter no mínimo 8 caracteres';
      } else if (password.length > 72) {
        newErrors.password = 'Senha deve ter no máximo 72 caracteres';
      }
    }

    // Confirm password: must match
    if (password && confirmPassword !== password) {
      newErrors.confirmPassword = 'Senhas não coincidem';
    } else if (!isEditMode && !confirmPassword) {
      newErrors.confirmPassword = 'Confirmação de senha é obrigatória';
    }

    // Role: required
    if (!role) {
      newErrors.role = 'Função é obrigatória';
    }

    setErrors(newErrors);
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

        await updateUser(params.id, updateData);
      } else {
        const createData: CreateUserInput = {
          name: name.trim(),
          email: email.trim(),
          password,
          role: role as UserRole,
        };
        await createUser(createData);
      }

      router.back();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar usuário';
      setApiError(message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const appBarStyle: ViewStyle = {
    height: 56,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    alignItems: 'center',
  };

  const backIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: '#8B6B5A',
  };

  const titleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 18,
    fontWeight: '400',
    color: '#3D2020',
  };

  const contentStyle: ViewStyle = {
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
    color: '#3D2020',
  };

  const inputContainerStyle: ViewStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    height: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E8DDD5',
  };

  const inputStyle: TextStyle = {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: '#3D2020',
    paddingVertical: 0,
    height: 48,
  };

  const visibilityIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    color: '#8B6B5A',
  };

  const arrowIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    color: '#8B6B5A',
  };

  const confirmButtonStyle: ViewStyle = {
    width: '100%',
    height: 44,
    borderRadius: 22,
    backgroundColor: '#7B2D2D',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const confirmButtonTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
  };

  const cancelButtonStyle: ViewStyle = {
    width: '100%',
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8DDD5',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const cancelButtonTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: '#3D2020',
  };

  const errorTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.error,
    marginTop: 4,
  };

  const roleDropdownStyle: ViewStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DDD5',
    marginTop: 4,
    overflow: 'hidden',
  };

  const roleOptionStyle: ViewStyle = {
    height: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F5F0EB',
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
          <RNText style={titleStyle}>Editar Usuário</RNText>
        </View>
        <View style={centeredContainerStyle}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <RNText
            style={{
              fontFamily: theme.typography.fontFamily,
              fontSize: 14,
              color: '#8B6B5A',
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
          <RNText style={titleStyle}>Editar Usuário</RNText>
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
        <RNText style={titleStyle}>
          {isEditMode ? 'Editar Usuário' : 'Novo Usuário'}
        </RNText>
      </View>

      <ScrollContainer padding={false} style={contentStyle}>
        {/* Nome Field */}
        <View style={fieldContainerStyle}>
          <RNText style={labelStyle}>Nome</RNText>
          <View style={inputContainerStyle}>
            <TextInput
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
                  ? { fontFamily: theme.typography.fontFamily, fontSize: 14, fontWeight: '400', color: '#3D2020', flex: 1 }
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
                      color: role === option.value ? theme.colors.primary : '#3D2020',
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
          accessibilityLabel={isEditMode ? 'Editar Usuário' : 'Criar Usuário'}
          testID="submit-user"
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <RNText style={confirmButtonTextStyle}>
              {isEditMode ? 'Editar Usuário' : 'Criar Usuário'}
            </RNText>
          )}
        </TouchableOpacity>

        {/* Cancel Button */}
        <TouchableOpacity
          style={cancelButtonStyle}
          onPress={() => router.back()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Cancelar"
          testID="cancel-user"
        >
          <RNText style={cancelButtonTextStyle}>Cancelar</RNText>
        </TouchableOpacity>
      </ScrollContainer>

      {/* Bottom Navigation */}
      <BottomNav />
    </Screen>
  );
}
