import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineRoute } from '../../src/api/kit.ts';
import type { AppServices } from '../../src/api/services.ts';
import type { TestDb, TestUser } from '../../src/core/api/db/testing.ts';
import type { Tx } from '../../src/core/api/db/types.ts';
import { AppError } from '../../src/core/api/errors.ts';
import { createApp, type App, type AppConfig } from '../../src/core/api/http/create-app.ts';
import { decodeCursor, encodeCursor, pageSchema } from '../../src/core/shared/cursor.ts';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MAX_SEARCH_LENGTH } from '../../src/core/shared/limits.ts';
import { defineContract } from '../../src/shared/contracts/kit.ts';
import { errors } from '../../src/shared/errors.ts';
import { APP_ORIGIN } from '../auth/harness.ts';
import {
  classificatieProblemen,
  type Aanroep,
  type EigenaarOpzet,
  type Spelers,
  type Wie,
  type Zender,
} from './controles.ts';
import { heeftBody, leesAntwoord, openProbe, type Probe } from './fixtures.ts';
import { rijenVan } from './hulp.ts';
import { probeRouteClassificatie, resources } from './resources.ts';

// De eigenaar-routes van de probe-resource (public.security_probes, fixtures.ts) in de vorm die een app voor een resource
// zou schrijven: create, lijst met cursor en q, lezen, wijzigen en verwijderen, allemaal onder RLS. Testfixtures, geen app-code.
// De sessie komt uit de test-gateway van asUser (de tabel bestaat alleen binnen de testtransactie, zie fixtures.ts).

const rijSchema = z.object({ id: z.string(), label: z.string() }).strict();
const labelVeld = { label: z.string().min(1).max(MAX_SEARCH_LENGTH) };
const idVeld = { id: z.uuid() };
const cursorSleutel = z.object({ id: z.uuid() }).strict();

const SELECTEER = sql`select p.id::text as id, p.label from public.security_probes p`;

async function leesRij(tx: Tx, id: string): Promise<z.infer<typeof rijSchema>> {
  const rijen = await rijenVan(tx, sql`${SELECTEER} where p.id = ${id}::uuid`);
  if (rijen[0] === undefined) throw new AppError('NOT_FOUND');
  return rijSchema.parse(rijen[0]);
}

async function maak({ tx, input }: { tx: Tx; input: { label: string } }) {
  const rijen = await rijenVan(
    tx,
    sql`insert into public.security_probes (label) values (${input.label}) returning id::text as id, label`,
  );
  return rijSchema.parse(rijen[0]);
}

const create = defineRoute(
  defineContract({
    method: 'POST',
    path: '/probes',
    input: z.object(labelVeld).strict(),
    output: rijSchema,
    permission: 'app.use',
  }),
  maak,
);

// Bewust gebroken: dezelfde route zonder .strict() (defineContract weigert dat, defineRoute zelf niet). Alleen voor de zelftest (AC-13).
const createLos = defineRoute(
  { method: 'POST', path: '/probes', input: z.object(labelVeld), output: rijSchema, permission: 'app.use' },
  maak,
);

function cursorId(cursor: string): string {
  try {
    return decodeCursor(cursor, cursorSleutel).id;
  } catch {
    throw new AppError('VALIDATION');
  }
}

const lijst = defineRoute(
  defineContract({
    method: 'GET',
    path: '/probes',
    input: z
      .object({
        q: z.string().trim().max(MAX_SEARCH_LENGTH).optional(),
        cursor: z.string().max(500).optional(),
        limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
      })
      .strict(),
    output: pageSchema(rijSchema),
    permission: 'app.use',
  }),
  async ({ tx, input }) => {
    const na = input.cursor === undefined ? sql`` : sql`and p.id > ${cursorId(input.cursor)}::uuid`;
    const zoek = input.q === undefined ? sql`` : sql`and position(lower(${input.q}) in lower(p.label)) > 0`;
    const rijen = await rijenVan(tx, sql`${SELECTEER} where true ${na} ${zoek} order by p.id limit ${input.limit + 1}`);
    const items = rijen.slice(0, input.limit).map((rij) => rijSchema.parse(rij));
    const laatste = items.at(-1);
    const nextCursor = rijen.length > input.limit && laatste !== undefined ? encodeCursor({ id: laatste.id }) : null;
    return { items, nextCursor };
  },
);

const lees = defineRoute(
  defineContract({
    method: 'GET',
    path: '/probes/:id',
    input: z.object(idVeld).strict(),
    output: rijSchema,
    permission: 'app.use',
  }),
  ({ tx, input }) => leesRij(tx, input.id),
);

// RLS filtert de rijen van een ander weg: 0 rijen is "bestaat niet", dezelfde NOT_FOUND als bij een onbekend id.
const wijzig = defineRoute(
  defineContract({
    method: 'PATCH',
    path: '/probes/:id',
    input: z.object({ ...idVeld, ...labelVeld }).strict(),
    output: rijSchema,
    permission: 'app.use',
  }),
  async ({ tx, input }) => {
    const rijen = await rijenVan(
      tx,
      sql`update public.security_probes set label = ${input.label} where id = ${input.id}::uuid returning id::text as id, label`,
    );
    if (rijen[0] === undefined) throw new AppError('NOT_FOUND');
    return rijSchema.parse(rijen[0]);
  },
);

