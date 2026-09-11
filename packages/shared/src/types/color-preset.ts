import type { ThemeConfig } from './theme';

/**
 * Preset de cores oferecido no onboarding (R6.1/R6.4/R6.5). Cada preset expõe a
 * paleta `colors` completa do `ThemeConfig` (todos os tokens, R6.4) e **não**
 * inclui `businessName` — este é fornecido pelo usuário no cadastro (R6.5).
 * Tipo compartilhado entre o backend (loader `services/color-presets.ts`) e o
 * `apps/web` (seletor de preset), mantendo uma única fonte da verdade da forma.
 */
export interface ColorPreset {
  /** Identificador estável do preset (ex.: `classico`). */
  id: string;
  /** Rótulo exibido ao usuário no seletor (pt-BR). */
  label: string;
  /** Paleta de cores completa, correspondente a `ThemeConfig['colors']`. */
  colors: ThemeConfig['colors'];
}
