/**
 * Signup_Service — orquestra o cadastro self-service de um novo tenant.
 *
 * PLATFORM-LEVEL SERVICE — roda FORA de qualquer escopo de tenant (o tenant
 * ainda está sendo criado). Assim como o `provisionTenant`
 * (`tenant-provision.service.ts`), este serviço opera no nível da plataforma e
 * pode usar o `pool` compartilhado diretamente — via injeção de dependência —
 * para detectar conflitos de e-mail/slug antes de provisionar e para preservar
 * o `trial_ends_at` em reenvios idempotentes. Está explicitamente listado no
 * allowlist `PLATFORM_SERVICES` do teste de arquitetura
 * (`__tests__/unit/tenant-repository-architecture.test.ts`), mantendo a
 * fronteira do `tenantRepository` intacta e documentada.
 *
 * Fluxo (design — Components → `signup.service.ts` + sequência):
 *   1. resolve o `Color_Preset` por id (R6.3 ⇒ 422 se inexistente);
 *   2. normaliza o telefone de contato e computa `trialEndsAt = now + 30d`
 *      (R11.1);
 *   3. detecta idempotência/conflitos por slug e e-mail (R3.7, R5.4, R10.4):
 *      - slug já usado pelo MESMO cadastro (mesmo e-mail de admin) ⇒ reenvio
 *        idempotente: delega ao `provisionTenant`, que retorna o tenant
 *        existente, e preserva o `trial_ends_at` já registrado (R10.4/R11.3);
 *      - slug usado por OUTRO tenant ⇒ 409 `CONFLICT` (R5.4);
 *      - slug livre + e-mail já em uso ⇒ 409 `CONFLICT` (R3.7);
 *   4. faz upload da logo (se houver) e deriva a `Logo_Public_Url` (R7/R8);
 *   5. monta `theme = { colors: preset.colors, businessName }` sobre o
 *      `NEUTRAL_PLATFORM_THEME` via `deepMergeTheme` (R6.6);
 *   6. chama `provisionTenant` com `provisioningKey=slug`, `contact`,
 *      `trialEndsAt` e o `genericMenuPreset` como `menuPreset` (R6.7, R10.1);
 *   7. mapeia `ProvisioningValidationError → 422` e
 *      `ProvisioningError → 500 PROVISIONING_FAILED` (R10.2/R10.3), sem vazar
 *      detalhes internos.
 *
 * As dependências com efeito colateral (upload S3, provisionamento, pool) são
 * injetáveis (`SignupDeps`), no mesmo padrão de `ProvisionDeps`, para permitir
 * testes sem I/O real. A validação Zod do corpo (`signupSchema`) acontece ANTES
 * deste serviço, no controller (task 9.3) via `parseBody`; aqui recebemos os
 * campos já validados/normalizados mais os bytes opcionais da logo.
 *
 * Imports ESM com sufixo `.js`. Mensagens em pt-BR.
 *
 * Design: `.kiro/specs/landing-onboarding/design.md` (Components — `signup.service.ts`).
 * _Requirements: 3.7, 5.4, 6.3, 6.6, 6.7, 7.5, 8.1, 8.3, 8.4, 8.5, 10.1, 10.2, 10.3, 11.1_
 */

import type { ThemeConfig } from '@order-system/shared';
import { NEUTRAL_PLATFORM_THEME, deepMergeTheme } from '@order-system/shared';

import { pool } from '../config/database.js';
import { isReservedSlug, normalizePhone } from '../validation/signup-slug.util.js';
import { SLUG_FORMAT } from '../validation/signup.validation.js';
import { genericMenuPreset } from '../presets/generic-menu.js';
import { getColorPreset } from './color-presets.js';
import { uploadLogo } from './s3-logo-upload.js';
import {
  provisionTenant,
  ProvisioningValidationError,
  ProvisioningError,
} from './tenant-provision.service.js';
import { ServiceError } from './service-error.js';
import { logError } from '../http/log-error.js';

// Reexporta a `ServiceError` central para chamadores do serviço (padrão do projeto).
export { ServiceError };

// --- Constantes nomeadas (evitar valores mágicos) ---------------------------

/** Duração do Trial_Period em dias corridos a partir do cadastro (R11.1). */
const TRIAL_PERIOD_DAYS = 30;

/** Milissegundos em um dia, usado no cálculo de `trialEndsAt`. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// --- Tipos de entrada/saída --------------------------------------------------

/**
 * Bytes + tipo MIME da logomarca opcional (R7.2). Quando presente, o serviço
 * faz o upload e deriva a `Logo_Public_Url`; quando ausente, o cadastro conclui
 * sem associar nenhuma logo ao tenant (R7.2).
 */
