import React from 'react';
import { useTheme } from '../theme';

/**
 * Offline empty state illustration for the web.
 * Same visual language as the mobile OfflineIllustration and Penpot design:
 * - Card with placeholder lines in error red tones
 * - wifi_off icon in a circle
 * - Decorative dots
 * - "Sem conexão com a internet" label
 */
export function OfflineIllustration() {
  const theme = useTheme();
  const errorColor = theme.colors.error;
  const fontFamily = `"${theme.typography.fontFamily}", -apple-system, sans-serif`;

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minHeight: '60vh',
    gap: '12px',
  };

  const illustrationStyle: React.CSSProperties = {
    position: 'relative',
    width: '240px',
    height: '220px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const dotStyle = (top: string, left: string, size: string, color: string, opacity: number): React.CSSProperties => ({
    position: 'absolute',
    top,
    left,
    width: size,
    height: size,
    borderRadius: '50%',
    backgroundColor: color,
    opacity,
  });

  const receiptBgStyle: React.CSSProperties = {
    width: '120px',
    height: '150px',
    borderRadius: '12px',
    backgroundColor: `${errorColor}14`,
    border: `1.5px solid ${errorColor}4D`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const receiptInnerStyle: React.CSSProperties = {
    width: '100px',
    height: '130px',
    borderRadius: '8px',
    backgroundColor: theme.colors.surface,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
  };

  const lineStyle = (width: string, opacity: number): React.CSSProperties => ({
    width,
    height: '5px',
    borderRadius: '2.5px',
    backgroundColor: errorColor,
    opacity,
  });

  const circleStyle: React.CSSProperties = {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: `${errorColor}1F`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: '-30px',
  };

  const iconStyle: React.CSSProperties = {
    fontSize: '24px',
    color: errorColor,
    opacity: 0.6,
  };

  const labelStyle: React.CSSProperties = {
    fontFamily,
    fontSize: '13px',
    fontWeight: 500,
    color: theme.colors.textSecondary,
    opacity: 0.8,
    margin: 0,
  };

  const sublabelStyle: React.CSSProperties = {
    fontFamily,
    fontSize: '11px',
    fontWeight: 400,
    color: theme.colors.textSecondary,
    opacity: 0.5,
    margin: 0,
  };

  return (
    <div style={containerStyle}>
      <div style={illustrationStyle}>
        {/* Decorative dots */}
        <div style={dotStyle('40px', '20px', '8px', errorColor, 0.25)} />
        <div style={dotStyle('100px', '5px', '6px', theme.colors.textSecondary, 0.2)} />
        <div style={dotStyle('35px', '195px', '7px', errorColor, 0.3)} />
        <div style={dotStyle('110px', '210px', '5px', theme.colors.secondary, 0.2)} />
        <div style={dotStyle('160px', '25px', '6px', errorColor, 0.15)} />
        <div style={dotStyle('155px', '195px', '8px', theme.colors.textSecondary, 0.25)} />

        {/* Receipt card */}
        <div style={receiptBgStyle}>
          <div style={receiptInnerStyle}>
            <div style={lineStyle('60px', 0.15)} />
            <div style={lineStyle('50px', 0.12)} />
            <div style={lineStyle('35px', 0.08)} />
          </div>
        </div>

        {/* Icon circle */}
        <div style={circleStyle}>
          <span className="material-symbols-outlined" style={iconStyle}>wifi_off</span>
        </div>
      </div>

      <p style={labelStyle}>Sem conexão com a internet</p>
      <p style={sublabelStyle}>Verifique sua rede e tente novamente</p>
    </div>
  );
}
