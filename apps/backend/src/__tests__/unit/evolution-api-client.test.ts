import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendTextMessage } from '../../bot/evolution-api.client.js';

/**
 * Unit tests for the per-tenant WhatsApp gateway abstraction.
 *
 * Verifies that the Evolution instance is resolved from the per-call
 * `instanceName` (the tenant's `evolution_instance_name`) and that the global
 * env var is used only as a fallback. (Requirement 8.1)
 */
describe('evolution-api.client sendTextMessage', () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends through the tenant instance when instanceName is provided', async () => {
    await sendTextMessage({
      number: '5511999999999',
      text: 'olá',
      instanceName: 'tenant-abc',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/message/sendText/tenant-abc');
  });

  it('routes different tenants to their own instances', async () => {
    await sendTextMessage({ number: '111', text: 'a', instanceName: 'tenant-a' });
    await sendTextMessage({ number: '222', text: 'b', instanceName: 'tenant-b' });

    const [urlA] = fetchMock.mock.calls[0]!;
    const [urlB] = fetchMock.mock.calls[1]!;
    expect(urlA).toContain('/message/sendText/tenant-a');
    expect(urlB).toContain('/message/sendText/tenant-b');
  });

  it('falls back to the global default instance when instanceName is omitted', async () => {
    await sendTextMessage({ number: '5511999999999', text: 'olá' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0]!;
    // Default fallback is EVOLUTION_INSTANCE_NAME || 'order-system'
    const expectedInstance = process.env.EVOLUTION_INSTANCE_NAME || 'order-system';
    expect(url).toContain(`/message/sendText/${expectedInstance}`);
  });

  it('sends the number and text in the request body', async () => {
    await sendTextMessage({ number: '5511999999999', text: 'olá', instanceName: 'tenant-abc' });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(init.body)).toEqual({ number: '5511999999999', text: 'olá' });
  });
});
