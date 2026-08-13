import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTheme } from '../theme';
import { Screen, Header, ScrollContainer, Card, Badge, OriginBadge, Text, FilterChips } from '../components';
import type { FilterChipOption } from '../components';
import { Button } from '../components/Button';
import { PrototypeBanner } from '../components/PrototypeBanner';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { apiClient } from '../services/api-client';
import { useAuth, useRealtime } from '../hooks';
import type { RealtimeEvent } from '../hooks';
import type { Order, OrderStatus } from '@order-system/shared';

const isPrototypeMode = import.meta.env.VITE_PROTOTYPE_MODE === 'true';

/** Format price in centavos to R$ X,XX */
function formatPrice(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

/** Filter chip options — colors match Penpot status palette */
const FILTER_OPTIONS: FilterChipOption[] = [
  { key: 'aguardando', label: 'Aguardando', color: '#D4812B' },
  { key: 'preparando', label: 'Preparando', color: '#5B8BA8' },
  { key: 'pronto', label: 'Pronto', color: '#5A8C5A' },
  { key: 'entregue', label: 'Entregue', color: '#8B6B5A' },
];

/** Default selected filters — entregue hidden by default */
const DEFAULT_FILTERS: string[] = ['aguardando', 'preparando', 'pronto'];

/**
 * Queue page for the Preparador — pixel-perfect match to Penpot "Fila do Preparador".
 *
 * Integrates Supabase Realtime via useRealtime hook:
 * - Loads complete state on initialization before activating Realtime (17.7)
 * - Reconnects every 5s with full order reload on reconnect (17.5)
 * - Marks data as stale during disconnection (17.6)
 * - Removes orders from queue on "entregue" event (17.8)
 */
export function QueuePage() {
  const theme = useTheme();
  const { logout } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilters, setSelectedFilters] = useState<string[]>(DEFAULT_FILTERS);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [isStale, setIsStale] = useState(false);

  // ─── Data Fetching ────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    try {
      const fetched = await apiClient.getOrders({ status: selectedFilters as OrderStatus[] });
      setOrders(fetched);
      setIsStale(false);
    } catch {
      // In prototype mode this should never fail
    } finally {
      setLoading(false);
    }
  }, [selectedFilters]);

  // Initial load — must complete before Realtime is enabled (Task 17.7)
  useEffect(() => {
    const doInitialLoad = async () => {
      await fetchOrders();
      setInitialLoaded(true);
    };
    doInitialLoad();
  }, [fetchOrders]);

  // ─── Realtime Event Handling ──────────────────────────────────────────────

  /** Handle incoming realtime events (Task 17.8) */
  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    const payload = event.payload;
    if (!payload) return;

    // Normalize: support both { type, record } and { order } formats
    let order: Order | undefined;
    if (payload.record) {
      order = payload.record as Order;
    } else if (payload.order) {
      order = payload.order as Order;
    } else if (payload.id && payload.status) {
      // Payload IS the order itself
      order = payload as Order;
    }

    if (!order) return;

    setOrders((prev) => {
      // Task 17.8: Remove order from queue if status is 'entregue' and entregue filter is NOT active
      if (order!.status === 'entregue' && !selectedFilters.includes('entregue')) {
        return prev.filter((o) => o.id !== order!.id);
      }

      // Remove if the order's status is no longer in selected filters
      if (!selectedFilters.includes(order!.status)) {
        return prev.filter((o) => o.id !== order!.id);
      }

      // Update existing or add new
      const existingIndex = prev.findIndex((o) => o.id === order!.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = order!;
        return updated;
      }

      // New order — add and sort by createdAt
      const newList = [...prev, order!];
      newList.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      return newList;
    });
  }, [selectedFilters]);

  /** Reconnect callback: reload full state from backend (Task 17.5) */
  const handleReconnect = useCallback(async () => {
    await fetchOrders();
  }, [fetchOrders]);

  // Stable channel list for useRealtime
  const channels = useMemo(() => ['orders:queue'], []);

  // Task 17.7: Only enable realtime AFTER initial load, and only in non-prototype mode
  const { status: realtimeStatus } = useRealtime({
    channels,
    onEvent: handleRealtimeEvent,
    onReconnect: handleReconnect,
    enabled: !isPrototypeMode && initialLoaded,
  });

  // Task 17.6: Mark data as stale when disconnected/reconnecting
  useEffect(() => {
    if (realtimeStatus === 'disconnected' || realtimeStatus === 'reconnecting') {
      setIsStale(true);
    } else if (realtimeStatus === 'connected') {
      setIsStale(false);
    }
  }, [realtimeStatus]);

  // ─── Prototype Mode: mock event subscription ─────────────────────────────
  useEffect(() => {
    if (!isPrototypeMode) return;

    const unsubscribe = apiClient.onOrderUpdate((updatedOrder: Order) => {
      setOrders((prev) => {
        // Remove if the order's status is no longer in selected filters
        if (!selectedFilters.includes(updatedOrder.status)) {
          return prev.filter((o) => o.id !== updatedOrder.id);
        }
        const existingIndex = prev.findIndex((o) => o.id === updatedOrder.id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = updatedOrder;
          return updated;
        }
        const newList = [...prev, updatedOrder];
        newList.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        return newList;
      });
    });
    return unsubscribe;
  }, [selectedFilters]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleAdvanceStatus = async (order: Order) => {
    const nextStatusMap: Record<OrderStatus, OrderStatus | null> = {
      aguardando: 'preparando',
      preparando: 'pronto',
      pronto: 'entregue',
      entregue: null,
    };
    const nextStatus = nextStatusMap[order.status];
    if (!nextStatus) return;
    try {
      await apiClient.updateOrderStatus(order.id, { status: nextStatus });
    } catch {
      // ignore
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const contentStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    padding: '24px',
  };

  const gridStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: '20px',
    // Task 17.6: reduce opacity when data is stale
    opacity: isStale ? 0.6 : 1,
    transition: 'opacity 0.3s ease',
  };

  const cardContentStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '348px', // 380px card - 16px*2 padding = 348px inner
  };

  const cardHeaderStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const titleStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: '16px',
    fontWeight: 500,
    color: '#3D2020',
    margin: 0,
  };

  const itemsStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: '13px',
    fontWeight: 400,
    color: '#3D2020',
    whiteSpace: 'pre-line',
    lineHeight: 1.5,
  };

  const priceStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: '18px',
    fontWeight: 600,
    color: '#3D2020',
  };

  const buttonContainerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
  };

  const loadingStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '50vh',
    fontFamily: theme.typography.fontFamily,
    fontSize: `${theme.typography.sizes.lg}px`,
    color: theme.colors.text,
  };

  const emptyStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '50vh',
  };

  const logoutButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'none',
    border: '1px solid #E8DDD5',
    borderRadius: '18px',
    height: '36px',
    padding: '0 12px',
    cursor: 'pointer',
    color: '#8B6B5A',
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: '12px',
    fontWeight: 400,
  };

  const staleNoteStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: '12px',
    color: '#8B6B5A',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '4px 0',
  };

  return (
    <Screen padding={false}>
      <PrototypeBanner />
      {/* Task 17.6 / 17.5: Show connection banner when realtime is not connected */}
      {!isPrototypeMode && <ConnectionBanner status={realtimeStatus} />}
      <Header
        title="Fila de Pedidos"
        icon="receipt_long"
        rightElement={
          <button onClick={handleLogout} style={logoutButtonStyle} aria-label="Sair">
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>logout</span>
            Sair
          </button>
        }
      />
      <ScrollContainer padding={false}>
        {loading ? (
          <div style={loadingStyle}>Carregando pedidos...</div>
        ) : orders.length === 0 ? (
          <div style={contentStyle}>
            <FilterChips
              options={FILTER_OPTIONS}
              selected={selectedFilters}
              onSelectionChange={setSelectedFilters}
            />
            {isStale && (
              <p style={staleNoteStyle}>Dados podem estar desatualizados</p>
            )}
            <div style={emptyStyle}>
              <Text size="lg">Nenhum pedido na fila</Text>
            </div>
          </div>
        ) : (
          <div style={contentStyle}>
            <FilterChips
              options={FILTER_OPTIONS}
              selected={selectedFilters}
              onSelectionChange={setSelectedFilters}
            />
            {isStale && (
              <p style={staleNoteStyle}>Dados podem estar desatualizados</p>
            )}
            <div style={gridStyle}>
            {orders.map((order) => {
              const cardVariant =
                order.status === 'aguardando' || order.status === 'preparando' || order.status === 'pronto'
                  ? order.status
                  : 'default';

              const nextStatusMap: Record<OrderStatus, OrderStatus | null> = {
                aguardando: 'preparando',
                preparando: 'pronto',
                pronto: 'entregue',
                entregue: null,
              };
              const nextStatus = nextStatusMap[order.status];
              const showButton = !!nextStatus;

              const buttonLabel: Record<OrderStatus, string> = {
                aguardando: 'Iniciar Preparo',
                preparando: 'Marcar Pronto',
                pronto: 'Marcar Entregue',
                entregue: '',
              };

              const getButtonColor = (): string => {
                switch (order.status) {
                  case 'preparando': return theme.colors.preparando;
                  case 'pronto': return theme.colors.pronto;
                  default: return theme.colors.primary;
                }
              };

              return (
              <Card
                key={order.id}
                variant={cardVariant}
                ariaLabel={`Pedido #${order.dailyNumber} - ${order.customerName}`}
              >
                <div style={cardContentStyle}>
                  <div style={cardHeaderStyle}>
                    <span style={titleStyle}>
                      #{order.dailyNumber} — {order.customerName}
                    </span>
                    <Badge
                      status={order.status as 'aguardando' | 'preparando' | 'pronto' | 'entregue'}
                      size="sm"
                    />
                  </div>

                  <OriginBadge origin={order.origin} />

                  <span style={itemsStyle}>
                    {order.items.map((item) => `${item.quantity}x ${item.name}`).join('\n')}
                  </span>

                  <span style={priceStyle}>
                    {formatPrice(order.totalAmount)}
                  </span>

                  {showButton && (
                    <div style={buttonContainerStyle}>
                      <Button
                        variant="primary"
                        color={getButtonColor()}
                        onClick={() => handleAdvanceStatus(order)}
                      >
                        {buttonLabel[order.status]}
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
              );
            })}
            </div>
          </div>
        )}
      </ScrollContainer>
    </Screen>
  );
}
