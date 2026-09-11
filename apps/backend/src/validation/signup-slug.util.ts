/**
 * Utilitário compartilhado do cadastro self-service (Signup).
 *
 * Fonte única da verdade para:
 *  - **Reserved_Slugs** (R4.5 / R5.3): conjunto de slugs proibidos que colidem
 *    com prefixos de rotas da plataforma/públicas. Antes vivia como `Set`
 *    privado em `tenant-provision.service.ts`; foi centralizado aqui para evitar
 *    duplicação — tanto o provisionamento quanto a validação Zod do signup e o
 *    Slug_Availability_Endpoint consomem o MESMO conjunto.
 *  - **Normalização de telefone/WhatsApp** (R3.4): remove espaços, `(`, `)` e
 *    `-`, preservando um `+` inicial opcional. O backend é a autoridade final e
 *    persiste os dígitos normalizados no formato E.164 flexível BR
 *    (`^\+?[1-9]\d{9,14}$`).
 *
 * Imports ESM com sufixo `.js` (mesmo em arquivos `.ts`). Mensagens em pt-BR.
 *
 * **Validates: Requirements 4.5, 3.4**
 */

/**
 * Reserved_Slugs (R4.5 / R5.3): slugs que colidem com prefixos de rotas da
 * plataforma/públicas e, portanto, não podem ser usados como slug de tenant.
 * Este é o único ponto de definição — não redefina este conjunto em outro lugar.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'api',
  'admin',
  'health',
  'webhook',
  'static',
  'assets',
  'public',
  'login',
  'queue',
]);

/**
 * Indica se `slug` pertence aos Reserved_Slugs (R4.5). A comparação é feita
 * exatamente sobre o valor informado (o formato já minúsculo é garantido pela
 * validação de formato do slug), sem normalização adicional.
 */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

/**
 * Padrão de telefone E.164 flexível BR (R3.4): `+` inicial opcional seguido de
 * 10 a 15 dígitos, sendo o primeiro não-zero.
 */
export const PHONE_E164_PATTERN = /^\+?[1-9]\d{9,14}$/;

/**
 * Normaliza um telefone/WhatsApp de contato (R3.4) removendo espaços, `(`, `)` e
 * `-`, preservando um `+` inicial opcional. Não valida o resultado — apenas o
 * prepara para ser testado contra `PHONE_E164_PATTERN` pela camada de validação.
 *
 * Exemplos:
 *  - `"+55 (11) 99999-1234"` → `"+5511999991234"`
 *  - `"(11) 3333-4444"`      → `"1133334444"`
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s()-]/g, '');
}
