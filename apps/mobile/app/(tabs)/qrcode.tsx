import React from 'react';
import { OperatorQrCodeScreen } from '../../src/screens/OperatorQrCodeScreen';

/**
 * QrCode tab (`/(tabs)/qrcode`).
 *
 * Landing page mirroring the customer Home: tenant logo, a QR code to the
 * public ordering URL, and a "Novo Pedido" button.
 */
export default function QrCodeRoute() {
  return <OperatorQrCodeScreen />;
}
