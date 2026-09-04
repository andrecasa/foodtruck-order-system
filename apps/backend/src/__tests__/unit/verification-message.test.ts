import { describe, it, expect } from 'vitest';

/**
 * Testes de exemplo para a montagem da mensagem de verificação
 * (`buildVerificationMessage`).
 *
 * Verificam que a mensagem montada carrega o remetente/assunto corretos e que
 * ela produz tanto o corpo em texto puro (via `buildVerificationBody`, fallback
 * SEMPRE presente) quanto o corpo HTML renderizado, ambos contendo o código.
 *
 * **Validates: Requirements 4.4, 4.5**
 */

import {
  buildVerificationMessage,
  buildVerificationBody,
} from '../../services/email/email.service.js';
import { renderVerificationEmail } from '../../services/email/templates/verification-email.js';

const TO = 'usuario@example.com';
const CODE = '123456';

describe('buildVerificationMessage', () => {
  it('preserva o destinatário e usa o assunto de verificação', () => {
    const message = buildVerificationMessage(TO, CODE);

    expect(message.to).toBe(TO);
    expect(message.subject).toBe('Código de verificação para redefinir sua senha');
  });

  it('define o body como o texto puro de buildVerificationBody (fallback) (R4.4)', () => {
    const message = buildVerificationMessage(TO, CODE);

    expect(message.body).toBe(buildVerificationBody(CODE));
    expect(message.body).toContain(CODE);
  });

  it('define o html como o HTML renderizado do template (R4.5)', () => {
    const message = buildVerificationMessage(TO, CODE);
    const { html } = renderVerificationEmail(CODE);

    expect(message.html).toBe(html);
    expect(message.html).toBeTruthy();
  });

  it('inclui o código tanto no corpo em texto quanto no HTML (R4.4, R4.5)', () => {
    const message = buildVerificationMessage(TO, CODE);

    expect(message.body).toContain(CODE);
    expect(message.html).toContain(CODE);
  });

  it('inclui a indicação de expiração de 15 minutos no texto e no HTML (R4.5)', () => {
    const message = buildVerificationMessage(TO, CODE);

    expect(message.body).toContain('15');
    expect(message.html).toContain('15');
  });
});
