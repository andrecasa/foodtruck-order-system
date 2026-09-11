import { describe, it, expect } from 'vitest';

import {
  RESERVED_SLUGS,
  isReservedSlug,
  normalizePhone,
  PHONE_E164_PATTERN,
} from '../../validation/signup-slug.util.js';

/**
 * Tarefa 6.2 — util compartilhado de slug reservado e normalização de telefone.
 *
 * Garante que `RESERVED_SLUGS` é a fonte única da verdade (mesmo conjunto antes
 * definido em `tenant-provision.service.ts`) e que `normalizePhone` prepara a
 * entrada para o formato E.164 flexível BR usado pela validação do cadastro.
 *
 * **Validates: Requirements 4.5, 3.4**
 */

describe('Reserved_Slugs (R4.5)', () => {
  const EXPECTED = [
    'api',
    'admin',
    'health',
    'webhook',
    'static',
    'assets',
    'public',
    'login',
    'queue',
  ];

  it('expõe exatamente o conjunto de slugs reservados esperado', () => {
    expect([...RESERVED_SLUGS].sort()).toEqual([...EXPECTED].sort());
  });

  it('isReservedSlug reconhece cada slug reservado', () => {
    for (const slug of EXPECTED) {
      expect(isReservedSlug(slug)).toBe(true);
    }
  });

  it('isReservedSlug não marca slugs comuns como reservados', () => {
    for (const slug of ['pastel-das-meninas', 'minha-loja', 'burger', 'apiz', 'admin-2']) {
      expect(isReservedSlug(slug)).toBe(false);
    }
  });
});

describe('normalizePhone (R3.4)', () => {
  it('remove espaços, parênteses e hífens preservando o + inicial', () => {
    expect(normalizePhone('+55 (11) 99999-1234')).toBe('+5511999991234');
  });

  it('normaliza número sem código do país mantendo apenas dígitos', () => {
    expect(normalizePhone('(11) 3333-4444')).toBe('1133334444');
  });

  it('mantém string já normalizada inalterada', () => {
    expect(normalizePhone('+5511999991234')).toBe('+5511999991234');
  });

  it('produz valor que casa com o padrão E.164 flexível BR para entradas válidas', () => {
    const valid = ['+55 (11) 99999-1234', '11 99999-1234', '(21) 3333-4444'];
    for (const raw of valid) {
      expect(PHONE_E164_PATTERN.test(normalizePhone(raw))).toBe(true);
    }
  });

  it('não force valores inválidos a casarem com o padrão', () => {
    // Começa com 0 (inválido para E.164) e curto demais.
    expect(PHONE_E164_PATTERN.test(normalizePhone('(011) 1234'))).toBe(false);
  });
});
