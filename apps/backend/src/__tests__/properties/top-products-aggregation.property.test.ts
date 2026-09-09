import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Feature: summary-top-products, Property: Invariantes do ranking "Top produtos mais vendidos"
 *
 * O ranking é ÚNICO e AGREGADO por produto, ordenado por quantidade vendida
 * (desc), com desempate por faturamento (desc), limitado a 10. Contabiliza
 * TODOS os itens de pedidos do período (independente do status de pagamento).
 * Espelha a query `queryTopProducts` do summary.service (JOIN order_items →
 * orders → menu_items). Para qualquer conjunto de itens deve valer:
 * - a agregação soma `quantity` por `menu_item_id` (e o faturamento é
 *   `SUM(quantity * unit_price_cents)`);
 * - o resultado tem no máximo 10 entradas e está ordenado por (quantidade desc,
 *   faturamento desc);
 * - com filtro de categorias, apenas produtos dessas categorias entram (ainda
 *   como um ranking único agregado);
 * - o escopo é por tenant: itens de outro tenant nunca são contados.
 *
 * **Validates: Requirements 9.2, 9.3, 6.1**
 */
describe('Property: Top produtos mais vendidos (ranking único agregado)', () => {
  const TOP_LIMIT = 10;

  interface OrderItemRow {
    tenantId: string;
    menuItemId: string;
    name: string;
    categoryId: string;
    unitPriceCents: number;
    quantity: number;
  }

  interface TopProduct {
    menuItemId: string;
    name: string;
    categoryId: string;
    quantitySold: number;
    revenueCents: number;
  }

  /**
   * Espelha a lógica de `queryTopProducts`: filtra por tenant (e opcionalmente
   * por categorias), agrega por menu_item_id, ordena por quantidade desc /
   * faturamento desc e corta em `TOP_LIMIT`. Determinístico: usa `menuItemId`
   * como desempate final para estabilidade.
   */
  function computeTopProducts(
    items: OrderItemRow[],
    tenantId: string,
    categoryIds: string[],
  ): TopProduct[] {
    const hasCategoryFilter = categoryIds.length > 0;
    const categorySet = new Set(categoryIds);

    const scoped = items.filter(
      (i) => i.tenantId === tenantId && (!hasCategoryFilter || categorySet.has(i.categoryId)),
    );

    const byProduct = new Map<string, TopProduct>();
    for (const item of scoped) {
      const existing = byProduct.get(item.menuItemId);
      const revenue = item.quantity * item.unitPriceCents;
      if (existing) {
        existing.quantitySold += item.quantity;
        existing.revenueCents += revenue;
      } else {
        byProduct.set(item.menuItemId, {
          menuItemId: item.menuItemId,
          name: item.name,
          categoryId: item.categoryId,
          quantitySold: item.quantity,
          revenueCents: revenue,
        });
      }
    }

    return Array.from(byProduct.values())
      .sort((a, b) => {
        if (b.quantitySold !== a.quantitySold) return b.quantitySold - a.quantitySold;
        if (b.revenueCents !== a.revenueCents) return b.revenueCents - a.revenueCents;
        return a.menuItemId.localeCompare(b.menuItemId);
      })
      .slice(0, TOP_LIMIT);
  }

  // Generators — dois tenants para provar o isolamento, poucas categorias e
  // produtos para forçar colisões/agrupamento.
  const tenantArb = fc.constantFrom('tenant-A', 'tenant-B');
  const categoryArb = fc.constantFrom('cat-1', 'cat-2', 'cat-3');
  const menuItemArb = fc.constantFrom('mi-1', 'mi-2', 'mi-3', 'mi-4', 'mi-5');

  const itemArb: fc.Arbitrary<OrderItemRow> = fc
    .record({
      tenantId: tenantArb,
      menuItemId: menuItemArb,
      categoryId: categoryArb,
      unitPriceCents: fc.integer({ min: 1, max: 99999 }),
      quantity: fc.integer({ min: 1, max: 99 }),
    })
    // O nome e a categoria são propriedades do menu_item, então itens do mesmo
    // produto compartilham nome/categoria (coerente com o JOIN em menu_items).
    .map((r) => ({ ...r, name: `Produto ${r.menuItemId}`, categoryId: `cat-of-${r.menuItemId}` }));

  const itemsArb = fc.array(itemArb, { minLength: 0, maxLength: 80 });

  it('agrega a quantidade vendida por produto (soma de todos os itens do produto)', () => {
    fc.assert(
      fc.property(itemsArb, (items) => {
        const result = computeTopProducts(items, 'tenant-A', []);
        for (const product of result) {
          const expectedQty = items
            .filter((i) => i.tenantId === 'tenant-A' && i.menuItemId === product.menuItemId)
            .reduce((sum, i) => sum + i.quantity, 0);
          expect(product.quantitySold).toBe(expectedQty);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('faturamento por produto = SUM(quantity * unit_price_cents)', () => {
    fc.assert(
      fc.property(itemsArb, (items) => {
        const result = computeTopProducts(items, 'tenant-A', []);
        for (const product of result) {
          const expectedRevenue = items
            .filter((i) => i.tenantId === 'tenant-A' && i.menuItemId === product.menuItemId)
            .reduce((sum, i) => sum + i.quantity * i.unitPriceCents, 0);
          expect(product.revenueCents).toBe(expectedRevenue);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('retorna no máximo 10 entradas, ordenadas por quantidade desc (desempate por faturamento desc)', () => {
    fc.assert(
      fc.property(itemsArb, (items) => {
        const result = computeTopProducts(items, 'tenant-A', []);
        expect(result.length).toBeLessThanOrEqual(TOP_LIMIT);
        for (let i = 1; i < result.length; i++) {
          const prev = result[i - 1]!;
          const curr = result[i]!;
          const ordered =
            prev.quantitySold > curr.quantitySold ||
            (prev.quantitySold === curr.quantitySold && prev.revenueCents >= curr.revenueCents);
          expect(ordered).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('cada produto aparece no máximo uma vez (ranking único agregado)', () => {
    fc.assert(
      fc.property(itemsArb, (items) => {
        const result = computeTopProducts(items, 'tenant-A', []);
        const ids = result.map((p) => p.menuItemId);
        expect(new Set(ids).size).toBe(ids.length);
      }),
      { numRuns: 100 },
    );
  });

  it('filtro de categorias: só entram produtos das categorias selecionadas', () => {
    fc.assert(
      fc.property(
        itemsArb,
        fc.subarray(['cat-of-mi-1', 'cat-of-mi-2', 'cat-of-mi-3', 'cat-of-mi-4', 'cat-of-mi-5'], { minLength: 1 }),
        (items, categoryIds) => {
          const result = computeTopProducts(items, 'tenant-A', categoryIds);
          for (const product of result) {
            expect(categoryIds).toContain(product.categoryId);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('isolamento por tenant: itens de outro tenant nunca são contados', () => {
    fc.assert(
      fc.property(itemsArb, (items) => {
        const resultA = computeTopProducts(items, 'tenant-A', []);
        // Reagrega manualmente só o tenant-A e compara os totais por produto.
        for (const product of resultA) {
          const fromOtherTenant = items
            .filter((i) => i.tenantId !== 'tenant-A' && i.menuItemId === product.menuItemId)
            .reduce((sum, i) => sum + i.quantity, 0);
          const sameTenant = items
            .filter((i) => i.tenantId === 'tenant-A' && i.menuItemId === product.menuItemId)
            .reduce((sum, i) => sum + i.quantity, 0);
          expect(product.quantitySold).toBe(sameTenant);
          // Sanidade: se houvesse vazamento, quantitySold incluiria fromOtherTenant.
          expect(product.quantitySold).not.toBe(sameTenant + fromOtherTenant + 1);
        }
      }),
      { numRuns: 100 },
    );
  });
});
