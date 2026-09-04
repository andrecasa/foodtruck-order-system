/**
 * Renderizador_Email — renderiza o e-mail de verificação em texto puro e HTML.
 *
 * O corpo em texto puro reusa `buildVerificationBody` (fallback SEMPRE presente);
 * o corpo HTML vem do Template_Email (`verification-code.html`), lido uma única
 * vez na carga do módulo, com os placeholders `{{code}}` e `{{expiresInMinutes}}`
 * substituídos por valores escapados.
 *
 * ESM com sufixo `.js` nos imports, como no restante de `apps/backend`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildVerificationBody } from '../email.service.js';

/** Minutos de validade do código, refletindo o Prazo_Validade (15 min). */
export const VERIFICATION_EXPIRES_IN_MINUTES = 15;

/**
 * Escapa caracteres especiais de HTML nos valores substituídos, de modo que
 * valores substituídos nunca introduzam marcação HTML nem vetores de injeção
 * (R6.6). Escapa `&`, `<`, `>`, `"` e `'`.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Substitui todas as ocorrências de `{{key}}` no template pelos valores
 * correspondentes, aplicando `escapeHtml` a TODO valor substituído (R6.6).
 * Placeholders sem valor correspondente são mantidos intactos.
 */
export function applyPlaceholders(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = values[key];
    return value === undefined ? `{{${key}}}` : escapeHtml(value);
  });
}

// Template lido do arquivo `.html` ao lado deste módulo, uma única vez na carga.
const TEMPLATE_PATH = fileURLToPath(
  new URL('./verification-code.html', import.meta.url),
);
const TEMPLATE_HTML = readFileSync(TEMPLATE_PATH, 'utf8');

/**
 * Renderiza o e-mail de verificação em texto puro e HTML.
 *
 * - `text`: via `buildVerificationBody(code)` — fallback SEMPRE presente (R4.4).
 * - `html`: do Template_Email com `{{code}}` → código e `{{expiresInMinutes}}` →
 *   `15` (R4.5), com escaping dos valores substituídos (R6.6).
 */
export function renderVerificationEmail(code: string): { text: string; html: string } {
  return {
    text: buildVerificationBody(code),
    html: applyPlaceholders(TEMPLATE_HTML, {
      code,
      expiresInMinutes: String(VERIFICATION_EXPIRES_IN_MINUTES),
    }),
  };
}
