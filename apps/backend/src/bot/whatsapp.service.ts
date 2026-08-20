/**
 * WhatsApp Bot Service - State machine, session management, and business logic.
 *
 * Multi-tenant (design section 6 "WhatsApp por Tenant", Requirements 8.7–8.11):
 * Every operation of the bot is scoped to the `tenantId` resolved by the
 * WebhookRouter (bot/whatsapp.controller.ts) from the Evolution instance.
 *
 * - Sessions are keyed by `(tenant_id, phone_number)` so the same phone number
 *   may talk to more than one tenant simultaneously (R8.7, R8.11).
 * - The greeting/menu uses the ACTIVE menu of the tenant (R8.10).
 * - Orders created from a conversation are attributed to an ACTIVE admin of the
 *   SAME tenant; if none exists the order is NOT created and a failure is
 *   logged (R8.8, R8.9).
 * - Outgoing messages are sent through the tenant's own Evolution instance
 *   (`tenants.evolution_instance_name`).
 *
 * Tenant-scoped reads/writes go through the `TenantRepository`, which injects
 * `tenant_id` into every query. Resolving the tenant's Evolution instance name
 * is a platform-level lookup (it selects a `tenants` row by id, not a
 * tenant-scoped table), so it uses the shared `pool` directly.
 */

import { pool } from '../config/database.js';
import { tenantRepository } from '../db/tenant-repository.js';
import { broadcast, tenantChannel, REALTIME_CHANNEL_QUEUE } from '../config/realtime.js';
import { sendTextMessage } from './evolution-api.client.js';
import { WHATSAPP_SESSION_TIMEOUT_MS } from '@order-system/shared';
import { toZonedTime, format } from 'date-fns-tz';

const SAO_PAULO_TZ = 'America/Sao_Paulo';

// --- Types ---

export type SessionState = 'saudacao' | 'selecionando' | 'resumo';

export interface CartItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface WhatsAppSession {
  phoneNumber: string;
  state: SessionState;
  cart: CartItem[];
  startedAt: string;
  lastActivityAt: string;
}

interface MenuItemRow {
  id: string;
  name: string;
  price_cents: number;
  category_name: string;
  category_sort_order: number;
}

// --- Price Formatting ---

export function formatPriceBRL(cents: number): string {
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;
  return `R$ ${reais},${centavos.toString().padStart(2, '0')}`;
}

// --- Tenant Evolution instance resolution ---

/**
 * Resolves the tenant's Evolution instance name (`tenants.evolution_instance_name`)
 * so outgoing messages are sent through the tenant's own WhatsApp number.
 *
 * This is a platform-level read of the `tenants` table by primary key (not a
 * tenant-scoped table), so it uses the shared `pool` directly. Returns
 * `undefined` when the tenant has no instance configured, in which case the
 * Evolution client falls back to its default instance.
 */
export async function resolveInstanceName(tenantId: string): Promise<string | undefined> {
  const result = await pool.query<{ evolution_instance_name: string | null }>(
    'SELECT evolution_instance_name FROM tenants WHERE id = $1',
    [tenantId]
  );
  return result.rows[0]?.evolution_instance_name ?? undefined;
}

// --- Menu Fetching ---

export async function fetchActiveMenuItems(tenantId: string): Promise<MenuItemRow[]> {
  const repo = tenantRepository(tenantId);
  const rows = await repo.raw<MenuItemRow>(
    `SELECT mi.id, mi.name, mi.price_cents, c.name AS category_name, c.sort_order AS category_sort_order
     FROM menu_items mi
     JOIN categories c ON mi.category_id = c.id AND c.tenant_id = mi.tenant_id
     WHERE mi.tenant_id = $1 AND mi.status = 'ativo'
     ORDER BY c.sort_order, mi.name`,
    [tenantId]
  );
  return rows;
}

