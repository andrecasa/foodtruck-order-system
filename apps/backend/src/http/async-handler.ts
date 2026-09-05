import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Envolve um handler assíncrono para que rejeições de promise sejam
 * encaminhadas ao error-handling middleware do Express.
 *
 * No Express 4, um `throw` (ou promise rejeitada) dentro de um handler `async`
 * NÃO é capturado automaticamente pelo middleware de erro — a rejeição vira um
 * `unhandledRejection` e a request fica pendurada. Este wrapper resolve isso
 * chamando `.catch(next)`, o padrão idiomático para async no Express 4.
 *
 * Uso nas rotas:
 *   router.get('/', asyncHandler(listCategories));
 *
 * Assim os controllers podem apenas `throw new ServiceError(...)` (ou deixar um
 * erro inesperado subir) e o mapeamento HTTP fica concentrado no
 * `errorHandler`.
 */
export function asyncHandler<Req extends Request = Request>(
  handler: (req: Req, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req as Req, res, next)).catch(next);
  };
}
