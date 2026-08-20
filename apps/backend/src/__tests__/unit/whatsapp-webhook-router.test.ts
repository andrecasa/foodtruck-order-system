import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

/**
 * Unit tests for the Evolution WebhookRouter (design section 6 "WhatsApp por
 * Tenant", WebhookRouter).
 *
 * Covers instance -> tenant routing and the always-200 / no-side-effects
 * contract for unknown instances, malformed payloads and internal errors.
 *
 * Requirements: 8.2, 8.3, 8.4, 8.5, 8.6
 */

// --- Mocks for side-effecting dependencies ---

const poolQueryMock = vi.fn();

vi.mock('../../config/database.js', () => ({
  pool: { query: (...args: unknown[]) => poolQueryMock(...args) },
}));

const handleIncomingMessageMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../bot/whatsapp.service.js', () => ({
  handleIncomingMessage: (...args: unknown[]) => handleIncomingMessageMock(...args),
}));

import { webhookEvolution } from '../../bot/whatsapp.controller.js';

const VALID_API_KEY = process.env.EVOLUTION_API_KEY || 'change-me-evolution-api-key';

// --- Test helpers ---

function makeReq(body: unknown, apiKey: string | undefined = VALID_API_KEY): Request {
  return {
    headers: apiKey === undefined ? {} : { apikey: apiKey },
    body,
  } as unknown as Request;
}

function makeRes(): Response & { statusCode: number; jsonBody: unknown; headersSent: boolean } {
  const res = {
    statusCode: 0,
    jsonBody: undefined as unknown,
    headersSent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.jsonBody = payload;
      this.headersSent = true;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; jsonBody: unknown; headersSent: boolean };
}

function messageUpsertBody(instance: string) {
  return {
    instance,
    event: 'messages.upsert',
    data: {
      key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false },
      pushName: 'Cliente',
      message: { conversation: 'oi' },
    },
  };
}

beforeEach(() => {
  poolQueryMock.mockReset();
  handleIncomingMessageMock.mockReset();
  handleIncomingMessageMock.mockResolvedValue(undefined);
});

describe('WebhookRouter: API key gate', () => {
  it('responds 401 when the API key is missing or wrong', async () => {
    const req = makeReq(messageUpsertBody('tenant-a-instance'), 'wrong-key');
    const res = makeRes();

    await webhookEvolution(req, res);

    expect(res.statusCode).toBe(401);
    expect(poolQueryMock).not.toHaveBeenCalled();
    expect(handleIncomingMessageMock).not.toHaveBeenCalled();
  });
});

describe('WebhookRouter: routing by instance (R8.2)', () => {
  it('resolves the tenant by evolution_instance_name and processes with that tenantId', async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ id: 'tenant-a' }] });

    const req = makeReq(messageUpsertBody('tenant-a-instance'));
    const res = makeRes();

    await webhookEvolution(req, res);

    // Looked up by the instance from the payload.
    expect(poolQueryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = poolQueryMock.mock.calls[0]!;
    expect(String(sql)).toContain('evolution_instance_name');
    expect(params).toEqual(['tenant-a-instance']);

    // Responded 200 and processed under the resolved tenant.
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ status: 'received' });
    expect(handleIncomingMessageMock).toHaveBeenCalledTimes(1);
    const [tenantId, phoneNumber, pushName, text] = handleIncomingMessageMock.mock.calls[0]!;
    expect(tenantId).toBe('tenant-a');
    expect(phoneNumber).toBe('5511999999999');
    expect(pushName).toBe('Cliente');
    expect(text).toBe('oi');
  });

  it('routes different instances to their own tenants', async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ id: 'tenant-a' }] });
    await webhookEvolution(makeReq(messageUpsertBody('instance-a')), makeRes());

    poolQueryMock.mockResolvedValueOnce({ rows: [{ id: 'tenant-b' }] });
    await webhookEvolution(makeReq(messageUpsertBody('instance-b')), makeRes());

    expect(handleIncomingMessageMock.mock.calls[0]![0]).toBe('tenant-a');
    expect(handleIncomingMessageMock.mock.calls[1]![0]).toBe('tenant-b');
  });
});

describe('WebhookRouter: always 200 with no side effects', () => {
  it('unknown instance -> 200, no message processing (R8.3)', async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    const req = makeReq(messageUpsertBody('unknown-instance'));
    const res = makeRes();

    await webhookEvolution(req, res);

    expect(res.statusCode).toBe(200);
    expect(handleIncomingMessageMock).not.toHaveBeenCalled();
  });

  it('missing instance -> 200, no tenant lookup, no processing (R8.4)', async () => {
    const req = makeReq({ event: 'messages.upsert', data: {} });
    const res = makeRes();

    await webhookEvolution(req, res);

    expect(res.statusCode).toBe(200);
    expect(poolQueryMock).not.toHaveBeenCalled();
    expect(handleIncomingMessageMock).not.toHaveBeenCalled();
  });

  it('empty/whitespace instance -> 200, no processing (R8.4)', async () => {
    const res = makeRes();
    await webhookEvolution(makeReq({ instance: '   ', event: 'messages.upsert' }), res);

    expect(res.statusCode).toBe(200);
    expect(poolQueryMock).not.toHaveBeenCalled();
    expect(handleIncomingMessageMock).not.toHaveBeenCalled();
  });

  it('malformed / non-object body -> 200, no processing (R8.4)', async () => {
    const res = makeRes();
    await webhookEvolution(makeReq(null), res);

    expect(res.statusCode).toBe(200);
    expect(poolQueryMock).not.toHaveBeenCalled();
    expect(handleIncomingMessageMock).not.toHaveBeenCalled();
  });

  it('internal error during tenant resolution -> 200, no processing (R8.5)', async () => {
    poolQueryMock.mockRejectedValueOnce(new Error('db down'));

    const req = makeReq(messageUpsertBody('tenant-a-instance'));
    const res = makeRes();

    await webhookEvolution(req, res);

    expect(res.statusCode).toBe(200);
    expect(handleIncomingMessageMock).not.toHaveBeenCalled();
  });

  it('non-message event for a known tenant -> 200, ignored (no processing)', async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ id: 'tenant-a' }] });

    const req = makeReq({ instance: 'tenant-a-instance', event: 'connection.update', data: {} });
    const res = makeRes();

    await webhookEvolution(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ status: 'ignored' });
    expect(handleIncomingMessageMock).not.toHaveBeenCalled();
  });

  it('fromMe message for a known tenant -> 200, ignored', async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ id: 'tenant-a' }] });

    const body = messageUpsertBody('tenant-a-instance');
    body.data.key.fromMe = true;

    const res = makeRes();
    await webhookEvolution(makeReq(body), res);

    expect(res.statusCode).toBe(200);
    expect(handleIncomingMessageMock).not.toHaveBeenCalled();
  });

  it('message without text for a known tenant -> 200, ignored', async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ id: 'tenant-a' }] });

    const body = messageUpsertBody('tenant-a-instance');
    body.data.message = {} as never;

    const res = makeRes();
    await webhookEvolution(makeReq(body), res);

    expect(res.statusCode).toBe(200);
    expect(handleIncomingMessageMock).not.toHaveBeenCalled();
  });

  it('never responds 500 on unexpected errors (contract change from MVP)', async () => {
    poolQueryMock.mockImplementationOnce(() => {
      throw new Error('sync throw');
    });

    const res = makeRes();
    await webhookEvolution(makeReq(messageUpsertBody('tenant-a-instance')), res);

    expect(res.statusCode).not.toBe(500);
    expect(res.statusCode).toBe(200);
  });
});
