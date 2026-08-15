import { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabase.js';

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
    const channel = supabaseAdmin.channel(channelName);
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
 * Broadcasts an event on a Supabase Realtime channel.
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

/**
 * Pre-subscribes to all known broadcast channels at startup.
 * This avoids the first-broadcast delay that causes "connection lost" on the frontend.
 */
export function initRealtimeChannels(): void {
  const channels = ['orders:queue', 'orders:payment'];
  for (const ch of channels) {
    getChannel(ch).catch((err) => {
      console.error(`[realtime] Failed to pre-subscribe to "${ch}":`, err);
    });
  }
  console.log('[realtime] Pre-subscribing to channels:', channels.join(', '));
}
