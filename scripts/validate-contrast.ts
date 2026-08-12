/**
 * WCAG AA Contrast Ratio Validation Script
 *
 * Validates that all default theme color token combinations meet
 * WCAG 2.1 AA contrast requirements:
 * - Normal text: ≥ 4.5:1
 * - Large text & UI components: ≥ 3:1
 *
 * Formula:
 * - Relative luminance: L = 0.2126*R + 0.7152*G + 0.0722*B
 *   where R, G, B are linearized sRGB values
 * - Linearize: if c <= 0.04045 then c/12.92 else ((c+0.055)/1.055)^2.4
 * - Contrast ratio: (L1 + 0.05) / (L2 + 0.05), L1 >= L2
 *
 * Usage: npx tsx scripts/validate-contrast.ts
 */

// --- Color utility functions ---

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16) / 255;
  const g = parseInt(cleaned.substring(2, 4), 16) / 255;
  const b = parseInt(cleaned.substring(4, 6), 16) / 255;
  return [r, g, b];
}

function linearize(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(color1: string, color2: string): number {
  const l1 = relativeLuminance(color1);
  const l2 = relativeLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// --- Color pairs to validate ---

interface ColorPair {
  name: string;
  foreground: string;
  background: string;
  minRatio: number;
  context: string;
}

const colorPairs: ColorPair[] = [
  {
    name: 'text on background',
    foreground: '#1C1917',
    background: '#FFFBF5',
    minRatio: 4.5,
    context: 'Normal text',
  },
  {
    name: 'primary on background',
    foreground: '#B45309',
    background: '#FFFBF5',
    minRatio: 3,
    context: 'Large text / UI components',
  },
  {
    name: 'secondary on background',
    foreground: '#78350F',
    background: '#FFFBF5',
    minRatio: 4.5,
    context: 'Normal text',
  },
  {
    name: 'success on background',
    foreground: '#15803D',
    background: '#FFFBF5',
    minRatio: 3,
    context: 'Badges / UI components',
  },
  {
    name: 'warning on background',
    foreground: '#D97706',
    background: '#FFFBF5',
    minRatio: 3,
    context: 'Badges / UI components',
  },
  {
    name: 'error on background',
    foreground: '#DC2626',
    background: '#FFFBF5',
    minRatio: 3,
    context: 'Badges / UI components',
  },
  {
    name: 'aguardando on background',
    foreground: '#D97706',
    background: '#FFFBF5',
    minRatio: 3,
    context: 'Status badges',
  },
  {
    name: 'preparando on background',
    foreground: '#2563EB',
    background: '#FFFBF5',
    minRatio: 3,
    context: 'Status badges',
  },
  {
    name: 'pronto on background',
    foreground: '#15803D',
    background: '#FFFBF5',
    minRatio: 3,
    context: 'Status badges',
  },
  {
    name: 'white on primary (button text)',
    foreground: '#FFFFFF',
    background: '#B45309',
    minRatio: 4.5,
    context: 'Button text on primary',
  },
  {
    name: 'white on secondary (button text)',
    foreground: '#FFFFFF',
    background: '#78350F',
    minRatio: 4.5,
    context: 'Button text on secondary',
  },
  {
    name: 'white on danger (button text)',
    foreground: '#FFFFFF',
    background: '#DC2626',
    minRatio: 4.5,
    context: 'Button text on danger/error',
  },
  {
    name: 'white on preparando (badge text)',
    foreground: '#FFFFFF',
    background: '#2563EB',
    minRatio: 4.5,
    context: 'Badge text on preparando',
  },
  {
    name: 'white on pronto/success (badge text)',
    foreground: '#FFFFFF',
    background: '#15803D',
    minRatio: 4.5,
    context: 'Badge text on pronto/success',
  },
  {
    name: 'dark text on aguardando/warning (badge text)',
    foreground: '#1C1917',
    background: '#D97706',
    minRatio: 4.5,
    context: 'Badge text on aguardando/warning (dark text used for contrast)',
  },
  {
    name: 'error text on background',
    foreground: '#DC2626',
    background: '#FFFBF5',
    minRatio: 4.5,
    context: 'Error message text',
  },
];

// --- Run validation ---

console.log('🎨 WCAG AA Contrast Ratio Validation');
console.log('═'.repeat(60));
console.log('');

let allPassed = true;

for (const pair of colorPairs) {
  const ratio = contrastRatio(pair.foreground, pair.background);
  const passed = ratio >= pair.minRatio;

  if (!passed) {
    allPassed = false;
  }

  const status = passed ? '✅ PASS' : '❌ FAIL';
  const ratioStr = ratio.toFixed(2);

  console.log(
    `${status}  ${pair.name}` +
    `\n       ${pair.foreground} on ${pair.background}` +
    `\n       Ratio: ${ratioStr}:1 (min ${pair.minRatio}:1 — ${pair.context})` +
    `\n`,
  );
}

console.log('═'.repeat(60));

if (allPassed) {
  console.log('✅ All color pairs meet WCAG AA contrast requirements.');
  process.exit(0);
} else {
  console.log('❌ Some color pairs FAIL WCAG AA contrast requirements.');
  console.log('   Update theme tokens to fix contrast issues.');
  process.exit(1);
}
