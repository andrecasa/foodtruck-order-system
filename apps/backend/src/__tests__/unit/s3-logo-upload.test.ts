import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PutObjectCommand } from '@aws-sdk/client-s3';

/**
 * Testes example-based do util de upload da logo ao S3 (`s3-logo-upload`).
 *
 * Cobrem, com o cliente S3 mockado (injeção via `depsOverride`, sem I/O real):
 * - a `Logo_Object_Key` e o `ContentType` corretos por tipo de arquivo
 *   (PNG/JPG/JPEG/SVG/WEBP), inspecionando os args do `PutObjectCommand` (R8.2);
 * - falha de upload ⇒ `ServiceError` 500 `UPLOAD_FAILED` com mensagem pt-BR que
 *   não vaza detalhes internos (R8.5);
 * - env ausente (`ASSETS_S3_BUCKET`/`ASSETS_PUBLIC_BASE_URL`) ⇒ `ServiceError`
 *   500 `INTERNAL_ERROR`, registrando via `logError` sem vazar detalhes (R8.4).
 *
 * **Validates: Requirements 8.2, 8.4, 8.5**
 */

// Mockamos `logError` para (a) manter a saída de teste limpa e (b) poder
// asseverar que erros inesperados são registrados, mas nunca vazados ao cliente.
vi.mock('../../http/log-error.js', () => ({
  logError: vi.fn(),
}));

import { uploadLogo, ServiceError, type S3ClientLike } from '../../services/s3-logo-upload.js';
import { logError } from '../../http/log-error.js';

const BUCKET = 'order-system-assets';
const PUBLIC_BASE_URL = 'https://foodtruck.app.br';
const SLUG = 'pastel-das-meninas';

/** Guarda o ambiente original para restaurar após cada teste. */
let envBackup: NodeJS.ProcessEnv;

beforeEach(() => {
  envBackup = { ...process.env };
  process.env.ASSETS_S3_BUCKET = BUCKET;
  process.env.ASSETS_PUBLIC_BASE_URL = PUBLIC_BASE_URL;
  vi.clearAllMocks();
});

afterEach(() => {
  process.env = envBackup;
});

/**
 * Cria um `depsOverride` com um cliente S3 mockado cujo `send` resolve por
 * padrão. Expõe o spy para inspecionar os args do `PutObjectCommand`.
 */
function makeDeps(sendImpl?: S3ClientLike['send']) {
  const send = vi.fn(sendImpl ?? (async () => ({})));
  const createS3Client = vi.fn((_region: string): S3ClientLike => ({ send }));
  return { deps: { createS3Client }, send, createS3Client };
}

describe('uploadLogo — chave e ContentType por tipo (R8.2)', () => {
  const cases: Array<{ contentType: string; ext: string }> = [
    { contentType: 'image/png', ext: 'png' },
    { contentType: 'image/jpeg', ext: 'jpg' },
    { contentType: 'image/jpg', ext: 'jpg' },
    { contentType: 'image/svg+xml', ext: 'svg' },
    { contentType: 'image/webp', ext: 'webp' },
  ];

  for (const { contentType, ext } of cases) {
    it(`deriva a Logo_Object_Key e o ContentType para ${contentType}`, async () => {
      const { deps, send } = makeDeps();

      const result = await uploadLogo(
        { slug: SLUG, body: Buffer.from('logo'), contentType },
        deps,
      );

      // Args do PutObjectCommand passados ao send mockado.
      expect(send).toHaveBeenCalledTimes(1);
      const command = send.mock.calls[0]![0];
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input.Bucket).toBe(BUCKET);
      expect(command.input.Key).toBe(`tenant-assets/${SLUG}/logo.${ext}`);
      expect(command.input.ContentType).toBe(contentType);

      // Resultado derivado (chave + URL pública).
      expect(result.objectKey).toBe(`tenant-assets/${SLUG}/logo.${ext}`);
      expect(result.publicUrl).toBe(`${PUBLIC_BASE_URL}/tenant-assets/${SLUG}/logo.${ext}`);
    });
  }

  it('normaliza o ContentType em caixa alta para a extensão correta', async () => {
    const { deps, send } = makeDeps();

    const result = await uploadLogo(
      { slug: SLUG, body: Buffer.from('logo'), contentType: 'IMAGE/PNG' },
      deps,
    );

    const command = send.mock.calls[0]![0];
    expect(command.input.Key).toBe(`tenant-assets/${SLUG}/logo.png`);
    expect(result.objectKey).toBe(`tenant-assets/${SLUG}/logo.png`);
  });
});

