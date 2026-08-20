import { describe, it, expect, vi } from 'vitest';

/**
 * Unit tests for tenant-namespaced realtime channels (task 11).
 *
 * Covers:
 * - `tenantChannel` builds `{base}:{tenantId}` names so each tenant's channels
 *   are distinct from every other tenant's (R12.7).
 * - `broadcast` subscribes LAZILY on first use and REUSES the cached channel on
 *   subsequent broadcasts (replaces the fixed global pre-warm — R12.7).
 * - A broadcast for tenant A goes to A's channel only; tenant B never receives
 *   it (R12.8).
 *
 * NOTE: `config/realtime.ts` keeps a module-level cache of subscribed channels
 * that persists across tests in this file. To keep tests independent we use a
 * UNIQUE channel name (unique tenant id) per test, so each test always exercises
 * a fresh lazy subscription rather than a channel cached by a previous test.
 */

// A per-channel fake so we can assert which channel object received a send().
const channels = new Map<string, { send: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> }>();
const channelFactory = vi.fn((name: string) => {
  let ch = channels.get(name);
  if (!ch) {
    const created = {
      send: vi.fn().mockResolvedValue(undefined),
      // subscribe immediately reports SUBSCRIBED so getChannel resolves.
      subscribe: vi.fn((cb: (status: string) => void) => {
        cb('SUBSCRIBED');
        return created;
      }),
    };
    ch = created;
    channels.set(name, created);
  }
  return ch;
});

vi.mock('../../config/supabase.js', () => ({
  supabase: { channel: (name: string) => channelFactory(name) },
  supabaseAdmin: {},
}));

import {
  broadcast,
  tenantChannel,
  REALTIME_CHANNEL_QUEUE,
  REALTIME_CHANNEL_PAYMENT,
} from '../../config/realtime.js';

// Distinct, per-test tenant ids so channel names never collide across tests.
const TENANT_1 = '11111111-1111-4111-8111-111111111111';
const TENANT_2 = '22222222-2222-4222-8222-222222222222';
const TENANT_3 = '33333333-3333-4333-8333-333333333333';
const TENANT_4A = '4444aaaa-4444-4444-8444-444444444444';
const TENANT_4B = '4444bbbb-4444-4444-8444-444444444444';

describe('tenantChannel (R12.7)', () => {
  it('builds a {base}:{tenantId} channel name', () => {
    expect(tenantChannel(REALTIME_CHANNEL_QUEUE, TENANT_1)).toBe(`orders:queue:${TENANT_1}`);
    expect(tenantChannel(REALTIME_CHANNEL_PAYMENT, TENANT_1)).toBe(`orders:payment:${TENANT_1}`);
  });

  it('produces distinct channel names for different tenants', () => {
    expect(tenantChannel(REALTIME_CHANNEL_QUEUE, TENANT_1)).not.toBe(
      tenantChannel(REALTIME_CHANNEL_QUEUE, TENANT_2),
    );
  });
});

describe('broadcast — lazy subscription and isolation (R12.7, R12.8)', () => {
  it('subscribes lazily on first broadcast for a channel', async () => {
    const name = tenantChannel(REALTIME_CHANNEL_QUEUE, TENANT_2);
    await broadcast(name, 'new_order', { id: 'o1' });

    expect(channelFactory).toHaveBeenCalledWith(name);
    const ch = channels.get(name)!;
    expect(ch.subscribe).toHaveBeenCalledTimes(1);
    expect(ch.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'new_order',
      payload: { id: 'o1' },
    });
  });

  it('reuses the cached subscription on subsequent broadcasts (no re-subscribe)', async () => {
    const name = tenantChannel(REALTIME_CHANNEL_QUEUE, TENANT_3);
    await broadcast(name, 'new_order', { id: 'o1' });
    await broadcast(name, 'status_updated', { id: 'o1', status: 'preparando' });

    const ch = channels.get(name)!;
    // Subscribed once, sent twice.
    expect(ch.subscribe).toHaveBeenCalledTimes(1);
    expect(ch.send).toHaveBeenCalledTimes(2);
  });

  it("delivers a tenant A event only to A's channel, not B's (R12.8)", async () => {
    const nameA = tenantChannel(REALTIME_CHANNEL_QUEUE, TENANT_4A);
    const nameB = tenantChannel(REALTIME_CHANNEL_QUEUE, TENANT_4B);

    await broadcast(nameA, 'new_order', { id: 'oA' });

    const chA = channels.get(nameA)!;
    // B's channel was never created/subscribed by A's broadcast.
    expect(channels.get(nameB)).toBeUndefined();
    expect(chA.send).toHaveBeenCalledTimes(1);
  });
});
