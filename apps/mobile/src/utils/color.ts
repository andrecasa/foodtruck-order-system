/**
 * Applies opacity to a hex color string, returning an rgba string.
 * @param hex - A hex color like '#7B2D2D'
 * @param opacity - A number between 0 and 1
 */
export function withOpacity(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
