import { type SQL, and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AppError } from '#core/api/errors.ts';
import { ROLES } from '#core/shared/can.ts';
import { decodeCursor, encodeCursor } from '#core/shared/cursor.ts';
import { ACCOUNT_SORTS, accountsListContract, inviteContract, reinviteContract } from '#shared/contracts/accounts.ts';
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
  status: z.enum(['active', 'invited']),
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

const STATUS_COLUMN = { actief: 'active', uitgenodigd: 'invited' } as const;

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
      status: row.status === 'active' ? ('actief' as const) : ('uitgenodigd' as const),
    })),
    nextCursor:
      rows.length > ACCOUNTS_PAGE_SIZE && last !== undefined
        ? encodeCursor([sort, byName ? last.naamKey : last.aangemaakt, last.id])
        : null,
  };
});

// De rol gaat in de transactie van de admin (app.assign_role eist een admin met MFA); pas daarna gaat de mail weg.
export const inviteRoute = defineRoute(inviteContract, async ({ input, tx, services }) => {
  const { userId } = await services.invitations.invite({ name: input.naam, email: input.email }, async (id) => {
    await tx.execute(sql`select app.assign_role(${id}, ${input.rol})`);
  });
  return { id: userId };
});

export const reinviteRoute = defineRoute(reinviteContract, async ({ input, services }) => {
  await services.invitations.reinvite(input.id);
  return null;
});
