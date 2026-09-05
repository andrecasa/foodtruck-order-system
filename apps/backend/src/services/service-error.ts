/**
 * Erro de domínio compartilhado por todos os serviços do backend.
 *
 * Antes, cada serviço declarava sua própria classe `ServiceError` idêntica, o
 * que fazia com que erros lançados por um serviço NÃO passassem no
 * `instanceof ServiceError` de outro (cada classe era distinta). Centralizar a
 * definição aqui garante uma única identidade de classe em todo o backend.
 *
 * O contrato permanece o mesmo: `message` (pt-BR), `statusCode` (HTTP) e `code`
 * (identificador estável do erro). Os controllers mapeiam para
 * `{ statusCode, error: code, message }`.
 */
export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}
