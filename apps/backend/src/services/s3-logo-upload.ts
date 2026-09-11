/**
 * Util de upload da logomarca para o bucket S3 de assets (Logo_Upload → S3).
 *
 * PLATFORM-LEVEL — parte do fluxo de onboarding self-service, que roda FORA de
 * qualquer escopo de tenant (o tenant ainda está sendo criado). Envia o arquivo
 * ao `Assets_Bucket` via `@aws-sdk/client-s3` (`PutObjectCommand`), autenticado
 * exclusivamente pelo IAM role da instância EC2 — NUNCA por credenciais em
 * variáveis de ambiente (R8.2, R14.2). Deriva a `Logo_Public_Url` a partir de
 * `ASSETS_PUBLIC_BASE_URL` (R8.3), sem expor a URL crua do S3.
 *
 * O cliente S3 é injetável (`UploadLogoDeps`) para permitir testes com um
 * cliente mockado, sem I/O real (mesmo padrão de injeção de `provisionTenant`).
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5.
 * Design: `.kiro/specs/landing-onboarding/design.md` — `services/s3-logo-upload.ts`.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ServiceError } from './service-error.js';
import { logError } from '../http/log-error.js';

// Reexporta a `ServiceError` central para chamadores do serviço (padrão do projeto).
export { ServiceError };

/** Região padrão do bucket de assets, sobrescrevível por `AWS_REGION` (R14). */
const DEFAULT_AWS_REGION = 'us-east-1';

/** Prefixo dos objetos de logo dentro do bucket (base da `Logo_Object_Key`). */
const TENANT_ASSETS_PREFIX = 'tenant-assets';

/**
 * Tipos de logo aceitos e a extensão do arquivo (`{ext}`) correspondente,
 * derivada do tipo do arquivo (R7.5, R8.2). A validação de tipo/tamanho é feita
 * antes (validação Zod, R7.3/R7.4); aqui apenas mapeamos o `ContentType` para a
 * extensão da `Logo_Object_Key`.
 */
const CONTENT_TYPE_TO_EXTENSION: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

/** Um cliente S3 mínimo (apenas o necessário), injetável para teste. */
export interface S3ClientLike {
  send: (command: PutObjectCommand) => Promise<unknown>;
}

/** Dependências injetáveis do upload (cliente S3 mockável em teste). */
export interface UploadLogoDeps {
  /** Fábrica do cliente S3; recebe a região resolvida do ambiente. */
  createS3Client: (region: string) => S3ClientLike;
}

const defaultDeps: UploadLogoDeps = {
  // Sem credenciais explícitas: o SDK usa a cadeia padrão de credenciais, que
  // na EC2 resolve para o IAM role da instância (R8.2/R14.2).
  createS3Client: (region) => new S3Client({ region }),
};

/** Entrada do upload da logomarca. */
export interface UploadLogoInput {
  /** Slug do tenant (compõe a `Logo_Object_Key`). */
  slug: string;
  /** Conteúdo binário da logo (já validado em tipo/tamanho). */
  body: Buffer | Uint8Array;
  /** Tipo MIME do arquivo (PNG/JPG/JPEG/SVG/WEBP). */
  contentType: string;
}

/** Resultado do upload: chave do objeto e URL pública derivada. */
export interface UploadLogoResult {
  /** `Logo_Object_Key`: `tenant-assets/{slug}/logo.{ext}`. */
  objectKey: string;
  /** `Logo_Public_Url`: `{ASSETS_PUBLIC_BASE_URL}/tenant-assets/{slug}/logo.{ext}`. */
  publicUrl: string;
}

/** Configuração de ambiente resolvida (bucket + base pública). */
interface AssetsEnv {
  bucket: string;
  publicBaseUrl: string;
  region: string;
}

/**
 * Lê e valida as variáveis de ambiente do bucket de assets (R8.1).
 *
 * Ausência de `ASSETS_S3_BUCKET` ou `ASSETS_PUBLIC_BASE_URL` é um erro de
 * configuração do servidor, não do cliente: lançamos `ServiceError` 500
 * `INTERNAL_ERROR` e registramos via `logError`, sem vazar detalhes (R8.4).
 */
function resolveAssetsEnv(): AssetsEnv {
  const bucket = process.env.ASSETS_S3_BUCKET?.trim();
  const publicBaseUrl = process.env.ASSETS_PUBLIC_BASE_URL?.trim();

  if (!bucket || !publicBaseUrl) {
    const missing = [
      !bucket ? 'ASSETS_S3_BUCKET' : null,
      !publicBaseUrl ? 'ASSETS_PUBLIC_BASE_URL' : null,
    ].filter((v): v is string => v !== null);
    logError('signup:s3-logo-upload', new Error(`Variáveis de ambiente ausentes: ${missing.join(', ')}`));
    throw new ServiceError('Erro interno ao processar o cadastro.', 500, 'INTERNAL_ERROR');
  }

  return {
    bucket,
    // Remove barra final para montar a URL sem barra dupla.
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ''),
    region: process.env.AWS_REGION?.trim() || DEFAULT_AWS_REGION,
  };
}

/** Deriva a extensão da `Logo_Object_Key` a partir do tipo do arquivo (R7.5, R8.2). */
function extensionForContentType(contentType: string): string {
  const ext = CONTENT_TYPE_TO_EXTENSION[contentType.toLowerCase()];
  if (!ext) {
    // A validação Zod já barra tipos não permitidos (R7.3); este guard protege
    // contra uso indevido do util fora do fluxo validado.
    throw new ServiceError(
      'Tipo de imagem não suportado para a logomarca. Use PNG, JPG, JPEG, SVG ou WEBP.',
      422,
      'VALIDATION_ERROR',
    );
  }
  return ext;
}

/**
 * Envia a logomarca ao `Assets_Bucket` e deriva a `Logo_Public_Url`.
 *
 * Passos: (1) resolve/valida env (R8.1/R8.4); (2) deriva a `Logo_Object_Key`
 * `tenant-assets/{slug}/logo.{ext}` (R8.2); (3) faz `PutObjectCommand` com o
 * `ContentType` correto, autenticado pelo IAM role (R8.2); (4) deriva a
 * `Logo_Public_Url` (R8.3). Falha de upload ⇒ `ServiceError(..., 500,
 * 'UPLOAD_FAILED')`, sem vazar detalhes internos (R8.5).
 */
export async function uploadLogo(
  input: UploadLogoInput,
  depsOverride?: Partial<UploadLogoDeps>,
): Promise<UploadLogoResult> {
  const deps: UploadLogoDeps = { ...defaultDeps, ...depsOverride };
  const env = resolveAssetsEnv();

  const ext = extensionForContentType(input.contentType);
  const objectKey = `${TENANT_ASSETS_PREFIX}/${input.slug}/logo.${ext}`;

  const client = deps.createS3Client(env.region);

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: env.bucket,
        Key: objectKey,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
  } catch (err) {
    logError('signup:s3-logo-upload', err);
    throw new ServiceError('Falha ao enviar a logomarca. Tente novamente.', 500, 'UPLOAD_FAILED');
  }

  return {
    objectKey,
    publicUrl: `${env.publicBaseUrl}/${objectKey}`,
  };
}
