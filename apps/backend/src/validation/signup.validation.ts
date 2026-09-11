import { z } from 'zod';

/**
 * Schema Zod do cadastro self-service (`POST /api/signup`), cobrindo as regras
 * de validação de R3–R7. Fica antes de qualquer efeito colateral (upload/
 * provisionamento): mensagens em pt-BR, mapeadas centralmente pelo
 * `errorHandler` como `VALIDATION_ERROR`/422 via `parseBody`.
 *
 * O controller mescla os campos de texto do multipart (`req.body`) com os
 * metadados da logo (`req.file`) antes de validar aqui. A logo é opcional
 * (R7.2): quando presente, valida-se o tipo (R7.3) e o tamanho (R7.4).
 *
 * A util de slug reservado / normalização de telefone compartilhada é
 * responsabilidade da tarefa 6.2; aqui a regex de slug e o normalizador de
 * telefone ficam definidos localmente. As constantes reutilizáveis por outras
 * tarefas (ex.: `MAX_LOGO_BYTES`) são exportadas.
 *
 * _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 4.3, 4.4, 4.5, 6.3, 7.3, 7.4, 9.2, 9.3_
 */

// --- Constantes nomeadas (evitar valores mágicos) ---------------------------

/** Comprimento máximo do nome da empresa (R3.2). */
export const MAX_BUSINESS_NAME_LENGTH = 120;

/** Comprimento máximo do nome do responsável (Contato_Comercial). */
export const MAX_CONTACT_NAME_LENGTH = 120;

/** Comprimento máximo aceito para e-mail (alinhado a `user.validation.ts`). */
export const MAX_EMAIL_LENGTH = 254;

/** Comprimento mínimo da senha (R3.6; alinhado a `user.validation.ts`). */
export const MIN_PASSWORD_LENGTH = 8;

/** Comprimento máximo da senha (limite do bcrypt usado pelo Supabase). */
export const MAX_PASSWORD_LENGTH = 72;

/**
 * Formato URL-friendly do slug (R4.3): 3–60 caracteres, apenas minúsculas,
 * dígitos e hífen, sem iniciar/terminar com hífen. Mesmo padrão validado em
 * `tenant-provision.service.ts` para tenants novos.
 */
export const SLUG_FORMAT = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;

/** Tamanho máximo da logo: 2 MB (R7.4). */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Mapa de MIME types aceitos para a logo (R7.3) para a extensão persistida na
 * `Logo_Object_Key` (R7.5). Mantido aqui como fonte única para tipo e extensão.
 */
export const ALLOWED_LOGO_MIME_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
} as const;

/** MIME types de logo aceitos (chaves de `ALLOWED_LOGO_MIME_TYPES`). */
export type AllowedLogoMimeType = keyof typeof ALLOWED_LOGO_MIME_TYPES;

/** Mensagem pt-BR listando os tipos de logo aceitos (R7.3). */
const LOGO_TYPE_MESSAGE = 'Tipo de logomarca inválido. Tipos aceitos: PNG, JPG, JPEG, SVG, WEBP';

/** Mensagem pt-BR sobre o tamanho máximo da logo (R7.4). */
const LOGO_SIZE_MESSAGE = 'A logomarca deve ter no máximo 2 MB';

// --- Normalização de telefone (E.164 flexível BR, R3.4) ---------------------

/**
 * Normaliza um telefone removendo espaços, parênteses e hífens, preservando um
 * `+` inicial opcional. O backend é a autoridade final: aceita entrada com
 * máscara BR na UI mas persiste apenas os dígitos normalizados.
 */
export function normalizePhone(input: string): string {
  return input.replace(/[\s()-]/g, '');
}

/** Telefone E.164 flexível: `+` opcional seguido de 10–15 dígitos (R3.4). */
const PHONE_FORMAT = /^\+?[1-9]\d{9,14}$/;

// --- Metadados da logo (opcional, R7) ---------------------------------------

/**
 * Metadados da logo enviados via multipart. Validados apenas quando a logo está
 * presente (R7.2): tipo permitido (R7.3) e tamanho ≤ `MAX_LOGO_BYTES` (R7.4).
 */
const logoSchema = z.object({
  mimetype: z
    .string()
    .refine(
      (value): value is AllowedLogoMimeType => value in ALLOWED_LOGO_MIME_TYPES,
      LOGO_TYPE_MESSAGE,
    ),
  size: z
    .number()
    .int()
    .max(MAX_LOGO_BYTES, LOGO_SIZE_MESSAGE),
});

// --- Schema principal do cadastro -------------------------------------------

export const signupSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, `Nome da empresa deve ter entre 1 e ${MAX_BUSINESS_NAME_LENGTH} caracteres`)
    .max(MAX_BUSINESS_NAME_LENGTH, `Nome da empresa deve ter entre 1 e ${MAX_BUSINESS_NAME_LENGTH} caracteres`),
  contactName: z
    .string()
    .trim()
    .min(1, 'Nome do responsável é obrigatório')
    .max(MAX_CONTACT_NAME_LENGTH, `Nome do responsável deve ter no máximo ${MAX_CONTACT_NAME_LENGTH} caracteres`),
  contactPhone: z
    .string()
    .transform(normalizePhone)
    .refine((value) => PHONE_FORMAT.test(value), 'Telefone de contato inválido'),
  adminName: z
    .string()
    .trim()
    .min(1, 'Nome do administrador é obrigatório')
    .max(100, 'Nome do administrador deve ter no máximo 100 caracteres'),
  adminEmail: z
    .string()
    .max(MAX_EMAIL_LENGTH, 'Formato de e-mail inválido')
    .email('Formato de e-mail inválido'),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `A senha deve ter entre ${MIN_PASSWORD_LENGTH} e ${MAX_PASSWORD_LENGTH} caracteres`)
    .max(MAX_PASSWORD_LENGTH, `A senha deve ter entre ${MIN_PASSWORD_LENGTH} e ${MAX_PASSWORD_LENGTH} caracteres`),
  slug: z
    .string()
    .regex(
      SLUG_FORMAT,
      'Slug inválido: use de 3 a 60 caracteres com apenas letras minúsculas, dígitos e hífen, sem iniciar ou terminar com hífen',
    ),
  colorPresetId: z
    .string()
    .min(1, 'Selecione um preset de cores'),
  logo: logoSchema.optional(),
});

/** Tipo já validado/normalizado do corpo de cadastro. */
export type SignupInput = z.infer<typeof signupSchema>;
