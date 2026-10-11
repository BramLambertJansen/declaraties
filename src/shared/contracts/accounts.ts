import { z } from 'zod';
import { ROLES } from '#core/shared/can.ts';
import { pageSchema } from '#core/shared/cursor.ts';
import { MAX_EMAIL_LENGTH, MAX_NAME_LENGTH } from '../limits.ts';
import { defineContract } from './kit.ts';

// Accountbeheer (spec accountbeheer): lijst met cursor, uitnodigen en opnieuw uitnodigen; alleen een admin met MFA.
// De rollen komen uit core (ROLES); een nieuwe rol verschijnt hier vanzelf.
export const ROLLEN = ROLES;

export const accountItem = z
  .object({
    id: z.string(),
    naam: z.string(),
    email: z.string(),
    rol: z.enum(ROLLEN),
    status: z.enum(['actief', 'uitgenodigd']),
    // ISO 8601 met tijdzone; tonen via format.dateTime.
    aangemaakt: z.string(),
  })
  .strict();

export const accountsListContract = defineContract({
  method: 'GET',
  path: '/accounts',
  input: z.object({ cursor: z.string().max(500).optional() }).strict(),
  output: pageSchema(accountItem),
  permission: 'accounts:read',
});

export const inviteInput = z
  .object({
    naam: z
      .string()
      .trim()
      .min(1, 'Vul een naam in.')
      .max(MAX_NAME_LENGTH, `Hooguit ${String(MAX_NAME_LENGTH)} tekens.`),
    email: z.email('Vul een geldig e-mailadres in.').max(MAX_EMAIL_LENGTH),
    rol: z.enum(ROLLEN),
  })
  .strict();

export const inviteContract = defineContract({
  method: 'POST',
  path: '/accounts/invite',
  input: inviteInput,
  output: z.object({ id: z.string() }).strict(),
  permission: 'accounts:invite',
  // Verstuurt mail (spec rate-limit).
  rateLimit: 'duur',
});

export const reinviteContract = defineContract({
  method: 'POST',
  path: '/accounts/:id/reinvite',
  input: z.object({ id: z.string().min(1).max(200) }).strict(),
  output: z.null(),
  permission: 'accounts:invite',
  // Verstuurt mail (spec rate-limit).
  rateLimit: 'duur',
});
