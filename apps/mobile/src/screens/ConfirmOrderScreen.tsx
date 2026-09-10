import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text as RNText,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../theme/ThemeProvider';
import { FormScreen } from '../components/FormScreen';
import { Text, Heading } from '../components/Typography';
import { Input } from '../components/Input';
import { FloatingButton } from '../components/FloatingButton';
import { MenuItemsCard } from '../components/MenuItemsCard';
import { OrderSummaryCard } from '../components/OrderSummaryCard';
import { apiClient } from '../services/api-client';
import { getCurrentCoordinates } from '../services/geolocation';
import type { MenuItem, OrderOrigin } from '@order-system/shared';

/** Item recebido da etapa de seleção: par menuItemId → quantity. */
export interface ConfirmOrderItem {
  menuItemId: string;
  quantity: number;
}

export interface ConfirmOrderScreenProps {
  /** Itens selecionados na etapa "Novo Pedido". */
  initialItems: ConfirmOrderItem[];
  /** Origem escolhida na etapa "Novo Pedido". */
  origin: OrderOrigin;
}

const MAX_NAME_LENGTH = 100;

/**
 * Confirmar Pedido (Operador) — etapa de confirmação do pedido, espelhando o
 * checkout do PWA do cliente (`CustomerCheckoutScreen`).
 *
 * Recebe os itens selecionados e a origem da etapa "Novo Pedido"
 * (`CreateOrderScreen`) e recarrega o cardápio (`apiClient.getMenu`) para
 * resolver nomes e preços. Mostra um card "Resumo" (via `OrderSummaryCard`,
 * compartilhado com o cliente), a lista de itens editável (mesmo stepper do
 * "Novo Pedido"; decrementar até 0 remove a linha) e solicita o nome do cliente
 * — como no PWA, o nome é pedido na confirmação. Ao confirmar, cria o pedido
 * (`apiClient.createOrder`) e navega para o pagamento; em caso de erro, mantém
 * a tela para nova tentativa.
 */
