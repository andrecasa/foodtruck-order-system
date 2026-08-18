import { describe, it, expect } from 'vitest';
import {
  createOrderRequestSchema,
  updateOrderStatusRequestSchema,
  updateOrderItemsRequestSchema,
} from '../validators/order.validator';
import {
  createMenuItemRequestSchema,
  updateMenuItemRequestSchema,
} from '../validators/menu.validator';
import { registerPaymentRequestSchema } from '../validators/payment.validator';
import {
  createCategoryRequestSchema,
  updateCategoryRequestSchema,
  reorderCategoriesRequestSchema,
} from '../validators/category.validator';

// ─── Order Validators ───────────────────────────────────────────────────────

describe('createOrderRequestSchema', () => {
  const validOrder = {
    customerName: 'João',
    origin: 'presencial' as const,
    items: [{ menuItemId: '550e8400-e29b-41d4-a716-446655440000', quantity: 2 }],
  };

  it('accepts valid order', () => {
    expect(createOrderRequestSchema.safeParse(validOrder).success).toBe(true);
  });

  it('rejects empty customerName', () => {
    const result = createOrderRequestSchema.safeParse({ ...validOrder, customerName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects customerName over 100 chars', () => {
    const result = createOrderRequestSchema.safeParse({ ...validOrder, customerName: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('rejects invalid origin', () => {
    const result = createOrderRequestSchema.safeParse({ ...validOrder, origin: 'telefone' });
    expect(result.success).toBe(false);
  });

  it('rejects empty items array', () => {
    const result = createOrderRequestSchema.safeParse({ ...validOrder, items: [] });
    expect(result.success).toBe(false);
  });

  it('rejects quantity 0', () => {
    const result = createOrderRequestSchema.safeParse({
      ...validOrder,
      items: [{ menuItemId: '550e8400-e29b-41d4-a716-446655440000', quantity: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects quantity over 99', () => {
    const result = createOrderRequestSchema.safeParse({
      ...validOrder,
      items: [{ menuItemId: '550e8400-e29b-41d4-a716-446655440000', quantity: 100 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid menuItemId', () => {
    const result = createOrderRequestSchema.safeParse({
      ...validOrder,
      items: [{ menuItemId: 'not-a-uuid', quantity: 1 }],
    });
    expect(result.success).toBe(false);
  });
});

describe('updateOrderStatusRequestSchema', () => {
  it('accepts all valid statuses', () => {
    for (const status of ['aguardando', 'preparando', 'pronto', 'entregue']) {
      expect(updateOrderStatusRequestSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    expect(updateOrderStatusRequestSchema.safeParse({ status: 'cancelado' }).success).toBe(false);
  });
});

describe('updateOrderItemsRequestSchema', () => {
  const validItems = {
    items: [{ menuItemId: '550e8400-e29b-41d4-a716-446655440000', quantity: 1 }],
  };

  it('accepts valid items', () => {
    expect(updateOrderItemsRequestSchema.safeParse(validItems).success).toBe(true);
  });

  it('accepts optional customerName', () => {
    const result = updateOrderItemsRequestSchema.safeParse({ ...validItems, customerName: 'Maria' });
    expect(result.success).toBe(true);
  });

  it('accepts optional origin', () => {
    const result = updateOrderItemsRequestSchema.safeParse({ ...validItems, origin: 'whatsapp' });
    expect(result.success).toBe(true);
  });

  it('rejects empty items', () => {
    expect(updateOrderItemsRequestSchema.safeParse({ items: [] }).success).toBe(false);
  });

  it('rejects more than 50 items', () => {
    const items = Array.from({ length: 51 }, (_, i) => ({
      menuItemId: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
      quantity: 1,
    }));
    expect(updateOrderItemsRequestSchema.safeParse({ items }).success).toBe(false);
  });

  it('rejects duplicate menuItemIds', () => {
    const items = [
      { menuItemId: '550e8400-e29b-41d4-a716-446655440000', quantity: 1 },
      { menuItemId: '550e8400-e29b-41d4-a716-446655440000', quantity: 2 },
    ];
    expect(updateOrderItemsRequestSchema.safeParse({ items }).success).toBe(false);
  });
});

// ─── Menu Validators ────────────────────────────────────────────────────────

describe('createMenuItemRequestSchema', () => {
  const validItem = { name: 'Pastel de Carne', price: 750, category: 'Salgados' };

  it('accepts valid menu item', () => {
    expect(createMenuItemRequestSchema.safeParse(validItem).success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(createMenuItemRequestSchema.safeParse({ ...validItem, name: '' }).success).toBe(false);
  });

  it('rejects name over 100 chars', () => {
    expect(createMenuItemRequestSchema.safeParse({ ...validItem, name: 'a'.repeat(101) }).success).toBe(false);
  });

  it('rejects price 0', () => {
    expect(createMenuItemRequestSchema.safeParse({ ...validItem, price: 0 }).success).toBe(false);
  });

  it('rejects price over 999999', () => {
    expect(createMenuItemRequestSchema.safeParse({ ...validItem, price: 1000000 }).success).toBe(false);
  });

  it('rejects non-integer price', () => {
    expect(createMenuItemRequestSchema.safeParse({ ...validItem, price: 7.5 }).success).toBe(false);
  });

  it('rejects empty category', () => {
    expect(createMenuItemRequestSchema.safeParse({ ...validItem, category: '' }).success).toBe(false);
  });
});

describe('updateMenuItemRequestSchema', () => {
  it('accepts empty update (all optional)', () => {
    expect(updateMenuItemRequestSchema.safeParse({}).success).toBe(true);
  });

  it('accepts partial name update', () => {
    expect(updateMenuItemRequestSchema.safeParse({ name: 'Novo Nome' }).success).toBe(true);
  });

  it('accepts partial price update', () => {
    expect(updateMenuItemRequestSchema.safeParse({ price: 800 }).success).toBe(true);
  });

  it('rejects invalid price in update', () => {
    expect(updateMenuItemRequestSchema.safeParse({ price: -1 }).success).toBe(false);
  });
});

// ─── Payment Validator ──────────────────────────────────────────────────────

describe('registerPaymentRequestSchema', () => {
  it('accepts dinheiro', () => {
    expect(registerPaymentRequestSchema.safeParse({ paymentMethod: 'dinheiro' }).success).toBe(true);
  });

  it('accepts pix', () => {
    expect(registerPaymentRequestSchema.safeParse({ paymentMethod: 'pix' }).success).toBe(true);
  });

  it('accepts cartão', () => {
    expect(registerPaymentRequestSchema.safeParse({ paymentMethod: 'cartão' }).success).toBe(true);
  });

  it('rejects invalid payment method', () => {
    expect(registerPaymentRequestSchema.safeParse({ paymentMethod: 'cheque' }).success).toBe(false);
  });

  it('rejects missing paymentMethod', () => {
    expect(registerPaymentRequestSchema.safeParse({}).success).toBe(false);
  });
});

// ─── Category Validators ────────────────────────────────────────────────────

describe('createCategoryRequestSchema', () => {
  it('accepts valid name', () => {
    const result = createCategoryRequestSchema.safeParse({ name: 'Bebidas' });
    expect(result.success).toBe(true);
  });

  it('trims whitespace', () => {
    const result = createCategoryRequestSchema.safeParse({ name: '  Bebidas  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Bebidas');
    }
  });

  it('rejects empty name', () => {
    expect(createCategoryRequestSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects whitespace-only name', () => {
    expect(createCategoryRequestSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects name over 100 chars', () => {
    expect(createCategoryRequestSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false);
  });
});

describe('updateCategoryRequestSchema', () => {
  it('accepts valid name', () => {
    expect(updateCategoryRequestSchema.safeParse({ name: 'Doces' }).success).toBe(true);
  });

  it('trims whitespace', () => {
    const result = updateCategoryRequestSchema.safeParse({ name: ' Doces ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Doces');
    }
  });

  it('rejects empty name', () => {
    expect(updateCategoryRequestSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('reorderCategoriesRequestSchema', () => {
  it('accepts valid UUID array', () => {
    const result = reorderCategoriesRequestSchema.safeParse({
      categoryIds: ['550e8400-e29b-41d4-a716-446655440000'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty array', () => {
    expect(reorderCategoriesRequestSchema.safeParse({ categoryIds: [] }).success).toBe(false);
  });

  it('rejects non-UUID strings', () => {
    expect(reorderCategoriesRequestSchema.safeParse({ categoryIds: ['not-uuid'] }).success).toBe(false);
  });
});
