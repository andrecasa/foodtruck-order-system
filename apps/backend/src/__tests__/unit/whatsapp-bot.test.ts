import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

// Mock Evolution API client
const mockSendTextMessage = vi.fn().mockResolvedValue(undefined);
vi.mock('../../bot/evolution-api.client.js', () => ({
  sendTextMessage: (...args: any[]) => mockSendTextMessage(...args),
}));

// Mock supabaseAdmin
const mockChannel = vi.fn();
const mockSend = vi.fn();
vi.mock('../../config/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn() } },
  supabaseAdmin: {
    from: vi.fn(),
    channel: (...args: any[]) => mockChannel(...args),
  },
}));

// Mock pg Pool. The whatsapp service reaches the DB through the shared pool,
// either directly (resolving the tenant's evolution instance) or through the
// TenantRepository (session/menu/order reads and writes), so a single query
// mock covers both paths.
const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn();
vi.mock('../../config/database.js', () => ({
  pool: {
    query: (...args: any[]) => mockQuery(...args),
    connect: () => mockConnect(),
  },
}));

// Mock date-fns-tz
vi.mock('date-fns-tz', () => ({
  toZonedTime: vi.fn().mockReturnValue(new Date('2024-06-15T10:00:00')),
  format: vi.fn().mockReturnValue('2024-06-15'),
}));

import { webhookEvolution } from '../../bot/whatsapp.controller.js';
import {
  formatPriceBRL,
  formatMenu,
  parseItemSelection,
  addToCart,
  formatCartSummary,
  calculateCartTotal,
  handleIncomingMessage,
} from '../../bot/whatsapp.service.js';
import type { CartItem } from '../../bot/whatsapp.service.js';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

// --- Helper Functions ---

