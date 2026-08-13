/**
 * WhatsApp Bot Service - State machine, session management, and business logic.
 */

import { pool } from '../config/database.js';
import { supabaseAdmin } from '../config/supabase.js';
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

// --- Menu Fetching ---

export async function fetchActiveMenuItems(): Promise<MenuItemRow[]> {
  const result = await pool.query<MenuItemRow>(
    `SELECT mi.id, mi.name, mi.price_cents, c.name AS category_name, c.sort_order AS category_sort_order
     FROM menu_items mi
     JOIN categories c ON mi.category_id = c.id
     WHERE mi.status = 'ativo'
     ORDER BY c.sort_order, mi.name`
  );
  return result.rows;
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

export async function getSession(phoneNumber: string): Promise<WhatsAppSession | null> {
  const result = await pool.query(
    'SELECT phone_number, state, cart, started_at, last_activity_at FROM whatsapp_sessions WHERE phone_number = $1',
    [phoneNumber]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    phoneNumber: row.phone_number,
    state: row.state as SessionState,
    cart: row.cart as CartItem[],
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
  };
}

export async function createSession(phoneNumber: string): Promise<WhatsAppSession> {
  const result = await pool.query(
    `INSERT INTO whatsapp_sessions (phone_number, state, cart, started_at, last_activity_at)
     VALUES ($1, 'saudacao', '[]'::jsonb, NOW(), NOW())
     ON CONFLICT (phone_number) DO UPDATE SET state = 'saudacao', cart = '[]'::jsonb, started_at = NOW(), last_activity_at = NOW()
     RETURNING phone_number, state, cart, started_at, last_activity_at`,
    [phoneNumber]
  );

  const row = result.rows[0];
  return {
    phoneNumber: row.phone_number,
    state: row.state as SessionState,
    cart: row.cart as CartItem[],
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
  };
}

export async function updateSession(phoneNumber: string, state: SessionState, cart: CartItem[]): Promise<void> {
  await pool.query(
    'UPDATE whatsapp_sessions SET state = $1, cart = $2, last_activity_at = NOW() WHERE phone_number = $3',
    [state, JSON.stringify(cart), phoneNumber]
  );
}

export async function deleteSession(phoneNumber: string): Promise<void> {
  await pool.query('DELETE FROM whatsapp_sessions WHERE phone_number = $1', [phoneNumber]);
}

export async function isSessionTimedOut(session: WhatsAppSession): Promise<boolean> {
  const lastActivity = new Date(session.lastActivityAt).getTime();
  const now = Date.now();
  return (now - lastActivity) >= WHATSAPP_SESSION_TIMEOUT_MS;
}

export async function cleanupTimedOutSessions(): Promise<void> {
  const result = await pool.query(
    `SELECT phone_number FROM whatsapp_sessions
     WHERE last_activity_at < NOW() - INTERVAL '10 minutes'`
  );

  for (const row of result.rows) {
    await sendTextMessage({
      number: row.phone_number,
      text: '⏰ Sua sessão expirou por inatividade. Envie uma nova mensagem para fazer um pedido.',
    });
    await deleteSession(row.phone_number);
  }
}

// --- Menu Items Indexed by Number ---

export async function getNumberedMenuItems(): Promise<Map<number, MenuItemRow>> {
  const items = await fetchActiveMenuItems();
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

async function createWhatsAppOrder(phoneNumber: string, customerName: string, cart: CartItem[]): Promise<{ dailyNumber: number; totalAmountCents: number } | null> {
  const totalAmountCents = calculateCartTotal(cart);

  const now = new Date();
  const zonedDate = toZonedTime(now, SAO_PAULO_TZ);
  const orderDate = format(zonedDate, 'yyyy-MM-dd', { timeZone: SAO_PAULO_TZ });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const seqResult = await client.query(
      'SELECT next_daily_number($1::date) AS daily_number',
      [orderDate]
    );
    const dailyNumber = seqResult.rows[0].daily_number;

    const orderResult = await client.query(
      `INSERT INTO orders (daily_number, customer_name, origin, status, payment_status, total_amount_cents, order_date, created_at)
       VALUES ($1, $2, 'whatsapp', 'aguardando', 'pendente', $3, $4, $5)
       RETURNING id, daily_number, customer_name, origin, status, payment_status, total_amount_cents, order_date, created_at`,
      [dailyNumber, customerName, totalAmountCents, orderDate, now.toISOString()]
    );
    const order = orderResult.rows[0];

    for (const item of cart) {
      await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price_cents, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.menuItemId, item.name, item.unitPriceCents, item.quantity]
      );
    }

    await client.query('COMMIT');

    // Publish realtime event (fire and forget)
    try {
      const channel = supabaseAdmin.channel('orders:queue');
      await channel.send({
        type: 'broadcast',
        event: 'new_order',
        payload: {
          id: order.id,
          dailyNumber: order.daily_number,
          customerName: order.customer_name,
          origin: order.origin,
          status: order.status,
          paymentStatus: order.payment_status,
          totalAmountCents: order.total_amount_cents,
          orderDate: order.order_date,
          createdAt: order.created_at,
        },
      });
    } catch {
      console.error('[whatsapp-bot] Failed to publish realtime event');
    }

    return { dailyNumber, totalAmountCents };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[whatsapp-bot] Error creating order:', error);
    return null;
  } finally {
    client.release();
  }
}

