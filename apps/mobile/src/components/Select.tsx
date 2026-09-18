import {
  View,
  Text,
  TouchableOpacity,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

/** Uma opção do seletor: valor interno + rótulo exibido. */
export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string = string> {
  /** Rótulo exibido acima do seletor. */
  label?: string;
  /** Valor atualmente selecionado (vazio = nada selecionado). */
  value: T | '';
  /** Opções disponíveis. */
  options: SelectOption<T>[];
  /** Callback quando uma opção é escolhida. */
  onChange: (value: T) => void;
  /** Texto exibido quando nada está selecionado. */
  placeholder?: string;
  /** Mensagem de erro exibida abaixo (também pinta a borda de erro). */
  error?: string;
  /**
   * Controla se a lista de opções está aberta. É controlado externamente para
   * que a tela possa abrir o seletor ao focar o primeiro campo inválido na
   * validação (paridade com o comportamento anterior).
   */
  open: boolean;
  /** Callback para alternar o estado aberto/fechado. */
  onOpenChange: (open: boolean) => void;
  /** Altura do gatilho em px (padrão 52). */
  height?: number;
  /** testID do gatilho (ex.: 'select-role', 'select-category'). */
  testID?: string;
  /**
   * Deriva o testID de cada opção a partir do seu valor
   * (ex.: value => `role-${value}`). Opcional.
   */
  optionTestID?: (value: T) => string;
  /** accessibilityHint do gatilho. */
  accessibilityHint?: string;
}

/**
 * Seletor (dropdown) temático reutilizável.
 *
 * Substitui o padrão duplicado "TouchableOpacity que abre uma lista de opções"
 * antes reimplementado nas telas de Usuário (Função) e de Cardápio (Categoria).
 * Mantém o mesmo visual do `Input` (label 12px, container com borda por estado,
 * borderRadius do tema) e a acessibilidade das opções (role radio + selected).
 */
export function Select<T extends string = string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Selecione...',
  error,
  open,
  onOpenChange,
  height = 52,
  testID,
  optionTestID,
  accessibilityHint,
}: SelectProps<T>) {
  const theme = useTheme();

  const selectedOption = options.find((o) => o.value === value);

  const containerStyle: ViewStyle = {
    gap: 8,
  };

  const labelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.text,
  };

  const triggerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: error ? theme.colors.error : theme.colors.border,
    borderRadius: theme.borderRadius.md,
    height,
    paddingHorizontal: 16,
    gap: 10,
  };

  const valueTextStyle: TextStyle = {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: selectedOption ? theme.colors.text : theme.colors.textSecondary,
  };

  const arrowIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    fontWeight: '400',
    color: theme.colors.textSecondary,
  };

  const dropdownStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: 4,
    overflow: 'hidden',
  };

  const optionStyle: ViewStyle = {
    height: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  };

  const optionTextStyle = (selected: boolean): TextStyle => ({
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: selected ? theme.colors.primary : theme.colors.text,
  });

  const errorStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.xs,
    fontWeight: '400',
    color: theme.colors.error,
    marginTop: theme.spacing.xs,
  };

  return (
    <View style={containerStyle}>
      {label ? (
        <Text style={labelStyle} accessibilityRole="text">
          {label}
        </Text>
      ) : null}

      <TouchableOpacity
        style={triggerStyle}
        onPress={() => onOpenChange(!open)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={selectedOption ? selectedOption.label : placeholder}
        accessibilityHint={accessibilityHint}
        testID={testID}
      >
        <Text style={valueTextStyle}>
          {selectedOption ? selectedOption.label : placeholder}
        </Text>
        <Text
          style={arrowIconStyle}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          expand_more
        </Text>
      </TouchableOpacity>

      {open && (
        <View style={dropdownStyle}>
          {options.map((option, index) => (
            <TouchableOpacity
              key={option.value}
              style={[
                optionStyle,
                index === options.length - 1 && { borderBottomWidth: 0 },
              ]}
              onPress={() => {
                onChange(option.value);
                onOpenChange(false);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: value === option.value }}
              accessibilityLabel={option.label}
              testID={optionTestID ? optionTestID(option.value) : undefined}
            >
              <Text style={optionTextStyle(value === option.value)}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {error ? (
        <Text
          style={errorStyle}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
