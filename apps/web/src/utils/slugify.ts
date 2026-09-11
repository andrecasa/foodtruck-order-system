/**
 * Geração de slug URL-friendly a partir do nome da empresa (client-side).
 *
 * Função pura, sem efeitos colaterais, usada pelo `Signup_Form` para sugerir um
 * slug enquanto o cliente digita o nome da empresa. Replica a normalização de
 * R4.1: remove acentos, converte para minúsculas, substitui qualquer caractere
 * fora de `[a-z0-9]` por hífen, colapsa hífens consecutivos em um único hífen e
 * remove hífens das extremidades.
 *
 * O backend permanece a autoridade final de validação (mesmo padrão
 * `^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$`, 3–60 caracteres). Por isso, esta função
 * apenas sugere: quando a normalização não produz um slug bem-formado — string
 * vazia ou com menos de 3 caracteres — ela retorna string vazia, deixando o
 * campo em branco para o cliente preencher.
 *
 * Validates: Requirements 4.1
 */

/** Comprimento mínimo de um slug válido exigido pelo backend (R4.3). */
const MIN_SLUG_LENGTH = 3;

/** Comprimento máximo de um slug válido exigido pelo backend (R4.3). */
const MAX_SLUG_LENGTH = 60;

/**
 * Deriva um slug sugerido a partir de um nome de empresa.
 *
 * @param name Nome da empresa informado pelo cliente.
 * @returns Slug bem-formado (3–60 caracteres, `^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$`)
 *   ou string vazia quando a normalização não produz um slug válido.
 */
export function slugify(name: string): string {
  const slug = name
    // Separa os acentos dos caracteres base (ex.: "ç" -> "c" + diacrítico)...
    .normalize('NFD')
    // ...e remove os diacríticos resultantes.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Qualquer caractere fora de [a-z0-9] vira hífen.
    .replace(/[^a-z0-9]+/g, '-')
    // Remove hífens das extremidades (o passo anterior já colapsa sequências).
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    // Recorte de comprimento pode reintroduzir um hífen à direita.
    .replace(/-+$/g, '');

  return slug.length >= MIN_SLUG_LENGTH ? slug : '';
}
