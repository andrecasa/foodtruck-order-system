/**
 * signup.controller — traduz HTTP ↔ serviço para o onboarding self-service
 * (landing-onboarding). São três handlers públicos platform-level, montados sem
 * auth e sem `tenantMiddleware` pelas rotas (task 9.4):
 *
 *  - `signupController` (POST /api/signup): mescla os campos de texto do
 *    multipart (`req.body`) com os metadados da logo (`req.file`), valida com
 *    `parseBody(signupSchema, ...)` (lança `ServiceError` 422 `VALIDATION_ERROR`,
 *    R9.2/R9.3), chama `signupService.signup` e responde 201 (novo) / 200
 *    (reenvio idempotente) com `{ tenantId, slug, trialEndsAt }` (R9.6/R10.5).
 *    Antes de tudo, aplica uma guarda defensiva de método/Content-Type (R9.7).
 *  - `listColorPresetsController` (GET /api/signup/color-presets): devolve a
 *    lista de Color_Presets do backend (R6.1) em `{ presets }`.
 *  - `slugAvailabilityController` (GET /api/signup/slug-availability): lê
 *    `req.query.slug` e devolve `{ slug, valid, available }` (R5.1/R5.2/R5.3).
 *
 * Os controllers apenas traduzem HTTP↔serviço: NÃO fazem try/catch que engula
 * erros. Recusas de negócio chegam como `ServiceError` e erros inesperados
 * sobem, ambos mapeados centralmente pelo `errorHandler`
 * (`src/http/error-handler.ts`) para o Error_Envelope `{ statusCode, error,
 * message }` (R9.8). As rotas envolvem cada handler em `asyncHandler`.
 *
 * Imports ESM com sufixo `.js`. Mensagens em pt-BR.
 *
 * Design: `.kiro/specs/landing-onboarding/design.md` (Components —
 *   `signup.controller.ts`; API Contracts; Error Handling).
 * _Requirements: 5.1, 5.2, 5.3, 6.1, 9.2, 9.3, 9.6, 9.7, 10.5_
 */

import { type Request, type Response } from 'express';
import { signupSchema } from '../validation/signup.validation.js';
import { parseBody } from '../http/parse-body.js';
import { listColorPresets } from '../services/color-presets.js';
import * as signupService from '../services/signup.service.js';
import { ServiceError } from '../services/service-error.js';

/**
 * Request do POST de signup. O parser multipart (`memoryStorage`, ver
 * `signup.routes.ts`) popula `req.file` com o arquivo de logo em memória
 * (`Express.Multer.File`), do qual usamos apenas `buffer`, `mimetype` e `size`.
 * O tipo `file?: Express.Multer.File` vem da augmentação global de
 * `@types/multer`, então basta reusar o próprio `Request`.
 */
type SignupRequest = Request;

/**
 * POST /api/signup (R9)
 *
 * Fluxo:
 *  1. Guarda defensiva de método/Content-Type (R9.7): embora a rota já restrinja
 *     ao método POST e o parser multipart trate o corpo, rejeitamos aqui, sem
 *     efeito colateral, qualquer requisição cujo `Content-Type` não seja
 *     `multipart/form-data` — com o Error_Envelope (via `ServiceError`) e
 *     mensagem em pt-BR.
 *  2. Mescla os campos de texto (`req.body`) com os metadados da logo
 *     (`req.file`: `{ mimetype, size }`) e valida com `parseBody(signupSchema)`
 *     ANTES de qualquer efeito colateral (R9.2). Falha ⇒ 422 `VALIDATION_ERROR`.
 *  3. Chama `signupService.signup`, repassando os bytes da logo quando presentes
 *     (`{ body, contentType }`).
 *  4. Responde 201 para cadastro novo (`idempotentHit=false`, R9.6) ou 200 para
 *     reenvio idempotente (`idempotentHit=true`, R10.5), com
 *     `{ tenantId, slug, trialEndsAt }`.
 *
 * Não há try/catch: recusas de negócio (`ServiceError`) e erros inesperados
 * sobem ao `errorHandler` central (R9.8).
 */
export async function signupController(req: SignupRequest, res: Response): Promise<void> {
  // 1. Guarda de Content-Type (R9.7). A restrição de método fica nas rotas; aqui
  //    garantimos que o corpo veio como multipart antes de qualquer efeito.
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    throw new ServiceError(
      'O cadastro deve ser enviado como multipart/form-data.',
      422,
      'VALIDATION_ERROR',
    );
  }

  // 2. Mescla texto + metadados da logo e valida (R9.2/R9.3). O `signupSchema`
  //    espera a logo como `{ mimetype, size }` (opcional); anexamos apenas
  //    quando há arquivo, preservando o cadastro sem logo (R7.2).
  const { file } = req;
  const forValidation = {
    ...req.body,
    ...(file ? { logo: { mimetype: file.mimetype, size: file.size } } : {}),
  };
  const data = parseBody(signupSchema, forValidation);

  // 3. Monta a entrada do serviço; a logo vira bytes + tipo para o upload S3.
  const result = await signupService.signup({
    businessName: data.businessName,
    contactName: data.contactName,
    contactPhone: data.contactPhone,
    adminName: data.adminName,
    adminEmail: data.adminEmail,
    password: data.password,
    slug: data.slug,
    colorPresetId: data.colorPresetId,
    logo: file ? { body: file.buffer, contentType: file.mimetype } : null,
  });

  // 4. 201 novo (R9.6) / 200 idempotente (R10.5), com o corpo do contrato.
  res.status(result.idempotentHit ? 200 : 201).json({
    tenantId: result.tenantId,
    slug: result.slug,
    trialEndsAt: result.trialEndsAt,
  });
}

/**
 * GET /api/signup/color-presets (R6.1)
 *
 * Devolve a lista completa dos Color_Presets do backend (fonte da verdade), no
 * corpo `{ presets }`. Eventual falha de carregamento vem como `ServiceError`
 * 500 do loader e sobe ao `errorHandler`.
 */
export async function listColorPresetsController(_req: Request, res: Response): Promise<void> {
  const presets = listColorPresets();
  res.status(200).json({ presets });
}

/** Mensagem pt-BR quando a query string `slug` está ausente ou vazia. */
const MISSING_SLUG_MESSAGE = 'Informe o slug a ser verificado.';

/**
 * GET /api/signup/slug-availability?slug={slug} (R5)
 *
 * Leitura idempotente: valida o formato (R4.3) e a disponibilidade (não
 * reservado R5.3, não usado por outro tenant R5.2), delegando a regra de negócio
 * ao `signupService.checkSlugAvailability`. Responde 200
 * `{ slug, valid, available }`. Ausência do parâmetro ⇒ 422 `VALIDATION_ERROR`.
 */
export async function slugAvailabilityController(req: Request, res: Response): Promise<void> {
  const raw = req.query.slug;
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new ServiceError(MISSING_SLUG_MESSAGE, 422, 'VALIDATION_ERROR');
  }

  const availability = await signupService.checkSlugAvailability(raw);
  res.status(200).json(availability);
}
