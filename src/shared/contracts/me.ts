import { z } from 'zod';
import { ROLES } from '#core/shared/can.ts';
import { MAX_NAME_LENGTH } from '../limits.ts';
import { defineContract } from './kit.ts';

// GET /api/me (spec accountbeheer): wie ben ik, met de rol uit de database.
export const meOutput = z.object({ id: z.string(), naam: z.string(), email: z.string(), rol: z.enum(ROLES) }).strict();

export const meContract = defineContract({
  method: 'GET',
  path: '/me',
  input: z.object({}).strict(),
  output: meOutput,
  permission: 'me:read',
});

// Spec eigen-account: de eigen naam wijzigen. Het account komt uit de sessie, nooit uit de invoer.
export const renameInput = z
  .object({
    naam: z
      .string()
      .trim()
      .min(1, 'Vul een naam in.')
      .max(MAX_NAME_LENGTH, `Hooguit ${String(MAX_NAME_LENGTH)} tekens.`),
  })
  .strict();

export const renameContract = defineContract({
  method: 'PATCH',
  path: '/me',
  input: renameInput,
  output: z.null(),
  permission: 'me:update',
});

// Spec eigen-account: eigen sessies. Nooit tokens of IP naar de browser; `id` is het sessie-ID, geen token.
export const sessionItem = z
  .object({
    id: z.string(),
    apparaat: z.string(),
    // ISO 8601 met tijdzone; tonen via format.dateTime.
    aangemaakt: z.string(),
    laatstActief: z.string(),
    huidig: z.boolean(),
  })
  .strict();

export const sessionsListContract = defineContract({
  method: 'GET',
  path: '/me/sessions',
  input: z.object({}).strict(),
  output: z.object({ items: z.array(sessionItem) }).strict(),
  permission: 'me:read',
});

// De eigen huidige sessie beëindigen kan hier niet (VALIDATION): daarvoor is "Uitloggen".
export const revokeSessionContract = defineContract({
  method: 'DELETE',
  path: '/me/sessions/:id',
  input: z.object({ id: z.string().min(1).max(200) }).strict(),
  output: z.null(),
  permission: 'me:update',
});

export const revokeOtherSessionsContract = defineContract({
  method: 'POST',
  path: '/me/sessions/revoke-others',
  input: z.object({}).strict(),
  output: z.null(),
  permission: 'me:update',
});

// Spec eigen-account: stap 1 (oud adres) of 2 (nieuw adres) van een e-mailwijziging bevestigen met het token uit de mail.
export const confirmEmailContract = defineContract({
  method: 'POST',
  path: '/me/email/bevestigen',
  input: z.object({ token: z.string().min(1).max(2000) }).strict(),
  output: z.object({ stap: z.enum(['oud', 'nieuw']) }).strict(),
  permission: 'me:update',
  // Kan mail versturen (stap 1 stuurt mail 2).
  rateLimit: 'duur',
});
