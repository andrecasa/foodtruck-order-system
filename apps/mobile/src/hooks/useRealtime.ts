import { useEffect, useRef, useCallback, useState } from 'react';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { tokenStorage } from '../services/token-storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://localhost:8000';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export type RealtimeStatus = 'connected' | 'disconnected' | 'reconnecting';

export interface RealtimeEvent {
  channel: string;
  event: string;
  payload: any;
}

interface UseRealtimeOptions {
  /** Channels to subscribe to (e.g., ['orders:queue', 'orders:payment']) */
  channels: string[];
  /** Callback invoked when an event is received */
  onEvent: (event: RealtimeEvent) => void;
  /** Callback invoked when connection is restored (for data reload) */
  onReconnect?: () => void;
  /** Whether realtime should be active */
  enabled?: boolean;
}

/**
 * Hook for Supabase Realtime subscriptions.
 * Subscribes to broadcast channels and handles:
 * - Auto-reconnection on disconnect
 * - Data reload callback after reconnect
 * - Connection status tracking
 */
export function useRealtime({ channels, onEvent, onReconnect, enabled = true }: UseRealtimeOptions) {
  const [status, setStatus] = useState<RealtimeStatus>('disconnected');
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  const onReconnectRef = useRef(onReconnect);

  // Keep refs up to date
  onEventRef.current = onEvent;
  onReconnectRef.current = onReconnect;

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    for (const ch of channelsRef.current) {
      try {
        ch.unsubscribe();
      } catch {
        // ignore
      }
    }
    channelsRef.current = [];
    setStatus('disconnected');
  }, []);

  useEffect(() => {
    if (!enabled || channels.length === 0) {
      cleanup();
      return;
    }

    let cancelled = false;

    async function subscribe() {
      const token = await tokenStorage.getAccessToken();

      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        realtime: {
          params: {
            apikey: SUPABASE_ANON_KEY,
            ...(token ? { token } : {}),
          },
        },
      });

      const subscribed: RealtimeChannel[] = [];

      for (const channelName of channels) {
        const channel = supabase.channel(channelName);

        channel
          .on('broadcast', { event: '*' }, (payload) => {
            if (!cancelled) {
              onEventRef.current({
                channel: channelName,
                event: payload.event ?? 'unknown',
                payload: payload.payload,
              });
            }
          })
          .subscribe((status) => {
            if (cancelled) return;

            if (status === 'SUBSCRIBED') {
              setStatus('connected');
            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
              setStatus('disconnected');
              // Auto-reconnect after 5 seconds
              if (!reconnectTimerRef.current && !cancelled) {
                setStatus('reconnecting');
                reconnectTimerRef.current = setTimeout(() => {
                  reconnectTimerRef.current = null;
                  if (!cancelled) {
                    // Cleanup and re-subscribe
                    cleanup();
                    subscribe();
                    // Notify caller to reload data
                    onReconnectRef.current?.();
                  }
                }, 5000);
              }
            }
          });

        subscribed.push(channel);
      }

      channelsRef.current = subscribed;
    }

    subscribe();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [enabled, channels.join(','), cleanup]);

  return { status };
}
