import React from 'react';
import { Pressable, Text, View, type ViewStyle, type TextStyle } from 'react-native';
import { useTheme } from '../theme';

export interface FilterChipOption {
  /** Unique key for the chip */
  key: string;
  /** Display label */
  label: string;
  /** Color to use for tinting (active bg + text) */
  color: string;
}

export interface FilterChipsProps {
  /** Available filter options */
  options: FilterChipOption[];
  /** Currently selected option keys */
  selected: string[];
  /** Called when selection changes */
  onSelectionChange: (selected: string[]) => void;
  /** Optional test ID prefix */
  testID?: string;
}

/**
 * FilterChips — horizontal row of toggleable status filter pills.
 *
 * Penpot specs (from Design System / steering):
 * - Container: flexDirection row, gap 8px, horizontalSizing fill
 * - Chip: height 32px, borderRadius 16px, paddingHorizontal 12px
 * - Active: backgroundColor = statusColor at 12% opacity, text = statusColor
 * - Inactive: backgroundColor = #FFFFFF, border 1px #E8DDD5, text = statusColor
 * - Font: Inter 12px weight 400
 */
export function FilterChips({ options, selected, onSelectionChange, testID }: FilterChipsProps) {
  const theme = useTheme();

  const handleToggle = (key: string) => {
    if (selected.includes(key)) {
      // Don't allow deselecting all — keep at least one
      if (selected.length > 1) {
        onSelectionChange(selected.filter(k => k !== key));
      }
    } else {
      onSelectionChange([...selected, key]);
    }
  };

  const containerStyle: ViewStyle = {
    flexDirection: 'row',
    gap: 8,
  };

  return (
    <View style={containerStyle} accessibilityRole="tablist" testID={testID}>
      {options.map(option => {
        const isActive = selected.includes(option.key);

        const chipStyle: ViewStyle = {
          height: 32,
          borderRadius: 16,
          paddingHorizontal: 12,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: isActive ? option.color + '1F' : '#FFFFFF', // 1F = ~12% opacity
          borderWidth: isActive ? 0 : 1,
          borderColor: isActive ? undefined : theme.colors.divider,
        };

        const textStyle: TextStyle = {
          fontFamily: theme.typography.fontFamily,
          fontSize: 12,
          fontWeight: '400',
          color: option.color,
        };

        return (
          <Pressable
            key={option.key}
            style={chipStyle}
            onPress={() => handleToggle(option.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`Filtrar ${option.label}`}
            testID={testID ? `${testID}-${option.key}` : undefined}
          >
            <Text style={textStyle}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
