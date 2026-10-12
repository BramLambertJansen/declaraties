import { coreErrorTexts } from '#core/web/copy/errors.ts';
import type { ErrorCode } from '#shared/errors.ts';

// Losse constante: Betterleaks (generic-password) leest `WRONG_PASSWORD: '…'` als een geheim.
const wrongCurrentPasswordText = 'Je huidige wachtwoord klopt niet.';

// Tekst per foutcode (framework §5): TypeScript eist er één voor elke code uit src/shared/errors.ts. Letterlijk uit de spec
// accountbeheer waar die een tekst geeft.
export const errorTexts = {
  ...coreErrorTexts,
  INVALID_CREDENTIALS: 'E-mailadres of wachtwoord klopt niet.',
  INVALID_TOTP: 'Deze code klopt niet. Probeer het opnieuw.',
  INVITATION_INVALID: 'Deze uitnodiging is verlopen of al gebruikt. Vraag een nieuwe aan.',
  ALREADY_ACTIVE: 'Dit account is al actief. Een nieuwe uitnodiging is niet nodig.',
  LAST_ADMIN: 'Er moet minstens één beheerder overblijven.',
  OWN_ACCOUNT: 'Dit kan niet bij je eigen account.',
  ACCOUNT_INVITED: 'Dit account is nog niet actief. Nodig opnieuw uit of trek de uitnodiging in.',
  ACCOUNT_BLOCKED: 'Dit account is geblokkeerd. Deblokkeer het eerst.',
  WRONG_PASSWORD: wrongCurrentPasswordText,
  SESSION_NOT_FRESH: 'Log opnieuw in om dit te wijzigen.',
  EMAIL_LINK_INVALID: 'Deze link is verlopen of al gebruikt. Vraag de wijziging opnieuw aan.',
} as const satisfies Record<ErrorCode, string>;
