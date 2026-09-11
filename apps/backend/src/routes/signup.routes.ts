import { Router, type NextFunction, type Request, type Response } from 'express';
import multer, { MulterError } from 'multer';
import { signupRateLimiter } from '../middleware/signup-rate-limit.middleware.js';
import { asyncHandler } from '../http/async-handler.js';
import {
  signupController,
  listColorPresetsController,
  slugAvailabilityController,
} from '../controllers/signup.controller.js';
import { MAX_LOGO_BYTES } from '../validation/signup.validation.js';
import { ServiceError } from '../services/service-error.js';

/**
 * Router público platform-level do onboarding self-service (landing-onboarding),
 * montado em `index.ts` como `app.use('/api/signup', signupRoutes)` — **sem**
 * `authMiddleware` e **sem** `tenantMiddleware` (R9.1). Expõe três rotas:
 *
 *   - `POST /api/signup` — cadastro multipart. Encadeia, nesta ordem:
 *       1. `signupRateLimiter` (por IP, antes de qualquer efeito, R9.4/R9.5);
 *       2. o parser multipart em memória (1 arquivo `logo`, ≤ `MAX_LOGO_BYTES`,
 *          R7); e
 *       3. `asyncHandler(signupController)`.
 *   - `GET /api/signup/color-presets` — lista de Color_Presets (R6.1).
 *   - `GET /api/signup/slug-availability` — formato + disponibilidade do slug (R5).
 *
 * Cada handler é envolvido em `asyncHandler` para que rejeições async cheguem ao
 * `errorHandler` central. O rate limiter e o parser multipart ficam **apenas**
 * no POST (as leituras GET não têm corpo nem criam recursos).
 *
 * Design: `.kiro/specs/landing-onboarding/design.md` (Architecture — camadas
 *   backend; Components — `signup.routes.ts`).
 * _Requirements: 9.1, 9.4, 6.1, 5.1_
 */

const router = Router();

/**
 * Parser multipart em memória para o POST de signup (R7): armazena o arquivo em
 * `req.file.buffer` (sem tocar o disco), aceita **um único** campo `logo` e
 * limita o tamanho a `MAX_LOGO_BYTES` como defesa em profundidade — o mesmo
 * limite é reafirmado pelo `signupSchema` (Zod). `memoryStorage` é adequado
 * porque a logo é pequena (≤ 2 MB) e segue direto para o upload S3.
 */
const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: MAX_LOGO_BYTES },
}).single('logo');

/** Mensagem pt-BR sobre o tamanho máximo da logo (alinhada ao `signupSchema`). */
const LOGO_SIZE_MESSAGE = 'A logomarca deve ter no máximo 2 MB';

/** Mensagem pt-BR genérica para envio de logo inválido (ex.: campo/arquivo extra). */
const LOGO_UPLOAD_MESSAGE = 'Envio da logomarca inválido.';

/**
 * Envolve o parser multipart traduzindo `MulterError` para `ServiceError` 422
 * `VALIDATION_ERROR`, para que a resposta use o Error_Envelope padrão em pt-BR
 * em vez de virar um 500 genérico no `errorHandler`. O limite de tamanho também
 * é validado pelo Zod, então isto é defesa em profundidade (R7.4).
 */
function parseLogoUpload(req: Request, res: Response, next: NextFunction): void {
  uploadLogo(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE' ? LOGO_SIZE_MESSAGE : LOGO_UPLOAD_MESSAGE;
      next(new ServiceError(message, 422, 'VALIDATION_ERROR'));
      return;
    }
    next(err);
  });
}

// POST /api/signup — rate limit (R9.4/R9.5) → parser multipart (R7) → controller.
router.post('/', signupRateLimiter, parseLogoUpload, asyncHandler(signupController));

// GET /api/signup/color-presets — lista os Color_Presets do backend (R6.1).
router.get('/color-presets', asyncHandler(listColorPresetsController));

// GET /api/signup/slug-availability?slug= — formato + disponibilidade (R5).
router.get('/slug-availability', asyncHandler(slugAvailabilityController));

export default router;
