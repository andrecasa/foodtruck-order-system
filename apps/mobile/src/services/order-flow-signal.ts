/**
 * Estado em memória para coordenar o fluxo "Novo Pedido" do operador entre telas.
 *
 * O fluxo atravessa telas empilhadas no Stack raiz, acima das abas (ver
 * `apps/mobile/app/_layout.tsx`): `CreateOrderScreen` (aba "Novo") →
 * `/confirm-order` → `/payment`. A aba "Novo" permanece montada por baixo, mas
 * `/confirm-order` é DESMONTADA ao voltar (`router.back()`) e remontada a cada
 * novo "Revisar Pedido" — por isso seu estado local (nome do cliente) se perde
 * entre idas e voltas. Não há store compartilhado para o rascunho do operador;
 * este módulo é o mínimo para manter a coerência do rascunho até o pedido ser
 * criado.
 *
 * Duas responsabilidades:
 * 1. Sinal de "pedido criado" (`markOrderCreated`/`consumeOrderCreated`): o
 *    carrinho da aba "Novo" só é zerado quando o pedido é EFETIVAMENTE criado —
 *    voltar da confirmação sem confirmar preserva os itens.
 * 2. Rascunho do nome do cliente (`setDraftCustomerName`/`getDraftCustomerName`):
 *    preenchido na confirmação, mantido entre Revisar → voltar → Revisar, e
 *    limpo quando o pedido é criado ou o rascunho é descartado.
 */

let orderCreated = false;
let draftCustomerName = '';

/** Marca que um pedido foi criado com sucesso (chamar após `createOrder`). */
export function markOrderCreated(): void {
  orderCreated = true;
}

/**
 * Consome o sinal: retorna `true` se um pedido foi criado desde a última leitura
 * e reseta a flag. Usado pela `CreateOrderScreen` para decidir se limpa o carrinho.
 */
export function consumeOrderCreated(): boolean {
  const created = orderCreated;
  orderCreated = false;
  return created;
}

/** Guarda o nome do cliente em rascunho enquanto o pedido não é criado. */
export function setDraftCustomerName(name: string): void {
  draftCustomerName = name;
}

/** Lê o nome do cliente em rascunho (vazio se não houver). */
export function getDraftCustomerName(): string {
  return draftCustomerName;
}

/** Limpa o rascunho do nome do cliente. */
export function clearDraftCustomerName(): void {
  draftCustomerName = '';
}

/** Limpa todo o estado de fluxo (sinal + rascunho). Útil em testes/desmontagem. */
export function resetOrderFlowState(): void {
  orderCreated = false;
  draftCustomerName = '';
}
