/**
 * Neutral platform theme + theme merge helper.
 *
 * These now live in `@order-system/shared` so the backend and the mobile app
 * share a single source of truth (identical colors + identical merge behavior).
 * This module re-exports them to keep existing backend import paths stable.
 */
export { NEUTRAL_PLATFORM_THEME, deepMergeTheme } from '@order-system/shared/theme/platform-theme';
