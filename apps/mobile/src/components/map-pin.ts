/**
 * Marcador em forma de pino (SVG inline) para os mapas Leaflet — compartilhado
 * por web e nativo para não divergir o visual.
 *
 * Usa um pino SVG desenhado no código (a "gota" clássica com um furo branco no
 * centro), colorido pelo status do pedido via `fill`. Vantagens sobre o ícone
 * de fonte: independe de fonte/rede, a cor aplica direto e o filtro grayscale
 * dos tiles não o afeta (fica em `pane` separado, sobre os tiles).
 */

/** Dimensões do pino (px). A gota é mais alta que larga. */
export const PIN_WIDTH = 18;
export const PIN_HEIGHT = 26;
/** Âncora: base central (a ponta do pino aponta exatamente a coordenada). */
export const PIN_ANCHOR: [number, number] = [PIN_WIDTH / 2, PIN_HEIGHT];

/**
 * SVG do pino colorido por `color`. Contorno branco + sombra sutil para
 * destacar sobre o mapa. Retorna a marcação SVG crua (string).
 */
export function pinSvg(color: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_WIDTH}" height="${PIN_HEIGHT}" viewBox="0 0 26 36">` +
    `<path d="M13 0C6 0 0.5 5.4 0.5 12.2 0.5 21 13 36 13 36S25.5 21 25.5 12.2C25.5 5.4 20 0 13 0Z" ` +
    `fill="${color}" stroke="#FFFFFF" stroke-width="2"/>` +
    `<circle cx="13" cy="12.2" r="4.6" fill="#FFFFFF"/>` +
    `</svg>`
  );
}

/**
 * `data:` URI do SVG do pino, para usar como `iconUrl` de um `L.icon`.
 * `encodeURIComponent` mantém o SVG válido dentro da URL.
 */
export function pinDataUri(color: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(pinSvg(color))}`;
}