export function formatMenu(items: MenuItemRow[]): string {
  if (items.length === 0) return '';

  const grouped: Record<string, MenuItemRow[]> = {};
  for (const item of items) {
    if (!grouped[item.category_name]) {
      grouped[item.category_name] = [];
    }
    grouped[item.category_name]!.push(item);
  }

  let menuText = '';
  let itemNumber = 1;
  const itemMap: { number: number; item: MenuItemRow }[] = [];

  for (const [category, categoryItems] of Object.entries(grouped)) {
    menuText += `\n*${category}*\n`;
    for (const item of categoryItems) {
      menuText += `${itemNumber}. ${item.name} - ${formatPriceBRL(item.price_cents)}\n`;
      itemMap.push({ number: itemNumber, item });
      itemNumber++;
    }
  }

  return menuText.trim();
}

// --- Session Management ---

export async function getSession(tenantId: string, phoneNumber: string): Promise<WhatsAppSession | null> {
  const repo = tenantRepository(tenantId);
  const row = await repo.findOne<{
    phone_number: string;
    state: SessionState;
    cart: CartItem[];
    started_at: string;
    last_activity_at: string;
  }>('whatsapp_sessions', {
    where: { text: 'phone_number = $1', params: [phoneNumber] },
  });

  if (!row) return null;

  return {
    phoneNumber: row.phone_number,
    state: row.state as SessionState,
    cart: row.cart as CartItem[],
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
  };
}

export async function createSession(tenantId: string, phoneNumber: string): Promise<WhatsAppSession> {
  // ON CONFLICT on the composite PK (tenant_id, phone_number) requires an
  // explicit statement, so we use raw() with the mandatory tenant placeholder.
  const repo = tenantRepository(tenantId);
  const rows = await repo.raw<{
    phone_number: string;
    state: SessionState;
    cart: CartItem[];
    started_at: string;
    last_activity_at: string;
  }>(
    `INSERT INTO whatsapp_sessions (tenant_id, phone_number, state, cart, started_at, last_activity_at)
     VALUES ($1, $2, 'saudacao', '[]'::jsonb, NOW(), NOW())
     ON CONFLICT (tenant_id, phone_number)
     DO UPDATE SET state = 'saudacao', cart = '[]'::jsonb, started_at = NOW(), last_activity_at = NOW()
     RETURNING phone_number, state, cart, started_at, last_activity_at`,
    [tenantId, phoneNumber]
  );

  const row = rows[0]!;
  return {
    phoneNumber: row.phone_number,
    state: row.state as SessionState,
    cart: row.cart as CartItem[],
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
  };
}

export async function updateSession(tenantId: string, phoneNumber: string, state: SessionState, cart: CartItem[]): Promise<void> {
  const repo = tenantRepository(tenantId);
  await repo.raw(
    `UPDATE whatsapp_sessions SET state = $2, cart = $3, last_activity_at = NOW()
     WHERE tenant_id = $1 AND phone_number = $4`,
    [tenantId, state, JSON.stringify(cart), phoneNumber]
  );
}

export async function deleteSession(tenantId: string, phoneNumber: string): Promise<void> {
  const repo = tenantRepository(tenantId);
  await repo.delete('whatsapp_sessions', { text: 'phone_number = $1', params: [phoneNumber] });
}

export async function isSessionTimedOut(session: WhatsAppSession): Promise<boolean> {
  const lastActivity = new Date(session.lastActivityAt).getTime();
  const now = Date.now();
  return (now - lastActivity) >= WHATSAPP_SESSION_TIMEOUT_MS;
}

export async function cleanupTimedOutSessions(tenantId: string): Promise<void> {
  const repo = tenantRepository(tenantId);
  const rows = await repo.raw<{ phone_number: string }>(
    `SELECT phone_number FROM whatsapp_sessions
     WHERE tenant_id = $1 AND last_activity_at < NOW() - INTERVAL '10 minutes'`,
    [tenantId]
  );

  const instanceName = await resolveInstanceName(tenantId);

  for (const row of rows) {
    await sendTextMessage({
      number: row.phone_number,
      text: '⏰ Sua sessão expirou por inatividade. Envie uma nova mensagem para fazer um pedido.',
      instanceName,
    });
    await deleteSession(tenantId, row.phone_number);
  }
}

