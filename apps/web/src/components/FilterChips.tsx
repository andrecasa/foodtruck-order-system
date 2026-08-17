import React from 'react';
import { useTheme } from '../theme';

export interface FilterChipOption {
  /** Unique key for the chip */
  key: string;
  /** Display label */
  label: string;
  /** Color to use for tinting (active bg + text) */
  color: string;
  /** Material Symbol icon name */
  icon: string;
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
 * FilterChips — icon-based status filter tabs matching Penpot mobile.
 *
 * Uses theme for surface color and font family.
 * - Container: surface bg, borderRadius 16px, flexDirection row
 * - Each tab: column layout, alignItems center, gap 6px
 * - Icon circle: 75x36px, borderRadius 18px
 *   - Active: bg = statusColor 100%, icon white
 *   - Inactive: bg = statusColor 8%, icon = statusColor 50%
 * - Label: fontFamily 10px weight 500, color = statusColor
 */
export function FilterChips({ options, selected, onSelectionChange }: FilterChipsProps) {
  const theme = useTheme();

  const handleToggle = (key: string) => {
    if (selected.includes(key)) {
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
    backgroundColor: theme.colors.surface,
    borderRadius: '16px',
    overflow: 'hidden',
    width: '100%',
    minWidth: '250px',
    maxWidth: '500px',
  };

  return (
    <div style={containerStyle} role="tablist" aria-label="Filtro de status">
      {options.map((option) => {
        const isActive = selected.includes(option.key);

        const tabStyle: React.CSSProperties = {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
          paddingTop: '10px',
          paddingBottom: '6px',
          paddingLeft: '8px',
          paddingRight: '8px',
          cursor: 'pointer',
          border: 'none',
          background: 'none',
          flex: '1 1 0',
          minWidth: 0,
        };

        const iconCircleStyle: React.CSSProperties = {
          width: '100%',
          maxWidth: '75px',
          height: '36px',
          borderRadius: '18px',
          backgroundColor: isActive ? option.color : `${option.color}14`, // 14 hex = 8%
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background-color 0.2s ease',
          aspectRatio: '75 / 36',
        };

        const iconStyle: React.CSSProperties = {
          fontFamily: 'Material Symbols Outlined',
          fontSize: 'clamp(16px, 5vw, 22px)',
          fontWeight: 400,
          color: isActive ? theme.colors.surface : option.color,
          opacity: isActive ? 1 : 0.5,
          lineHeight: 1,
        };

        const labelStyle: React.CSSProperties = {
          fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
          fontSize: `${theme.typography.sizes.xs}px`,
          fontWeight: theme.typography.weights.medium,
          color: option.color,
          lineHeight: 1,
          whiteSpace: 'nowrap',
        };

        return (
          <button
            key={option.key}
            type="button"
            style={tabStyle}
            onClick={() => handleToggle(option.key)}
            role="tab"
            aria-selected={isActive}
            aria-label={`Filtrar ${option.label}`}
          >
            <div style={iconCircleStyle}>
              <span style={iconStyle}>{option.icon}</span>
            </div>
            <span style={labelStyle}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
