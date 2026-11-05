import {
  addressTakenMail,
  confirmOldAddressMail,
  emailChangedMail,
  verifyNewAddressMail,
} from '../mail/email-change.ts';
import type { SendMail } from '../mail/smtp.ts';

// Wat een e-mailwijziging verstuurt (spec eigen-account). Aanwezig zodra AuthConfig.sendMail bestaat; zonder staat
// `changeEmail` uit. Beide links wijzen naar het scherm van de SPA, dat met een POST bevestigt (framework §6).
export const EMAIL_CONFIRM_PATH = '/email-bevestigen';

export interface MailAccount {
  readonly name: string;
  readonly email: string;
}

export interface Mailing {
  // Stap 1: naar het oude adres, met de link naar stap 1.
  readonly confirmOld: (user: MailAccount, newEmail: string, token: string) => Promise<void>;
  // Stap 2: naar het nieuwe adres.
  readonly verifyNew: (user: MailAccount, token: string) => Promise<void>;
  // Neutrale mail naar het oude adres wanneer het nieuwe al bezet is.
  readonly taken: (user: MailAccount, newEmail: string) => Promise<void>;
  // Melding naar het oude adres nadat het adres gewijzigd is.
  readonly changed: (user: MailAccount, newEmail: string) => Promise<void>;
}

export interface MailingConfig {
  readonly origin: string;
  readonly sendMail?: SendMail | undefined;
  // Zonder: de hostnaam van de origin.
  readonly appName?: string | undefined;
}

export function createMailing(config: MailingConfig): Mailing | null {
  const { sendMail } = config;
  if (sendMail === undefined) return null;
  const appName = config.appName ?? new URL(config.origin).hostname;
  const linkFor = (token: string) => `${config.origin}${EMAIL_CONFIRM_PATH}?token=${encodeURIComponent(token)}`;
  return {
    confirmOld: (user, newEmail, token) =>
      sendMail(confirmOldAddressMail({ appName, name: user.name, to: user.email, newEmail, url: linkFor(token) })),
    verifyNew: (user, token) =>
      sendMail(verifyNewAddressMail({ appName, name: user.name, to: user.email, url: linkFor(token) })),
    taken: (user, newEmail) => sendMail(addressTakenMail({ appName, name: user.name, to: user.email, newEmail })),
    changed: (user, newEmail) => sendMail(emailChangedMail({ appName, name: user.name, to: user.email, newEmail })),
  };
}
