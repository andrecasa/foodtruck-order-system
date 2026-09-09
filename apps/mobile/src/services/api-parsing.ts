/**
 * Helpers de parsing para respostas cruas do backend.
 *
 * O backend responde ora em camelCase, ora em snake_case (dependendo da rota e
 * de como o registro é serializado), então os mappers do `real-client` leem
 * ambos os formatos. Em vez de tipar essas respostas como `any` (o que desliga
 * toda a checagem), tratamos cada resposta como `unknown` e fazemos o narrowing
 * explícito aqui — alinhado à regra do projeto (preferir `unknown` + narrowing
 * a `any`). Estes helpers são puros e sem I/O.
 */

/** Um objeto de resposta cru, com chaves de tipo desconhecido. */
export type RawRecord = Record<string, unknown>;

/** Narrowing: retorna o objeto como `RawRecord` ou `{}` se não for objeto. */
export function asRecord(value: unknown): RawRecord {
  return typeof value === 'object' && value !== null ? (value as RawRecord) : {};
}

/** Narrowing: retorna um array de `RawRecord` a partir de um valor desconhecido. */
export function asRecordArray(value: unknown): RawRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

/**
 * Retorna o primeiro valor definido (não `undefined`/`null`) entre as chaves
 * informadas. Usado para ler o mesmo campo em camelCase ou snake_case.
 */
function firstDefined(raw: RawRecord, keys: string[]): unknown {
  for (const key of keys) {
    const v = raw[key];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

/** Lê uma string a partir das chaves (camelCase/snake_case); `''` se ausente. */
export function pickString(raw: RawRecord, ...keys: string[]): string {
  const v = firstDefined(raw, keys);
  return typeof v === 'string' ? v : '';
}

/**
 * Lê uma string opcional: retorna `undefined` quando ausente (em vez de `''`),
 * para campos que o contrato tipa como opcionais.
 */
export function pickOptionalString(raw: RawRecord, ...keys: string[]): string | undefined {
  const v = firstDefined(raw, keys);
  return typeof v === 'string' ? v : undefined;
}

/** Lê um número a partir das chaves; `fallback` (padrão 0) se ausente/ inválido. */
export function pickNumber(raw: RawRecord, keys: string[], fallback = 0): number {
  const v = firstDefined(raw, keys);
  return typeof v === 'number' ? v : fallback;
}

/**
 * Lê um número opcional: retorna `undefined` quando ausente, para coordenadas e
 * timestamps opcionais.
 */
export function pickOptionalNumber(raw: RawRecord, ...keys: string[]): number | undefined {
  const v = firstDefined(raw, keys);
  return typeof v === 'number' ? v : undefined;
}