function mockRequest(body?: any, headers?: Record<string, string>): Partial<Request> {
  return {
    body: body || {},
    headers: headers || {},
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

/** Queues the initial resolveInstanceName() tenant lookup for a scenario. */
function mockResolveInstance(instanceName: string | null = 'tenant-instance') {
  mockQuery.mockResolvedValueOnce({ rows: [{ evolution_instance_name: instanceName }] });
}

// --- Tests ---

describe('WhatsApp Bot - Price Formatting', () => {
  it('should format price in BRL with comma separator', () => {
    expect(formatPriceBRL(750)).toBe('R$ 7,50');
    expect(formatPriceBRL(1000)).toBe('R$ 10,00');
    expect(formatPriceBRL(300)).toBe('R$ 3,00');
    expect(formatPriceBRL(1250)).toBe('R$ 12,50');
    expect(formatPriceBRL(99)).toBe('R$ 0,99');
  });

  it('should handle zero cents', () => {
    expect(formatPriceBRL(0)).toBe('R$ 0,00');
  });

  it('should pad single digit centavos', () => {
    expect(formatPriceBRL(505)).toBe('R$ 5,05');
    expect(formatPriceBRL(101)).toBe('R$ 1,01');
  });
});

describe('WhatsApp Bot - Menu Formatting', () => {
  const sampleItems = [
    { id: '1', name: 'Pastel de Carne', price_cents: 750, category_name: 'Pastéis Salgados', category_sort_order: 1 },
    { id: '2', name: 'Pastel de Queijo', price_cents: 700, category_name: 'Pastéis Salgados', category_sort_order: 1 },
    { id: '3', name: 'Pastel de Chocolate', price_cents: 800, category_name: 'Pastéis Doces', category_sort_order: 2 },
    { id: '4', name: 'Água Mineral', price_cents: 300, category_name: 'Bebidas', category_sort_order: 3 },
  ];

  it('should format menu grouped by category with item numbers', () => {
    const result = formatMenu(sampleItems);
    expect(result).toContain('*Pastéis Salgados*');
    expect(result).toContain('*Pastéis Doces*');
    expect(result).toContain('*Bebidas*');
    expect(result).toContain('1. Pastel de Carne - R$ 7,50');
    expect(result).toContain('2. Pastel de Queijo - R$ 7,00');
    expect(result).toContain('3. Pastel de Chocolate - R$ 8,00');
    expect(result).toContain('4. Água Mineral - R$ 3,00');
  });

  it('should return empty string for empty menu', () => {
    expect(formatMenu([])).toBe('');
  });
});

describe('WhatsApp Bot - Item Selection Parsing', () => {
  it('should parse single number as item with quantity 1', () => {
    const result = parseItemSelection('1');
    expect(result).toEqual([{ itemNumber: 1, quantity: 1 }]);
  });

  it('should parse "number space number" as item and quantity', () => {
    const result = parseItemSelection('1 2');
    expect(result).toEqual([{ itemNumber: 1, quantity: 2 }]);
  });

  it('should parse "NxQ" as quantity x item', () => {
    const result = parseItemSelection('2x1');
    expect(result).toEqual([{ itemNumber: 1, quantity: 2 }]);
  });

  it('should parse "N x Q" with spaces', () => {
    const result = parseItemSelection('3 x 2');
    expect(result).toEqual([{ itemNumber: 2, quantity: 3 }]);
  });

  it('should parse multiple items separated by commas', () => {
    const result = parseItemSelection('1, 3');
    expect(result).toEqual([
      { itemNumber: 1, quantity: 1 },
      { itemNumber: 3, quantity: 1 },
    ]);
  });

  it('should parse multiple items separated by newlines', () => {
    const result = parseItemSelection('1 2\n3 1');
    expect(result).toEqual([
      { itemNumber: 1, quantity: 2 },
      { itemNumber: 3, quantity: 1 },
    ]);
  });

  it('should return empty array for non-numeric input', () => {
    expect(parseItemSelection('olá')).toEqual([]);
    expect(parseItemSelection('quero pastel')).toEqual([]);
  });

  it('should return empty array for empty string', () => {
    expect(parseItemSelection('')).toEqual([]);
  });
});

describe('WhatsApp Bot - Cart Operations', () => {
  const menuItem1 = { id: 'item-1', name: 'Pastel de Carne', price_cents: 750, category_name: 'Salgados', category_sort_order: 1 };
  const menuItem2 = { id: 'item-2', name: 'Água Mineral', price_cents: 300, category_name: 'Bebidas', category_sort_order: 2 };

  it('should add new item to empty cart', () => {
    const cart = addToCart([], menuItem1, 2);
    expect(cart).toEqual([{
      menuItemId: 'item-1',
      name: 'Pastel de Carne',
      quantity: 2,
      unitPriceCents: 750,
    }]);
  });

  it('should accumulate quantity when adding same item', () => {
    const cart: CartItem[] = [{
      menuItemId: 'item-1',
      name: 'Pastel de Carne',
      quantity: 1,
      unitPriceCents: 750,
    }];
    const updated = addToCart(cart, menuItem1, 3);
    expect(updated[0]!.quantity).toBe(4);
  });

  it('should add different items separately', () => {
    const cart = addToCart([], menuItem1, 1);
    const updated = addToCart(cart, menuItem2, 2);
    expect(updated).toHaveLength(2);
    expect(updated[0]!.name).toBe('Pastel de Carne');
    expect(updated[1]!.name).toBe('Água Mineral');
  });

  it('should calculate total correctly', () => {
    const cart: CartItem[] = [
      { menuItemId: 'item-1', name: 'Pastel de Carne', quantity: 2, unitPriceCents: 750 },
      { menuItemId: 'item-2', name: 'Água Mineral', quantity: 1, unitPriceCents: 300 },
    ];
    expect(calculateCartTotal(cart)).toBe(1800);
  });

  it('should return 0 for empty cart', () => {
    expect(calculateCartTotal([])).toBe(0);
  });
});

describe('WhatsApp Bot - Cart Summary Formatting', () => {
  it('should format cart with items, prices, and total', () => {
    const cart: CartItem[] = [
      { menuItemId: 'item-1', name: 'Pastel de Carne', quantity: 2, unitPriceCents: 750 },
      { menuItemId: 'item-2', name: 'Água Mineral', quantity: 1, unitPriceCents: 300 },
    ];
    const summary = formatCartSummary(cart);
    expect(summary).toContain('2x Pastel de Carne');
    expect(summary).toContain('R$ 7,50');
    expect(summary).toContain('R$ 15,00');
    expect(summary).toContain('1x Água Mineral');
    expect(summary).toContain('R$ 3,00');
    expect(summary).toContain('Total: R$ 18,00');
    expect(summary).toContain('CONFIRMAR');
    expect(summary).toContain('CANCELAR');
  });

  it('should return empty message for empty cart', () => {
    expect(formatCartSummary([])).toBe('Carrinho vazio.');
  });
});

describe('WhatsApp Bot - Webhook Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject request without valid API key', async () => {
    const req = mockRequest(
      { instance: 'tenant-instance', event: 'messages.upsert', data: {} },
      { apikey: 'wrong-key' }
    );
    const res = mockResponse();

    await webhookEvolution(req as Request, res as unknown as Response);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('should accept request with valid API key', async () => {
    // Known tenant resolves for the instance.
    mockQuery.mockResolvedValueOnce({ rows: [{ id: TENANT_ID }] });
    const req = mockRequest(
      { instance: 'tenant-instance', event: 'messages.upsert', data: { key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: true } } },
      { apikey: 'change-me-evolution-api-key' }
    );
    const res = mockResponse();

    await webhookEvolution(req as Request, res as unknown as Response);

    expect(res.statusCode).toBe(200);
  });

  it('should ignore non-message events', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: TENANT_ID }] });
    const req = mockRequest(
      { instance: 'tenant-instance', event: 'connection.update', data: {} },
      { apikey: 'change-me-evolution-api-key' }
    );
    const res = mockResponse();

    await webhookEvolution(req as Request, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ignored');
  });

  it('should ignore fromMe messages', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: TENANT_ID }] });
    const req = mockRequest(
      {
        instance: 'tenant-instance',
        event: 'messages.upsert',
        data: {
          key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: true },
          message: { conversation: 'hello' },
        },
      },
      { apikey: 'change-me-evolution-api-key' }
    );
    const res = mockResponse();

    await webhookEvolution(req as Request, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ignored');
  });

  it('should ignore messages without text content', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: TENANT_ID }] });
    const req = mockRequest(
      {
        instance: 'tenant-instance',
        event: 'messages.upsert',
        data: {
          key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false },
          message: {},
        },
      },
      { apikey: 'change-me-evolution-api-key' }
    );
    const res = mockResponse();

    await webhookEvolution(req as Request, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ignored');
  });
});