export interface SignupLogo {
  /** Conteúdo binário da logo (já validado em tipo/tamanho pelo `signupSchema`). */
  body: Buffer | Uint8Array;
  /** Tipo MIME do arquivo (PNG/JPG/JPEG/SVG/WEBP). */
  contentType: string;
}

/**
 * Entrada do `Signup_Service`: os campos de cadastro já validados/normalizados
 * pelo `signupSchema` (no controller) mais os bytes opcionais da logo. O
 * `contactPhone` chega já no formato E.164 flexível (transform do schema); ainda
 * assim normalizamos de novo aqui para robustez, pois o serviço também pode ser
 * chamado por testes com dados crus.
 */
export interface SignupInputForService {
  businessName: string;
  contactName: string;
  contactPhone: string;
  adminName: string;
  adminEmail: string;
  password: string;
  slug: string;
  colorPresetId: string;
  /** Logo opcional (bytes + tipo). Ausente ⇒ cadastro sem logo (R7.2). */
  logo?: SignupLogo | null;
}

/** Resultado do cadastro, consumido pelo controller para montar a resposta. */
export interface SignupResult {
  tenantId: string;
  /** Slug público do tenant (= `provisioning_key`). */
  slug: string;
  /** Instante de expiração do Trial_Period (R11.1). */
  trialEndsAt: Date;
  /** `true` quando o tenant já existia (reenvio idempotente) ⇒ 200 (R10.5). */
  idempotentHit: boolean;
}

// --- Dependências injetáveis (efeitos colaterais mockáveis em teste) ---------

/**
 * Cliente mínimo do pool necessário para as consultas de conflito/idempotência.
 * Injetável para permitir testes sem banco real (mesmo padrão de `ProvisionDeps`).
 */
export interface SignupPoolLike {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** Dependências injetáveis do `Signup_Service`. */
export interface SignupDeps {
  /** Upload da logo ao S3 (retorna `objectKey` + `publicUrl`). */
  uploadLogo: typeof uploadLogo;
  /** Provisionamento transacional/idempotente do tenant. */
  provisionTenant: typeof provisionTenant;
  /** Pool compartilhado (platform-level) para consultas de conflito/idempotência. */
  pool: SignupPoolLike;
}

const defaultDeps: SignupDeps = {
  uploadLogo,
  provisionTenant,
  pool,
};

// --- Helpers internos --------------------------------------------------------

/** Calcula o `trial_ends_at` como `now + 30 dias corridos` (R11.1, Property 12). */
function computeTrialEndsAt(now: Date): Date {
  return new Date(now.getTime() + TRIAL_PERIOD_DAYS * MS_PER_DAY);
}

/**
 * Monta o `theme` (`Partial<ThemeConfig>`) do tenant combinando a paleta
 * completa do preset selecionado com o `businessName` do cadastro, aplicado
 * sobre o `NEUTRAL_PLATFORM_THEME` via `deepMergeTheme` (R6.6, Property 5). O
 * resultado é um `Partial` (só `colors` + `businessName`), como esperado pelo
 * `provisionTenant`, cujo merge com o tema neutro é replicado pelo branding.
 */
function buildTheme(
  colors: ThemeConfig['colors'],
  businessName: string,
): Partial<ThemeConfig> {
  const override: Partial<ThemeConfig> = { colors, businessName };
  // Aplicar sobre o tema neutro valida que o override produz um tema completo e
  // renderizável (mesma operação do branding); o valor repassado ao
  // `provisionTenant` permanece o `Partial` (override), conforme o contrato.
  deepMergeTheme(NEUTRAL_PLATFORM_THEME, override);
  return override;
}

/**
 * Verifica se já existe um usuário com o e-mail informado (comparação
 * case-insensitive), em QUALQUER tenant — o cadastro cria um admin novo, então
 * um e-mail já existente é conflito (R3.7). Mesmo predicado do password-reset
 * (`LOWER(email) = LOWER($1)`).
 */
async function isEmailInUse(deps: SignupDeps, email: string): Promise<boolean> {
  const res = await deps.pool.query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [email],
  );
  return res.rows.length > 0;
}

/**
 * Estado do slug no momento do cadastro, usado para distinguir reenvio
 * idempotente (mesmo e-mail de admin) de conflito com outro tenant (R5.4/R10.4).
 */
interface SlugState {
  /** `true` se já existe um tenant com este slug (`provisioning_key`). */
  exists: boolean;
  /** E-mail do admin do tenant existente (para comparar com o do cadastro). */
  existingAdminEmail: string | null;
  /** `trial_ends_at` já registrado, a ser preservado no hit idempotente (R11.3). */
  existingTrialEndsAt: Date | null;
}