// --- Menu Items Indexed by Number ---

export async function getNumberedMenuItems(tenantId: string): Promise<Map<number, MenuItemRow>> {
  const items = await fetchActiveMenuItems(tenantId);
  const map = new Map<number, MenuItemRow>();
  let index = 1;
  for (const item of items) {
    map.set(index, item);
    index++;
  }
  return map;
}

// --- Message Parsing ---

export interface ParsedSelection {
  itemNumber: number;
  quantity: number;
}

/**
 * Parse user message to identify item selections.
 * Supports formats like:
 * - "1" (item 1, quantity 1)
 * - "1 2" (item 1, quantity 2)
 * - "1x2" or "1 x 2" (item 1, quantity 2)
 * - "2x 1" (2 units of item 1)
 */
export function parseItemSelection(message: string): ParsedSelection[] {
  const selections: ParsedSelection[] = [];
  const trimmed = message.trim().toLowerCase();

  // Try pattern: "NxQ" or "QxN" or just "N"
  // Split by commas, newlines, or semicolons for multiple items
  const parts = trimmed.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    // Pattern: "N x Q" or "NxQ" (item number x quantity)
    const xMatch = part.match(/^(\d+)\s*x\s*(\d+)$/);
    if (xMatch) {
      const first = parseInt(xMatch[1]!, 10);
      const second = parseInt(xMatch[2]!, 10);
      // Interpret as "quantity x item" (e.g., "2x1" = 2 units of item 1)
      selections.push({ itemNumber: second, quantity: first });
      continue;
    }

    // Pattern: "N Q" (item number, quantity) - two numbers separated by space
    const spaceMatch = part.match(/^(\d+)\s+(\d+)$/);
    if (spaceMatch) {
      const itemNum = parseInt(spaceMatch[1]!, 10);
      const qty = parseInt(spaceMatch[2]!, 10);
      selections.push({ itemNumber: itemNum, quantity: qty });
      continue;
    }

    // Pattern: just a number (item number, quantity defaults to 1)
    const singleMatch = part.match(/^(\d+)$/);
    if (singleMatch) {
      selections.push({ itemNumber: parseInt(singleMatch[1]!, 10), quantity: 1 });
      continue;
    }
  }

  return selections;
}

// --- Cart Operations ---

export function addToCart(cart: CartItem[], menuItem: MenuItemRow, quantity: number): CartItem[] {
  const existing = cart.find((c) => c.menuItemId === menuItem.id);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({
      menuItemId: menuItem.id,
      name: menuItem.name,
      quantity,
      unitPriceCents: menuItem.price_cents,
    });
  }
  return [...cart];
}

export function formatCartSummary(cart: CartItem[]): string {
  if (cart.length === 0) return 'Carrinho vazio.';

  let text = '*📋 Resumo do seu pedido:*\n\n';
  let total = 0;

  for (const item of cart) {
    const subtotal = item.unitPriceCents * item.quantity;
    total += subtotal;
    text += `• ${item.quantity}x ${item.name} - ${formatPriceBRL(item.unitPriceCents)} cada = ${formatPriceBRL(subtotal)}\n`;
  }

  text += `\n*Total: ${formatPriceBRL(total)}*\n`;
  text += '\nDigite *CONFIRMAR* para finalizar o pedido';
  text += '\nDigite *CANCELAR* para cancelar';
  text += '\nOu continue adicionando itens (envie o número do item)';

  return text;
}

export function calculateCartTotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
}

// --- Order Creation ---

/**
 * Creates an order from a WhatsApp conversation, scoped to `tenantId`.
 *
 * The order is attributed to an ACTIVE admin of the SAME tenant
 * (`WHERE tenant_id=$1 AND role='admin' AND status='ativo'`). If no active
 * admin exists for the tenant, the order is NOT created and a failure is logged
 * (R8.8, R8.9). Uses `next_daily_number($tenantId, $date)` and inserts
 * `tenant_id` on the order and its items (R8.8, R8.11).
 */