// --- State Machine Handler ---

export async function handleIncomingMessage(phoneNumber: string, pushName: string | undefined, messageText: string): Promise<void> {
  // Check for existing session
  let session = await getSession(phoneNumber);

  // Check timeout
  if (session && await isSessionTimedOut(session)) {
    await sendTextMessage({
      number: phoneNumber,
      text: '⏰ Sua sessão anterior expirou por inatividade. Vamos começar de novo!',
    });
    await deleteSession(phoneNumber);
    session = null;
  }

  // No session: create new one and start saudacao flow
  if (!session) {
    session = await createSession(phoneNumber);
    await handleSaudacao(phoneNumber, pushName);
    return;
  }

  // Update last activity
  await updateSession(session.phoneNumber, session.state, session.cart);

  // Route to current state handler
  switch (session.state) {
    case 'saudacao':
      // After greeting, any message moves to selecionando
      await handleSelecionando(phoneNumber, messageText, []);
      break;
    case 'selecionando':
      await handleSelecionando(phoneNumber, messageText, session.cart);
      break;
    case 'resumo':
      await handleResumo(phoneNumber, pushName, messageText, session.cart);
      break;
  }
}

// --- State: saudacao ---

async function handleSaudacao(phoneNumber: string, pushName: string | undefined): Promise<void> {
  const items = await fetchActiveMenuItems();

  // Empty menu case
  if (items.length === 0) {
    await sendTextMessage({
      number: phoneNumber,
      text: '😔 Desculpe, nosso cardápio está temporariamente sem itens disponíveis. Tente novamente mais tarde!',
    });
    await deleteSession(phoneNumber);
    return;
  }

  const customerGreeting = pushName ? `Olá, ${pushName}! 👋` : 'Olá! 👋';
  const menuText = formatMenu(items);

  const greeting = `${customerGreeting}\n\nBem-vindo(a) ao nosso Food Truck! 🚚\n\nAqui está nosso cardápio:\n\n${menuText}\n\n📝 Para fazer seu pedido, envie o *número do item* e a *quantidade*.\nExemplo: "1" para 1 unidade ou "1 2" para 2 unidades do item 1.\n\nVocê pode adicionar vários itens antes de confirmar!`;

  await sendTextMessage({ number: phoneNumber, text: greeting });
  await updateSession(phoneNumber, 'selecionando', []);
}

// --- State: selecionando ---

