/**
 * Base de mapa (tiles) compartilhada por todos os mapas do app — pins do dia
 * (`DailyOrdersMap`) e heatmap do mês (`MonthlyHeatmap`), web e nativo.
 *
 * Centraliza a URL e a atribuição dos tiles num único lugar para: (1) evitar
 * duplicação (antes a URL do OSM estava repetida em 4 arquivos) e (2) permitir
 * trocar a base de mapa mudando UMA constante (`MAP_TILE`).
 *
 * Todas as opções são gratuitas e SEM API key. Para heatmap, bases claras e
 * dessaturadas (Positron) dão mais contraste ao calor; para pins, o OSM padrão
 * costuma ser suficiente.
 */

export interface TileConfig {
  /** Template de URL dos tiles ({z}/{x}/{y}); `{s}` e `{r}` são resolvidos pelo Leaflet. */
  url: string;
  /** Atribuição obrigatória exibida no mapa (HTML permitido pelo Leaflet). */
  attribution: string;
  /**
   * Intensidade da dessaturação (grayscale) aplicada via CSS aos tiles do mapa
   * base, de 0 (colorido) a 1 (cinza total). Ausente/0 = sem filtro. Útil só
   * para bases coloridas (OSM); bases já claras (Positron) não precisam.
   * Ex.: `0.7` deixa o mapa parcialmente cinza.
   */
  grayscale?: number;
}

const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors';
const CARTO_ATTRIBUTION = '&copy; OpenStreetMap contributors &copy; CARTO';

/**
 * Presets de base de mapa disponíveis. Para trocar a base do app inteiro, mude
 * apenas qual preset `MAP_TILE` aponta.
 */
export const TILE_PRESETS = {
  /** OSM padrão (colorido). */
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTRIBUTION,
  },
  /** OSM padrão dessaturado via CSS (cinza) — bom fundo para heatmap sem trocar de provedor. */
  osmGrayscale: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTRIBUTION,
    grayscale: 0.7,
  },
  /** CARTO Positron — base clara/cinza desenhada para visualização de dados. */
  cartoPositron: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: CARTO_ATTRIBUTION,
  },
  /** CARTO Positron sem rótulos — fundo ainda mais limpo (o calor domina). */
  cartoPositronNoLabels: {
    url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
    attribution: CARTO_ATTRIBUTION,
  },
  /** CARTO Dark Matter — base escura; heatmap quente sobre preto (estilo dashboard). */
  cartoDarkMatter: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: CARTO_ATTRIBUTION,
  },
} as const satisfies Record<string, TileConfig>;

/**
 * Base de mapa em uso. Troque aqui para mudar todos os mapas do app.
 * Atualmente: OSM dessaturado (cinza) — bom contraste para o heatmap, sem
 * depender de outro provedor de tiles.
 */
export const MAP_TILE: TileConfig = TILE_PRESETS.osmGrayscale; 

/**
 * Classe CSS aplicada à camada de tiles quando a base pede dessaturação.
 * Compartilhada por web (via `className` do TileLayer) para filtrar SÓ os tiles,
 * nunca os marcadores/heatmap por cima.
 */
export const GRAYSCALE_TILE_CLASS = 'map-grayscale-tiles';

/** Intensidade de grayscale da base atual (0 quando não se aplica). */
export const GRAYSCALE_AMOUNT: number = MAP_TILE.grayscale ?? 0;

/** Regra CSS de grayscale para os tiles, ou string vazia quando não se aplica. */
export function grayscaleTileCss(selector: string): string {
  return GRAYSCALE_AMOUNT > 0 ? `${selector} { filter: grayscale(${GRAYSCALE_AMOUNT}); }` : '';
}
