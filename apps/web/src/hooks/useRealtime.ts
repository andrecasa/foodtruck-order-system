import { useEffect, useRef, useState } from 'react';
import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:8000';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

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

/** Singleton Supabase client for realtime — avoids creating new connections on every render */
let realtimeClient: SupabaseClient | null = null;

function getRealtimeClient(): SupabaseClient {
  if (!realtimeClient) {
    realtimeClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: {
        params: {
          apikey: SUPABASE_ANON_KEY,
        },
      },
    });
  }
  return realtimeClient;
}

/**
 * Hook for Supabase Realtime subscriptions (web).
 * Subscribes to broadcast channels and handles:
 * - Stable connection (singleton client, no recreation on re-render)
 * - Auto-reconnection on disconnect (5s delay)
 * - Data reload callback after reconnect
 * - Connection status tracking
 */
export function useRealtime({ channels, onEvent, onReconnect, enabled = true }: UseRealtimeOptions) {
  const [status, setStatus] = useState<RealtimeStatus>('disconnected');
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  const onReconnectRef = useRef(onReconnect);
  const enabledRef = useRef(enabled);

  // Keep refs up to date without causing re-renders or effect re-runs
  onEventRef.current = onEvent;
  onReconnectRef.current = onReconnect;
  enabledRef.current = enabled;

  // Stable channel key for effect dependency
  const channelKey = channels.join(',');

  useEffect(() => {
    if (!enabled || channels.length === 0) {
      // Cleanup if disabled
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      for (const ch of channelsRef.current) {
        try { ch.unsubscribe(); } catch { /* ignore */ }
      }
      channelsRef.current = [];
      setStatus('disconnected');
      return;
    }

    let cancelled = false;
    const supabase = getRealtimeClient();
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
        .subscribe((subscribeStatus) => {
          if (cancelled) return;

          if (subscribeStatus === 'SUBSCRIBED') {
            setStatus('connected');
          } else if (subscribeStatus === 'CLOSED' || subscribeStatus === 'CHANNEL_ERROR') {
            setStatus('disconnected');
            // Auto-reconnect after 5 seconds (only once)
            if (!reconnectTimerRef.current && !cancelled) {
              setStatus('reconnecting');
              reconnectTimerRef.current = setTimeout(() => {
                reconnectTimerRef.current = null;
                if (!cancelled && enabledRef.current) {
                  // Unsubscribe old channels
                  for (const ch of channelsRef.current) {
                    try { ch.unsubscribe(); } catch { /* ignore */ }
                  }
                  channelsRef.current = [];

                  // Re-subscribe
                  const newSubscribed: RealtimeChannel[] = [];
                  for (const chName of channels) {
                    const newCh = supabase.channel(chName);
                    newCh
                      .on('broadcast', { event: '*' }, (p) => {
                        if (!cancelled) {
                          onEventRef.current({
                            channel: chName,
                            event: p.event ?? 'unknown',
                            payload: p.payload,
                          });
                        }
                      })
                      .subscribe((s) => {
                        if (s === 'SUBSCRIBED') setStatus('connected');
                      });
                    newSubscribed.push(newCh);
                  }
                  channelsRef.current = newSubscribed;

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

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      for (const ch of subscribed) {
        try { ch.unsubscribe(); } catch { /* ignore */ }
      }
      channelsRef.current = [];
    };
  }, [enabled, channelKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { status };
}
