import { GRAYSCALE_TILE_CLASS, GRAYSCALE_AMOUNT } from './map-tiles';

/**
 * Injeta (uma vez) a regra CSS que dessatura APENAS os tiles do mapa base na
 * web, com a intensidade definida em `MAP_TILE.grayscale`. Compartilhado pelos
 * mapas web (`DailyOrdersMap.web`, `MonthlyHeatmap.web`) para não duplicar a
 * lógica. A classe é aplicada só à camada de tiles, então marcadores e heatmap
 * (que ficam em panes separados) mantêm as cores.
 *
 * No-op quando não há dessaturação (`GRAYSCALE_AMOUNT === 0`) ou fora do DOM.
 */
export function ensureGrayscaleTileStyle(): void {
  if (GRAYSCALE_AMOUNT <= 0) return;
  if (typeof document === 'undefined') return;
  const styleId = 'map-grayscale-style';
  const css = `.${GRAYSCALE_TILE_CLASS} { filter: grayscale(${GRAYSCALE_AMOUNT}); }`;
  const existing = document.getElementById(styleId);
  if (existing) {
    existing.textContent = css; // ressincroniza (HMR / mudança de intensidade)
    return;
  }
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = css;
  document.head.appendChild(style);
}
