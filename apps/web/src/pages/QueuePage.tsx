import React, { useEffect, useState, useCallback } from 'react';
import { useTheme } from '../theme';
import { Screen, Header, ScrollContainer, Card, Badge, OriginBadge, Text, FilterChips } from '../components';
import type { FilterChipOption } from '../components';
import { Button } from '../components/Button';
import { PrototypeBanner } from '../components/PrototypeBanner';
import { apiClient } from '../services/api-client';
import type { Order, OrderStatus } from '@order-system/shared';

interface QueuePageProps {
  onLogout: () => void;
}

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
 * Penpot specs:
 * - Header: 56px, bg white, shadow 0 1px 3px rgba(0,0,0,0.06), padding 0 24px
 *   - Left: icon receipt_long 24px #7B2D2D + title "Fila de Pedidos" 18px weight 400 #3D2020
 *   - Right: icon logout 16px + "Sair" 12px, both #8B6B5A
 * - Content: flex row, gap 20px, padding 24px, wrap
 * - Cards: same as mobile (gradient + stroke 30% + 12px radius + 16px padding + gap 12px)
 *   - Title: 16px weight 500 #3D2020
 *   - Status badge: sm (22px, radius 11)
 *   - Origin badge: pill tinted
 *   - Items: 13px weight 400 #3D2020
 *   - Price: 18px weight 600 #3D2020
 *   - Button: 36px height, radius 18, alignSelf center
 */
export function QueuePage({ onLogout }: QueuePageProps) {
  const theme = useTheme();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilters, setSelectedFilters] = useState<string[]>(DEFAULT_FILTERS);

  const fetchOrders = useCallback(async () => {
    try {
      const fetched = await apiClient.getOrders({ status: selectedFilters as OrderStatus[] });
      setOrders(fetched);
    } catch {
      // In prototype mode this should never fail
    } finally {
      setLoading(false);
    }
  }, [selectedFilters]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Subscribe to realtime order updates
  useEffect(() => {
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
    try {
      await apiClient.logout();
    } catch {
      // ignore
    }
    onLogout();
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

  // Logout button in header (Penpot: pill outline, 36px, border #E8DDD5, icon + text #8B6B5A)
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

  return (
    <Screen padding={false}>
      <PrototypeBanner />
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
            <div style={emptyStyle}>
              <Text size="lg">Nenhum pedido na fila</Text>
            </div>
          </div>
        ) : (
          <div style={contentStyle}>
            {/* Status Filter Chips — inside content, no separate bg, aligned with cards */}
            <FilterChips
              options={FILTER_OPTIONS}
              selected={selectedFilters}
              onSelectionChange={setSelectedFilters}
            />
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

              // Button label per status
              const buttonLabel: Record<OrderStatus, string> = {
                aguardando: 'Iniciar Preparo',
                preparando: 'Marcar Pronto',
                pronto: 'Marcar Entregue',
                entregue: '',
              };

              // Button color: aguardando → primary, preparando → blue, pronto → green
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
                  {/* Header: "#N — Nome" + status badge */}
                  <div style={cardHeaderStyle}>
                    <span style={titleStyle}>
                      #{order.dailyNumber} — {order.customerName}
                    </span>
                    <Badge
                      status={order.status as 'aguardando' | 'preparando' | 'pronto' | 'entregue'}
                      size="sm"
                    />
                  </div>

                  {/* Origin badge (tinted pill) */}
                  <OriginBadge origin={order.origin} />

                  {/* Items */}
                  <span style={itemsStyle}>
                    {order.items.map((item) => `${item.quantity}x ${item.name}`).join('\n')}
                  </span>

                  {/* Price */}
                  <span style={priceStyle}>
                    {formatPrice(order.totalAmount)}
                  </span>

                  {/* Action button (centered) */}
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