async function handleSelecionando(phoneNumber: string, messageText: string, currentCart: CartItem[]): Promise<void> {
  const trimmed = messageText.trim().toLowerCase();

  // Check if user wants to see summary/finalize
  if (trimmed === 'pronto' || trimmed === 'finalizar' || trimmed === 'fechar') {
    if (currentCart.length === 0) {
      await sendTextMessage({
        number: phoneNumber,
        text: '🛒 Seu carrinho está vazio! Envie o número de um item do cardápio para adicioná-lo.',
      });
      return;
    }
    const summary = formatCartSummary(currentCart);
    await sendTextMessage({ number: phoneNumber, text: summary });
    await updateSession(phoneNumber, 'resumo', currentCart);
    return;
  }

  // Check if user wants to cancel
  if (trimmed === 'cancelar') {
    await sendTextMessage({
      number: phoneNumber,
      text: '❌ Pedido cancelado. Envie uma mensagem a qualquer momento para fazer um novo pedido!',
    });
    await deleteSession(phoneNumber);
    return;
  }

  // Parse item selections
  const selections = parseItemSelection(messageText);

  if (selections.length === 0) {
    // Unexpected message
    await sendTextMessage({
      number: phoneNumber,
      text: '🤔 Não entendi. Por favor, envie o *número do item* para adicioná-lo ao carrinho.\nExemplo: "1" para 1 unidade ou "1 2" para 2 unidades.\n\nDigite *PRONTO* quando quiser finalizar o pedido.\nDigite *CANCELAR* para cancelar.',
    });
    return;
  }

  // Fetch numbered menu items
  const numberedItems = await getNumberedMenuItems();
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

  await sendTextMessage({ number: phoneNumber, text: response });
  await updateSession(phoneNumber, 'selecionando', cart);
}

// --- State: resumo ---

async function handleResumo(phoneNumber: string, pushName: string | undefined, messageText: string, cart: CartItem[]): Promise<void> {
  const trimmed = messageText.trim().toLowerCase();

  if (trimmed === 'confirmar' || trimmed === 'sim' || trimmed === 'ok') {
    // Create order
    const customerName = pushName || formatPhoneForDisplay(phoneNumber);
    const result = await createWhatsAppOrder(phoneNumber, customerName, cart);

    if (result) {
      await sendTextMessage({
        number: phoneNumber,
        text: `🎉 Pedido confirmado!\n\n📋 Número do pedido: *#${result.dailyNumber}*\n💰 Total: *${formatPriceBRL(result.totalAmountCents)}*\n\nAguarde a preparação. Obrigado pela preferência! 🚚`,
      });
    } else {
      await sendTextMessage({
        number: phoneNumber,
        text: '❌ Ocorreu um erro ao criar seu pedido. Por favor, tente novamente.',
      });
    }

    await deleteSession(phoneNumber);
    return;
  }

  if (trimmed === 'cancelar' || trimmed === 'não' || trimmed === 'nao') {
    await sendTextMessage({
      number: phoneNumber,
      text: '❌ Pedido cancelado. Envie uma mensagem a qualquer momento para fazer um novo pedido!',
    });
    await deleteSession(phoneNumber);
    return;
  }

  // User wants to go back and add more items
  if (trimmed === 'mais' || trimmed === 'adicionar' || trimmed === 'voltar') {
    await sendTextMessage({
      number: phoneNumber,
      text: '🛒 Ok! Continue adicionando itens. Envie o número do item.\nDigite *PRONTO* quando quiser finalizar.',
    });
    await updateSession(phoneNumber, 'selecionando', cart);
    return;
  }

  // Check if it's a number (maybe adding an item)
  const selections = parseItemSelection(messageText);
  if (selections.length > 0) {
    // Move back to selecionando and add item
    await updateSession(phoneNumber, 'selecionando', cart);
    await handleSelecionando(phoneNumber, messageText, cart);
    return;
  }

  // Unexpected message
  await sendTextMessage({
    number: phoneNumber,
    text: '🤔 Não entendi. Opções disponíveis:\n\n✅ *CONFIRMAR* - Finalizar o pedido\n❌ *CANCELAR* - Cancelar o pedido\n➕ *MAIS* - Adicionar mais itens',
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