async function createWhatsAppOrder(tenantId: string, phoneNumber: string, customerName: string, cart: CartItem[]): Promise<{ dailyNumber: number; totalAmountCents: number } | null> {
  const totalAmountCents = calculateCartTotal(cart);

  const now = new Date();
  const zonedDate = toZonedTime(now, SAO_PAULO_TZ);
  const orderDate = format(zonedDate, 'yyyy-MM-dd', { timeZone: SAO_PAULO_TZ });

  const repo = tenantRepository(tenantId);

  // Get the first active admin of THIS tenant as the creator for bot orders.
  const admins = await repo.raw<{ id: string }>(
    "SELECT id FROM users WHERE tenant_id = $1 AND role = 'admin' AND status = 'ativo' ORDER BY created_at ASC LIMIT 1",
    [tenantId]
  );
  if (admins.length === 0) {
    // No active admin for the tenant: do NOT create the order, register failure
    // (R8.9). The caller informs the customer of the error.
    console.error(`[whatsapp-bot] No active admin found for tenant ${tenantId} to attribute order; order not created`);
    return null;
  }
  const createdBy = admins[0]!.id;

  try {
    const created = await repo.withTransaction(async (txRepo) => {
      const seqRows = await txRepo.raw<{ daily_number: number }>(
        'SELECT next_daily_number($1::uuid, $2::date) AS daily_number',
        [tenantId, orderDate]
      );
      const dailyNumber = seqRows[0]!.daily_number;

      const order = await txRepo.insert<Record<string, unknown>>('orders', {
        daily_number: dailyNumber,
        customer_name: customerName,
        origin: 'whatsapp',
        status: 'aguardando',
        payment_status: 'pendente',
        total_amount_cents: totalAmountCents,
        order_date: orderDate,
        created_by: createdBy,
        created_at: now.toISOString(),
      });

      for (const item of cart) {
        await txRepo.insert('order_items', {
          order_id: order.id,
          menu_item_id: item.menuItemId,
          item_name: item.name,
          unit_price_cents: item.unitPriceCents,
          quantity: item.quantity,
        });
      }

      return order;
    });

    // Publish realtime event on the tenant-namespaced queue channel (R12.7, R12.8).
    try {
      broadcast(tenantChannel(REALTIME_CHANNEL_QUEUE, tenantId), 'new_order', {
        id: created.id,
        dailyNumber: created.daily_number,
        customerName: created.customer_name,
        origin: created.origin,
        status: created.status,
        paymentStatus: created.payment_status,
        totalAmountCents: created.total_amount_cents,
        orderDate: created.order_date,
        createdAt: created.created_at,
        tenantId,
      });
    } catch {
      console.error('[whatsapp-bot] Failed to publish realtime event');
    }

    void phoneNumber;
    return { dailyNumber: created.daily_number as number, totalAmountCents };
  } catch (error) {
    console.error('[whatsapp-bot] Error creating order:', error);
    return null;
  }
}

// --- State Machine Handler ---

/**
 * Handle an incoming WhatsApp message under a resolved tenant scope.
 *
 * `tenantId` (resolved by the WebhookRouter from the Evolution instance) is
 * threaded through every session, menu and order operation so all reads/writes
 * are scoped to the tenant (R8.7–R8.11).
 */
export async function handleIncomingMessage(tenantId: string, phoneNumber: string, pushName: string | undefined, messageText: string): Promise<void> {
  const instanceName = await resolveInstanceName(tenantId);

  // Check for existing session (scoped to the tenant).
  let session = await getSession(tenantId, phoneNumber);

  // Check timeout
  if (session && await isSessionTimedOut(session)) {
    await sendTextMessage({
      number: phoneNumber,
      text: '⏰ Sua sessão anterior expirou por inatividade. Vamos começar de novo!',
      instanceName,
    });
    await deleteSession(tenantId, phoneNumber);
    session = null;
  }

  // No session: create new one and start saudacao flow
  if (!session) {
    session = await createSession(tenantId, phoneNumber);
    await handleSaudacao(tenantId, phoneNumber, pushName, instanceName);
    return;
  }

  // Update last activity
  await updateSession(tenantId, session.phoneNumber, session.state, session.cart);

  // Route to current state handler
  switch (session.state) {
    case 'saudacao':
      // After greeting, any message moves to selecionando
      await handleSelecionando(tenantId, phoneNumber, messageText, [], instanceName);
      break;
    case 'selecionando':
      await handleSelecionando(tenantId, phoneNumber, messageText, session.cart, instanceName);
      break;
    case 'resumo':
      await handleResumo(tenantId, phoneNumber, pushName, messageText, session.cart, instanceName);
      break;
  }
}

