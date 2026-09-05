import type { Request } from 'express';

/**
 * Resolve o IP do cliente a partir da request.
 *
 * Prioriza o primeiro endereço de `x-forwarded-for` (o cliente original quando
 * há proxy/load balancer à frente) e faz fallback para `req.ip` /
 * `socket.remoteAddress`. Retorna `'unknown'` quando nada é resolvível.
 *
 * Fonte única: alimenta o rate limiting (controle de segurança), portanto a
 * lógica de resolução precisa ser idêntica em todos os pontos que a usam —
 * antes estava duplicada em auth.controller e nos dois middlewares de rate
 * limit.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}
