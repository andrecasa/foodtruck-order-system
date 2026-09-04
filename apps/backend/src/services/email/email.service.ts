/**
 * EmailService — abstração de envio de e-mail com envio assíncrono (fire-and-forget)
 * e política de retry, para a feature de recuperação de senha (forgot-password).
 *
 * Restrições de projeto (design.md — "Backend — EmailService"):
 * - O envio é assíncrono para não bloquear a resposta de 5s do endpoint de solicitação.
 * - Retry: até 3 tentativas, com intervalo mínimo de 2s entre elas, parando na primeira aceita.
 * - Em falha total, executa `onAllAttemptsFailed` (invalida o código) e registra log interno
 *   sem expor a causa ao chamador. NUNCA lança para o chamador.
 * - O corpo da mensagem inclui o código e a instrução de expiração em 15 minutos.
 */

import { renderVerificationEmail } from './templates/verification-email.js';
import { SmtpEmailProvider } from './smtp-email.provider.js';
import { loadSmtpConfig } from './smtp-config.js';

/** Número máximo de tentativas de envio (R9.2). */
export const MAX_SEND_ATTEMPTS = 3;

/** Intervalo mínimo, em milissegundos, entre tentativas de envio (R9.2). */
export const RETRY_INTERVAL_MS = 2_000;

export interface EmailMessage {
  to: string;
  subject: string;
  /** Corpo em texto puro — fallback SEMPRE presente. */
  body: string;
  /**
   * Corpo HTML opcional. Quando presente e não vazio, o provedor envia a
   * mensagem em formato multipart (HTML + texto); quando ausente, o envio é
   * somente-texto (comportamento anterior preservado). Extensão retrocompatível:
   * `NoopEmailProvider`/`LoggingEmailProvider` e mensagens somente-texto
   * continuam válidos sem alteração.
   */
  html?: string;
}

/** Contrato do provedor de e-mail. Uma tentativa de envio; lança em falha. */
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

export interface EmailService {
  /**
   * Envia o código de forma assíncrona com retry (até 3 tentativas,
   * >= 2s entre elas). NÃO lança para o chamador. Em falha total,
   * executa onAllAttemptsFailed (invalida o código) e registra log.
   */
  sendVerificationCode(params: {
    to: string;
    code: string;
    onAllAttemptsFailed: () => Promise<void>;
  }): void;
}

/** Assunto padrão da mensagem de verificação. */
const VERIFICATION_SUBJECT = 'Código de verificação para redefinir sua senha';

/**
 * Monta o corpo da mensagem de verificação. Inclui o código e a instrução de
 * que ele expira em 15 minutos (R9.1).
 */
export function buildVerificationBody(code: string): string {
  return `Seu código de verificação é ${code}. Ele expira em 15 minutos.`;
}

/** Monta a `EmailMessage` completa de verificação de código. */
export function buildVerificationMessage(to: string, code: string): EmailMessage {
  const { text, html } = renderVerificationEmail(code);
  return {
    to,
    subject: VERIFICATION_SUBJECT,
    body: text, // texto puro via buildVerificationBody (fallback SEMPRE presente)
    html, // HTML renderizado do Template_Email
  };
}

/** Promessa que resolve após `ms` milissegundos (compatível com timers falsos). */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Provedor que descarta a mensagem silenciosamente. Mantém o fluxo funcional
 * quando nenhum provedor real está configurado.
 */
export class NoopEmailProvider implements EmailProvider {
  async send(_message: EmailMessage): Promise<void> {
    // Intencionalmente sem efeito.
  }
}

/**
 * Provedor que apenas registra a tentativa de envio em log (útil em
 * desenvolvimento). Não faz entrega real; nunca expõe o código em produção.
 */
export class LoggingEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    console.info(
      `[EmailService] (dev) e-mail de verificação para ${message.to} — assunto: "${message.subject}"`,
    );
  }
}

/**
 * Implementação de `EmailService` que orquestra o envio assíncrono com retry.
 */
export class RetryingEmailService implements EmailService {
  constructor(private readonly provider: EmailProvider) {}

  sendVerificationCode(params: {
    to: string;
    code: string;
    onAllAttemptsFailed: () => Promise<void>;
  }): void {
    const message = buildVerificationMessage(params.to, params.code);

    // Fire-and-forget: dispara a orquestração sem que o chamador aguarde ou receba exceção.
    void this.deliverWithRetry(message, params.onAllAttemptsFailed);
  }

  private async deliverWithRetry(
    message: EmailMessage,
    onAllAttemptsFailed: () => Promise<void>,
  ): Promise<void> {
    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
      try {
        await this.provider.send(message);
        // Para na primeira tentativa aceita.
        return;
      } catch {
        // Não expõe a causa; apenas registra internamente o número da tentativa.
        console.error(
          `[EmailService] falha na tentativa ${attempt} de ${MAX_SEND_ATTEMPTS} ao enviar código de verificação.`,
        );

        // Aguarda o intervalo mínimo apenas se ainda houver tentativas restantes.
        if (attempt < MAX_SEND_ATTEMPTS) {
          await delay(RETRY_INTERVAL_MS);
        }
      }
    }

    // Todas as tentativas falharam: invalida o código e registra o log interno.
    try {
      await onAllAttemptsFailed();
    } catch {
      console.error('[EmailService] falha ao invalidar o código após esgotar as tentativas de envio.');
    }

    console.error(
      '[EmailService] envio do código de verificação falhou após todas as tentativas; código invalidado.',
    );
  }
}

/**
 * Seleciona o provedor de e-mail conforme a variável de ambiente `EMAIL_PROVIDER`.
 * Enquanto nenhum provedor real estiver configurado, usa o `LoggingEmailProvider`
 * em desenvolvimento e o `NoopEmailProvider` como padrão silencioso.
 */
export function resolveEmailProvider(
  providerName: string | undefined = process.env.EMAIL_PROVIDER,
): EmailProvider {
  switch ((providerName ?? '').toLowerCase()) {
    case 'smtp':
      return new SmtpEmailProvider(loadSmtpConfig()); // fail-fast se config inválida
    case 'logging':
      return new LoggingEmailProvider();
    case 'noop':
    case '':
      return new NoopEmailProvider();
    default:
      console.warn(
        `[EmailService] EMAIL_PROVIDER "${providerName}" não reconhecido; usando NoopEmailProvider.`,
      );
      return new NoopEmailProvider();
  }
}

/** Instância padrão do serviço de e-mail, com o provedor resolvido por ambiente. */
export const emailService: EmailService = new RetryingEmailService(resolveEmailProvider());
