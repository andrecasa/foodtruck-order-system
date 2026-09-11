/**
 * Onboarding preset — cardápio genérico único.
 *
 * Este é o cardápio inicial (categorias + itens) aplicado AUTOMATICAMENTE a todos
 * os novos tenants criados via onboarding self-service (R6.7). Diferente do preset
 * "Pastel das Meninas" (específico do primeiro tenant), este é um cardápio genérico
 * e neutro — não escolhido pelo cliente no cadastro — servindo como ponto de partida
 * que o estabelecimento pode editar depois. É consumido pelo `Signup_Service` como
 * `menuPreset` na chamada a `provisionTenant` (ver `tenant-provision.service.ts`).
 *
 * O artefato JSON equivalente vive em `apps/backend/presets/generic-menu.json` e pode
 * ser passado ao CLI: `--menu-preset=./presets/generic-menu.json`. Este módulo e esse
 * arquivo JSON devem permanecer em sincronia (um teste assegura que o JSON parseia para
 * o mesmo formato `OnboardingPreset`), seguindo o mesmo padrão do par
 * `pastel-das-meninas.{json,ts}` existente.
 *
 * Design: `.kiro/specs/landing-onboarding/design.md` (seção de decisões — nome do
 * preset de cardápio genérico).
 * Requirements: 6.7.
 */

import type { OnboardingPreset } from '../services/tenant-provision.service.js';

export const genericMenuPreset: OnboardingPreset = {
  categories: [
    {
      name: 'Entradas',
      sortOrder: 1,
      items: [
        { name: 'Porção de Batata Frita', priceCents: 1500 },
        { name: 'Porção de Mandioca Frita', priceCents: 1500 },
        { name: 'Pastelzinho (6 unidades)', priceCents: 1800 },
      ],
    },
    {
      name: 'Pratos Principais',
      sortOrder: 2,
      items: [
        { name: 'Prato do Dia', priceCents: 2500 },
        { name: 'Sanduíche da Casa', priceCents: 2200 },
        { name: 'Hambúrguer Artesanal', priceCents: 2800 },
      ],
    },
    {
      name: 'Sobremesas',
      sortOrder: 3,
      items: [
        { name: 'Pudim', priceCents: 900 },
        { name: 'Brownie', priceCents: 1000 },
      ],
    },
    {
      name: 'Bebidas',
      sortOrder: 4,
      items: [
        { name: 'Refrigerante Lata', priceCents: 600 },
        { name: 'Suco Natural', priceCents: 800 },
        { name: 'Água Mineral', priceCents: 400 },
      ],
    },
  ],
};

export default genericMenuPreset;
