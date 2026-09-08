import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { type Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/tenant.middleware.js';

/**
 * Feature: order-location, Property: Persistência opcional de coordenadas
 *
 * Ao criar um pedido, se latitude/longitude forem fornecidas (dentro do range
 * válido), elas SÃO persistidas na tabela `orders` e refletidas na resposta.
 * Quando omitidas, o pedido é criado normalmente com latitude/longitude nulas.
 * A captura é sempre opcional — a ausência de coordenadas nunca impede a
 * criação do pedido.
 *
 * **Validates: registro de geolocalização no pedido**
 */

const mockChannel = vi.fn();
const mockSend = vi.fn();

vi.mock('../../config/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn() } },
  supabaseAdmin: {
    channel: (...args: any[]) => mockChannel(...args),
  },
}));

const mockClientQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn();
const mockPoolQuery = vi.fn();

vi.mock('../../config/database.js', () => ({
  pool: {
    connect: () => mockConnect(),
    query: (...args: any[]) => mockPoolQuery(...args),
  },
}));

vi.mock('date-fns-tz', () => ({
  toZonedTime: vi.fn().mockReturnValue(new Date('2024-06-15T10:00:00')),
  format: vi.fn().mockReturnValue('2024-06-15'),
}));

import { createOrder } from '../../controllers/order.controller.js';
import { invokeHandler } from '../helpers/invoke-handler.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MENU_ITEM_ID = '550e8400-e29b-41d4-a716-446655440000';

function mockRequest(body: any): Partial<AuthenticatedRequest> {
  return {
    body,
    params: {},
    user: { id: 'user-1', email: 'test@test.com' },
    tenantId: TENANT_ID,
  };
}

function mockResponse(): Partial<Response> & { statusCode: number; body: any } {
  const res: any = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
  };
  return res;
}

/**
 * Configura os mocks de pool/cliente para um `createOrder` bem-sucedido com um
 * único item. Captura os parâmetros do INSERT em `orders` para permitir
 * asserções sobre latitude/longitude persistidas, e faz o INSERT ecoar as
 * colunas recebidas (simulando o RETURNING *).
 */
function setupSuccessfulCreate(): { getInsertedOrder: () => Record<string, unknown> } {
  let insertedOrder: Record<string, unknown> = {};

  mockConnect.mockResolvedValue({ query: mockClientQuery, release: mockRelease });
  mockChannel.mockReturnValue({ send: mockSend.mockResolvedValue(undefined) });

  // pool.query (fora da transação): 1ª chamada = lookup dos menu items.
  mockPoolQuery.mockImplementation(async () => ({
    rows: [{ id: MENU_ITEM_ID, name: 'Pastel', price_cents: 750, status: 'ativo' }],
  }));

  // client.query (dentro da transação): BEGIN → next_daily_number → INSERT
  // orders → INSERT order_items → COMMIT.
  mockClientQuery.mockImplementation(async (sql: string, params: unknown[]) => {
    if (/^\s*BEGIN/i.test(sql) || /^\s*COMMIT/i.test(sql)) return undefined;

    if (/next_daily_number/i.test(sql)) {
      return { rows: [{ daily_number: 1 }] };
    }

    if (/INSERT INTO orders\b/i.test(sql)) {
      // Reconstrói a linha inserida a partir das colunas/valores do INSERT.
      const columns = sql
        .slice(sql.indexOf('(') + 1, sql.indexOf(')'))
        .split(',')
        .map((c) => c.trim());
      // As colunas e os params têm correspondência 1:1 (o repositório injeta
      // `tenant_id` já como uma das colunas).
      insertedOrder = {};
      columns.forEach((col, i) => {
        insertedOrder[col] = params[i];
      });
      // Simula RETURNING *: inclui id/tenant e ecoa as colunas inseridas.
      return {
        rows: [{ id: 'order-1', tenant_id: TENANT_ID, ...insertedOrder }],
      };
    }

    if (/INSERT INTO order_items\b/i.test(sql)) {
      return {
        rows: [{
          id: 'item-1',
          menu_item_id: MENU_ITEM_ID,
          item_name: 'Pastel',
          unit_price_cents: 750,
          quantity: 1,
        }],
      };
    }

    return { rows: [], rowCount: 1 };
  });

  return { getInsertedOrder: () => insertedOrder };
}

describe('Property: order-location — persistência opcional de coordenadas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseBody = {
    customerName: 'João',
    origin: 'web' as const,
    items: [{ menuItemId: MENU_ITEM_ID, quantity: 1 }],
  };

  // Coordenadas válidas dentro do range.
  const latArb = fc.double({ min: -90, max: 90, noNaN: true });
  const lngArb = fc.double({ min: -180, max: 180, noNaN: true });

  it('persiste latitude/longitude fornecidas e as reflete na resposta', async () => {
    await fc.assert(
      fc.asyncProperty(latArb, lngArb, async (latitude, longitude) => {
        vi.clearAllMocks();
        const { getInsertedOrder } = setupSuccessfulCreate();

        const req = mockRequest({ ...baseBody, latitude, longitude });
        const res = mockResponse();

        await invokeHandler(createOrder, req as AuthenticatedRequest, res as unknown as Response);

        expect(res.statusCode).toBe(201);

        // Persistido no INSERT.
        const inserted = getInsertedOrder();
        expect(inserted.latitude).toBe(latitude);
        expect(inserted.longitude).toBe(longitude);

        // Refletido na resposta.
        expect(res.body.latitude).toBe(latitude);
        expect(res.body.longitude).toBe(longitude);
      }),
      { numRuns: 50 },
    );
  });

  it('cria o pedido com coordenadas nulas quando omitidas', async () => {
    const { getInsertedOrder } = setupSuccessfulCreate();

    const req = mockRequest(baseBody);
    const res = mockResponse();

    await invokeHandler(createOrder, req as AuthenticatedRequest, res as unknown as Response);

    expect(res.statusCode).toBe(201);

    const inserted = getInsertedOrder();
    expect(inserted.latitude).toBeNull();
    expect(inserted.longitude).toBeNull();

    expect(res.body.latitude).toBeNull();
    expect(res.body.longitude).toBeNull();
  });

  it('rejeita coordenadas fora do range com 422 (não cria o pedido)', async () => {
    setupSuccessfulCreate();

    const req = mockRequest({ ...baseBody, latitude: 91, longitude: 0 });
    const res = mockResponse();

    await invokeHandler(createOrder, req as AuthenticatedRequest, res as unknown as Response);

    expect(res.statusCode).toBe(422);
  });
});
