import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text as RNText,
  TextInput,
  TouchableOpacity,
  type ViewStyle,
  type TextStyle,
  type TextInputProps,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme/ThemeProvider';
import { Screen, ScrollContainer, Header } from '../components/Layout';
import { Button } from '../components/Button';
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
  const [success, setSuccess] = useState(false);

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
      setSuccess(true);
      setTimeout(() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(tabs)/menu');
        }
      }, 1500);
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
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 20,
  };

  // Field label: Inter 12px weight 400, color #3D2020
  const labelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.text,
    marginBottom: 8,
  };

  // Input container: height 52, bg #FFFFFF, border 1px #E8DDD5, borderRadius 24, paddingHorizontal 16, row, alignItems center
  const inputContainerStyle: ViewStyle = {
    height: 52,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    borderRadius: 24,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  };

  // Input container with error
  const inputContainerErrorStyle: ViewStyle = {
    ...inputContainerStyle,
    borderColor: theme.colors.error,
  };

  // Placeholder text: Inter 14px weight 400, color #8B6B5A opacity 0.6
  const placeholderTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(139, 107, 90, 0.6)',
    flex: 1,
  };

  // Input value text: Inter 14px weight 400, color #3D2020
  const inputValueStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
    flex: 1,
  };

  // Prefix "R$": Inter 14px weight 400, color #3D2020
  const prefixStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
    marginRight: 8,
  };

  // Arrow icon (expand_more): Material Symbols 20px, color #8B6B5A
  const arrowIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    fontWeight: '400',
    color: theme.colors.textSecondary,
  };



  // Error text: Inter 12px weight 400, color error
  const errorTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.error,
    marginTop: 4,
  };

  // Category picker dropdown
  const categoryDropdownStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.divider,
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
            Item criado com sucesso!
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
    <Screen padding={false}>
      {/* Header */}
      <Header title="Cardápio" onBack={() => router.back()} />

      <ScrollContainer padding={false} style={contentStyle}>
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
            <RNText
              style={{ display: 'none' }}
              accessibilityRole="text"
            />
            {/* Using a TextInput inline to keep Penpot styling exact */}
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
          disabled={loading}
          testID="submit-menu-item"
        />
      </ScrollContainer>
    </Screen>
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
}

/**
 * Minimal inline TextInput that matches Penpot field specs:
 * - No extra wrapper/padding (parent container handles it)
 * - Inter 14px weight 400, color #3D2020
 * - Placeholder color rgba(139,107,90,0.6)
 */
const InputInline = React.forwardRef<TextInput, InputInlineProps>(
  function InputInline(
    { value, onChangeText, placeholder, keyboardType = 'default', testID, accessibilityLabel, color },
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
        placeholderTextColor="rgba(139, 107, 90, 0.6)"
        keyboardType={keyboardType}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
      />
    );
  },
);
