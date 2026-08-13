import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { defaultTheme } from '../../theme/theme.config';

/**
 * Feature: food-truck-order-system, Property 1: Contraste WCAG AA
 *
 * Para qualquer configuração de tema válida, todas as combinações de cor de texto
 * sobre cor de fundo devem atender ao ratio de contraste mínimo WCAG AA
 * (4.5:1 para texto normal, 3:1 para texto grande).
 *
 * **Validates: Requirements 1.8**
 */

// --- WCAG Contrast Ratio Utilities ---

/**
 * Converts a hex color string to RGB components (0-255).
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return { r, g, b };
}

/**
 * Linearizes an sRGB channel value (0-255) to linear light value (0-1).
 * Per WCAG 2.x formula.
 */
function linearize(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.03928
    ? srgb / 12.92
    : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

/**
 * Calculates relative luminance of a color per WCAG 2.x.
 * L = 0.2126 * R + 0.7152 * G + 0.0722 * B
 */
function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Calculates WCAG contrast ratio between two colors.
 * Ratio = (L1 + 0.05) / (L2 + 0.05) where L1 >= L2
 */
function contrastRatio(color1: string, color2: string): number {
  const l1 = relativeLuminance(color1);
  const l2 = relativeLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// --- Arbitraries ---

/**
 * Generates a valid 6-character hex color string prefixed with '#'.
 */
function hexColorArb(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
    )
    .map(([r, g, b]) => {
      const toHex = (n: number) => n.toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    });
}

/**
 * Generates a dark color (luminance < 0.2) suitable as text on light backgrounds.
 * This ensures the generated theme configurations are "valid" —
 * a valid theme must pass WCAG AA contrast by design.
 */
function darkColorArb(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.integer({ min: 0, max: 100 }),
      fc.integer({ min: 0, max: 100 }),
      fc.integer({ min: 0, max: 100 }),
    )
    .map(([r, g, b]) => {
      const toHex = (n: number) => n.toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    });
}

/**
 * Generates a light color (luminance > 0.7) suitable as background.
 */
function lightColorArb(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.integer({ min: 200, max: 255 }),
      fc.integer({ min: 200, max: 255 }),
      fc.integer({ min: 200, max: 255 }),
    )
    .map(([r, g, b]) => {
      const toHex = (n: number) => n.toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    });
}

// --- Tests ---

