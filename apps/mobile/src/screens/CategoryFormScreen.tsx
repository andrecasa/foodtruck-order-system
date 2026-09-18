import React, { useState } from 'react';
import {
  Text as RNText,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme';
import { FormScreen } from '../components/FormScreen';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
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
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ─── Delete ─────────────────────────────────────────────────────────────────

  const handleDeletePress = () => {
    setDeleteError(null);
    setDeleteModalVisible(true);
  };

  const handleConfirmDelete = async () => {
    if (!id) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      await apiClient.deleteCategory(id);
      setDeleteModalVisible(false);
      router.back();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao excluir categoria';
      setDeleteError(message);
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
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <FormScreen
      title="Categoria"
      onBack={() => router.back()}
      contentContainerStyle={contentStyle}
    >
        {/* Nome Field */}
        <Input
          label="Nome"
          accessibilityLabel="Nome da categoria"
          value={categoryName}
          onChangeText={(text) => {
            setCategoryName(text);
            if (fieldError) setFieldError('');
            if (apiError) setApiError('');
          }}
          placeholder="Nome da categoria"
          error={fieldError || undefined}
          maxLength={101}
          autoFocus
          testID="input-category-name"
        />

        {/* API Error */}
        {apiError ? (
          <RNText style={errorTextStyle} testID="api-error">
            {apiError}
          </RNText>
        ) : null}

        {/* Submit Button */}
        <Button
          title="Salvar"
          variant="primary"
          size="lg"
          fullWidth
          onPress={handleSubmit}
          loading={loading}
          disabled={loading || deleting}
          testID="submit-category"
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
            testID="delete-category"
          />
        )}

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
        errorMessage={deleteError}
        loading={deleting}
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
    </FormScreen>
  );
}
