/**
 * Utilidades de telefone celular brasileiro para o Signup_Form.
 *
 * O backend é a autoridade final (normaliza e valida via `signupSchema`), mas a
 * UI aplica máscara e uma validação leve para orientar o cliente antes do envio:
 * exige um celular BR completo — DDD (2 dígitos) + 9 + 8 dígitos.
 */

/** Quantidade de dígitos de um celular BR completo: DDD (2) + 9 + 8. */
const MOBILE_DIGITS = 11;

/** Remove tudo que não for dígito. */
export function extractDigits(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * Aplica a máscara de celular BR progressivamente, conforme o cliente digita:
 * `(11) 90000-0000`. Ignora dígitos além de {@link MOBILE_DIGITS}.
 */
export function formatPhoneBR(input: string): string {
  const digits = extractDigits(input).slice(0, MOBILE_DIGITS);
  const ddd = digits.slice(0, 2);
  const prefix = digits.slice(2, 7); // 9 + 4 dígitos
  const suffix = digits.slice(7, 11); // 4 dígitos finais

  if (digits.length <= 2) return ddd.length ? `(${ddd}` : '';
  if (digits.length <= 7) return `(${ddd}) ${prefix}`;
  return `(${ddd}) ${prefix}-${suffix}`;
}

/**
 * Valida se o valor (com ou sem máscara) é um celular BR válido: exatamente 11
 * dígitos, DDD começando em 1–9 e o nono dígito igual a 9 (marca de celular).
 */
export function isValidMobileBR(input: string): boolean {
  const digits = extractDigits(input);
  return /^[1-9][0-9]9[0-9]{8}$/.test(digits);
}
