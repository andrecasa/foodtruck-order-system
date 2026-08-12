import React from 'react';
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
}

/**
 * FilterChips — horizontal row of toggleable status filter pills (web version).
 *
 * Penpot specs (from steering/penpot-to-code.md):
 * - Container: flexDirection row, gap 8px
 * - Chip: height 32px, borderRadius 16px, paddingHorizontal 12px
 * - Active: backgroundColor = statusColor at 12% opacity, no border, text = statusColor
 * - Inactive: backgroundColor = #FFFFFF, border 1px #E8DDD5, text = statusColor
 * - Font: Inter 12px weight 400
 */
export function FilterChips({ options, selected, onSelectionChange }: FilterChipsProps) {
  const theme = useTheme();

  const handleToggle = (key: string) => {
    if (selected.includes(key)) {
      // Don't allow deselecting all — keep at least one
      if (selected.length > 1) {
        onSelectionChange(selected.filter((k) => k !== key));
      }
    } else {
      onSelectionChange([...selected, key]);
    }
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    gap: '8px',
    flexWrap: 'wrap',
  };

  return (
    <div style={containerStyle} role="tablist" aria-label="Filtro de status">
      {options.map((option) => {
        const isActive = selected.includes(option.key);

        const chipStyle: React.CSSProperties = {
          height: '32px',
          borderRadius: '16px',
          padding: '0 12px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isActive ? `${option.color}1F` : '#FFFFFF', // 1F = ~12% opacity
          border: isActive ? 'none' : `1px solid ${theme.colors.divider}`,
          fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
          fontSize: '12px',
          fontWeight: 400,
          color: option.color,
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background-color 0.15s ease, border 0.15s ease',
        };

        return (
          <button
            key={option.key}
            type="button"
            style={chipStyle}
            onClick={() => handleToggle(option.key)}
            role="tab"
            aria-selected={isActive}
            aria-label={`Filtrar ${option.label}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
