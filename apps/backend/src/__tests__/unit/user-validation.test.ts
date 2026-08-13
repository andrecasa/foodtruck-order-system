import { describe, it, expect } from 'vitest';
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  toggleStatusSchema,
  roleSchema,
} from '../../validation/user.validation.js';

describe('roleSchema', () => {
  it('accepts valid roles', () => {
    expect(roleSchema.parse('admin')).toBe('admin');
    expect(roleSchema.parse('atendente')).toBe('atendente');
    expect(roleSchema.parse('preparador')).toBe('preparador');
  });

  it('rejects invalid roles', () => {
    expect(() => roleSchema.parse('manager')).toThrow();
    expect(() => roleSchema.parse('')).toThrow();
  });
});

describe('createUserSchema', () => {
  const validInput = {
    name: 'João Silva',
    email: 'joao@example.com',
    password: 'senhaSegura123',
    role: 'admin' as const,
  };

  it('accepts valid input', () => {
    const result = createUserSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('rejects name with only spaces', () => {
    const result = createUserSchema.safeParse({ ...validInput, name: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = createUserSchema.safeParse({ ...validInput, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects name longer than 100 chars', () => {
    const result = createUserSchema.safeParse({ ...validInput, name: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('rejects email longer than 254 chars', () => {
    const longEmail = 'a'.repeat(250) + '@b.com';
    const result = createUserSchema.safeParse({ ...validInput, email: longEmail });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email format', () => {
    const result = createUserSchema.safeParse({ ...validInput, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects password shorter than 8 chars', () => {
    const result = createUserSchema.safeParse({ ...validInput, password: '1234567' });
    expect(result.success).toBe(false);
  });

  it('rejects password longer than 72 chars', () => {
    const result = createUserSchema.safeParse({ ...validInput, password: 'a'.repeat(73) });
    expect(result.success).toBe(false);
  });

  it('rejects invalid role', () => {
    const result = createUserSchema.safeParse({ ...validInput, role: 'gerente' });
    expect(result.success).toBe(false);
  });

  it('accepts name with exactly 1 char', () => {
    const result = createUserSchema.safeParse({ ...validInput, name: 'A' });
    expect(result.success).toBe(true);
  });

  it('accepts name with exactly 100 chars', () => {
    const result = createUserSchema.safeParse({ ...validInput, name: 'a'.repeat(100) });
    expect(result.success).toBe(true);
  });

  it('accepts email with exactly 254 chars', () => {
    // Build a valid email that is exactly 254 chars total
    // format: local@domain.com -> we need local + '@' + domain = 254
    const domain = 'b'.repeat(243) + '.com'; // 247 chars
    const local = 'a'.repeat(254 - 1 - domain.length); // 254 - '@' - domain
    const email254 = `${local}@${domain}`;
    expect(email254.length).toBe(254);
    const result = createUserSchema.safeParse({ ...validInput, email: email254 });
    expect(result.success).toBe(true);
  });

  it('accepts password with exactly 8 chars', () => {
    const result = createUserSchema.safeParse({ ...validInput, password: 'a'.repeat(8) });
    expect(result.success).toBe(true);
  });

  it('accepts password with exactly 72 chars', () => {
    const result = createUserSchema.safeParse({ ...validInput, password: 'a'.repeat(72) });
    expect(result.success).toBe(true);
  });

  it('rejects name with tab characters only', () => {
    const result = createUserSchema.safeParse({ ...validInput, name: '\t\t\t' });
    expect(result.success).toBe(false);
  });

  it('reports name in error when only name is missing', () => {
    const { name, ...withoutName } = validInput;
    const result = createUserSchema.safeParse(withoutName);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map(i => i.path[0]);
      expect(paths).toContain('name');
    }
  });

  it('reports email in error when only email is missing', () => {
    const { email, ...withoutEmail } = validInput;
    const result = createUserSchema.safeParse(withoutEmail);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map(i => i.path[0]);
      expect(paths).toContain('email');
    }
  });
});

describe('updateUserSchema', () => {
  it('accepts partial update with name only', () => {
    const result = updateUserSchema.safeParse({ name: 'Novo Nome' });
    expect(result.success).toBe(true);
  });

  it('accepts partial update with email only', () => {
    const result = updateUserSchema.safeParse({ email: 'novo@example.com' });
    expect(result.success).toBe(true);
  });

  it('accepts partial update with role only', () => {
    const result = updateUserSchema.safeParse({ role: 'atendente' });
    expect(result.success).toBe(true);
  });

  it('rejects empty object (no fields)', () => {
    const result = updateUserSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects name with only spaces', () => {
    const result = updateUserSchema.safeParse({ name: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = updateUserSchema.safeParse({ email: 'bad' });
    expect(result.success).toBe(false);
  });

  it('rejects body with unknown fields only', () => {
    const result = updateUserSchema.safeParse({ foo: 'bar' });
    expect(result.success).toBe(false);
  });

  it('accepts name with exactly 100 chars', () => {
    const result = updateUserSchema.safeParse({ name: 'a'.repeat(100) });
    expect(result.success).toBe(true);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts valid password', () => {
    const result = resetPasswordSchema.safeParse({ password: 'novaSenha1' });
    expect(result.success).toBe(true);
  });

  it('rejects password shorter than 8 chars', () => {
    const result = resetPasswordSchema.safeParse({ password: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects password longer than 72 chars', () => {
    const result = resetPasswordSchema.safeParse({ password: 'x'.repeat(73) });
    expect(result.success).toBe(false);
  });

  it('accepts password with exactly 8 chars', () => {
    const result = resetPasswordSchema.safeParse({ password: 'a'.repeat(8) });
    expect(result.success).toBe(true);
  });

  it('accepts password with exactly 72 chars', () => {
    const result = resetPasswordSchema.safeParse({ password: 'a'.repeat(72) });
    expect(result.success).toBe(true);
  });
});

describe('toggleStatusSchema', () => {
  it('accepts ativo', () => {
    const result = toggleStatusSchema.safeParse({ status: 'ativo' });
    expect(result.success).toBe(true);
  });

  it('accepts inativo', () => {
    const result = toggleStatusSchema.safeParse({ status: 'inativo' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = toggleStatusSchema.safeParse({ status: 'suspended' });
    expect(result.success).toBe(false);
  });
});
