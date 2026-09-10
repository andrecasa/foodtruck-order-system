import React, { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ConfirmOrderScreen, type ConfirmOrderItem } from '../src/screens/ConfirmOrderScreen';
import type { OrderOrigin } from '@order-system/shared';

const ORDER_ORIGINS: OrderOrigin[] = ['presencial', 'whatsapp', 'web'];

/**
 * Rota de confirmação do operador — `/confirm-order`.
 *
 * Aberta pela etapa "Novo Pedido" (`CreateOrderScreen`) com os itens
 * selecionados serializados em JSON e a origem escolhida:
 *   router.push({ pathname: '/confirm-order', params: { items, origin } })
 *
 * Faz o parsing defensivo dos params (strings no expo-router) e repassa itens e
 * origem para a `ConfirmOrderScreen`, que recarrega o cardápio para resolver
 * nomes e preços.
 */
export default function ConfirmOrderRoute() {
  const { items, origin } = useLocalSearchParams<{ items?: string; origin?: string }>();

  const initialItems = useMemo<ConfirmOrderItem[]>(() => {
    if (typeof items !== 'string') return [];
    try {
      const parsed = JSON.parse(items) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((entry) => {
        if (
          entry &&
          typeof entry === 'object' &&
          typeof (entry as ConfirmOrderItem).menuItemId === 'string' &&
          typeof (entry as ConfirmOrderItem).quantity === 'number'
        ) {
          const { menuItemId, quantity } = entry as ConfirmOrderItem;
          return [{ menuItemId, quantity }];
        }
        return [];
      });
    } catch {
      return [];
    }
  }, [items]);

  const resolvedOrigin: OrderOrigin =
    typeof origin === 'string' && (ORDER_ORIGINS as string[]).includes(origin)
      ? (origin as OrderOrigin)
      : 'presencial';

  return <ConfirmOrderScreen initialItems={initialItems} origin={resolvedOrigin} />;
}