// --- State: saudacao ---

async function handleSaudacao(tenantId: string, phoneNumber: string, pushName: string | undefined, instanceName: string | undefined): Promise<void> {
  const items = await fetchActiveMenuItems(tenantId);

  // Empty menu case
  if (items.length === 0) {
    await sendTextMessage({
      number: phoneNumber,
      text: '😔 Desculpe, nosso cardápio está temporariamente sem itens disponíveis. Tente novamente mais tarde!',
      instanceName,
    });
    await deleteSession(tenantId, phoneNumber);
    return;
  }

  const customerGreeting = pushName ? `Olá, ${pushName}! 👋` : 'Olá! 👋';
  const menuText = formatMenu(items);

  const greeting = `${customerGreeting}\n\nBem-vindo(a) ao nosso Food Truck! 🚚\n\nAqui está nosso cardápio:\n\n${menuText}\n\n📝 Para fazer seu pedido, envie o *número do item* e a *quantidade*.\nExemplo: "1" para 1 unidade ou "1 2" para 2 unidades do item 1.\n\nVocê pode adicionar vários itens antes de confirmar!`;

  await sendTextMessage({ number: phoneNumber, text: greeting, instanceName });
  await updateSession(tenantId, phoneNumber, 'selecionando', []);
}

// --- State: selecionando ---

async function handleSelecionando(tenantId: string, phoneNumber: string, messageText: string, currentCart: CartItem[], instanceName: string | undefined): Promise<void> {
  const trimmed = messageText.trim().toLowerCase();

  // Check if user wants to see summary/finalize
  if (trimmed === 'pronto' || trimmed === 'finalizar' || trimmed === 'fechar') {
    if (currentCart.length === 0) {
      await sendTextMessage({
        number: phoneNumber,
        text: '🛒 Seu carrinho está vazio! Envie o número de um item do cardápio para adicioná-lo.',
        instanceName,
      });
      return;
    }
    const summary = formatCartSummary(currentCart);
    await sendTextMessage({ number: phoneNumber, text: summary, instanceName });
    await updateSession(tenantId, phoneNumber, 'resumo', currentCart);
    return;
  }

  // Check if user wants to cancel
  if (trimmed === 'cancelar') {
    await sendTextMessage({
      number: phoneNumber,
      text: '❌ Pedido cancelado. Envie uma mensagem a qualquer momento para fazer um novo pedido!',
      instanceName,
    });
    await deleteSession(tenantId, phoneNumber);
    return;
  }

  // Parse item selections
  const selections = parseItemSelection(messageText);

  if (selections.length === 0) {
    // Unexpected message
    await sendTextMessage({
      number: phoneNumber,
      text: '🤔 Não entendi. Por favor, envie o *número do item* para adicioná-lo ao carrinho.\nExemplo: "1" para 1 unidade ou "1 2" para 2 unidades.\n\nDigite *PRONTO* quando quiser finalizar o pedido.\nDigite *CANCELAR* para cancelar.',
      instanceName,
    });
    return;
  }

  // Fetch numbered menu items (scoped to the tenant).
  const numberedItems = await getNumberedMenuItems(tenantId);
  const maxNumber = numberedItems.size;
  let cart = [...currentCart];
  const addedItems: string[] = [];
  const invalidNumbers: number[] = [];

  for (const selection of selections) {
    if (selection.itemNumber < 1 || selection.itemNumber > maxNumber) {
      invalidNumbers.push(selection.itemNumber);
      continue;
    }
    const menuItem = numberedItems.get(selection.itemNumber)!;
    const qty = Math.min(Math.max(selection.quantity, 1), 99);
    cart = addToCart(cart, menuItem, qty);
    addedItems.push(`${qty}x ${menuItem.name}`);
  }

  let response = '';
  if (addedItems.length > 0) {
    response += `✅ Adicionado: ${addedItems.join(', ')}\n\n`;
  }
  if (invalidNumbers.length > 0) {
    response += `⚠️ Item(ns) inválido(s): ${invalidNumbers.join(', ')}. Escolha entre 1 e ${maxNumber}.\n\n`;
  }
  response += '📝 Continue adicionando itens ou digite *PRONTO* para finalizar.';

  await sendTextMessage({ number: phoneNumber, text: response, instanceName });
  await updateSession(tenantId, phoneNumber, 'selecionando', cart);
}

