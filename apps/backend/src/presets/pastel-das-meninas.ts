/**
 * Onboarding preset — "Pastel das Meninas".
 *
 * This is the initial menu (categories + items) for the very first tenant,
 * "Pastel das Meninas". It recovers the exact menu from the old global seed
 * migration `apps/backend/migrations/010_seed_menu.sql` (removed in task 1) and
 * re-expresses it as TENANT ONBOARDING DATA rather than a global schema
 * migration (R9.6). It is consumed by `provisionTenant` via the
 * `menuPreset` input (see `tenant-provision.service.ts`).
 *
 * The equivalent JSON artifact lives at `apps/backend/presets/pastel-das-meninas.json`
 * and can be passed to the CLI: `--menu-preset=./presets/pastel-das-meninas.json`.
 * This module and that JSON file must stay in sync (a test asserts the JSON
 * parses to the same `OnboardingPreset` shape).
 *
 * Prices (in cents) match the original MVP menu:
 *   Salgados: Carne 750, Queijo 700, Frango 750, Pizza 800
 *   Doces:    Chocolate 800, Doce de Leite 800
 *   Bebidas:  Caldo de Cana 600, Refrigerante 500, Água 300
 *
 * Design: `.kiro/specs/multi-tenant-white-label/design.md` section 7.
 * Requirements: 9.6.
 */

import type { OnboardingPreset } from '../services/tenant-provision.service.js';

export const pastelDasMeninasPreset: OnboardingPreset = {
  categories: [
    {
      name: 'Pastéis Salgados',
      sortOrder: 1,
      items: [
        { name: 'Pastel de Carne', priceCents: 750 },
        { name: 'Pastel de Queijo', priceCents: 700 },
        { name: 'Pastel de Frango', priceCents: 750 },
        { name: 'Pastel de Pizza', priceCents: 800 },
      ],
    },
    {
      name: 'Pastéis Doces',
      sortOrder: 2,
      items: [
        { name: 'Pastel de Chocolate', priceCents: 800 },
        { name: 'Pastel de Doce de Leite', priceCents: 800 },
      ],
    },
    {
      name: 'Bebidas',
      sortOrder: 3,
      items: [
        { name: 'Caldo de Cana 300ml', priceCents: 600 },
        { name: 'Refrigerante Lata', priceCents: 500 },
        { name: 'Água Mineral', priceCents: 300 },
      ],
    },
  ],
};

export default pastelDasMeninasPreset;
