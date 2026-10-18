import { z } from 'zod';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '#core/shared/limits.ts';
import { MAX_EMAIL_LENGTH } from '../limits.ts';

// Formulieren rond inloggen (spec accountbeheer). De server controleert opnieuw (Better Auth, ADR 0013); dezelfde grenzen
// uit limits.ts (test in auth.test.ts).
export const loginInput = z
  .object({
    email: z
      .email('Vul een geldig e-mailadres in.')
      .max(MAX_EMAIL_LENGTH, `Hooguit ${String(MAX_EMAIL_LENGTH)} tekens.`),
    password: z
      .string()
      .min(1, 'Vul je wachtwoord in.')
      .max(MAX_PASSWORD_LENGTH, `Hooguit ${String(MAX_PASSWORD_LENGTH)} tekens.`),
  })
  .strict();

export const totpInput = z.object({ code: z.string().regex(/^\d{6}$/, 'Vul de 6 cijfers in.') }).strict();

export const newPasswordInput = z
  .object({
    wachtwoord: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Minstens ${String(MIN_PASSWORD_LENGTH)} tekens.`)
      .max(MAX_PASSWORD_LENGTH, `Hooguit ${String(MAX_PASSWORD_LENGTH)} tekens.`),
    herhaal: z.string(),
  })
  .strict()
  .refine((value) => value.wachtwoord === value.herhaal, {
    path: ['herhaal'],
    message: 'De wachtwoorden zijn niet gelijk.',
  });

// Spec eigen-account: wachtwoord wijzigen. Het nieuwe wachtwoord volgt dezelfde grenzen als bij het instellen.
export const changePasswordInput = z
  .object({
    huidig: z
      .string()
      .min(1, 'Vul je huidige wachtwoord in.')
      .max(MAX_PASSWORD_LENGTH, `Hooguit ${String(MAX_PASSWORD_LENGTH)} tekens.`),
    nieuw: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Minstens ${String(MIN_PASSWORD_LENGTH)} tekens.`)
      .max(MAX_PASSWORD_LENGTH, `Hooguit ${String(MAX_PASSWORD_LENGTH)} tekens.`),
    herhaal: z.string(),
  })
  .strict()
  .refine((value) => value.nieuw === value.herhaal, {
    path: ['herhaal'],
    message: 'De wachtwoorden zijn niet gelijk.',
  });

// Spec eigen-account: een e-mailwijziging aanvragen. Alleen het nieuwe adres; de server controleert opnieuw.
export const changeEmailInput = z
  .object({
    email: z
      .email('Vul een geldig e-mailadres in.')
      .max(MAX_EMAIL_LENGTH, `Hooguit ${String(MAX_EMAIL_LENGTH)} tekens.`),
  })
  .strict();