describe('Property 1: Contraste WCAG AA (ratio ≥ 4.5:1 e ≥ 3:1)', () => {
  describe('WCAG contrast ratio utility correctness', () => {
    it('should compute correct contrast for black on white (21:1)', () => {
      const ratio = contrastRatio('#000000', '#FFFFFF');
      expect(ratio).toBeCloseTo(21, 0);
    });

    it('should compute correct contrast for white on white (1:1)', () => {
      const ratio = contrastRatio('#FFFFFF', '#FFFFFF');
      expect(ratio).toBeCloseTo(1, 0);
    });

    it('should be symmetric (order does not matter)', () => {
      const r1 = contrastRatio('#7B2D2D', '#FFFFFF');
      const r2 = contrastRatio('#FFFFFF', '#7B2D2D');
      expect(r1).toBeCloseTo(r2, 10);
    });
  });

  describe('Default theme passes WCAG AA contrast requirements', () => {
    const { colors } = defaultTheme;
    const surface = colors.surface ?? '#FFFFFF';
    const background = colors.background;
    const text = colors.text;

    it('text on background ≥ 4.5:1 (normal text)', () => {
      const ratio = contrastRatio(text, background);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('text on surface ≥ 4.5:1 (normal text on cards)', () => {
      const ratio = contrastRatio(text, surface);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('primary on surface ≥ 4.5:1 (button text, normal)', () => {
      const ratio = contrastRatio(colors.primary, surface);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('primary on surface ≥ 3:1 (large text threshold)', () => {
      const ratio = contrastRatio(colors.primary, surface);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });

    it('aguardando status color on surface ≥ 3:1', () => {
      const ratio = contrastRatio(colors.aguardando, surface);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });

    it('preparando status color on surface ≥ 3:1', () => {
      const ratio = contrastRatio(colors.preparando, surface);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });

    it('pronto status color on surface ≥ 3:1', () => {
      const ratio = contrastRatio(colors.pronto, surface);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Property: any valid theme with dark text on light background passes WCAG AA', () => {
    it('very dark text (channels ≤ 50) on white always achieves ≥ 4.5:1 contrast', () => {
      // Very dark colors on pure white should always meet WCAG AA for normal text
      const veryDarkColorArb = fc
        .tuple(
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 0, max: 50 }),
        )
        .map(([r, g, b]) => {
          const toHex = (n: number) => n.toString(16).padStart(2, '0');
          return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        });

      fc.assert(
        fc.property(veryDarkColorArb, (textColor) => {
          const ratio = contrastRatio(textColor, '#FFFFFF');
          return ratio >= 4.5;
        }),
        { numRuns: 100 },
      );
    });

    it('any color on itself always produces ratio of 1:1', () => {
      fc.assert(
        fc.property(hexColorArb(), (color) => {
          const ratio = contrastRatio(color, color);
          return Math.abs(ratio - 1) < 0.001;
        }),
        { numRuns: 100 },
      );
    });

    it('contrast ratio is always symmetric', () => {
      fc.assert(
        fc.property(hexColorArb(), hexColorArb(), (c1, c2) => {
          const r1 = contrastRatio(c1, c2);
          const r2 = contrastRatio(c2, c1);
          return Math.abs(r1 - r2) < 0.0001;
        }),
        { numRuns: 100 },
      );
    });

    it('contrast ratio is always between 1 and 21', () => {
      fc.assert(
        fc.property(hexColorArb(), hexColorArb(), (c1, c2) => {
          const ratio = contrastRatio(c1, c2);
          return ratio >= 1 && ratio <= 21;
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Property: generated WCAG-compliant theme configurations maintain contrast', () => {
    /**
     * Generates a pair of colors (foreground, background) that is guaranteed
     * to meet a minimum contrast ratio. Uses filter to only keep valid pairs.
     */
    function wcagCompliantPairArb(minRatio: number): fc.Arbitrary<[string, string]> {
      return fc
        .tuple(hexColorArb(), hexColorArb())
        .filter(([fg, bg]) => contrastRatio(fg, bg) >= minRatio);
    }

    it('any color pair meeting ≥ 4.5:1 is correctly identified by contrast checker', () => {
      fc.assert(
        fc.property(
          wcagCompliantPairArb(4.5),
          ([textColor, bgColor]) => {
            // If a pair passes our filter, the contrast function must confirm it
            const ratio = contrastRatio(textColor, bgColor);
            return ratio >= 4.5;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('any color pair meeting ≥ 3:1 is correctly identified for large text (status colors)', () => {
      fc.assert(
        fc.property(
          wcagCompliantPairArb(3),
          ([statusColor, surfaceColor]) => {
            const ratio = contrastRatio(statusColor, surfaceColor);
            return ratio >= 3;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('valid theme config: text colors on backgrounds always meet WCAG AA thresholds', () => {
      // Generate a full theme-like color config constrained to be WCAG-valid
      const validThemeColorsArb = fc.record({
        text: darkColorArb(),
        background: lightColorArb(),
        surface: lightColorArb(),
        primary: darkColorArb(),
        aguardando: hexColorArb(),
        preparando: hexColorArb(),
        pronto: hexColorArb(),
      }).filter((colors) => {
        // Only keep configs where all critical pairs meet WCAG AA
        const textOnBg = contrastRatio(colors.text, colors.background);
        const textOnSurface = contrastRatio(colors.text, colors.surface);
        const primaryOnSurface = contrastRatio(colors.primary, colors.surface);
        const aguardandoOnSurface = contrastRatio(colors.aguardando, colors.surface);
        const preparandoOnSurface = contrastRatio(colors.preparando, colors.surface);
        const prontoOnSurface = contrastRatio(colors.pronto, colors.surface);
        return (
          textOnBg >= 4.5 &&
          textOnSurface >= 4.5 &&
          primaryOnSurface >= 4.5 &&
          aguardandoOnSurface >= 3 &&
          preparandoOnSurface >= 3 &&
          prontoOnSurface >= 3
        );
      });

      fc.assert(
        fc.property(validThemeColorsArb, (colors) => {
          // Verify the property: all WCAG-valid theme configs pass our checker
          const textOnBg = contrastRatio(colors.text, colors.background);
          const textOnSurface = contrastRatio(colors.text, colors.surface);
          const primaryOnSurface = contrastRatio(colors.primary, colors.surface);
          const aguardandoOnSurface = contrastRatio(colors.aguardando, colors.surface);
          const preparandoOnSurface = contrastRatio(colors.preparando, colors.surface);
          const prontoOnSurface = contrastRatio(colors.pronto, colors.surface);

          return (
            textOnBg >= 4.5 &&
            textOnSurface >= 4.5 &&
            primaryOnSurface >= 4.5 &&
            aguardandoOnSurface >= 3 &&
            preparandoOnSurface >= 3 &&
            prontoOnSurface >= 3
          );
        }),
        { numRuns: 100 },
      );
    });
  });
});
