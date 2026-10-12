import { type SQL, and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AppError } from '#core/api/errors.ts';
import { ROLES } from '#core/shared/can.ts';
import { decodeCursor, encodeCursor } from '#core/shared/cursor.ts';
import {
  ACCOUNT_SORTS,
  accountsListContract,
  blockContract,
  inviteContract,
  reinviteContract,
  unblockContract,
} from '#shared/contracts/accounts.ts';
import { ACCOUNTS_PAGE_SIZE } from '#shared/limits.ts';
import { appAccounts } from '../db/schema.ts';
import { defineRoute } from '../kit.ts';

// Accountbeheer (spec accountbeheer). app.accounts toont alleen iets aan een admin met MFA (view, pgTAP); can() eist
// hetzelfde vooraf. Zoeken, filteren en sorteren volgens spec lijstpagina; de cursor is [sort, sleutel, id] van de laatste rij.

// Kolommen van een view zijn voor de catalogus altijd nullable: parse op de grens; een null is een bug (INTERNAL_ERROR).
const accountRow = z.object({
  id: z.string(),
  naam: z.string(),
  email: z.string(),
  rol: z.enum(ROLES),
  status: z.enum(['active', 'invited', 'blocked']),
  aangemaakt: z.string(),
  naamKey: z.string(),
});

type Sort = (typeof ACCOUNT_SORTS)[number];

// De cursor hoort bij één sortering: [sort, sleutel, id]. Een cursor van een andere sortering geeft VALIDATION.
const cursorKey = (sort: Sort) => z.tuple([z.literal(sort), z.string(), z.string()]);

function after(cursor: string | undefined, sort: Sort): readonly [string, string, string] | null {
  if (cursor === undefined) return null;
  // decodeCursor gooit een ZodError bij een gemanipuleerde cursor: dat is invoer van de client, dus VALIDATION.
  try {
    return decodeCursor(cursor, cursorKey(sort));
  } catch {
    throw new AppError('VALIDATION');
  }
}

// `%`, `_` en `\` zoeken letterlijk (ilike gebruikt `\` als escape).
function containsPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

const STATUS_COLUMN = { actief: 'active', uitgenodigd: 'invited', geblokkeerd: 'blocked' } as const;

const STATUS_LABEL = { active: 'actief', invited: 'uitgenodigd', blocked: 'geblokkeerd' } as const;

const naamKey = sql<string>`lower(${appAccounts.name})`;
const aangemaaktKey = sql<string>`to_json(${appAccounts.createdAt}) #>> '{}'`;

export const accountsListRoute = defineRoute(accountsListContract, async ({ input, tx }) => {
  const { sort, q, rol, status } = input;
  const byName = sort === 'naam-az' || sort === 'naam-za';
  const descending = sort === 'nieuwste' || sort === 'naam-za';
  const from = after(input.cursor, sort);
  const keyColumn = byName ? sql`lower(${appAccounts.name})` : sql`${appAccounts.createdAt}`;
  const keyCast = byName ? sql`` : sql`::timestamptz`;
  const conditions: SQL[] = [];
  if (q !== undefined) {
    const pattern = containsPattern(q);
    conditions.push(sql`(${appAccounts.name} ilike ${pattern} or ${appAccounts.email} ilike ${pattern})`);
  }
  if (rol !== undefined) conditions.push(eq(appAccounts.role, rol));
  if (status !== undefined) conditions.push(eq(appAccounts.status, STATUS_COLUMN[status]));
  if (from !== null) {
    const operator = descending ? sql`<` : sql`>`;
    conditions.push(sql`(${keyColumn}, ${appAccounts.id}) ${operator} (${from[1]}${keyCast}, ${from[2]})`);
  }
  const order = descending ? desc : asc;
  const rows = await tx
    .select({
      id: appAccounts.id,
      naam: appAccounts.name,
      email: appAccounts.email,
      rol: appAccounts.role,
      status: appAccounts.status,
      // ISO 8601 met microseconden: dezelfde waarde gaat ongewijzigd terug in de cursor.
      aangemaakt: aangemaaktKey,
      naamKey,
    })
    .from(appAccounts)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(order(byName ? naamKey : appAccounts.createdAt), order(appAccounts.id))
    .limit(ACCOUNTS_PAGE_SIZE + 1);

  const page = rows.slice(0, ACCOUNTS_PAGE_SIZE).map((row) => accountRow.parse(row));
  const last = page.at(-1);
  return {
    items: page.map((row) => ({
      id: row.id,
      naam: row.naam,
      email: row.email,
      rol: row.rol,
      aangemaakt: row.aangemaakt,
      status: STATUS_LABEL[row.status],
    })),
    nextCursor:
      rows.length > ACCOUNTS_PAGE_SIZE && last !== undefined
        ? encodeCursor([sort, byName ? last.naamKey : last.aangemaakt, last.id])
        : null,
  };
});

// De rol en de auditregel gaan in de transactie van de admin (app.assign_role en app.audit_account_action eisen een admin met
// MFA); pas daarna gaat de mail weg. Een fout in beforeMail laat inviteUser het account weer verwijderen (spec audit-log, OV-C2).
export const inviteRoute = defineRoute(inviteContract, async ({ input, tx, services }) => {
  const { userId } = await services.invitations.invite({ name: input.naam, email: input.email }, async (id) => {
    await tx.execute(sql`select app.assign_role(${id}, ${input.rol})`);
    await tx.execute(sql`select app.audit_account_action('core.account.invite', ${id})`);
  });
  return { id: userId };
});

// De regel staat vóór de service: NOT_FOUND of ALREADY_ACTIVE rolt de transactie terug, dus ook de regel.
export const reinviteRoute = defineRoute(reinviteContract, async ({ input, tx, services }) => {
  await tx.execute(sql`select app.audit_account_action('core.account.reinvite', ${input.id})`);
  await services.invitations.reinvite(input.id);
  return null;
});

// Blokkeren (ADR 0026, besluit 7): de functie in de transactie van de admin (NOT_FOUND, OWN_ACCOUNT, ACCOUNT_INVITED en
// LAST_ADMIN komen als P0001 uit de database), daarna de sessies opruimen. Core geeft een handler geen hook na de commit,
// dus dat opruimen draait vóór de commit (afwijking van besluit 7); faalt het, dan weigert getSession de sessies toch.
// `/api/auth/*` loopt niet via getSession: daar blijft een geblokkeerde sessie bruikbaar tot het opruimen gelukt is.
export const blockRoute = defineRoute(blockContract, async ({ input, tx, services }) => {
  await tx.execute(sql`select app.set_account_blocked(${input.id}, true)`);
  await services.sessions.revokeAll(input.id);
  return null;
});

export const unblockRoute = defineRoute(unblockContract, async ({ input, tx }) => {
  await tx.execute(sql`select app.set_account_blocked(${input.id}, false)`);
  return null;
});