export function ConfirmOrderScreen({ initialItems, origin }: ConfirmOrderScreenProps) {
  const theme = useTheme();
  const router = useRouter();

  // itemId → quantity, semeado com os itens vindos da etapa de seleção.
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const it of initialItems) {
      if (it.quantity > 0) map[it.menuItemId] = it.quantity;
    }
    return map;
  });

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);

  const [customerName, setCustomerName] = useState('');
  const [nameError, setNameError] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  // Recarrega o cardápio para resolver nomes e preços dos itens selecionados.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function loadMenu() {
        try {
          setMenuLoading(true);
          const items = await apiClient.getMenu();
          if (!cancelled) setMenuItems(items);
        } catch {
          if (!cancelled) setApiError('Erro ao carregar cardápio');
        } finally {
          if (!cancelled) setMenuLoading(false);
        }
      }
      loadMenu();
      return () => { cancelled = true; };
    }, [])
  );

  // Linhas do pedido resolvidas contra o cardápio (nome + preço unitário).
  const orderLines = useMemo(() => {
    const lines: { menuItemId: string; name: string; priceCents: number; quantity: number }[] = [];
    for (const [menuItemId, quantity] of Object.entries(selectedItems)) {
      if (quantity <= 0) continue;
      const item = menuItems.find((m) => m.id === menuItemId);
      if (item) {
        lines.push({ menuItemId, name: item.name, priceCents: item.price, quantity });
      }
    }
    return lines;
  }, [selectedItems, menuItems]);

  const total = useMemo(
    () => orderLines.reduce((sum, l) => sum + l.priceCents * l.quantity, 0),
    [orderLines],
  );

  const hasItems = useMemo(
    () => Object.values(selectedItems).some((qty) => qty > 0),
    [selectedItems],
  );

  const incrementItem = useCallback((id: string) => {
    setSelectedItems((prev) => {
      const current = prev[id] ?? 0;
      if (current >= 99) return prev;
      return { ...prev, [id]: current + 1 };
    });
  }, []);

  const decrementItem = useCallback((id: string) => {
    setSelectedItems((prev) => {
      const current = prev[id] ?? 0;
      if (current <= 0) return prev;
      const newQty = current - 1;
      if (newQty === 0) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: newQty };
    });
  }, []);

  // Cria o pedido e navega para o pagamento. Mantém a tela em caso de erro
  // (padrão de nova tentativa, como no checkout do cliente).
  const handleConfirm = async () => {
    setApiError('');

    const trimmed = customerName.trim();
    if (trimmed.length === 0) {
      setNameError('Informe o nome do cliente');
      return;
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      setNameError(`O nome deve ter no máximo ${MAX_NAME_LENGTH} caracteres.`);
      return;
    }
    setNameError('');

    if (!hasItems) {
      setApiError('Adicione ao menos um item ao pedido');
      return;
    }

    const items = Object.entries(selectedItems)
      .filter(([, qty]) => qty > 0)
      .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));

    try {
      setLoading(true);
      // Captura opcional da localização; ausente se a permissão for negada.
      const coords = await getCurrentCoordinates();
      const order = await apiClient.createOrder({
        customerName: trimmed,
        origin,
        items,
        ...(coords ?? {}),
      });
      // Substitui a rota atual para que a confirmação não fique na pilha de volta.
      router.replace({ pathname: '/payment', params: { orderId: order.id } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar pedido';
      setApiError(message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const contentStyle: ViewStyle = {
    flexGrow: 1,
    paddingHorizontal: 16,
    // Top padding handled by the fixed name bar above; keep a small gap here.
    paddingTop: 8,
    gap: 20,
    // Room so the last content clears the floating "Confirmar Pedido" CTA.
    paddingBottom: 16 + 44 + 16,
  };

  // Fixed name bar below the header (matches content horizontal padding).
  const nameBarStyle: ViewStyle = {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: theme.colors.background,
  };

  const errorTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.error,
    marginTop: 4,
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <FormScreen
      title="Confirmar Pedido"
      onBack={() => router.back()}
      contentContainerStyle={contentStyle}
      hideFooterOnKeyboard={false}
      stickyHeader={
        <View style={nameBarStyle}>
          {/* Nome do cliente — solicitado na confirmação, como no PWA. */}
          <Input
            accessibilityLabel="Nome do Cliente"
            value={customerName}
            onChangeText={(text) => {
              setCustomerName(text.slice(0, MAX_NAME_LENGTH));
              if (nameError) setNameError('');
            }}
            placeholder="Nome do cliente..."
            icon="person"
            iconColor={theme.colors.textSecondary}
            error={nameError}
            autoCapitalize="words"
            testID="confirm-name-input"
          />
        </View>
      }
      footer={
        <FloatingButton
          label={loading ? 'Enviando...' : 'Confirmar Pedido'}
          onPress={handleConfirm}
          disabled={loading || !hasItems}
          bottomOffset={16}
          testID="confirm-order-button"
        />
      }
    >
        {/* Resumo — nome + itens + total, com faixa lateral colorida. */}
        <View>
          <View style={{ marginBottom: theme.spacing.sm }}>
            <Heading level={3}>Resumo</Heading>
          </View>
          <OrderSummaryCard
            customerName={customerName}
            items={orderLines.map((l) => ({
              name: l.name,
              quantity: l.quantity,
              priceCents: l.priceCents,
            }))}
            totalCents={total}
            testID="confirm-resumo"
            contentTestID="confirm-summary"
            totalTestID="confirm-total"
          />
        </View>

        {/* Itens editáveis — mesmo card/stepper do "Novo Pedido"; decrementar
            até 0 remove a linha. */}
        <View>
          <View style={{ marginBottom: theme.spacing.sm }}>
            <Heading level={3}>Itens do Pedido</Heading>
          </View>

          {menuLoading ? (
            <Text size="sm" color={theme.colors.textSecondary}>
              Carregando cardápio...
            </Text>
          ) : (
            <MenuItemsCard
              category="Itens do Pedido"
              hideCategoryLabel
              items={orderLines.map((l) => ({
                id: l.menuItemId,
                name: l.name,
                priceCents: l.priceCents,
              }))}
              quantities={selectedItems}
              onIncrement={incrementItem}
              onDecrement={decrementItem}
            />
          )}
        </View>

        {apiError ? (
          <RNText style={errorTextStyle} testID="confirm-error">
            {apiError}
          </RNText>
        ) : null}
    </FormScreen>
  );
}
