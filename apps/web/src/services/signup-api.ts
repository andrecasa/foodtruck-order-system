import type { ColorPreset } from '@order-system/shared';

/**
 * Cliente de API do onboarding self-service (`apps/web`).
 *
 * Concentra as chamadas aos três endpoints públicos do cadastro, consumidos pelo
 * `Signup_Form`:
 *
 * - `POST /api/signup` — cria o tenant a partir dos dados do formulário enviados
 *   como `multipart/form-data`, incluindo a logo opcional (R9.1).
 * - `GET /api/signup/color-presets` — lista os presets de cores disponíveis para
 *   o seletor de tema (R6.1).
 * - `GET /api/signup/slug-availability` — consulta formato/disponibilidade do
 *   slug enquanto o cliente digita (R5.1).
 *
 * O backend é a autoridade final de validação; este módulo apenas transporta os
 * dados e traduz o `Error_Envelope` (`{ statusCode, error, message }`) das
 * respostas de erro em um {@link SignupApiError}. Substitui o antigo par
 * `api-client`/`real-client` (removido na tarefa de limpeza).
 *
 * Validates: Requirements 6.1, 5.1, 9.1
 */

/** URL base da API, configurável via `VITE_API_URL` (mesma convenção do app). */
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/** Caminho do endpoint de cadastro (R9.1). */
const SIGNUP_PATH = '/api/signup';

/** Caminho do endpoint de presets de cores (R6.1). */
const COLOR_PRESETS_PATH = '/api/signup/color-presets';

/** Caminho do endpoint de disponibilidade de slug (R5.1). */
const SLUG_AVAILABILITY_PATH = '/api/signup/slug-availability';

/** Mensagem neutra usada quando a resposta de erro não traz uma mensagem. */
const DEFAULT_ERROR_MESSAGE = 'Não foi possível concluir a operação. Tente novamente.';

/**
 * Dados do formulário de cadastro (campos de texto de R3–R6) mais a logo
 * opcional (R7). Espelha os campos aceitos pelo `POST /api/signup`.
 */
export interface SignupInput {
  /** Nome da empresa/estabelecimento. */
  businessName: string;
  /** Nome do responsável comercial (Contato_Comercial). */
  contactName: string;
  /** Telefone/WhatsApp do responsável comercial. */
  contactPhone: string;
  /** Nome do usuário administrador. */
  adminName: string;
  /** E-mail de acesso do administrador. */
  adminEmail: string;
  /** Senha de acesso do administrador. */
  password: string;
  /** Slug desejado para o tenant (subdomínio/rota pública). */
  slug: string;
  /** Identificador do Color_Preset selecionado. */
  colorPresetId: string;
  /** Logomarca opcional (1 arquivo, PNG/JPG/JPEG/SVG/WEBP, ≤ 2 MB). */
  logo?: File | null;
}

/**
 * Resposta de sucesso do cadastro. Retornada tanto para criação nova (201)
 * quanto para o caminho idempotente (200), com os mesmos campos.
 */
export interface SignupResult {
  /** Identificador do tenant criado (ou já existente, no caso idempotente). */
  tenantId: string;
  /** Slug efetivamente atribuído ao tenant. */
  slug: string;
  /** Data/hora de término do período de teste (ISO 8601), quando houver. */
  trialEndsAt: string | null;
}

/** Resposta do endpoint de presets de cores (R6.1). */
export interface ColorPresetsResult {
  /** Lista completa de presets de cores disponíveis. */
  presets: ColorPreset[];
}

/** Resposta do endpoint de disponibilidade de slug (R5). */
export interface SlugAvailabilityResult {
  /** Slug consultado, normalizado pelo backend. */
  slug: string;
  /** `true` quando o formato do slug é válido (R4.3). */
  valid: boolean;
  /** `true` quando o slug não é reservado nem usado por outro tenant (R5.2/R5.3). */
  available: boolean;
}

/**
 * Erro de API do onboarding. Transporta o `Error_Envelope` do backend
 * (`{ statusCode, error, message }`) para que a UI possa exibir a mensagem
 * (pt-BR) e reagir ao `statusCode`/`code` quando necessário.
 */
export class SignupApiError extends Error {
  /** Código HTTP da resposta de erro. */
  readonly statusCode: number;
  /** Código de erro do envelope (ex.: `VALIDATION_ERROR`, `CONFLICT`). */
  readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = 'SignupApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Lê o corpo da resposta com segurança, tratando corpos vazios ou não-JSON.
 *
 * @returns O JSON decodificado ou `null` quando o corpo não pôde ser lido.
 */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Lança um {@link SignupApiError} a partir do `Error_Envelope` da resposta.
 * Deve ser chamada apenas quando `response.ok` é `false`.
 */
async function throwFromErrorResponse(response: Response): Promise<never> {
  const body = await readJson(response);
  const envelope =
    body && typeof body === 'object'
      ? (body as { error?: unknown; message?: unknown })
      : {};
  const message =
    typeof envelope.message === 'string' && envelope.message.length > 0
      ? envelope.message
      : DEFAULT_ERROR_MESSAGE;
  const code =
    typeof envelope.error === 'string' && envelope.error.length > 0
      ? envelope.error
      : 'INTERNAL_ERROR';

  throw new SignupApiError(message, response.status, code);
}

/**
 * Envia o cadastro para `POST /api/signup` como `multipart/form-data` (R9.1).
 *
 * Os campos de texto e a logo opcional são anexados a um `FormData`; o
 * `Content-Type` (com boundary) é definido automaticamente pelo `fetch`.
 *
 * @throws {SignupApiError} Quando o backend responde com erro (envelope traduzido).
 */
export async function signup(input: SignupInput): Promise<SignupResult> {
  const form = new FormData();
  form.append('businessName', input.businessName);
  form.append('contactName', input.contactName);
  form.append('contactPhone', input.contactPhone);
  form.append('adminName', input.adminName);
  form.append('adminEmail', input.adminEmail);
  form.append('password', input.password);
  form.append('slug', input.slug);
  form.append('colorPresetId', input.colorPresetId);
  if (input.logo) {
    form.append('logo', input.logo);
  }

  const response = await fetch(`${API_URL}${SIGNUP_PATH}`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    await throwFromErrorResponse(response);
  }

  return (await response.json()) as SignupResult;
}

/**
 * Busca a lista de presets de cores em `GET /api/signup/color-presets` (R6.1).
 *
 * @throws {SignupApiError} Quando o backend responde com erro.
 */
export async function listColorPresets(): Promise<ColorPresetsResult> {
  const response = await fetch(`${API_URL}${COLOR_PRESETS_PATH}`);

  if (!response.ok) {
    await throwFromErrorResponse(response);
  }

  return (await response.json()) as ColorPresetsResult;
}

/**
 * Consulta formato e disponibilidade de um slug em
 * `GET /api/signup/slug-availability?slug=` (R5.1). Leitura idempotente.
 *
 * @throws {SignupApiError} Quando o backend responde com erro.
 */
export async function checkSlugAvailability(slug: string): Promise<SlugAvailabilityResult> {
  const params = new URLSearchParams({ slug });
  const response = await fetch(`${API_URL}${SLUG_AVAILABILITY_PATH}?${params.toString()}`);

  if (!response.ok) {
    await throwFromErrorResponse(response);
  }

  return (await response.json()) as SlugAvailabilityResult;
}
