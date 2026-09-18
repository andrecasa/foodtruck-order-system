import React, { useEffect, useRef, useState } from 'react';
import {
  Text as RNText,
  type TextInput,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme/ThemeProvider';
import { FormScreen } from '../components/FormScreen';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import { Input } from '../components/Input';
import { formatCurrencyDigits, parseCurrencyToCentavos } from '../utils/format';
import { apiClient } from '../services/api-client';

/**
 * Novo Item (Create Menu Item) Screen — pixel-perfect match to Penpot design.
 *
 * Penpot specs (extracted from "Novo Item Cardápio" board):
 * - Screen: flex column
 * - AppBar: height 56, bg #FFFFFF, shadow 0 1px 3px rgba(0,0,0,0.06)
 *   - Back Icon: Material Symbols "arrow_back" 24px, color #8B6B5A
 *   - Title: "Novo Item" Inter 18px weight 400, color #3D2020
 *   - Spacer for symmetry
 * - Content: flex column, gap 20, padding 16 (top, left, right), paddingBottom 24
 *   - Field order: Categoria → Nome → Preço
 *   - Each field: flex column, gap 8
 *     - Label: Inter 12px weight 400, color #3D2020
 *     - Input: bg #FFFFFF, height 52, borderRadius 24, border 1px #E8DDD5, paddingHorizontal 16
 *   - Categoria: dropdown style with "Selecione..." placeholder and "expand_more" arrow
 *   - Nome: placeholder "Ex: Pastel de Frango"
 *   - Preço: prefix "R$" + value "0,00"
 *   - Confirm Button: height 44, borderRadius 22, bg #7B2D2D, text "Adicionar" white 14px
 *   - Cancel Button: height 44, borderRadius 22, bg #FFFFFF, border 1px #E8DDD5, text "Cancelar" #3D2020 14px
 */
export function CreateMenuItemScreen() {
  const theme = useTheme();
  const router = useRouter();

  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<string>('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // Refs for focus management
  const nameRef = useRef<TextInput>(null);
  const priceRef = useRef<TextInput>(null);

  // Categories from API
  const [categoryNames, setCategoryNames] = useState<string[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState('');
  const [priceError, setPriceError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [apiError, setApiError] = useState('');

  // Load categories from API
  useEffect(() => {
    apiClient.getCategories().then((cats) => {
      setCategoryNames(cats.filter(c => c.status === 'ativo').map(c => c.name));
    }).catch(() => {
      // Fallback silently — user will see empty dropdown
    });
  }, []);

  // Price input handler — keeps only digits and reformats
  const handlePriceChange = (text: string) => {
    const digits = text.replace(/\D/g, '');
    if (digits.length === 0) {
      setPrice('');
    } else {
      setPrice(formatCurrencyDigits(digits));
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

  // Submit
  const handleSubmit = async () => {
    setApiError('');
    if (!validate()) return;

    const centavos = parseCurrencyToCentavos(price);

    try {
      setLoading(true);
      await apiClient.createMenuItem({
        name: name.trim(),
        price: centavos,
        category,
      });
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/menu');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar item';
      if (message.includes('409')) {
        setApiError('Já existe um item com este nome');
      } else {
        setApiError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Styles (Penpot-aligned) ────────────────────────────────────────────────

  // Content: column, gap 20, padding 16 top/left/right, paddingBottom 24
  const contentStyle: ViewStyle = {
    flexGrow: 1,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 20,
  };

  // Field label: Inter 12px weight 400, color #3D2020
  // Error text: Inter 12px weight 400, color error
  const errorTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.error,
    marginTop: 4,
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <FormScreen
      title="Cardápio"
      onBack={() => router.back()}
      contentContainerStyle={contentStyle}
    >
        {/* 1. Categoria Field (first per Penpot order) */}
        <Select
          label="Categoria"
          value={category}
          options={categoryNames.map((cat) => ({ value: cat, label: cat }))}
          onChange={(value) => {
            setCategory(value);
            if (categoryError) setCategoryError('');
          }}
          error={categoryError || undefined}
          open={showCategoryPicker}
          onOpenChange={setShowCategoryPicker}
          testID="select-category"
          optionTestID={(value) => `category-${value.toLowerCase().replace(/\s+/g, '-')}`}
          accessibilityHint="Toque para selecionar a categoria"
        />

        {/* 2. Nome Field */}
        <Input
          label="Nome do item"
          accessibilityLabel="Nome do item"
          value={name}
          onChangeText={(text) => {
            setName(text.slice(0, 100));
            if (nameError) setNameError('');
            if (apiError) setApiError('');
          }}
          placeholder="Ex: Pastel de Frango"
          error={nameError || undefined}
          maxLength={100}
          inputRef={nameRef}
          testID="input-item-name"
        />

        {/* 3. Preço Field */}
        <Input
          label="Preço"
          accessibilityLabel="Preço"
          value={price ? price.replace('R$ ', '') : ''}
          onChangeText={handlePriceChange}
          placeholder="0,00"
          error={priceError || undefined}
          prefix="R$"
          keyboardType="numeric"
          inputRef={priceRef}
          testID="input-item-price"
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
          testID="submit-menu-item"
        />
    </FormScreen>
  );
}