/**
 * Resolve o estado do slug: se já existe um tenant com esse `provisioning_key`,
 * retorna o e-mail do admin e o `trial_ends_at` registrados. Usado para decidir
 * entre reenvio idempotente e conflito (R5.4).
 */
async function resolveSlugState(deps: SignupDeps, slug: string): Promise<SlugState> {
  const tenantRes = await deps.pool.query(
    'SELECT id, trial_ends_at FROM tenants WHERE provisioning_key = $1 LIMIT 1',
    [slug],
  );
  const tenantRow = tenantRes.rows[0];
  if (!tenantRow) {
    return { exists: false, existingAdminEmail: null, existingTrialEndsAt: null };
  }

  const adminRes = await deps.pool.query(
    "SELECT email FROM users WHERE tenant_id = $1 AND role = 'admin' ORDER BY created_at ASC LIMIT 1",
    [tenantRow.id],
  );
  const adminEmail = adminRes.rows[0]?.email;
  const rawTrial = tenantRow.trial_ends_at;

  return {
    exists: true,
    existingAdminEmail: typeof adminEmail === 'string' ? adminEmail : null,
    existingTrialEndsAt: rawTrial != null ? new Date(rawTrial as string | number | Date) : null,
  };
}

// --- Entrada principal -------------------------------------------------------

/**
 * Orquestra o cadastro self-service de um tenant (ver JSDoc do módulo para o
 * fluxo completo e os requisitos cobertos).
 *
 * @param input Campos já validados/normalizados + logo opcional.
 * @param depsOverride Sobrescritas de dependências (upload/provision/pool) para teste.
 */
export async function signup(
  input: SignupInputForService,
  depsOverride?: Partial<SignupDeps>,
): Promise<SignupResult> {
  const deps: SignupDeps = { ...defaultDeps, ...depsOverride };

  // 1. Resolve o Color_Preset por id; preset inexistente ⇒ 422 (R6.3).
  const preset = getColorPreset(input.colorPresetId);
  if (!preset) {
    throw new ServiceError('Preset de cores inválido ou indisponível.', 422, 'VALIDATION_ERROR');
  }

  // 2. Normaliza o telefone de contato e computa o fim do trial (R11.1).
  const contactPhone = normalizePhone(input.contactPhone);
  const trialEndsAt = computeTrialEndsAt(new Date());

  // 3. Detecta idempotência/conflitos por slug e e-mail (R3.7, R5.4, R10.4).
  const slugState = await resolveSlugState(deps, input.slug);

  if (slugState.exists) {
    const sameAdmin =
      slugState.existingAdminEmail != null &&
      slugState.existingAdminEmail.toLowerCase() === input.adminEmail.toLowerCase();

    if (!sameAdmin) {
      // Slug já usado por OUTRO tenant (R5.4).
      throw new ServiceError('Este endereço (slug) já está em uso.', 409, 'CONFLICT');
    }

    // Reenvio idempotente: o `provisionTenant` retorna o tenant existente sem
    // criar duplicata e sem tocar em trial/contato (R10.4/R11.3). Preservamos o
    // `trial_ends_at` já registrado; se legado sem trial, mantemos o computado.
    const result = await callProvision(deps, input, contactPhone, preset.colors, trialEndsAt);
    return {
      tenantId: result.tenantId,
      slug: input.slug,
      trialEndsAt: slugState.existingTrialEndsAt ?? trialEndsAt,
      idempotentHit: result.idempotentHit,
    };
  }

  // Slug livre: e-mail já em uso ⇒ 409 (R3.7), sem qualquer efeito colateral.
  if (await isEmailInUse(deps, input.adminEmail)) {
    throw new ServiceError('Este e-mail já está em uso.', 409, 'CONFLICT');
  }

  // 4. Upload da logo (se houver) e derivação da `Logo_Public_Url` (R7/R8).
  let logoUrl: string | null = null;
  if (input.logo) {
    const uploaded = await deps.uploadLogo({
      slug: input.slug,
      body: input.logo.body,
      contentType: input.logo.contentType,
    });
    logoUrl = uploaded.publicUrl;
  }

  // 5–7. Monta o tema, provisiona e mapeia os erros do provisionamento.
  const result = await callProvision(deps, input, contactPhone, preset.colors, trialEndsAt, logoUrl);

  return {
    tenantId: result.tenantId,
    slug: input.slug,
    trialEndsAt,
    idempotentHit: result.idempotentHit,
  };
}

/**
 * Chama `provisionTenant` montando o tema (R6.6) e passando `contact`,
 * `trialEndsAt`, `subscriptionStatus='trial'` e o `genericMenuPreset` (R6.7,
 * R10.1). Mapeia `ProvisioningValidationError → 422 VALIDATION_ERROR` (R10.2) e
 * `ProvisioningError → 500 PROVISIONING_FAILED` (R10.3), registrando o erro via
 * `logError` sem vazar detalhes internos.
 */
