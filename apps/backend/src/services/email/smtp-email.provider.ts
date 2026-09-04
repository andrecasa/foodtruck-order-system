/**
 * SmtpEmailProvider — implementação concreta do contrato `EmailProvider` que
 * entrega mensagens através de um servidor SMTP genérico via `nodemailer`.
 *
 * Contrato (design.md — "Backend — SmtpEmailProvider"):
 * - Uma tentativa por chamada de `send` (R3.1). A repetição é responsabilidade
 *   exclusiva do `RetryingEmailService`.
 * - Sucesso: se `sendMail` resolve, `send` resolve (R3.2, R4.3).
 * - Falha: qualquer rejeição de `sendMail` propaga como `throw`, disparando o
 *   retry existente (R3.3).
 * - Multipart: `body`→`text` sempre; `html`→`html` SOMENTE quando presente e
 *   não vazio (R3.5, R3.6, R4.2).
 * - `from` vem da `Configuracao_SMTP` (`SMTP_FROM`) (R3.4, R4.1).
 *
 * Segurança (R6.1–R6.5): logs de erro nunca incluem `SMTP_PASS`/credenciais, e
 * em `NODE_ENV=production` também omitem corpo (texto/HTML) e código. O
 * diagnóstico mínimo (host + código/resposta SMTP quando houver) é suficiente
 * para investigação sem vazar segredos.
 *
 * ESM com sufixo `.js` nos imports, como no restante de `apps/backend`.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailProvider, EmailMessage } from './email.service.js';
import type { SmtpConfig } from './smtp-config.js';

/**
 * Erro de SMTP com os campos de diagnóstico expostos pelo `nodemailer`/Node.
 * Usado apenas para leitura tolerante em `logSmtpError` (sem depender do tipo
 * concreto do erro capturado).
 */
interface SmtpErrorLike {
  code?: unknown;
  responseCode?: unknown;
  response?: unknown;
  message?: unknown;
}

/**
 * Provedor de e-mail baseado em SMTP genérico (nodemailer).
 * Implementa o contrato EmailProvider: uma tentativa por chamada de `send`;
 * lança em falha para que o `RetryingEmailService` aplique a política de retry.
 */
export class SmtpEmailProvider implements EmailProvider {
  private readonly transport: Transporter;
  private readonly from: string;
  private readonly host: string;

  constructor(config: SmtpConfig) {
    this.from = config.from;
    this.host = config.host;
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure, // R2.4: true = TLS implícito; false = STARTTLS
      auth: { user: config.user, pass: config.pass },
    });
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.from, // R3.4 / R4.1: remetente da Configuracao_SMTP
        to: message.to, // preserva integralmente (R4.2)
        subject: message.subject, // preserva integralmente (R4.2)
        text: message.body, // corpo em texto puro — fallback SEMPRE presente (R3.5, R4.2)
        // R3.5/R3.6: inclui a parte HTML apenas quando presente e não vazia;
        // caso contrário, envio somente-texto (comportamento anterior preservado).
        ...(message.html && message.html.length > 0 ? { html: message.html } : {}),
      });
    } catch (err) {
      // Diagnóstico sem segredos (R6.1–R6.5): host + código/resposta SMTP
      // quando houver. NÃO loga SMTP_PASS/credenciais; em produção também não
      // inclui corpo (texto/HTML) nem o código de verificação.
      logSmtpError(err, this.host);
      throw err; // propaga para acionar o retry existente (R3.3)
    }
  }
}

/**
 * Registra um diagnóstico mínimo de erro de envio SMTP, sem expor segredos.
 *
 * O que é registrado: o `host` SMTP e, quando disponível, o código/resposta de
 * erro do servidor (`err.code`, `err.responseCode`, `err.response`).
 *
 * O que NUNCA é registrado (R6.1–R6.5):
 * - `SMTP_PASS` nem qualquer credencial da Configuracao_SMTP;
 * - em `NODE_ENV=production`: corpo em texto (`body`), corpo HTML (`html`) e o
 *   código de verificação — nada disso é passado a esta função, garantindo que
 *   não haja como vazar por aqui.
 *
 * Fora de produção, é adicionada a mensagem crua do erro (`err.message`) para
 * facilitar a investigação local; essa mensagem provém do transport/servidor e
 * não contém credenciais.
 */
export function logSmtpError(err: unknown, host: string): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const smtpError = (err ?? {}) as SmtpErrorLike;

  const details: Record<string, string> = { host };

  if (typeof smtpError.code === 'string' || typeof smtpError.code === 'number') {
    details.code = String(smtpError.code);
  }
  if (typeof smtpError.responseCode === 'number') {
    details.responseCode = String(smtpError.responseCode);
  }
  if (typeof smtpError.response === 'string' && smtpError.response.length > 0) {
    details.response = smtpError.response;
  }

  // Fora de produção, inclui a mensagem crua do erro para facilitar o diagnóstico
  // local. Em produção, mantém o log restrito ao mínimo (host + código/resposta).
  if (!isProduction && typeof smtpError.message === 'string' && smtpError.message.length > 0) {
    details.message = smtpError.message;
  }

  const diagnostic = Object.entries(details)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');

  console.error(`[SmtpEmailProvider] falha ao enviar e-mail via SMTP — ${diagnostic}`);
}
