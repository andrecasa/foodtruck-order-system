import { type RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase.js';

/**
 * Manages Supabase Realtime broadcast channels.
 * Channels are subscribed once and reused across requests to avoid latency.
 */
const subscribedChannels = new Map<string, RealtimeChannel>();
const subscribingChannels = new Map<string, Promise<RealtimeChannel>>();

/**
 * Gets or creates a subscribed broadcast channel.
 * Ensures the channel is subscribed before returning (required for send() to work).
 */
async function getChannel(channelName: string): Promise<RealtimeChannel> {
  // Already subscribed
  const existing = subscribedChannels.get(channelName);
  if (existing) return existing;

  // Subscription in progress — wait for it
  const pending = subscribingChannels.get(channelName);
  if (pending) return pending;

  // Create and subscribe
  const promise = new Promise<RealtimeChannel>((resolve, reject) => {
    const channel = supabase.channel(channelName);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        subscribedChannels.set(channelName, channel);
        subscribingChannels.delete(channelName);
        resolve(channel);
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        subscribedChannels.delete(channelName);
        subscribingChannels.delete(channelName);
        reject(new Error(`Channel ${channelName} subscription failed: ${status}`));
      }
    });
  });

  subscribingChannels.set(channelName, promise);
  return promise;
}

/**
 * Base names of the tenant-namespaced realtime channels.
 * The full channel name is `{base}:{tenantId}` (see {@link tenantChannel}).
 */
export const REALTIME_CHANNEL_QUEUE = 'orders:queue';
export const REALTIME_CHANNEL_PAYMENT = 'orders:payment';

/**
 * Builds a tenant-namespaced channel name, e.g. `orders:queue:{tenantId}`.
 * Namespacing keeps each tenant's realtime traffic isolated from every other
 * tenant's (R12.7, R12.8).
 */
export function tenantChannel(base: string, tenantId: string): string {
  return `${base}:${tenantId}`;
}

/**
 * Broadcasts an event on a Supabase Realtime channel.
 *
 * Subscription is LAZY: the first time a channel is broadcast on, it is
 * subscribed and cached (via {@link getChannel}); subsequent broadcasts reuse
 * the cached subscription. This replaces the old fixed global pre-warm, which
 * cannot scale to N tenants (R12.7). Callers pass a tenant-namespaced channel
 * name (see {@link tenantChannel}).
 *
 * Fire-and-forget — errors are logged but do not propagate.
 */
export async function broadcast(channelName: string, event: string, payload: unknown): Promise<void> {
  try {
    const channel = await getChannel(channelName);
    await channel.send({
      type: 'broadcast',
      event,
      payload,
    });
  } catch (err) {
    console.error(`[realtime] Failed to broadcast "${event}" on "${channelName}":`, err);
  }
}
