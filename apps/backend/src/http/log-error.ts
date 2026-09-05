import type { Request } from 'express';

/**
 * Loga um erro inesperado num formato único e consistente em todo o backend.
 *
 * Antes, cada controller usava `console.error` com um prefixo próprio e sem o
 * contexto da request. Este helper centraliza o formato: prefixo semântico +
 * método/rota (quando a request é fornecida) + o erro. Fica um só ponto para
 * evoluir a observabilidade (ex.: trocar por um logger estruturado, adicionar
 * um traceId) sem tocar em cada chamador.
 *
 * `context` é uma etiqueta curta que identifica a origem (ex.: 'public:menu',
 * 'error-handler'). Deve descrever ONDE o erro ocorreu, não o quê.
 */
export function logError(context: string, err: unknown, req?: Request): void {
  const where = req ? ` ${req.method} ${req.originalUrl}` : '';
  console.error(`[${context}]${where}`, err);
}
