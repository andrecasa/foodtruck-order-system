import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { uploadLogo, type S3ClientLike, type UploadLogoDeps } from '../../services/s3-logo-upload.js';
import { signupSchema, ALLOWED_LOGO_MIME_TYPES } from '../../validation/signup.validation.js';

/**
 * Testes de propriedade para a derivação da extensão e da `Logo_Object_Key` a
 * partir do tipo do arquivo (fluxo de onboarding self-service, PLATFORM-LEVEL).
 *
 * Feature: landing-onboarding, Property 8: Extensão e chave da logo derivam do
 * tipo do arquivo
 *   Para qualquer Logo_Upload de tipo permitido (PNG/JPG/JPEG/SVG/WEBP), a
 *   `Logo_Object_Key` gerada deve ser `tenant-assets/{slug}/logo.{ext}` com
 *   `{ext}` correspondente ao tipo do arquivo; e logos de tipo não permitido
 *   devem ser rejeitadas com mensagem pt-BR listando os tipos aceitos.
 *
 * Validates: Requirements 7.3, 7.5, 8.2
 *
 * A derivação de chave/extensão é verificada no nível do `uploadLogo`, com um
 * cliente S3 injetado (`send` mockado) e env de assets definidas no teste — sem
 * qualquer I/O real. A rejeição de tipo não permitido é verificada via
 * `signupSchema` (validação Zod), que barra a logo antes de qualquer efeito
 * colateral, com a mensagem pt-BR listando os tipos aceitos (R7.3).
 */

/** Mapa tipo MIME → extensão esperada na `Logo_Object_Key` (R7.5, R8.2). */
const CONTENT_TYPE_TO_EXTENSION: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

/** Mensagem pt-BR esperada para tipo de logo não permitido (R7.3). */
const LOGO_TYPE_MESSAGE = 'Tipo de logomarca inválido. Tipos aceitos: PNG, JPG, JPEG, SVG, WEBP';

/**
 * Gera um `contentType` permitido junto com a `{ext}` esperada, para que a
 * propriedade afirme a extensão derivada sem reimplementar a lógica.
 */
const allowedLogoTypeArb: fc.Arbitrary<{ contentType: string; ext: string }> = fc
  .constantFrom(...Object.keys(CONTENT_TYPE_TO_EXTENSION))
  .map((contentType) => {
    const ext = CONTENT_TYPE_TO_EXTENSION[contentType];
    if (ext === undefined) {
      throw new Error(`Tipo sem extensão mapeada: ${contentType}`);
    }
    return { contentType, ext };
  });

/**
 * Slug plausível de tenant: segmentos alfanuméricos separados por hífen, sem
 * barras, compondo um único segmento de caminho da `Logo_Object_Key`.
 */
const slugArb: fc.Arbitrary<string> = fc
  .array(
    fc.stringMatching(/^[a-z0-9]+$/).filter((s) => s.length >= 1 && s.length <= 12),
    { minLength: 1, maxLength: 4 },
  )
  .map((parts) => parts.join('-'));

/**
 * Gera um MIME type NÃO permitido para a logo: qualquer string que não seja uma
 * das chaves de `ALLOWED_LOGO_MIME_TYPES` (comparação case-sensitive, como a
 * validação Zod faz via `value in ALLOWED_LOGO_MIME_TYPES`).
 */
const disallowedMimeArb: fc.Arbitrary<string> = fc
  .oneof(
    fc.constantFrom(
      'image/gif',
      'image/bmp',
      'image/tiff',
      'image/avif',
      'application/pdf',
      'text/plain',
      'image/PNG',
      'image/JPEG',
      '',
    ),
    fc.string(),
  )
  .filter((value) => !(value in ALLOWED_LOGO_MIME_TYPES));

/** Corpo de cadastro válido base; a logo é sobrescrita por cada caso de teste. */
function validSignupBody(logo: { mimetype: string; size: number }): Record<string, unknown> {
  return {
    businessName: 'Empresa Teste',
    contactName: 'Fulano de Tal',
    contactPhone: '+5511999998888',
    adminName: 'Admin Teste',
    adminEmail: 'admin@exemplo.com',
    password: 'senhaSegura123',
    slug: 'empresa-teste',
    colorPresetId: 'classico',
    logo,
  };
}

describe('Feature: landing-onboarding, Property 8: Extensão e chave da logo derivam do tipo do arquivo', () => {
  const originalEnv = {
    ASSETS_S3_BUCKET: process.env.ASSETS_S3_BUCKET,
    ASSETS_PUBLIC_BASE_URL: process.env.ASSETS_PUBLIC_BASE_URL,
    AWS_REGION: process.env.AWS_REGION,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ASSETS_S3_BUCKET = 'assets-bucket-test';
    process.env.ASSETS_PUBLIC_BASE_URL = 'https://assets.exemplo.com';
    process.env.AWS_REGION = 'us-east-1';
  });

  afterEach(() => {
    // Restaura o ambiente original para não vazar estado entre arquivos de teste.
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('gera objectKey = tenant-assets/{slug}/logo.{ext} com {ext} derivada do tipo permitido, sem I/O real', async () => {
    await fc.assert(
      fc.asyncProperty(slugArb, allowedLogoTypeArb, async (slug, logo) => {
        // Cliente S3 mockado: apenas registra a chamada, sem contatar a AWS.
        const send = vi.fn().mockResolvedValue({});
        const deps: Partial<UploadLogoDeps> = {
          createS3Client: (): S3ClientLike => ({ send }),
        };

        const result = await uploadLogo(
          { slug, body: Buffer.from([0x01, 0x02, 0x03]), contentType: logo.contentType },
          deps,
        );

        // A chave deriva exatamente do slug e da extensão correspondente ao tipo.
        expect(result.objectKey).toBe(`tenant-assets/${slug}/logo.${logo.ext}`);

        // O upload foi tentado exatamente uma vez, com a chave e o ContentType corretos.
        expect(send).toHaveBeenCalledTimes(1);
        const command = send.mock.calls[0]?.[0] as { input?: { Key?: string; ContentType?: string } };
        expect(command?.input?.Key).toBe(`tenant-assets/${slug}/logo.${logo.ext}`);
        expect(command?.input?.ContentType).toBe(logo.contentType);
      }),
      { numRuns: 200 },
    );
  });

  it('rejeita logo de tipo não permitido com mensagem pt-BR listando os tipos aceitos', () => {
    fc.assert(
      fc.property(disallowedMimeArb, fc.integer({ min: 0, max: 1024 }), (mimetype, size) => {
        const result = signupSchema.safeParse(validSignupBody({ mimetype, size }));

        // Tipo não permitido ⇒ validação falha antes de qualquer efeito colateral.
        expect(result.success).toBe(false);
        if (result.success) {
          return;
        }

        // A mensagem pt-BR do erro do campo `logo.mimetype` lista os tipos aceitos.
        const logoTypeIssue = result.error.issues.find(
          (issue) => issue.path.join('.') === 'logo.mimetype',
        );
        expect(logoTypeIssue?.message).toBe(LOGO_TYPE_MESSAGE);
      }),
      { numRuns: 200 },
    );
  });
});
