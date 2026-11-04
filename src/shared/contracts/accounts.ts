import { z } from 'zod';
import { ROLES } from '#core/shared/can.ts';
import { pageSchema } from '#core/shared/cursor.ts';
import { MAX_ID_LENGTH, MAX_TIMESTAMP_LENGTH } from '#core/shared/limits.ts';
import { defineListSearch } from '#core/shared/list-search.ts';
import { MAX_EMAIL_LENGTH, MAX_NAME_LENGTH } from '../limits.ts';
import { defineContract } from './kit.ts';

// Accountbeheer (spec accountbeheer): lijst met cursor, uitnodigen en opnieuw uitnodigen; alleen een admin met MFA.
// De rollen komen uit core (ROLES); een nieuwe rol verschijnt hier vanzelf.
export const ROLLEN = ROLES;

export const STATUSSEN = ['actief', 'uitgenodigd', 'geblokkeerd', 'gedeactiveerd'] as const;
export const ACCOUNT_SORTS = ['nieuwste', 'oudste', 'naam-az', 'naam-za'] as const;

// Zoeken, filteren en sorteren (spec lijstpagina): één schema voor de API (strict) en de webroute (validateSearch).
// cursorKeys: de sleutel na de sortering is (aangemaakt, id) of (lower(naam), id); lower() kan een teken verlengen (İ → i + U+0307).
const timeKey = [MAX_TIMESTAMP_LENGTH, MAX_ID_LENGTH] as const;
const nameKey = [2 * MAX_NAME_LENGTH, MAX_ID_LENGTH] as const;
export const accountsSearch = defineListSearch({
  sorts: ACCOUNT_SORTS,
  filters: { rol: ROLLEN, status: STATUSSEN },
  cursorKeys: { nieuwste: timeKey, oudste: timeKey, 'naam-az': nameKey, 'naam-za': nameKey },
});

export const accountItem = z
  .object({
    id: z.string(),
    naam: z.string(),
    email: z.string(),
    rol: z.enum(ROLLEN),
    status: z.enum(STATUSSEN),
    // ISO 8601 met tijdzone; tonen via format.dateTime.
    aangemaakt: z.string(),
    laatstIngelogd: z.iso.datetime({ offset: true }).nullable(),
    gedeactiveerd: z.boolean(),
    geblokkeerd: z.boolean(),
  })
  .strict();

export const accountsListContract = defineContract({
  method: 'GET',
  path: '/accounts',
  input: accountsSearch.api,
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
  input: z.object({ id: z.string().min(1).max(MAX_ID_LENGTH) }).strict(),
  output: z.null(),
  permission: 'accounts:invite',
  // Verstuurt mail (spec rate-limit).
  rateLimit: 'duur',
});

const accountIdInput = z.object({ id: z.string().min(1).max(MAX_ID_LENGTH) }).strict();

// Blokkeren en deblokkeren (spec accountbeheer-uitbreiding, ADR 0043); idempotent.
export const blockContract = defineContract({
  method: 'POST',
  path: '/accounts/:id/block',
  input: accountIdInput,
  output: z.null(),
  permission: 'accounts:manage',
});

export const unblockContract = defineContract({
  method: 'POST',
  path: '/accounts/:id/unblock',
  input: accountIdInput,
  output: z.null(),
  permission: 'accounts:manage',
});

export const deactivateContract = defineContract({
  method: 'POST',
  path: '/accounts/:id/deactivate',
  input: accountIdInput,
  output: z.null(),
  permission: 'accounts:manage',
});

export const activateContract = defineContract({
  method: 'POST',
  path: '/accounts/:id/activate',
  input: accountIdInput,
  output: z.null(),
  permission: 'accounts:manage',
});