const verwijder = defineRoute(
  defineContract({
    method: 'DELETE',
    path: '/probes/:id',
    input: z.object(idVeld).strict(),
    output: z.null(),
    permission: 'app.use',
  }),
  async ({ tx, input }) => {
    const rijen = await rijenVan(tx, sql`delete from public.security_probes where id = ${input.id}::uuid returning id`);
    if (rijen[0] === undefined) throw new AppError('NOT_FOUND');
    return null;
  },
);

export const EIGENAAR_ROUTES = [create, lijst, lees, wijzig, verwijder] as const;
export const EIGENAAR_ROUTES_LOS = [createLos, lijst, lees, wijzig, verwijder] as const;

export const labelsVan = (
  lijstMetRoutes: readonly { readonly contract: { method: string; path: string } }[],
): string[] => lijstMetRoutes.map(({ contract }) => `${contract.method} ${contract.path}`);

const notUsed = () => Promise.reject(new Error('niet gebruikt in de probe-app'));
const unusedServices: AppServices = {
  invitations: { invite: notUsed, reinvite: notUsed },
  profile: { rename: notUsed, confirmEmail: notUsed },
  sessions: { list: notUsed, revoke: notUsed, revokeOthers: notUsed, revokeAll: notUsed },
};

function verzoek(aanroep: Aanroep): Request {
  const pad = aanroep.pad.replace(/:([A-Za-z0-9_]+)/g, (_, naam: string) =>
    encodeURIComponent(aanroep.params[naam] ?? ''),
  );
  const body = heeftBody(aanroep.method);
  const query = body
    ? ''
    : `?${new URLSearchParams(Object.entries(aanroep.invoer).map(([naam, waarde]) => [naam, String(waarde)])).toString()}`;
  return new Request(`${APP_ORIGIN}/api${pad}${query}`, {
    method: aanroep.method,
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: APP_ORIGIN },
    ...(body ? { body: JSON.stringify(aanroep.invoer) } : {}),
  });
}

type Routes = NonNullable<AppConfig<AppServices>['routes']>;

export interface EigenaarProbe {
  readonly probe: Probe;
  readonly spelers: Spelers;
  // De opzet voor AC-9/AC-10 via de API: A en B bellen dezelfde app (elk met de eigen vaste sessie).
  readonly opzet: (routes?: Routes) => EigenaarOpzet;
  // De ruwe app van één gebruiker, voor een probe-specifiek verzoek.
  readonly appVoor: (wie: Wie, routes?: Routes) => App;
  // Voert DDL uit als eigenaar van het schema (app_migrator, zoals een migratie); alles draait terug.
  readonly alsEigenaar: (statements: readonly string[]) => Promise<void>;
  readonly sluit: () => Promise<void>;
}

// Opent de probe-resource (fixtures.openProbe) met twee gewone gebruikers A en B.
export async function openEigenaarProbe(): Promise<EigenaarProbe> {
  const probe = await openProbe();
  const gebruikers: Record<Wie, TestUser> = { A: await probe.db.asUser('user'), B: await probe.db.asUser('user') };
  const appVoor = (wie: Wie, routes: Routes = EIGENAAR_ROUTES): App =>
    createApp<AppServices>({
      appOrigin: APP_ORIGIN,
      auth: gebruikers[wie].auth,
      withUser: probe.db.withUser,
      services: unusedServices,
      routes,
      errors,
    });
  const opzet = (routes: Routes = EIGENAAR_ROUTES): EigenaarOpzet => {
    const apps = { A: appVoor('A', routes), B: appVoor('B', routes) };
    const zend: Zender = async (wie, aanroep) => leesAntwoord(await apps[wie].fetch(verzoek(aanroep)));
    return {
      zend,
      classificatie: probeRouteClassificatie,
      resources,
      gebruikers: { A: gebruikers.A.actor.userId, B: gebruikers.B.actor.userId },
    };
  };
  return {
    probe,
    spelers: { db: probe.db, A: gebruikers.A, B: gebruikers.B },
    opzet,
    appVoor,
    alsEigenaar: (statements) => alsEigenaar(probe.db, statements),
    sluit: () => probe.sluit(),
  };
}

async function alsEigenaar(db: TestDb, statements: readonly string[]): Promise<void> {
  const beheerder = await db.asUser('admin');
  await db.withUser(beheerder.actor, async (tx) => {
    // Terug naar de sessiegebruiker (app_migrator): DDL kan niet als app_authenticated. Alles draait terug (zie fixtures.openProbe).
    await tx.execute(sql.raw('reset role'));
    for (const statement of statements) await tx.execute(sql.raw(statement));
  });
}

// AC-11 voor de probe-app: elke route van de probe-app is geclassificeerd en wijst naar een gedeclareerde resource.
export function probeClassificatieProblemen(owner: readonly string[]): string[] {
  return classificatieProblemen({
    routes: labelsVan(EIGENAAR_ROUTES),
    classificatie: probeRouteClassificatie,
    resources,
    eigenaarTabellen: owner,
  });
}
