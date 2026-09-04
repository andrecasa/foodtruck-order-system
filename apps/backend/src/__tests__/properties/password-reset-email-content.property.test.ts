import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Feature: forgot-password, Property 19: Mensagem de e-mail contém código e expiração
 *
 * Para qualquer Codigo_Verificacao, o corpo da mensagem de e-mail solicitada deve
 * conter o código e a instrução de que ele expira em 15 minutos.
 *
 * **Validates: Requirements 9.1**
 */

import {
  buildVerificationBody,
  buildVerificationMessage,
} from '../../services/email/email.service.js';

// Gerador de Codigo_Verificacao bem-formado: 6 dígitos, com zeros à esquerda permitidos.
const codeArb = fc
  .integer({ min: 0, max: 999_999 })
  .map((n) => n.toString().padStart(6, '0'));

// Gerador de endereço de destino não-vazio (formato de e-mail plausível).
const emailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9]{1,20}$/),
    fc.constantFrom('example.com', 'test.org', 'mail.dev', 'pastel.com.br'),
  )
  .map(([local, domain]) => `${local}@${domain}`);

describe('Feature: forgot-password, Property 19: Mensagem de e-mail contém código e expiração', () => {
  it('buildVerificationBody inclui o código e a instrução de expiração em 15 minutos', () => {
    fc.assert(
      fc.property(codeArb, (code) => {
        const body = buildVerificationBody(code);

        // O corpo deve conter o código exato.
        expect(body).toContain(code);
        // O corpo deve conter a instrução de expiração em 15 minutos.
        expect(body).toContain('15 minutos');
      }),
      { numRuns: 100 },
    );
  });

  it('buildVerificationMessage produz corpo com o código e a expiração em 15 minutos', () => {
    fc.assert(
      fc.property(emailArb, codeArb, (to, code) => {
        const message = buildVerificationMessage(to, code);

        // Destinatário coerente com o solicitado.
        expect(message.to).toBe(to);
        // Assunto não-vazio.
        expect(message.subject.length).toBeGreaterThan(0);
        // Corpo contém o código e a instrução de expiração em 15 minutos.
        expect(message.body).toContain(code);
        expect(message.body).toContain('15 minutos');
      }),
      { numRuns: 100 },
    );
  });
});