describe('WhatsApp Bot - State Machine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue({
      query: mockQuery,
      release: mockRelease,
    });
    mockChannel.mockReturnValue({
      send: mockSend.mockResolvedValue(undefined),
    });
  });

  describe('New session (saudacao flow)', () => {
    it('should create session and send greeting with menu for new user', async () => {
      // resolveInstanceName
      mockResolveInstance();
      // getSession -> no existing session
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // createSession (INSERT ... ON CONFLICT)
      mockQuery.mockResolvedValueOnce({
        rows: [{
          phone_number: '5511999999999',
          state: 'saudacao',
          cart: [],
          started_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
        }],
      });
      // fetchActiveMenuItems
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: '1', name: 'Pastel de Carne', price_cents: 750, category_name: 'Pastéis Salgados', category_sort_order: 1 },
          { id: '2', name: 'Água Mineral', price_cents: 300, category_name: 'Bebidas', category_sort_order: 3 },
        ],
      });
      // updateSession to selecionando
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await handleIncomingMessage(TENANT_ID, '5511999999999', 'João', 'oi');

      expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
      const sentMessage = mockSendTextMessage.mock.calls[0]![0];
      expect(sentMessage.number).toBe('5511999999999');
      expect(sentMessage.text).toContain('Olá, João!');
      expect(sentMessage.text).toContain('Pastel de Carne');
      expect(sentMessage.text).toContain('R$ 7,50');
      expect(sentMessage.text).toContain('Água Mineral');
      expect(sentMessage.text).toContain('R$ 3,00');
      // Message is sent through the tenant's own Evolution instance.
      expect(sentMessage.instanceName).toBe('tenant-instance');
    });

    it('should handle empty menu by informing and ending session', async () => {
      mockResolveInstance();
      // getSession -> none
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // createSession
      mockQuery.mockResolvedValueOnce({
        rows: [{
          phone_number: '5511999999999',
          state: 'saudacao',
          cart: [],
          started_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
        }],
      });
      // fetchActiveMenuItems - empty
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // deleteSession
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await handleIncomingMessage(TENANT_ID, '5511999999999', 'Maria', 'oi');

      expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
      const sentMessage = mockSendTextMessage.mock.calls[0]![0];
      expect(sentMessage.text).toContain('sem itens disponíveis');
    });
  });

  describe('Existing session (selecionando flow)', () => {
    it('should add item to cart when valid number is sent', async () => {
      mockResolveInstance();
      // getSession -> existing selecionando session
      mockQuery.mockResolvedValueOnce({
        rows: [{
          phone_number: '5511999999999',
          state: 'selecionando',
          cart: [],
          started_at: new Date().toISOString(),
          last_activity_at: new Date(Date.now() - 1000).toISOString(),
        }],
      });
      // updateSession (touch last_activity)
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // getNumberedMenuItems -> fetchActiveMenuItems
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'item-1', name: 'Pastel de Carne', price_cents: 750, category_name: 'Pastéis Salgados', category_sort_order: 1 },
          { id: 'item-2', name: 'Água Mineral', price_cents: 300, category_name: 'Bebidas', category_sort_order: 3 },
        ],
      });
      // updateSession with new cart
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await handleIncomingMessage(TENANT_ID, '5511999999999', 'João', '1');

      expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
      const sentMessage = mockSendTextMessage.mock.calls[0]![0];
      expect(sentMessage.text).toContain('Adicionado');
      expect(sentMessage.text).toContain('Pastel de Carne');
    });

    it('should respond with error for unexpected message in selecionando', async () => {
      mockResolveInstance();
      // getSession -> existing selecionando session
      mockQuery.mockResolvedValueOnce({
        rows: [{
          phone_number: '5511999999999',
          state: 'selecionando',
          cart: [],
          started_at: new Date().toISOString(),
          last_activity_at: new Date(Date.now() - 1000).toISOString(),
        }],
      });
      // updateSession (touch last_activity)
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await handleIncomingMessage(TENANT_ID, '5511999999999', 'João', 'quero pastel');

      expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
      const sentMessage = mockSendTextMessage.mock.calls[0]![0];
      expect(sentMessage.text).toContain('Não entendi');
      expect(sentMessage.text).toContain('PRONTO');
      expect(sentMessage.text).toContain('CANCELAR');
    });
  });

  describe('Resumo flow', () => {
    it('should show summary when user types PRONTO', async () => {
      const cart: CartItem[] = [
        { menuItemId: 'item-1', name: 'Pastel de Carne', quantity: 2, unitPriceCents: 750 },
      ];

      mockResolveInstance();
      // getSession -> selecionando with items
      mockQuery.mockResolvedValueOnce({
        rows: [{
          phone_number: '5511999999999',
          state: 'selecionando',
          cart: cart,
          started_at: new Date().toISOString(),
          last_activity_at: new Date(Date.now() - 1000).toISOString(),
        }],
      });
      // updateSession (touch last_activity)
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // updateSession to resumo
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await handleIncomingMessage(TENANT_ID, '5511999999999', 'João', 'pronto');

      expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
      const sentMessage = mockSendTextMessage.mock.calls[0]![0];
      expect(sentMessage.text).toContain('Resumo do seu pedido');
      expect(sentMessage.text).toContain('2x Pastel de Carne');
      expect(sentMessage.text).toContain('R$ 15,00');
      expect(sentMessage.text).toContain('CONFIRMAR');
    });

    it('should create order attributed to a tenant admin and confirm', async () => {
      const cart: CartItem[] = [
        { menuItemId: 'item-1', name: 'Pastel de Carne', quantity: 2, unitPriceCents: 750 },
      ];

      mockResolveInstance();
      // getSession -> resumo state
      mockQuery.mockResolvedValueOnce({
        rows: [{
          phone_number: '5511999999999',
          state: 'resumo',
          cart: cart,
          started_at: new Date().toISOString(),
          last_activity_at: new Date(Date.now() - 1000).toISOString(),
        }],
      });
      // updateSession (touch last_activity)
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Active admin lookup for THIS tenant (created_by)
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'admin-uuid-1' }] });

      // Order creation transaction (withTransaction uses pool.connect()).
      mockConnect.mockResolvedValue({
        query: mockQuery,
        release: mockRelease,
      });
      // BEGIN
      mockQuery.mockResolvedValueOnce(undefined);
      // next_daily_number
      mockQuery.mockResolvedValueOnce({ rows: [{ daily_number: 7 }] });
      // INSERT order
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'order-uuid-1',
          daily_number: 7,
          customer_name: 'João',
          origin: 'whatsapp',
          status: 'aguardando',
          payment_status: 'pendente',
          total_amount_cents: 1500,
          order_date: '2024-06-15',
          created_at: '2024-06-15T13:00:00.000Z',
        }],
      });
      // INSERT order_item
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'oi-1' }] });
      // COMMIT
      mockQuery.mockResolvedValueOnce(undefined);
      // deleteSession
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await handleIncomingMessage(TENANT_ID, '5511999999999', 'João', 'confirmar');

      // The admin lookup is scoped to the tenant and active admins only.
      const adminCall = mockQuery.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes("role = 'admin'")
      );
      expect(adminCall).toBeDefined();
      expect(String(adminCall![0])).toContain("status = 'ativo'");
      expect(String(adminCall![0])).toContain('tenant_id = $1');
      expect(adminCall![1]).toEqual([TENANT_ID]);

      expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
      const sentMessage = mockSendTextMessage.mock.calls[0]![0];
      expect(sentMessage.text).toContain('Pedido confirmado');
      expect(sentMessage.text).toContain('#7');
      expect(sentMessage.text).toContain('R$ 15,00');
    });

    it('should NOT create order and inform error when tenant has no active admin (R8.9)', async () => {
      const cart: CartItem[] = [
        { menuItemId: 'item-1', name: 'Pastel de Carne', quantity: 1, unitPriceCents: 750 },
      ];

      mockResolveInstance();
      // getSession -> resumo state
      mockQuery.mockResolvedValueOnce({
        rows: [{
          phone_number: '5511999999999',
          state: 'resumo',
          cart: cart,
          started_at: new Date().toISOString(),
          last_activity_at: new Date(Date.now() - 1000).toISOString(),
        }],
      });
      // updateSession (touch last_activity)
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Active admin lookup -> none for this tenant
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // deleteSession
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await handleIncomingMessage(TENANT_ID, '5511999999999', 'João', 'confirmar');

      // No order was created: pool.connect() (transaction) must never be called.
      expect(mockConnect).not.toHaveBeenCalled();

      expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
      const sentMessage = mockSendTextMessage.mock.calls[0]![0];
      expect(sentMessage.text).toContain('erro ao criar seu pedido');
    });

    it('should cancel order when user says CANCELAR in resumo', async () => {
      const cart: CartItem[] = [
        { menuItemId: 'item-1', name: 'Pastel de Carne', quantity: 1, unitPriceCents: 750 },
      ];

      mockResolveInstance();
      // getSession -> resumo state
      mockQuery.mockResolvedValueOnce({
        rows: [{
          phone_number: '5511999999999',
          state: 'resumo',
          cart: cart,
          started_at: new Date().toISOString(),
          last_activity_at: new Date(Date.now() - 1000).toISOString(),
        }],
      });
      // updateSession (touch last_activity)
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // deleteSession
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await handleIncomingMessage(TENANT_ID, '5511999999999', 'João', 'cancelar');

      expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
      const sentMessage = mockSendTextMessage.mock.calls[0]![0];
      expect(sentMessage.text).toContain('cancelado');
    });
  });

  describe('Session timeout', () => {
    it('should end session and restart when timed out', async () => {
      const timedOutDate = new Date(Date.now() - 11 * 60 * 1000).toISOString();

      mockResolveInstance();
      // getSession -> timed out session
      mockQuery.mockResolvedValueOnce({
        rows: [{
          phone_number: '5511999999999',
          state: 'selecionando',
          cart: [{ menuItemId: 'item-1', name: 'Pastel', quantity: 1, unitPriceCents: 750 }],
          started_at: timedOutDate,
          last_activity_at: timedOutDate,
        }],
      });
      // deleteSession (timeout)
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // createSession (new)
      mockQuery.mockResolvedValueOnce({
        rows: [{
          phone_number: '5511999999999',
          state: 'saudacao',
          cart: [],
          started_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
        }],
      });
      // fetchActiveMenuItems
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: '1', name: 'Pastel de Carne', price_cents: 750, category_name: 'Pastéis Salgados', category_sort_order: 1 },
        ],
      });
      // updateSession to selecionando
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await handleIncomingMessage(TENANT_ID, '5511999999999', 'João', 'oi');

      // Should send timeout message + greeting
      expect(mockSendTextMessage).toHaveBeenCalledTimes(2);
      expect(mockSendTextMessage.mock.calls[0]![0].text).toContain('expirou');
      expect(mockSendTextMessage.mock.calls[1]![0].text).toContain('Olá, João');
    });
  });

  describe('Unexpected messages in resumo state', () => {
    it('should show valid options when message is not recognized', async () => {
      const cart: CartItem[] = [
        { menuItemId: 'item-1', name: 'Pastel de Carne', quantity: 1, unitPriceCents: 750 },
      ];

      mockResolveInstance();
      // getSession -> resumo state
      mockQuery.mockResolvedValueOnce({
        rows: [{
          phone_number: '5511999999999',
          state: 'resumo',
          cart: cart,
          started_at: new Date().toISOString(),
          last_activity_at: new Date(Date.now() - 1000).toISOString(),
        }],
      });
      // updateSession (touch last_activity)
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await handleIncomingMessage(TENANT_ID, '5511999999999', 'João', 'blablabla');

      expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
      const sentMessage = mockSendTextMessage.mock.calls[0]![0];
      expect(sentMessage.text).toContain('Não entendi');
      expect(sentMessage.text).toContain('CONFIRMAR');
      expect(sentMessage.text).toContain('CANCELAR');
      expect(sentMessage.text).toContain('MAIS');
    });
  });
});