async function callProvision(
  deps: SignupDeps,
  input: SignupInputForService,
  contactPhone: string,
  colors: ThemeConfig['colors'],
  trialEndsAt: Date,
  logoUrl: string | null = null,
): Promise<{ tenantId: string; idempotentHit: boolean }> {
  const theme = buildTheme(colors, input.businessName);

  try {
    const result = await deps.provisionTenant({
      provisioningKey: input.slug,
      businessName: input.businessName,
      logoUrl,
      theme,
      // O slug (= provisioning_key) também nomeia a instância Evolution do
      // tenant, seguindo a convenção do onboarding (ver `create-tenant.ts`).
      evolutionInstanceName: input.slug,
      admin: {
        name: input.adminName,
        email: input.adminEmail,
        password: input.password,
      },
      menuPreset: genericMenuPreset,
      contact: { name: input.contactName, phone: contactPhone },
      trialEndsAt,
      subscriptionStatus: 'trial',
    });

    return { tenantId: result.tenantId, idempotentHit: result.idempotentHit };
  } catch (err) {
    if (err instanceof ProvisioningValidationError) {
      // Lista os campos inválidos reportados pelo provisionamento (R10.2).
      throw new ServiceError(
        `Dados de provisionamento inválidos: ${err.fields.join(', ')}.`,
        422,
        'VALIDATION_ERROR',
      );
    }
    if (err instanceof ProvisioningError) {
      logError('signup:provision', err);
      throw new ServiceError('Falha ao provisionar o cadastro. Tente novamente.', 500, 'PROVISIONING_FAILED');
    }
    // Erro inesperado: deixa subir ao `errorHandler` central (500 genérico, R9.8).
    throw err;
  }
}

// --- Slug_Availability_Endpoint (R5.1/R5.2/R5.3) -----------------------------

/**
 * Resultado da checagem de disponibilidade do slug, consumido pelo controller
 * do `GET /api/signup/slug-availability` (R5.1). Espelha o contrato de resposta
 * `{ slug, valid, available }` do design (API Contracts):
 *  - `valid`: o slug tem formato válido (R4.3 — casa `SLUG_FORMAT`);
 *  - `available`: além de válido, não é reservado (R5.3) e não está em uso por
 *    outro tenant (R5.2). Formato inválido ⇒ `available=false`.
 */
export interface SlugAvailability {
  slug: string;
  valid: boolean;
  available: boolean;
}

/**
 * Dependência mínima injetável para a checagem de disponibilidade — apenas o
 * `pool` (leitura idempotente por `provisioning_key`), no mesmo padrão de
 * `SignupDeps`, para permitir testes sem banco real.
 */
export interface SlugAvailabilityDeps {
  pool: SignupPoolLike;
}

const defaultSlugAvailabilityDeps: SlugAvailabilityDeps = { pool };

/**
 * Verifica se um `provisioning_key` (slug) já está registrado em algum tenant.
 */
async function isSlugTaken(deps: SlugAvailabilityDeps, slug: string): Promise<boolean> {
  const res = await deps.pool.query(
    'SELECT id FROM tenants WHERE provisioning_key = $1 LIMIT 1',
    [slug],
  );
  return res.rows.length > 0;
}

/**
 * Checa a disponibilidade de um slug candidato (Slug_Availability_Endpoint,
 * R5.1). Regra de negócio (mantida no service, não no controller):
 *  - `valid` = o slug casa `SLUG_FORMAT` (R4.3);
 *  - `available` = `valid` E não pertence aos Reserved_Slugs (R5.3) E não está
 *    em uso por outro tenant (R5.2).
 *
 * Slug de formato inválido é curto-circuitado: retorna `valid=false,
 * available=false` sem consultar o banco (nada a reservar/checar).
 *
 * @param slug Slug candidato (query string `slug`).
 * @param depsOverride Sobrescritas de dependências (pool) para teste.
 */
export async function checkSlugAvailability(
  slug: string,
  depsOverride?: Partial<SlugAvailabilityDeps>,
): Promise<SlugAvailability> {
  const deps: SlugAvailabilityDeps = { ...defaultSlugAvailabilityDeps, ...depsOverride };

  const valid = SLUG_FORMAT.test(slug);
  if (!valid) {
    return { slug, valid: false, available: false };
  }

  // Reservado (R5.3) nunca é disponível, sem precisar consultar o banco.
  if (isReservedSlug(slug)) {
    return { slug, valid: true, available: false };
  }

  const taken = await isSlugTaken(deps, slug);
  return { slug, valid: true, available: !taken };
}
