import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  RetryingEmailService,
  MAX_SEND_ATTEMPTS,
  RETRY_INTERVAL_MS,
  type EmailProvider,
  type EmailMessage,
} from '../../services/email/email.service.js';

/**
 * Feature: forgot-password, Property 20: Política de retry de envio
 *
 * Para qualquer falha temporária de envio, o Servico_Email deve ser acionado
 * no máximo 3 vezes, com intervalo mínimo de 2 segundos entre tentativas,
 * parando assim que uma tentativa for aceita.
 *
 * Validates: Requirements 9.2
 */
describe('RetryingEmailService — política de retry (Property 20)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Silencia os logs internos de falha para não poluir a saída do teste.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /**
   * Provedor de e-mail controlado: falha nas primeiras `failuresBeforeSuccess`
   * tentativas e depois aceita. Registra o timestamp (relógio falso) de cada
   * tentativa para permitir verificar o espaçamento mínimo.
   */
  function makeProvider(failuresBeforeSuccess: number): {
    provider: EmailProvider;
    attemptTimestamps: number[];
  } {
    const attemptTimestamps: number[] = [];
    let calls = 0;

    const provider: EmailProvider = {
      async send(_message: EmailMessage): Promise<void> {
        attemptTimestamps.push(Date.now());
        calls += 1;
        if (calls <= failuresBeforeSuccess) {
          throw new Error('falha temporária de envio');
        }
      },
    };

    return { provider, attemptTimestamps };
  }

  /**
   * Executa toda a orquestração de retry até drenar os timers pendentes,
   * avançando o relógio falso o suficiente para cobrir todos os intervalos.
   */
  async function runToCompletion(): Promise<void> {
    // Cada intervalo entre tentativas é RETRY_INTERVAL_MS; no máximo há
    // (MAX_SEND_ATTEMPTS - 1) intervalos. Avançamos com folga e drenamos.
    for (let i = 0; i < MAX_SEND_ATTEMPTS; i++) {
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
    }
    await vi.runAllTimersAsync();
  }

  it('aciona no máximo 3 vezes, com >= 2s entre tentativas, parando na primeira aceita', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Quantidade de falhas antes de uma tentativa ser aceita.
        // 0..MAX-1 => acaba aceitando; MAX => todas falham (nunca aceita).
        fc.integer({ min: 0, max: MAX_SEND_ATTEMPTS }),
        fc.emailAddress(),
        fc.stringMatching(/^[0-9]{6}$/),
        async (failuresBeforeSuccess, to, code) => {
          const { provider, attemptTimestamps } = makeProvider(failuresBeforeSuccess);
          const onAllAttemptsFailed = vi.fn().mockResolvedValue(undefined);
          const service = new RetryingEmailService(provider);

          service.sendVerificationCode({ to, code, onAllAttemptsFailed });
          await runToCompletion();

          const attempts = attemptTimestamps.length;

          // (1) Nunca aciona mais que o máximo permitido.
          expect(attempts).toBeLessThanOrEqual(MAX_SEND_ATTEMPTS);

          // (2) Para na primeira tentativa aceita: se a tentativa k é aceita,
          // não há tentativas subsequentes.
          const willEventuallySucceed = failuresBeforeSuccess < MAX_SEND_ATTEMPTS;
          if (willEventuallySucceed) {
            // Tentou exatamente até a primeira que teria sucesso.
            expect(attempts).toBe(failuresBeforeSuccess + 1);
            // Não invalida o código quando o envio acaba aceito.
            expect(onAllAttemptsFailed).not.toHaveBeenCalled();
          } else {
            // Todas as tentativas falharam: usou o máximo e invalidou o código.
            expect(attempts).toBe(MAX_SEND_ATTEMPTS);
            expect(onAllAttemptsFailed).toHaveBeenCalledTimes(1);
          }

          // (3) Intervalo mínimo de 2s entre tentativas consecutivas.
          for (let i = 1; i < attemptTimestamps.length; i++) {
            const gap = attemptTimestamps[i] - attemptTimestamps[i - 1];
            expect(gap).toBeGreaterThanOrEqual(RETRY_INTERVAL_MS);
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
