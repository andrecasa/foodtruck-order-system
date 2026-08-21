import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text as RNText,
  TouchableOpacity,
  TextInput,
  type ViewStyle,
  type TextStyle,
  type TextInputProps,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme/ThemeProvider';
import { Screen, Header } from '../components/Layout';
import { FormScreen } from '../components/FormScreen';
import { BottomNav } from '../components/BottomNav';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Text } from '../components/Typography';
import { apiClient } from '../services/api-client';

/**
 * Parses a formatted currency string (R$ X,XX) to centavos (integer).
 * Returns 0 if the string is empty or invalid.
 */
function parseCurrencyToCentavos(formatted: string): number {
  const digits = formatted.replace(/\D/g, '');
  if (digits.length === 0) return 0;
  return parseInt(digits, 10);
}

/**
 * Formats a raw digit string as Brazilian Real currency (R$ X,XX).
 */
function formatCurrency(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return '';
  const padded = digits.padStart(3, '0');
  const integerPart = padded.slice(0, padded.length - 2);
  const decimalPart = padded.slice(padded.length - 2);
  const trimmedInteger = integerPart.replace(/^0+/, '') || '0';
  return `R$ ${trimmedInteger},${decimalPart}`;
}

export interface EditMenuItemScreenProps {
  id: string;
  name: string;
  price: number; // centavos
  category: string;
}

/**
 * Editar Item (Edit Menu Item) Screen — pixel-perfect match to Penpot design.
 *
 * Penpot specs (same as "Novo Item Cardápio" board, with title/button text changes):
 * - Screen: flex column
 * - AppBar: height 56, bg #FFFFFF, shadow 0 1px 3px rgba(0,0,0,0.06)
 *   - Back Icon: Material Symbols "arrow_back" 24px, color #8B6B5A
 *   - Title: "Editar Item" Inter 18px weight 400, color #3D2020
 *   - Spacer for symmetry
 * - Content: flex column, gap 20, padding 16 (top, left, right), paddingBottom 24
 *   - Field order: Categoria → Nome → Preço
 *   - Each field: flex column, gap 8
 *     - Label: Inter 12px weight 400, color #3D2020
 *     - Input: bg #FFFFFF, height 52, borderRadius 24, border 1px #E8DDD5, paddingHorizontal 16
 *   - Categoria: dropdown with selected value pre-filled
 *   - Nome: pre-filled with item name
 *   - Preço: prefix "R$" + formatted value pre-filled
 *   - Confirm Button: height 44, borderRadius 22, bg #7B2D2D, text "Salvar" white 14px
 *   - Cancel Button: height 44, borderRadius 22, bg #FFFFFF, border 1px #E8DDD5, text "Cancelar" #3D2020 14px
 */
