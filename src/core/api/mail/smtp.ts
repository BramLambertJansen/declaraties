import { createTransport } from 'nodemailer';

export interface Mail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  // HTML-versie naast de tekst (renderMail in layout.ts); zonder alleen tekst.
  readonly html?: string;
}

export type SendMail = (mail: Mail) => Promise<void>;

// Een hangende mailserver mag geen route (en dus geen transactie of verbinding) vasthouden.
export const SMTP_TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 } as const;

// Lokaal en in de runner: Mailpit (framework §3, poort E-mail). Per app een SMTP-dienst via SMTP_URL.
export function createSmtpMailer(smtpUrl: string, from: string): SendMail {
  const transport = createTransport(smtpUrl, SMTP_TIMEOUTS);
  return async (mail) => {
    await transport.sendMail({ from, ...mail });
  };
}
