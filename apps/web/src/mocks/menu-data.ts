import type { MenuItem } from '@order-system/shared';

export const CATEGORIES = ['Pastéis Salgados', 'Pastéis Doces', 'Bebidas'] as const;

export type Category = (typeof CATEGORIES)[number];

const now = '2024-01-15T10:00:00.000Z';

export const menuItems: MenuItem[] = [
  // Pastéis Salgados
  {
    id: 'menu-001',
    name: 'Pastel de Carne',
    price: 1200,
    category: 'Pastéis Salgados',
    status: 'ativo',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'menu-002',
    name: 'Pastel de Queijo',
    price: 1000,
    category: 'Pastéis Salgados',
    status: 'ativo',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'menu-003',
    name: 'Pastel de Frango com Catupiry',
    price: 1400,
    category: 'Pastéis Salgados',
    status: 'ativo',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'menu-004',
    name: 'Pastel de Pizza',
    price: 1300,
    category: 'Pastéis Salgados',
    status: 'ativo',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'menu-005',
    name: 'Pastel de Palmito',
    price: 1200,
    category: 'Pastéis Salgados',
    status: 'inativo',
    createdAt: now,
    updatedAt: now,
  },
  // Pastéis Doces
  {
    id: 'menu-006',
    name: 'Pastel de Chocolate',
    price: 1000,
    category: 'Pastéis Doces',
    status: 'ativo',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'menu-007',
    name: 'Pastel de Romeu e Julieta',
    price: 1100,
    category: 'Pastéis Doces',
    status: 'ativo',
    createdAt: now,
    updatedAt: now,
  },
  // Bebidas
  {
    id: 'menu-008',
    name: 'Caldo de Cana',
    price: 800,
    category: 'Bebidas',
    status: 'ativo',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'menu-009',
    name: 'Refrigerante Lata',
    price: 600,
    category: 'Bebidas',
    status: 'ativo',
    createdAt: now,
    updatedAt: now,
  },
];

/** Only items with status 'ativo' */
export const activeMenuItems = menuItems.filter((item) => item.status === 'ativo');

/** Menu items grouped by category */
export const menuByCategory = CATEGORIES.reduce(
  (acc, category) => {
    acc[category] = activeMenuItems.filter((item) => item.category === category);
    return acc;
  },
  {} as Record<Category, MenuItem[]>,
);