export function EditMenuItemScreen({ id, name: initialName, price: initialPrice, category: initialCategory }: EditMenuItemScreenProps) {
  const theme = useTheme();
  const router = useRouter();

  // Form state — pre-filled with existing item data
  const [name, setName] = useState(initialName);
  const [price, setPrice] = useState(formatCurrency(String(initialPrice)));
  const [category, setCategory] = useState<string>(initialCategory);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // Categories from API
  const [categoryNames, setCategoryNames] = useState<string[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState('');
  const [priceError, setPriceError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [apiError, setApiError] = useState('');
  const [success, setSuccess] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  // Refs for focus management
  const nameRef = useRef<TextInput>(null);
  const priceRef = useRef<TextInput>(null);

  // Load categories from API
  useEffect(() => {
    apiClient.getCategories().then((cats) => {
      setCategoryNames(cats.filter(c => c.status === 'ativo').map(c => c.name));
    }).catch(() => {
      // Fallback silently
    });
  }, []);

  // Price input handler — keeps only digits and reformats
  const handlePriceChange = (text: string) => {
    const digits = text.replace(/\D/g, '');
    if (digits.length === 0) {
      setPrice('');
    } else {
      setPrice(formatCurrency(digits));
    }
    if (priceError) setPriceError('');
  };

  // Validation
  const validate = (): boolean => {
    let isValid = true;
    let firstErrorField: 'category' | 'name' | 'price' | null = null;

    if (!category) {
      setCategoryError('Selecione uma categoria');
      isValid = false;
      if (!firstErrorField) firstErrorField = 'category';
    } else {
      setCategoryError('');
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Informe o nome do item');
      isValid = false;
      if (!firstErrorField) firstErrorField = 'name';
    } else if (trimmedName.length > 100) {
      setNameError('Nome deve ter no máximo 100 caracteres');
      isValid = false;
      if (!firstErrorField) firstErrorField = 'name';
    } else {
      setNameError('');
    }

    const centavos = parseCurrencyToCentavos(price);
    if (centavos <= 0) {
      setPriceError('Informe um preço válido');
      isValid = false;
      if (!firstErrorField) firstErrorField = 'price';
    } else if (centavos > 999999) {
      setPriceError('Preço máximo é R$ 9.999,99');
      isValid = false;
      if (!firstErrorField) firstErrorField = 'price';
    } else {
      setPriceError('');
    }

    // Focus on the first field with error
    if (firstErrorField === 'category') {
      setShowCategoryPicker(true);
    } else if (firstErrorField === 'name') {
      nameRef.current?.focus();
    } else if (firstErrorField === 'price') {
      priceRef.current?.focus();
    }

    return isValid;
  };

  // Submit — only send changed fields
  const handleSubmit = async () => {
    setApiError('');
    if (!validate()) return;

    const centavos = parseCurrencyToCentavos(price);
    const trimmedName = name.trim();

    // Build update payload with only changed fields
    const updates: { name?: string; price?: number; category?: string } = {};
    if (trimmedName !== initialName) updates.name = trimmedName;
    if (centavos !== initialPrice) updates.price = centavos;
    if (category !== initialCategory) updates.category = category;

    try {
      setLoading(true);
      await apiClient.updateMenuItem(id, updates);
      setSuccess(true);
      setTimeout(() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(tabs)/menu');
        }
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao atualizar item';
      if (message.includes('409')) {
        setApiError('Já existe um item com este nome');
      } else {
        setApiError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Delete handler
  const handleDeletePress = () => {
    setDeleteError(null);
    setDeleteModalVisible(true);
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    setDeleteError(null);

    try {
      await apiClient.deleteMenuItem(id);
      setDeleteModalVisible(false);
      setDeleted(true);
      setSuccess(true);
      setTimeout(() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(tabs)/menu');
        }
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao excluir item';
      setDeleteError(message);
    } finally {
      setDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setDeleteModalVisible(false);
  };

  // ─── Styles (Penpot-aligned) ────────────────────────────────────────────────

  const contentStyle: ViewStyle = {
    flexGrow: 1,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 20,
  };

  const labelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.text,
    marginBottom: 8,
  };

  const inputContainerStyle: ViewStyle = {
    height: 52,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 24,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  };

  const inputContainerErrorStyle: ViewStyle = {
    ...inputContainerStyle,
    borderColor: theme.colors.error,
  };

  const placeholderTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.textSecondary,
    flex: 1,
  };

  const inputValueStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
    flex: 1,
  };

  const prefixStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
    marginRight: 8,
  };

  const arrowIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    fontWeight: '400',
    color: theme.colors.textSecondary,
  };

  const deleteButtonStyle: ViewStyle = {
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

  const deleteButtonTextStyle: TextStyle = {
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

  const categoryDropdownStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: 4,
    overflow: 'hidden',
  };

  const categoryOptionStyle: ViewStyle = {
    height: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  };

  const categoryOptionTextStyle = (selected: boolean): TextStyle => ({
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: selected ? theme.colors.primary : theme.colors.text,
  });

  // ─── Render ─────────────────────────────────────────────────────────────────

  // Success state
  if (success) {
    return (
      <Screen padding={false}>
        <Header title="Cardápio" onBack={() => router.back()} />
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 32,
            gap: 12,
          }}
        >
          <RNText
            style={{
              fontFamily: theme.typography.fontFamily,
              fontSize: 18,
              fontWeight: '500',
              color: theme.colors.text,
              textAlign: 'center',
            }}
          >
            Item {deleted ? 'excluído' : 'atualizado'} com sucesso!
          </RNText>
          <RNText
            style={{
              fontFamily: theme.typography.fontFamily,
              fontSize: 14,
              fontWeight: '400',
              color: theme.colors.textSecondary,
              textAlign: 'center',
              marginTop: 8,
            }}
          >
            Voltando ao cardápio...
          </RNText>
        </View>
      </Screen>
    );
  }

  return (
    <FormScreen
      title="Cardápio"
      onBack={() => router.back()}
      contentContainerStyle={contentStyle}
      footer={<BottomNav />}
    >
        {/* 1. Categoria Field (first per Penpot order) */}
        <View>
          <RNText style={labelStyle}>Categoria</RNText>
          <TouchableOpacity
            style={categoryError ? inputContainerErrorStyle : inputContainerStyle}
            onPress={() => setShowCategoryPicker(!showCategoryPicker)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={category || 'Selecione uma categoria'}
            accessibilityHint="Toque para selecionar a categoria"
            testID="select-category"
          >
            <RNText style={category ? inputValueStyle : placeholderTextStyle}>
              {category || 'Selecione...'}
            </RNText>
            <RNText style={arrowIconStyle}>expand_more</RNText>
          </TouchableOpacity>
          {showCategoryPicker && (
            <View style={categoryDropdownStyle}>
              {categoryNames.map((cat, index) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    categoryOptionStyle,
                    index === categoryNames.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => {
                    setCategory(cat);
                    setShowCategoryPicker(false);
                    if (categoryError) setCategoryError('');
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: category === cat }}
                  accessibilityLabel={cat}
                  testID={`category-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <RNText style={categoryOptionTextStyle(category === cat)}>
                    {cat}
                  </RNText>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {categoryError ? (
            <RNText style={errorTextStyle}>{categoryError}</RNText>
          ) : null}
        </View>

        {/* 2. Nome Field */}
        <View>
          <RNText style={labelStyle}>Nome do item</RNText>
          <View style={nameError ? inputContainerErrorStyle : inputContainerStyle}>
            <InputInline
              ref={nameRef}
              value={name}
              onChangeText={(text) => {
                setName(text.slice(0, 100));
                if (nameError) setNameError('');
                if (apiError) setApiError('');
              }}
              placeholder="Ex: Pastel de Frango"
              testID="input-item-name"
              accessibilityLabel="Nome do item"
              color={theme.colors.text}
              placeholderColor={theme.colors.textSecondary}
            />
          </View>
          {nameError ? (
            <RNText style={errorTextStyle}>{nameError}</RNText>
          ) : null}
        </View>

        {/* 3. Preço Field */}
        <View>
          <RNText style={labelStyle}>Preço</RNText>
          <View style={priceError ? inputContainerErrorStyle : inputContainerStyle}>
            <RNText style={prefixStyle}>R$</RNText>
            <InputInline
              ref={priceRef}
              value={price ? price.replace('R$ ', '') : ''}
              onChangeText={handlePriceChange}
              placeholder="0,00"
              keyboardType="numeric"
              testID="input-item-price"
              accessibilityLabel="Preço"
              color={theme.colors.text}
              placeholderColor={theme.colors.textSecondary}
            />
          </View>
          {priceError ? (
            <RNText style={errorTextStyle}>{priceError}</RNText>
          ) : null}
        </View>

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
          testID="submit-menu-item"
        />

        {/* Delete Button */}
        <TouchableOpacity
          style={deleteButtonStyle}
          onPress={handleDeletePress}
          activeOpacity={0.7}
          disabled={deleting || loading}
          accessibilityRole="button"
          accessibilityLabel="Excluir"
          testID="delete-menu-item"
        >
          <RNText style={deleteIconStyle}>delete</RNText>
          <RNText style={deleteButtonTextStyle}>Excluir</RNText>
        </TouchableOpacity>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        onClose={handleCancelDelete}
        title="Excluir item"
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        variant="danger"
        errorMessage={deleteError}
        loading={deleting}
        testID="delete-confirmation-modal"
      >
        <Text size="md">
          Deseja excluir o item{' '}
          <Text size="md" weight="bold">
            {initialName}
          </Text>
          ? Esta ação não pode ser desfeita.
        </Text>
      </Modal>
    </FormScreen>
  );
}

// ─── InputInline ──────────────────────────────────────────────────────────────

interface InputInlineProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  keyboardType?: TextInputProps['keyboardType'];
  testID?: string;
  accessibilityLabel?: string;
  color: string;
  placeholderColor: string;
}

/**
 * Minimal inline TextInput that matches Penpot field specs:
 * - No extra wrapper/padding (parent container handles it)
 * - Inter 14px weight 400, color #3D2020
 * - Placeholder color from theme.colors.textSecondary
 */
const InputInline = React.forwardRef<TextInput, InputInlineProps>(
  function InputInline(
    { value, onChangeText, placeholder, keyboardType = 'default', testID, accessibilityLabel, color, placeholderColor },
    ref,
  ) {
    return (
      <TextInput
        ref={ref}
        style={{
          flex: 1,
          fontFamily: 'Inter',
          fontSize: 14,
          fontWeight: '400',
          color: color,
          paddingVertical: 0,
          height: 52,
        }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderColor}
        keyboardType={keyboardType}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
      />
    );
  },
);
