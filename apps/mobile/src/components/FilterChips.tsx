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
  /** Material Symbols Outlined icon name */
  icon?: string;
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
 * FilterChips — horizontal row of toggleable status filter tabs with icons.
 *
 * Penpot specs (icon tabs with solid active state):
 * - Container: white bg, borderRadius 16, flexDirection row
 * - Each tab: flex 1, height 76, column, alignItems center, justifyContent center
 * - Icon area: width 75, height 36, borderRadius 18
 *   - Active: solid status color bg, white icon 22px
 *   - Inactive: status color at 8% opacity bg, status color icon at 50% opacity
 * - Label: Inter 10px weight 400, color = statusColor (active) or textSecondary (inactive)
 */
export function FilterChips({ options, selected, onSelectionChange, testID }: FilterChipsProps) {
  const theme = useTheme();

  const handleToggle = (key: string) => {
    if (selected.includes(key)) {
      onSelectionChange(selected.filter(k => k !== key));
    } else {
      onSelectionChange([...selected, key]);
    }
  };

  const hasIcons = options.some(o => o.icon);

  // If no icons provided, fall back to simple chip style
  if (!hasIcons) {
    return (
      <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="tablist" testID={testID}>
        {options.map(option => {
          const isActive = selected.includes(option.key);
          const chipStyle: ViewStyle = {
            height: 32,
            borderRadius: 16,
            paddingHorizontal: 12,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: isActive ? option.color + '1F' : theme.colors.surface,
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

  // Icon tabs layout
  const containerStyle: ViewStyle = {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    paddingVertical: 10,
  };

  return (
    <View style={containerStyle} accessibilityRole="tablist" testID={testID}>
      {options.map(option => {
        const isActive = selected.includes(option.key);

        const tabStyle: ViewStyle = {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        };

        const iconAreaStyle: ViewStyle = {
          width: 75,
          height: 36,
          borderRadius: 18,
          backgroundColor: isActive ? option.color : option.color + '14', // solid or 8%
          alignItems: 'center',
          justifyContent: 'center',
        };

        const iconStyle: TextStyle = {
          fontFamily: 'Material Symbols Outlined',
          fontSize: 22,
          fontWeight: '400',
          color: isActive ? theme.colors.surface : option.color,
          opacity: isActive ? 1 : 0.5,
        };

        const labelStyle: TextStyle = {
          fontFamily: theme.typography.fontFamily,
          fontSize: 10,
          fontWeight: '400',
          color: isActive ? option.color : theme.colors.textSecondary,
        };

        return (
          <Pressable
            key={option.key}
            style={tabStyle}
            onPress={() => handleToggle(option.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`Filtrar ${option.label}`}
            testID={testID ? `${testID}-${option.key}` : undefined}
          >
            <View style={iconAreaStyle}>
              <Text style={iconStyle}>{option.icon}</Text>
            </View>
            <Text style={labelStyle}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