describe('uploadLogo — falha de upload (R8.5)', () => {
  it('mapeia falha do send para ServiceError 500 UPLOAD_FAILED, sem vazar detalhes', async () => {
    const internalDetail = 'AccessDenied: bucket policy xyz s3://internal';
    const { deps } = makeDeps(async () => {
      throw new Error(internalDetail);
    });

    const promise = uploadLogo(
      { slug: SLUG, body: Buffer.from('logo'), contentType: 'image/png' },
      deps,
    );

    await expect(promise).rejects.toBeInstanceOf(ServiceError);
    const err = await promise.catch((e: unknown) => e as ServiceError);
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('UPLOAD_FAILED');
    // Mensagem pt-BR ao cliente, sem vazar o detalhe interno.
    expect(err.message).toBe('Falha ao enviar a logomarca. Tente novamente.');
    expect(err.message).not.toContain(internalDetail);

    // O erro real é registrado internamente (observabilidade), não devolvido.
    expect(logError).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logError).mock.calls[0]![0]).toBe('signup:s3-logo-upload');
  });
});

describe('uploadLogo — env ausente (R8.4)', () => {
  it('rejeita com ServiceError 500 INTERNAL_ERROR quando falta ASSETS_S3_BUCKET', async () => {
    delete process.env.ASSETS_S3_BUCKET;
    const { deps, createS3Client, send } = makeDeps();

    const promise = uploadLogo(
      { slug: SLUG, body: Buffer.from('logo'), contentType: 'image/png' },
      deps,
    );

    await expect(promise).rejects.toBeInstanceOf(ServiceError);
    const err = await promise.catch((e: unknown) => e as ServiceError);
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.message).toBe('Erro interno ao processar o cadastro.');
    // Não vaza o nome da variável ausente ao cliente.
    expect(err.message).not.toContain('ASSETS_S3_BUCKET');

    // Falha antes de qualquer I/O: nenhum cliente criado, nenhum send.
    expect(createS3Client).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();

    // Erro registrado internamente com o detalhe da variável ausente.
    expect(logError).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logError).mock.calls[0]![0]).toBe('signup:s3-logo-upload');
    const loggedErr = vi.mocked(logError).mock.calls[0]![1] as Error;
    expect(loggedErr.message).toContain('ASSETS_S3_BUCKET');
  });

  it('rejeita com ServiceError 500 INTERNAL_ERROR quando falta ASSETS_PUBLIC_BASE_URL', async () => {
    delete process.env.ASSETS_PUBLIC_BASE_URL;
    const { deps, createS3Client, send } = makeDeps();

    const promise = uploadLogo(
      { slug: SLUG, body: Buffer.from('logo'), contentType: 'image/png' },
      deps,
    );

    await expect(promise).rejects.toBeInstanceOf(ServiceError);
    const err = await promise.catch((e: unknown) => e as ServiceError);
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.message).not.toContain('ASSETS_PUBLIC_BASE_URL');

    expect(createS3Client).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledTimes(1);
    const loggedErr = vi.mocked(logError).mock.calls[0]![1] as Error;
    expect(loggedErr.message).toContain('ASSETS_PUBLIC_BASE_URL');
  });
});
