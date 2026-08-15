import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useTheme } from '../theme';
import { Screen, Header, ScrollContainer, Card, Badge, OriginBadge, Text, FilterChips } from '../components';
import type { FilterChipOption } from '../components';
import { Button } from '../components/Button';
import { PrototypeBanner } from '../components/PrototypeBanner';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { apiClient } from '../services/api-client';
import { mapOrder } from '../services/real-client';
import { useAuth, useRealtime } from '../hooks';
import type { RealtimeEvent } from '../hooks';
import type { Order, OrderStatus, PaymentStatus } from '@order-system/shared';

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

  // Polling fallback: resync every 30s to catch missed realtime events
  useEffect(() => {
    if (isPrototypeMode || !initialLoaded) return;
    const interval = setInterval(() => {
      fetchOrders();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchOrders, initialLoaded]);

  // ─── Realtime Event Handling ──────────────────────────────────────────────

  /** Handle incoming realtime events (Task 17.8) */
  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    const payload = event.payload;
    if (!payload) return;

    // Normalize: support both { type, record } and { order } formats
    let raw: any;
    if (payload.record) {
      raw = payload.record;
    } else if (payload.order) {
      raw = payload.order;
    } else if (payload.id && payload.status) {
      // Payload IS the order itself (possibly partial — e.g. status_updated has no items)
      raw = payload;
    }

    if (!raw || !raw.id) return;

    // Map raw backend payload to Order format (handles field name differences)
    const mapped = mapOrder(raw);

    setOrders((prev) => {
      const orderStatus = mapped.status;

      // Task 17.8: Remove order from queue if status is 'entregue' and entregue filter is NOT active
      if (orderStatus === 'entregue' && !selectedFilters.includes('entregue')) {
        return prev.filter((o) => o.id !== mapped.id);
      }

      // Remove if the order's status is no longer in selected filters
      if (orderStatus && !selectedFilters.includes(orderStatus)) {
        return prev.filter((o) => o.id !== mapped.id);
      }

      // Update existing — MERGE mapped data into existing order to preserve fields like items
      const existingIndex = prev.findIndex((o) => o.id === mapped.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        // Only merge fields that are present in mapped (items may be empty array for partial payloads)
        const mergedOrder = { ...prev[existingIndex], ...mapped };
        // Preserve existing items if the broadcast had no items
        if (!raw.items || raw.items.length === 0) {
          mergedOrder.items = prev[existingIndex].items;
        }
        updated[existingIndex] = mergedOrder;
        return updated;
      }

      // New order — only add if it has items (full order payload)
      if (mapped.items && mapped.items.length > 0) {
        const newList = [...prev, mapped];
        newList.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        return newList;
      }

      return prev;
    });
  }, [selectedFilters]);

  /** Reconnect callback: reload full state from backend (Task 17.5) */
  const handleReconnect = useCallback(async () => {
    await fetchOrders();
  }, [fetchOrders]);

  // Stable channel list for useRealtime
  const channels = useMemo(() => ['orders:queue', 'orders:payment'], []);

  // Task 17.7: Only enable realtime AFTER initial load, and only in non-prototype mode
  const { status: realtimeStatus } = useRealtime({
    channels,
    onEvent: handleRealtimeEvent,
    onReconnect: handleReconnect,
    enabled: !isPrototypeMode && initialLoaded,
  });

  // Task 17.6: Mark data as stale when disconnected/reconnecting (debounced to avoid flicker)
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (realtimeStatus === 'disconnected' || realtimeStatus === 'reconnecting') {
      // Only mark stale after 3s of being disconnected — avoids flicker on brief drops
      if (!staleTimerRef.current) {
        staleTimerRef.current = setTimeout(() => {
          setIsStale(true);
        }, 3000);
      }
    } else if (realtimeStatus === 'connected') {
      // Cancel pending stale timer and clear stale state immediately
      if (staleTimerRef.current) {
        clearTimeout(staleTimerRef.current);
        staleTimerRef.current = null;
      }
      setIsStale(false);
    }

    return () => {
      if (staleTimerRef.current) {
        clearTimeout(staleTimerRef.current);
        staleTimerRef.current = null;
      }
    };
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

  const paymentBadgeStyle = (status: PaymentStatus): React.CSSProperties => ({
    width: '22px',
    height: '22px',
    borderRadius: '11px',
    backgroundColor: status === 'pago' ? '#5A8C5A' : '#B54040',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  });

  const paymentBadgeIconStyle: React.CSSProperties = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: '14px',
    fontWeight: 400,
    color: '#FFFFFF',
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
    fontSize: '14px',
    fontWeight: 400,
    color: '#3D2020',
    whiteSpace: 'pre-line',
    lineHeight: 1.5,
    alignSelf: 'center',
    textAlign: 'center',
  };

  const priceStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: '18px',
    fontWeight: 600,
    color: '#3D2020',
    alignSelf: 'center',
  };

  const dividerStyle: React.CSSProperties = {
    height: '1px',
    backgroundColor: '#E8DDD5',
    width: '80%',
    alignSelf: 'center',
  };

  const buttonContainerStyle: React.CSSProperties = {
    display: 'flex',
    width: '100%',
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
      {/* Task 17.6 / 17.5: Show connection banner only after debounced stale state */}
      {!isPrototypeMode && isStale && <ConnectionBanner status={realtimeStatus} />}
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
                    <span style={paymentBadgeStyle(order.paymentStatus)}>
                      <span className="material-symbols-outlined" style={paymentBadgeIconStyle}>payments</span>
                    </span>
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
                    {order.items.map((item, idx) => (
                      <span key={idx}>
                        {idx > 0 && '\n'}
                        {item.quantity}X - {item.name} - {formatPrice(item.unitPrice * item.quantity)}
                      </span>
                    ))}
                  </span>

                  <div style={dividerStyle} />

                  <span style={priceStyle}>
                    {formatPrice(order.totalAmount)}
                  </span>

                  {showButton && (
                    <div style={buttonContainerStyle}>
                      <Button
                        variant="primary"
                        color={getButtonColor()}
                        onClick={() => handleAdvanceStatus(order)}
                        fullWidth
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
