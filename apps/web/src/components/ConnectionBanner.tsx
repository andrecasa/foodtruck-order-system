import React from 'react';
import { useTheme } from '../theme';
import type { RealtimeStatus } from '../hooks';

export interface ConnectionBannerProps {
  status: RealtimeStatus;
}

/**
 * Fixed red banner shown when the realtime connection is lost or reconnecting.
 * Renders nothing when connected.
 *
 * Accessibility: role="alert" + aria-live="assertive" so screen readers
 * announce the connection loss immediately.
 */
export function ConnectionBanner({ status }: ConnectionBannerProps) {
  if (status === 'connected') {
    return null;
  }

  const theme = useTheme();

  const bannerStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '40px',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: theme.colors.error,
    color: '#FFFFFF',
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: '14px',
    fontWeight: 500,
    boxSizing: 'border-box',
  };

  const iconStyle: React.CSSProperties = {
    fontSize: '18px',
    color: '#FFFFFF',
  };

  return (
    <div role="alert" aria-live="assertive" style={bannerStyle}>
      <span className="material-symbols-outlined" style={iconStyle} aria-hidden="true">
        wifi_off
      </span>
      <span>Conexão perdida — tentando reconectar...</span>
    </div>
  );
}
