import React from 'react';
import { OrderQueueScreen } from '../../src/screens/OrderQueueScreen';

/**
 * Default tab — Order Queue (Fila de Pedidos).
 * Maps to /(tabs)/ which is the first screen after login.
 */
export default function OrdersRoute() {
  return <OrderQueueScreen />;
}
