export const ORDER_STATUSES = [
    'aguardando',
    'preparando',
    'pronto',
    'entregue',
];
export const PAYMENT_STATUSES = [
    'pendente',
    'pago',
];
export const ORDER_ORIGINS = [
    'presencial',
    'whatsapp',
];
export const PAYMENT_METHODS = [
    'dinheiro',
    'pix',
    'cartão',
];
export const VALID_TRANSITIONS = {
    aguardando: 'preparando',
    preparando: 'pronto',
    pronto: 'entregue',
};
export function isValidTransition(from, to) {
    return VALID_TRANSITIONS[from] === to;
}
//# sourceMappingURL=status.js.map