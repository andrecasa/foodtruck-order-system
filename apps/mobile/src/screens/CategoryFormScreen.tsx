import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { useTheme } from '../theme';
import { Screen, ScrollContainer } from '../components/Layout';
import { BottomNav } from '../components/BottomNav';
import { Modal } from '../components/Modal';
import { Text } from '../components/Typography';
import { apiClient } from '../services/api-client';

// ─── Props ──────────────────────────────────────────────────────────────────

interface CategoryFormScreenProps {
  id?: string;
  name?: string;
}

/**
 * Category Form Screen — create or edit a category.
 *
 * Create mode: no `id` prop → header "Nova Categoria", empty field.
 * Edit mode: `id` prop present → header "Editar Categoria", name pre-filled.
 *
 * Requirements: 2.1, 2.5, 2.6, 3.1, 3.7, 3.8
 */
export function CategoryFormScreen({ id, name: initialName }: CategoryFormScreenProps) {
  const theme = useTheme();
  const router = useRouter();

  const isEditMode = Boolean(id);

  // Form state
  const [categoryName, setCategoryName] = useState(initialName || '');

  // UI state
  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [apiError, setApiError] = useState('');
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ─── Delete ─────────────────────────────────────────────────────────────────

  const handleDeletePress = () => {
    setDeleteModalVisible(true);
  };

  const handleConfirmDelete = async () => {
    if (!id) return;
    setDeleteModalVisible(false);
    setDeleting(true);
    setApiError('');

    try {
      await apiClient.deleteCategory(id);
      router.back();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao excluir categoria';
      setApiError(message);
    } finally {
      setDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setDeleteModalVisible(false);
  };

  // ─── Validation ─────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const trimmed = categoryName.trim();

    if (!trimmed) {
      setFieldError('Nome é obrigatório');
      return false;
    }

    if (trimmed.length > 100) {
      setFieldError('Nome deve ter entre 1 e 100 caracteres');
      return false;
    }

    setFieldError('');
    return true;
  };

  // ─── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setApiError('');
    if (!validate()) return;

    const trimmedName = categoryName.trim();

    try {
      setLoading(true);

      if (isEditMode && id) {
        await apiClient.updateCategory(id, { name: trimmedName });
      } else {
        await apiClient.createCategory({ name: trimmedName });
      }

      router.back();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar categoria';
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
    flex: 1,
    textAlign: 'center',
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

  const inputStyle: TextStyle = {
    height: 52,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: fieldError ? theme.colors.error : '#E8DDD5',
    paddingHorizontal: 16,
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: '#3D2020',
    backgroundColor: '#FFFFFF',
  };

  const errorTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.error,
  };

  const submitButtonStyle: ViewStyle = {
    width: '100%',
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  };

  const submitButtonDisabledStyle: ViewStyle = {
    ...submitButtonStyle,
    opacity: 0.6,
  };

  const submitButtonTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 16,
    fontWeight: '400',
    color: '#FFFFFF',
  };

  const deleteButtonContainerStyle: ViewStyle = {
    width: '100%',
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  };

  const deleteButtonTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 16,
    fontWeight: '400',
    color: theme.colors.error,
  };

  const deleteIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 18,
    color: theme.colors.error,
  };

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
          {isEditMode ? 'Salvar' : 'Categoria'}
        </RNText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollContainer padding={false} style={contentStyle}>
        {/* Nome Field */}
        <View style={fieldContainerStyle}>
          <RNText style={labelStyle}>Nome</RNText>
          <TextInput
            style={inputStyle}
            value={categoryName}
            onChangeText={(text) => {
              setCategoryName(text);
              if (fieldError) setFieldError('');
              if (apiError) setApiError('');
            }}
            placeholder="Nome da categoria"
            placeholderTextColor="rgba(139, 107, 90, 0.6)"
            maxLength={101}
            autoFocus
            accessibilityLabel="Nome da categoria"
            testID="input-category-name"
          />
          {fieldError ? (
            <RNText style={errorTextStyle} testID="field-error">
              {fieldError}
            </RNText>
          ) : null}
        </View>

        {/* API Error */}
        {apiError ? (
          <RNText style={errorTextStyle} testID="api-error">
            {apiError}
          </RNText>
        ) : null}

        {/* Submit Button */}
        <TouchableOpacity
          style={loading || deleting ? submitButtonDisabledStyle : submitButtonStyle}
          onPress={handleSubmit}
          disabled={loading || deleting}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Salvar"
          testID="submit-category"
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <RNText style={submitButtonTextStyle}>Salvar</RNText>
          )}
        </TouchableOpacity>

        {/* Delete Button — only in edit mode */}
        {isEditMode && (
          <TouchableOpacity
            style={deleteButtonContainerStyle}
            onPress={handleDeletePress}
            disabled={deleting || loading}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Excluir"
            testID="delete-category"
          >
            <RNText style={deleteIconStyle}>delete</RNText>
            <RNText style={deleteButtonTextStyle}>Excluir</RNText>
          </TouchableOpacity>
        )}
      </ScrollContainer>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        onClose={handleCancelDelete}
        title="Excluir categoria"
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        variant="danger"
        testID="delete-category-modal"
      >
        <Text size="md">
          Deseja excluir a categoria{' '}
          <Text size="md" weight="bold">
            {initialName}
          </Text>
          ? Esta ação não pode ser desfeita.
        </Text>
      </Modal>

      {/* Bottom Navigation */}
      <BottomNav />
    </Screen>
  );
}
