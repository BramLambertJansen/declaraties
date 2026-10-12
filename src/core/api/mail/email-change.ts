import { renderMail } from './layout.ts';
import type { Mail } from './smtp.ts';

// De vier mails van een e-mailwijziging (spec eigen-account, tabel "Alle zichtbare tekst"), in de layout van core.
interface Base {
  readonly appName: string;
  readonly name: string;
  // Het adres waar de mail heen gaat.
  readonly to: string;
}

// Stap 1: naar het oude adres.
export function confirmOldAddressMail(input: Base & { readonly newEmail: string; readonly url: string }): Mail {
  const { appName, name, to, newEmail, url } = input;
  return {
    to,
    subject: 'Bevestig de wijziging van je e-mailadres',
    ...renderMail({
      appName,
      greeting: `Hallo ${name},`,
      paragraphs: [
        `Iemand wil het e-mailadres van je account bij ${appName} wijzigen in ${newEmail}. Was jij dat? Bevestig dan met de knop. Was jij het niet? Wijzig direct je wachtwoord.`,
      ],
      action: { label: 'Wijziging bevestigen', url, labelInText: true },
    }),
  };
}

// Stap 2: naar het nieuwe adres.
export function verifyNewAddressMail(input: Base & { readonly url: string }): Mail {
  const { appName, name, to, url } = input;
  return {
    to,
    subject: 'Bevestig je nieuwe e-mailadres',
    ...renderMail({
      appName,
      greeting: `Hallo ${name},`,
      paragraphs: [`Bevestig dat dit je nieuwe e-mailadres is voor ${appName}.`],
      action: { label: 'E-mailadres bevestigen', url, labelInText: true },
    }),
  };
}

// Het gevraagde adres hoort al bij een ander account: neutrale mail naar het oude adres, zonder link (OV-9).
export function addressTakenMail(input: Base & { readonly newEmail: string }): Mail {
  const { appName, name, to, newEmail } = input;
  return {
    to,
    subject: 'Je e-mailadres is niet gewijzigd',
    ...renderMail({
      appName,
      greeting: `Hallo ${name},`,
      paragraphs: [
        `Iemand wilde het e-mailadres van je account bij ${appName} wijzigen in ${newEmail}, maar dat adres hoort al bij een ander account. Er is niets gewijzigd. Was jij het niet? Wijzig direct je wachtwoord.`,
      ],
    }),
  };
}

// Na stap 2: naar het oude adres (OV-7).
export function emailChangedMail(input: Base & { readonly newEmail: string }): Mail {
  const { appName, name, to, newEmail } = input;
  return {
    to,
    subject: 'Je e-mailadres is gewijzigd',
    ...renderMail({
      appName,
      greeting: `Hallo ${name},`,
      paragraphs: [
        `Het e-mailadres van je account bij ${appName} is nu ${newEmail}. Je andere sessies zijn beëindigd. Was jij het niet? Neem direct contact op met een beheerder.`,
      ],
    }),
  };
}
