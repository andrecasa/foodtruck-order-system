import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { uploadLogo, type S3ClientLike, type UploadLogoDeps } from '../../services/s3-logo-upload.js';

/**
 * Testes de propriedade para a derivação da `Logo_Public_Url` em
 * `services/s3-logo-upload.ts` (fluxo de onboarding self-service, PLATFORM-LEVEL).
 *
 * Feature: landing-onboarding, Property 10: Derivação da URL pública da logo
 *   Para qualquer `ASSETS_PUBLIC_BASE_URL`, `slug` e tipo de logo permitido
 *   (PNG/JPG/JPEG/SVG/WEBP), a `Logo_Public_Url` derivada deve ser exatamente
 *   `{ASSETS_PUBLIC_BASE_URL}/tenant-assets/{slug}/logo.{ext}` — normalizando
 *   barras finais da base pública para não gerar barra dupla — e a
 *   `Logo_Object_Key` (`objectKey`) deve ser `tenant-assets/{slug}/logo.{ext}`,
 *   com `{ext}` correspondente ao tipo do arquivo.
 *
 * Validates: Requirements 8.3
 *
 * O cliente S3 é injetado via `deps.createS3Client` com um `send` mockado
 * (spy), de modo que a propriedade é verificada SEM qualquer I/O real. As
 * variáveis de ambiente `ASSETS_S3_BUCKET`/`ASSETS_PUBLIC_BASE_URL`/`AWS_REGION`
 * são definidas dentro do teste e restauradas ao final.
 */

/** Mapa tipo MIME → extensão esperada na `Logo_Object_Key` (R7.5, R8.2). */
const CONTENT_TYPE_TO_EXTENSION: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

/**
 * Gera um `contentType` permitido junto com a `{ext}` esperada, para que a
 * propriedade possa afirmar a extensão derivada sem reimplementar a lógica.
 */
const logoTypeArb: fc.Arbitrary<{ contentType: string; ext: string }> = fc
  .constantFrom(...Object.keys(CONTENT_TYPE_TO_EXTENSION))
  .map((contentType) => {
    const ext = CONTENT_TYPE_TO_EXTENSION[contentType];
    if (ext === undefined) {
      throw new Error(`Tipo sem extensão mapeada: ${contentType}`);
    }
    return { contentType, ext };
  });

/**
 * Slug plausível de tenant: segmentos alfanuméricos separados por hífen,
 * sem barras, para compor um único segmento de caminho da `Logo_Object_Key`.
 */
const slugArb: fc.Arbitrary<string> = fc
  .array(
    fc.stringMatching(/^[a-z0-9]+$/).filter((s) => s.length >= 1 && s.length <= 12),
    { minLength: 1, maxLength: 4 },
  )
  .map((parts) => parts.join('-'));

/**
 * URL base pública sem barra final, à qual anexamos aleatoriamente uma ou mais
 * barras finais (`baseWithSlashes`) para exercitar a normalização de barra
 * final feita pelo serviço.
 */
const publicBaseArb: fc.Arbitrary<{ canonical: string; withSlashes: string }> = fc
  .record({
    scheme: fc.constantFrom('https', 'http'),
    host: fc
      .array(fc.stringMatching(/^[a-z0-9]+$/).filter((s) => s.length >= 1 && s.length <= 10), {
        minLength: 1,
        maxLength: 3,
      })
      .map((parts) => parts.join('.')),
    trailingSlashes: fc.integer({ min: 0, max: 3 }),
  })
  .map(({ scheme, host, trailingSlashes }) => {
    const canonical = `${scheme}://${host}`;
    return { canonical, withSlashes: canonical + '/'.repeat(trailingSlashes) };
  });

describe('Feature: landing-onboarding, Property 10: Derivação da URL pública da logo', () => {
  const originalEnv = {
    ASSETS_S3_BUCKET: process.env.ASSETS_S3_BUCKET,
    ASSETS_PUBLIC_BASE_URL: process.env.ASSETS_PUBLIC_BASE_URL,
    AWS_REGION: process.env.AWS_REGION,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ASSETS_S3_BUCKET = 'assets-bucket-test';
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

  it('deriva publicUrl = {base}/tenant-assets/{slug}/logo.{ext} e objectKey correspondente, sem I/O real', async () => {
    await fc.assert(
      fc.asyncProperty(publicBaseArb, slugArb, logoTypeArb, async (base, slug, logo) => {
        // Base pública com barras finais arbitrárias: o serviço deve normalizá-las.
        process.env.ASSETS_PUBLIC_BASE_URL = base.withSlashes;

        // Cliente S3 mockado: apenas registra a chamada, sem contatar a AWS.
        const send = vi.fn().mockResolvedValue({});
        const deps: Partial<UploadLogoDeps> = {
          createS3Client: (): S3ClientLike => ({ send }),
        };

        const result = await uploadLogo(
          { slug, body: Buffer.from([0x01, 0x02, 0x03]), contentType: logo.contentType },
          deps,
        );

        const expectedKey = `tenant-assets/${slug}/logo.${logo.ext}`;

        // Chave do objeto derivada exatamente do slug e da extensão.
        expect(result.objectKey).toBe(expectedKey);

        // URL pública derivada exatamente da base canônica (sem barra dupla) + chave.
        expect(result.publicUrl).toBe(`${base.canonical}/${expectedKey}`);

        // Garantia adicional: nunca há barra dupla após o esquema.
        expect(result.publicUrl.replace(/^https?:\/\//, '')).not.toContain('//');

        // O upload foi tentado exatamente uma vez (via cliente injetado, sem I/O real).
        expect(send).toHaveBeenCalledTimes(1);
      }),
      { numRuns: 200 },
    );
  });
});
