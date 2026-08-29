import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { AppState, type AppStateStatus } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://localhost:8000';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export type RealtimeStatus = 'connected' | 'disconnected' | 'reconnecting';

export interface RealtimeEvent {
  channel: string;
  event: string;
  payload: any;
}

interface UseRealtimeOptions {
  channels: string[];
  onEvent: (event: RealtimeEvent) => void;
  onReconnect?: () => void;
  enabled?: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const RECONNECT_DELAY_MS = 5000;
const MAX_RETRIES = 8;

// ─── Singleton Supabase client ──────────────────────────────────────────────

let realtimeClient: SupabaseClient | null = null;

function getRealtimeClient(): SupabaseClient {
  if (!realtimeClient) {
    realtimeClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      // This client is used ONLY for Realtime broadcast channels. It must not
      // spin up a GoTrue (auth) subsystem: doing so creates a second
      // GoTrueClient sharing the default `sb-<ref>-auth-token` storage key,
      // which triggers the "Multiple GoTrueClient instances" warning and can
      // leave channels stuck (never reaching SUBSCRIBED) in the public customer
      // flow. Disabling session persistence/refresh and giving it an isolated
      // storage key keeps this client purely a Realtime transport.
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'sb-realtime-only',
      },
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
 * Hook for Supabase Realtime subscriptions (mobile).
 *
 * Strategy: Subscribe once, stay connected. Only report 'disconnected' if
 * the initial subscription fails outright. Ignore transient CLOSED/CHANNEL_ERROR
 * from Supabase since the broadcast channel often continues working despite them.
 *
 * Reconnection only triggers if the initial subscribe never succeeds.
 */
export function useRealtime({ channels, onEvent, onReconnect, enabled = true }: UseRealtimeOptions) {
  const [status, setStatus] = useState<RealtimeStatus>('disconnected');
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const hasConnectedRef = useRef(false);
  const onEventRef = useRef(onEvent);
  const onReconnectRef = useRef(onReconnect);
  const enabledRef = useRef(enabled);
  const cancelledRef = useRef(false);

  onEventRef.current = onEvent;
  onReconnectRef.current = onReconnect;
  enabledRef.current = enabled;

  const channelKey = channels.join(',');

  const doSubscribe = useCallback((supabase: SupabaseClient, channelNames: string[], isReconnect: boolean): RealtimeChannel[] => {
    const subscribed: RealtimeChannel[] = [];

    for (const channelName of channelNames) {
      const channel = supabase.channel(channelName);

      channel
        .on('broadcast', { event: '*' }, (payload) => {
          if (cancelledRef.current) return;

          // Any event received = connection is alive
          if (!hasConnectedRef.current) {
            hasConnectedRef.current = true;
            setStatus('connected');
            retryCountRef.current = 0;
          }

          onEventRef.current({
            channel: channelName,
            event: payload.event ?? 'unknown',
            payload: payload.payload,
          });
        })
        .subscribe((subscribeStatus) => {
          if (cancelledRef.current) return;

          if (subscribeStatus === 'SUBSCRIBED') {
            hasConnectedRef.current = true;
            setStatus('connected');
            retryCountRef.current = 0;

            if (isReconnect) {
              onReconnectRef.current?.();
            }
          } else if (subscribeStatus === 'CLOSED' || subscribeStatus === 'CHANNEL_ERROR') {
            // Only treat as disconnected if we NEVER successfully connected
            if (!hasConnectedRef.current) {
              setStatus('disconnected');
              scheduleReconnect(supabase, channelNames);
            }
            // If we previously connected, ignore transient errors
          }
        });

      subscribed.push(channel);
    }

    return subscribed;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function scheduleReconnect(supabase: SupabaseClient, channelNames: string[]) {
    if (reconnectTimerRef.current || cancelledRef.current) return;
    if (retryCountRef.current >= MAX_RETRIES) {
      setStatus('disconnected');
      return;
    }

    setStatus('reconnecting');
    retryCountRef.current += 1;

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (cancelledRef.current || !enabledRef.current) return;

      for (const ch of channelsRef.current) {
        try { ch.unsubscribe(); } catch { /* ignore */ }
      }
      channelsRef.current = [];

      const newChannels = doSubscribe(supabase, channelNames, true);
      channelsRef.current = newChannels;
    }, RECONNECT_DELAY_MS);
  }

  // ─── Main effect ───────────────────────────────────────────────────────

  useEffect(() => {
    cancelledRef.current = false;
    hasConnectedRef.current = false;

    if (!enabled || channels.length === 0 || !SUPABASE_ANON_KEY) {
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

      const supabase = getRealtimeClient();
    const subscribed = doSubscribe(supabase, channels, false);
    channelsRef.current = subscribed;

    return () => {
      cancelledRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      for (const ch of subscribed) {
        try { ch.unsubscribe(); } catch { /* ignore */ }
      }
      channelsRef.current = [];
    };
  }, [enabled, channelKey, doSubscribe]);

  // ─── AppState: reload data when returning from background ─────────────

  useEffect(() => {
    if (!enabled) return;

    function handleAppStateChange(nextState: AppStateStatus) {
      if (nextState === 'active' && hasConnectedRef.current) {
        // App returned from background — refetch to catch anything missed
        onReconnectRef.current?.();
      }
    }

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [enabled]);

  return { status };
}
