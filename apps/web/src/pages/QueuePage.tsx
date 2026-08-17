import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useTheme } from '../theme';
import { Screen, Header, ScrollContainer, Card, Text, FilterChips } from '../components';
import type { FilterChipOption } from '../components';
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

/** Format relative time since creation as "Pedido criado há Xh XXmin" */
function formatCreatedTime(createdAt: string): string {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));
  const hours = Math.floor(diffMin / 60);
  const minutes = diffMin % 60;

  if (hours === 0 && minutes === 0) return 'Pedido criado agora';
  if (hours === 0) return `Pedido criado há ${minutes}min`;
  return `Pedido criado há ${hours}h ${minutes.toString().padStart(2, '0')}min`;
}

/** Default selected filters — entregue hidden by default */
const DEFAULT_FILTERS: string[] = ['aguardando', 'preparando', 'pronto'];

/** Status icons for badges */
const STATUS_ICONS: Record<OrderStatus, string> = {
  aguardando: 'schedule',
  preparando: 'local_fire_department',
  pronto: 'check_circle',
  entregue: 'check_circle',
};

/** Button labels per status */
const BUTTON_LABELS: Record<OrderStatus, string> = {
  aguardando: 'Iniciar Preparo',
  preparando: 'Marcar Pronto',
  pronto: 'Marcar Entregue',
  entregue: 'Entregue',
};

/** Button icons per status */
const BUTTON_ICONS: Record<OrderStatus, string> = {
  aguardando: 'local_fire_department',
  preparando: 'local_fire_department',
  pronto: 'check_circle',
  entregue: 'check_circle',
};

// ─── Badge Sub-component ────────────────────────────────────────────────────

interface OrderBadgeProps {
  icon: string;
  label: string;
  color: string;
  fontFamily: string;
}

function OrderBadge({ icon, label, color, fontFamily }: OrderBadgeProps) {
  const badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    height: '22px',
    borderRadius: '11px',
    backgroundColor: `${color}1F`, // 12% opacity
    paddingLeft: '7px',
    paddingRight: '9px',
    flexShrink: 0,
  };

  const iconStyle: React.CSSProperties = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: '13px',
    fontWeight: 400,
    color,
    lineHeight: 1,
  };

  const textStyle: React.CSSProperties = {
    fontFamily: `"${fontFamily}", -apple-system, sans-serif`,
    fontSize: '10px',
    fontWeight: 400,
    color,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  };

  return (
    <span style={badgeStyle}>
      <span style={iconStyle}>{icon}</span>
      <span style={textStyle}>{label}</span>
    </span>
  );
}

// ─── Action Button Sub-component ────────────────────────────────────────────

interface ActionButtonProps {
  label: string;
  icon: string;
  color: string;
  onClick: () => void;
  disabled?: boolean;
  fontFamily: string;
  disabledBg: string;
  disabledText: string;
  surfaceColor: string;
}

function ActionButton({ label, icon, color, onClick, disabled = false, fontFamily, disabledBg, disabledText, surfaceColor }: ActionButtonProps) {
  const buttonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    width: '100%',
    height: '36px',
    borderRadius: '18px',
    backgroundColor: disabled ? disabledBg : color,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'opacity 0.15s ease',
    opacity: disabled ? 0.6 : 1,
  };

  const iconStyle: React.CSSProperties = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: '16px',
    fontWeight: 400,
    color: disabled ? disabledText : surfaceColor,
    lineHeight: 1,
  };

  const textStyle: React.CSSProperties = {
    fontFamily: `"${fontFamily}", -apple-system, sans-serif`,
    fontSize: '13px',
    fontWeight: 400,
    color: disabled ? disabledText : surfaceColor,
    lineHeight: 1,
  };

  return (
    <button type="button" style={buttonStyle} onClick={onClick} disabled={disabled}>
      <span style={iconStyle}>{icon}</span>
      <span style={textStyle}>{label}</span>
    </button>
  );
}

// ─── Main QueuePage ─────────────────────────────────────────────────────────

/**
 * Queue page for the Preparador — pixel-perfect match to Penpot mobile cards.
 * All colors sourced from theme for consistency across platforms.
 */