// --- State: resumo ---

async function handleResumo(tenantId: string, phoneNumber: string, pushName: string | undefined, messageText: string, cart: CartItem[], instanceName: string | undefined): Promise<void> {
  const trimmed = messageText.trim().toLowerCase();

  if (trimmed === 'confirmar' || trimmed === 'sim' || trimmed === 'ok') {
    // Create order
    const customerName = pushName || formatPhoneForDisplay(phoneNumber);
    const result = await createWhatsAppOrder(tenantId, phoneNumber, customerName, cart);

    if (result) {
      await sendTextMessage({
        number: phoneNumber,
        text: `🎉 Pedido confirmado!\n\n📋 Número do pedido: *#${result.dailyNumber}*\n💰 Total: *${formatPriceBRL(result.totalAmountCents)}*\n\nAguarde a preparação. Obrigado pela preferência! 🚚`,
        instanceName,
      });
    } else {
      await sendTextMessage({
        number: phoneNumber,
        text: '❌ Ocorreu um erro ao criar seu pedido. Por favor, tente novamente.',
        instanceName,
      });
    }

    await deleteSession(tenantId, phoneNumber);
    return;
  }

  if (trimmed === 'cancelar' || trimmed === 'não' || trimmed === 'nao') {
    await sendTextMessage({
      number: phoneNumber,
      text: '❌ Pedido cancelado. Envie uma mensagem a qualquer momento para fazer um novo pedido!',
      instanceName,
    });
    await deleteSession(tenantId, phoneNumber);
    return;
  }

  // User wants to go back and add more items
  if (trimmed === 'mais' || trimmed === 'adicionar' || trimmed === 'voltar') {
    await sendTextMessage({
      number: phoneNumber,
      text: '🛒 Ok! Continue adicionando itens. Envie o número do item.\nDigite *PRONTO* quando quiser finalizar.',
      instanceName,
    });
    await updateSession(tenantId, phoneNumber, 'selecionando', cart);
    return;
  }

  // Check if it's a number (maybe adding an item)
  const selections = parseItemSelection(messageText);
  if (selections.length > 0) {
    // Move back to selecionando and add item
    await updateSession(tenantId, phoneNumber, 'selecionando', cart);
    await handleSelecionando(tenantId, phoneNumber, messageText, cart, instanceName);
    return;
  }

  // Unexpected message
  await sendTextMessage({
    number: phoneNumber,
    text: '🤔 Não entendi. Opções disponíveis:\n\n✅ *CONFIRMAR* - Finalizar o pedido\n❌ *CANCELAR* - Cancelar o pedido\n➕ *MAIS* - Adicionar mais itens',
    instanceName,
  });
}

// --- Helpers ---

function formatPhoneForDisplay(phone: string): string {
  // Remove @s.whatsapp.net suffix and format
  const number = phone.replace('@s.whatsapp.net', '');
  if (number.length === 13 && number.startsWith('55')) {
    const ddd = number.slice(2, 4);
    const part1 = number.slice(4, 9);
    const part2 = number.slice(9);
    return `(${ddd}) ${part1}-${part2}`;
  }
  return number;
}