export function QueuePage() {
  const theme = useTheme();
  const { logout } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilters, setSelectedFilters] = useState<string[]>(DEFAULT_FILTERS);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [isStale, setIsStale] = useState(false);

  // ─── Theme-derived values ─────────────────────────────────────────────────

  const statusColors: Record<OrderStatus, string> = useMemo(() => ({
    aguardando: theme.colors.aguardando,
    preparando: theme.colors.preparando,
    pronto: theme.colors.pronto,
    entregue: theme.colors.entregue,
  }), [theme]);

  const filterOptions: FilterChipOption[] = useMemo(() => [
    { key: 'aguardando', label: 'Aguardando', color: theme.colors.aguardando, icon: 'schedule' },
    { key: 'preparando', label: 'Preparando', color: theme.colors.preparando, icon: 'local_fire_department' },
    { key: 'pronto', label: 'Pronto', color: theme.colors.pronto, icon: 'notifications' },
    { key: 'entregue', label: 'Entregue', color: theme.colors.entregue, icon: 'check_circle' },
  ], [theme]);

  // ─── Data Fetching ────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    try {
      const fetched = await apiClient.getOrders({ status: selectedFilters as OrderStatus[] });
      setOrders(fetched);
      setIsStale(false);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [selectedFilters]);

  useEffect(() => {
    const doInitialLoad = async () => {
      await fetchOrders();
      setInitialLoaded(true);
    };
    doInitialLoad();
  }, [fetchOrders]);

  useEffect(() => {
    if (isPrototypeMode || !initialLoaded) return;
    const interval = setInterval(() => {
      fetchOrders();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchOrders, initialLoaded]);

  // ─── Realtime Event Handling ──────────────────────────────────────────────

  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    const payload = event.payload;
    if (!payload) return;

    let raw: any;
    if (payload.record) {
      raw = payload.record;
    } else if (payload.order) {
      raw = payload.order;
    } else if (payload.id && payload.status) {
      raw = payload;
    }

    if (!raw || !raw.id) return;

    const mapped = mapOrder(raw);

    setOrders((prev) => {
      const orderStatus = mapped.status;

      if (orderStatus === 'entregue' && !selectedFilters.includes('entregue')) {
        return prev.filter((o) => o.id !== mapped.id);
      }

      if (orderStatus && !selectedFilters.includes(orderStatus)) {
        return prev.filter((o) => o.id !== mapped.id);
      }

      const existingIndex = prev.findIndex((o) => o.id === mapped.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        const mergedOrder = { ...prev[existingIndex], ...mapped };
        if (!raw.items || raw.items.length === 0) {
          mergedOrder.items = prev[existingIndex]!.items;
        }
        updated[existingIndex] = mergedOrder;
        return updated;
      }

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

  const handleReconnect = useCallback(async () => {
    await fetchOrders();
  }, [fetchOrders]);

  const channels = useMemo(() => ['orders:queue', 'orders:payment'], []);

  const { status: realtimeStatus } = useRealtime({
    channels,
    onEvent: handleRealtimeEvent,
    onReconnect: handleReconnect,
    enabled: !isPrototypeMode && initialLoaded,
  });

  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (realtimeStatus === 'disconnected' || realtimeStatus === 'reconnecting') {
      if (!staleTimerRef.current) {
        staleTimerRef.current = setTimeout(() => {
          setIsStale(true);
        }, 3000);
      }
    } else if (realtimeStatus === 'connected') {
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

  // ─── Prototype Mode ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPrototypeMode) return;

    const unsubscribe = apiClient.onOrderUpdate((updatedOrder: Order) => {
      setOrders((prev) => {
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

  // ─── Styles (all theme-sourced) ───────────────────────────────────────────

  const fontFamily = `"${theme.typography.fontFamily}", -apple-system, sans-serif`;

  const contentStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: `${theme.spacing.md}px`,
    padding: `${theme.spacing.lg}px`,
    alignItems: 'center',
  };

  const gridStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: '12px',
    justifyContent: 'center',
    width: '100%',
    opacity: isStale ? 0.6 : 1,
    transition: 'opacity 0.3s ease',
  };

  const badgesRowStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    gap: '6px',
    flexWrap: 'wrap',
  };

  const titleStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.lg}px`,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    margin: 0,
    lineHeight: 1.2,
  };

  const itemStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.sm}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.text,
    margin: 0,
    lineHeight: 1.2,
  };

  const totalStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.lg}px`,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    margin: 0,
    lineHeight: 1.2,
  };

  const timelineStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '5px',
  };

  const timelineIconStyle: React.CSSProperties = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: '14px',
    fontWeight: 400,
    color: theme.colors.textSecondary,
    opacity: 0.7,
    lineHeight: 1,
  };

  const timelineTextStyle: React.CSSProperties = {
    fontFamily,
    fontSize: '11px',
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.textSecondary,
    opacity: 0.7,
    lineHeight: 1,
  };

  const logoutButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'none',
    border: `1px solid ${theme.colors.divider}`,
    borderRadius: '18px',
    height: '36px',
    padding: '0 12px',
    cursor: 'pointer',
    color: theme.colors.textSecondary,
    fontFamily,
    fontSize: `${theme.typography.sizes.sm}px`,
    fontWeight: theme.typography.weights.regular,
  };

  const loadingStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '50vh',
    fontFamily,
    fontSize: `${theme.typography.sizes.lg}px`,
    color: theme.colors.text,
  };

  const emptyStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '50vh',
  };

  const staleNoteStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.sm}px`,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '4px 0',
  };

  // ─── Render Helpers ───────────────────────────────────────────────────────

  const getPaymentBadge = (status: PaymentStatus) => {
    return status === 'pago'
      ? { icon: 'currency_exchange', label: 'Pago', color: theme.colors.pronto }
      : { icon: 'currency_exchange', label: 'Pendente', color: theme.colors.error };
  };

  const getOriginBadge = (origin: string) => {
    return origin === 'whatsapp'
      ? { icon: 'chat', label: 'WhatsApp', color: theme.colors.primary }
      : { icon: 'storefront', label: 'Presencial', color: theme.colors.primary };
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Screen padding={false}>
      <PrototypeBanner />
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
        ) : (
          <div style={contentStyle}>
            <FilterChips
              options={filterOptions}
              selected={selectedFilters}
              onSelectionChange={setSelectedFilters}
            />
            {isStale && (
              <p style={staleNoteStyle}>Dados podem estar desatualizados</p>
            )}
            {orders.length === 0 ? (
              <div style={emptyStyle}>
                <Text size="lg">Nenhum pedido na fila</Text>
              </div>
            ) : (
              <div style={gridStyle}>
                {orders.map((order) => {
                  const statusColor = statusColors[order.status];
                  const paymentBadge = getPaymentBadge(order.paymentStatus);
                  const originBadge = getOriginBadge(order.origin);
                  const statusBadge = {
                    icon: STATUS_ICONS[order.status],
                    label: order.status.charAt(0).toUpperCase() + order.status.slice(1),
                    color: statusColor,
                  };

                  return (
                    <Card
                      key={order.id}
                      variant={order.status}
                      ariaLabel={`Pedido #${order.dailyNumber} - ${order.customerName}`}
                    >
                      {/* Badges Row */}
                      <div style={badgesRowStyle}>
                        <OrderBadge {...paymentBadge} fontFamily={theme.typography.fontFamily} />
                        <OrderBadge {...originBadge} fontFamily={theme.typography.fontFamily} />
                        <OrderBadge {...statusBadge} fontFamily={theme.typography.fontFamily} />
                      </div>

                      {/* Title */}
                      <p style={titleStyle}>
                        #{order.dailyNumber} — {order.customerName}
                      </p>

                      {/* Items with individual prices */}
                      {order.items.map((item, idx) => (
                        <p key={idx} style={itemStyle}>
                          {item.quantity}x {item.name} ({formatPrice(item.unitPrice * item.quantity)})
                        </p>
                      ))}

                      {/* Total */}
                      <p style={totalStyle}>
                        {formatPrice(order.totalAmount)}
                      </p>

                      {/* Timeline */}
                      <div style={timelineStyle}>
                        <span style={timelineIconStyle}>timer</span>
                        <span style={timelineTextStyle}>{formatCreatedTime(order.createdAt)}</span>
                      </div>

                      {/* Action Button */}
                      <ActionButton
                        label={BUTTON_LABELS[order.status]}
                        icon={BUTTON_ICONS[order.status]}
                        color={statusColor}
                        onClick={() => handleAdvanceStatus(order)}
                        disabled={order.status === 'entregue'}
                        fontFamily={theme.typography.fontFamily}
                        disabledBg={theme.colors.divider}
                        disabledText={theme.colors.textSecondary}
                        surfaceColor={theme.colors.surface}
                      />
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </ScrollContainer>
    </Screen>
  );
}
