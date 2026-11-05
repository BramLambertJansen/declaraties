import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { z } from 'zod';
import { routes } from '../../src/api/app.ts';
import { defineRoute } from '../../src/api/kit.ts';
import type { AppServices } from '../../src/api/services.ts';
import { inviteUser } from '../../src/core/api/auth/index.ts';
import { beginTestDb, createPool, type TestDb, type TestUser } from '../../src/core/api/db/testing.ts';
import { createApp, type App } from '../../src/core/api/http/create-app.ts';
import type { Role } from '../../src/core/shared/can.ts';
import { rateLimitCategory, type Method } from '../../src/core/shared/contract.ts';
import { MAX_BODY_BYTES, SESSION_ABSOLUTE_SECONDS, type RateLimitCategory } from '../../src/core/shared/limits.ts';
import { defineContract } from '../../src/shared/contracts/kit.ts';
import { errors } from '../../src/shared/errors.ts';
import { RATE_LIMITS } from '../../src/shared/limits.ts';
import { permissions } from '../../src/shared/permissions.ts';
import { APP_ORIGIN, Browser, latestMailTo, required, tokenFrom, uniqueEmail } from '../auth/harness.ts';
import { createAccountTestApp, PASSWORD } from '../api/account-harness.ts';

// Fixtures van de generieke securitysuite (spec security-suite): actors, de permissie-oracle, voorbeeldinput uit het
// zod-schema en de probe-resource met haar probe-app. Alleen testcode; alles draait tegen de echte stack (`pnpm test:db`).

export type AppRoute = (typeof routes)[number];

export const routeLabel = (route: AppRoute): string => `${route.contract.method} ${route.contract.path}`;

// ---------------------------------------------------------------------------------------------------------------------
// De permissie-oracle: per permissie de toegestane rollen, letterlijk uit de specs (accountbeheer, eigen-account,
// design-system) en framework §6. Bewust handgeschreven en NIET afgeleid van check(): anders test de suite de implementatie
// met zichzelf. src/shared/permissions.test.ts heeft een eigen, lokale tabel; die twee verwachtingen zijn onafhankelijk.
// ---------------------------------------------------------------------------------------------------------------------
export const PERMISSIE_ORACLE = {
  'app.use': ['user', 'admin'],
  'me:read': ['user', 'admin'],
  'me:update': ['user', 'admin'],
  'accounts:read': ['admin'],
  'accounts:invite': ['admin'],
  'accounts:manage': ['admin'],
  'design-system:read': ['admin'],
} as const satisfies Record<string, readonly Role[]>;

export type ActorSoort = 'geenSessie' | 'zonderRol' | 'user' | 'adminZonderMfa' | 'adminMfa';

export type Uitkomst =
  | { readonly toegestaan: true }
  | {
      readonly toegestaan: false;
      readonly status: 401 | 403;
      readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'MFA_REQUIRED';
    };

const OORDEEL_ROLLEN = new Map<string, readonly Role[]>(Object.entries(PERMISSIE_ORACLE));

// Wat een route met deze permissie voor deze actor moet doen, zonder check() aan te roepen.
export function verwachteUitkomst(soort: ActorSoort, permissie: string): Uitkomst {
  const rollen = OORDEEL_ROLLEN.get(permissie);
  if (rollen === undefined)
    throw new Error(`permissie '${permissie}' staat niet in PERMISSIE_ORACLE (test/security/fixtures.ts)`);
  if (soort === 'geenSessie') return { toegestaan: false, status: 401, code: 'UNAUTHENTICATED' };
  if (soort === 'zonderRol') return { toegestaan: false, status: 403, code: 'FORBIDDEN' };
  const rol: Role = soort === 'user' ? 'user' : 'admin';
  if (!rollen.includes(rol)) return { toegestaan: false, status: 403, code: 'FORBIDDEN' };
  if (rol === 'admin' && soort === 'adminZonderMfa') return { toegestaan: false, status: 403, code: 'MFA_REQUIRED' };
  return { toegestaan: true };
}

// Rood als een nieuwe permissie niet in de oracle staat (of andersom): geen permissie valt erbuiten.
export function oracleSleutelsVerschil(): { readonly alleenInOracle: string[]; readonly alleenInTabel: string[] } {
  const inOracle = Object.keys(PERMISSIE_ORACLE);
  const inTabel: string[] = [...permissions.names];
  return {
    alleenInOracle: inOracle.filter((naam) => !inTabel.includes(naam)),
    alleenInTabel: inTabel.filter((naam) => !inOracle.includes(naam)),
  };
}

export function adminHeeftPermissie(permissie: string): boolean {
  return OORDEEL_ROLLEN.get(permissie)?.includes('admin') ?? false;
}

// ---------------------------------------------------------------------------------------------------------------------
// Voorbeeldinput en ongeldige varianten, afgeleid uit het zod-schema van het contract (zod v4-introspectie).
// ---------------------------------------------------------------------------------------------------------------------
const SAMPLE_BOODSCHAP = 'voeg sample toe aan test/security/resources.ts';
export const SAMPLE_EMAIL_PREFIX = 'beveiligingstest-sample';

export interface RouteSample {
  // Waarden voor de padparameters (`:id`).
  readonly params: Readonly<Record<string, string>>;
  // Overige velden: body (POST, PUT, PATCH) of querystring (GET, DELETE).
  readonly invoer: Readonly<Record<string, unknown>>;
}

export const heeftBody = (method: Method): boolean => method !== 'GET' && method !== 'DELETE';

function padSleutels(path: string): string[] {
  return [...path.matchAll(/:([A-Za-z0-9_]+)/g)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
}

// Uit optional/default/pipe de eigenlijke schema-laag onder de wrappers.
function kern(field: z.core.$ZodType): z.core.$ZodType {
  if (field instanceof z.ZodOptional || field instanceof z.ZodDefault) return kern(field.unwrap());
  if (field instanceof z.ZodPipe) return kern(field.def.in);
  return field;
}

const isZodType = (waarde: unknown): waarde is z.core.$ZodType =>
  typeof waarde === 'object' && waarde !== null && '_zod' in waarde;

// De velden van het inputschema van de route (zod-object, strict).
function veldenVan(route: AppRoute): [string, z.core.$ZodType][] {
  const velden: [string, z.core.$ZodType][] = [];
  for (const [naam, veld] of Object.entries(z.record(z.string(), z.unknown()).parse(route.contract.input.shape))) {
    if (!isZodType(veld)) throw new Error(`${routeLabel(route)}: veld '${naam}' is geen zod-schema`);
    velden.push([naam, veld]);
  }
  return velden;
}

const isOptioneel = (field: z.core.$ZodType): boolean => z.safeParse(field, undefined).success;

function getal(field: object, naam: string): number | undefined {
  const waarde: unknown = naam in field ? Reflect.get(field, naam) : undefined;
  return typeof waarde === 'number' ? waarde : undefined;
}

function sampleString(field: z.core.$ZodType): string {
  const format: unknown = 'format' in field ? field.format : undefined;
  if (format === 'email') return `${SAMPLE_EMAIL_PREFIX}@template.test`;
  if (typeof format === 'string') throw new Error(`${SAMPLE_BOODSCHAP} (stringformaat '${format}')`);
  const min = getal(field, 'minLength') ?? 1;
  const max = getal(field, 'maxLength') ?? 50;
  return 'beveiligingstest'.padEnd(min, 'x').slice(0, Math.max(min, Math.min(max, 16)));
}

function sampleWaarde(naam: string, veld: z.core.$ZodType): unknown {
  const field = kern(veld);
  const type = field._zod.def.type;
  if (type === 'string') return sampleString(field);
  if (type === 'number') {
    return Math.min(getal(field, 'minValue') ?? 1, getal(field, 'maxValue') ?? Number.MAX_SAFE_INTEGER);
  }
  if (type === 'boolean') return true;
  if (field instanceof z.ZodEnum) return field.options[0];
  if (field instanceof z.ZodLiteral) return field.value;
  throw new Error(`${SAMPLE_BOODSCHAP} (veld '${naam}', type '${type}')`);
}

// Geldige voorbeeldinput: alleen de verplichte velden; optionele velden en velden met een standaardwaarde blijven weg.
export function sampleFor(route: AppRoute): RouteSample {
  const params: Record<string, string> = {};
  const invoer: Record<string, unknown> = {};
  const inPad = padSleutels(route.contract.path);
  for (const [naam, veld] of veldenVan(route)) {
    if (isOptioneel(veld)) continue;
    const waarde = sampleWaarde(naam, veld);
    if (inPad.includes(naam)) params[naam] = String(waarde);
    else invoer[naam] = waarde;
  }
  for (const naam of inPad) {
    if (!(naam in params)) throw new Error(`${SAMPLE_BOODSCHAP} (padparameter '${naam}' staat niet in het schema)`);
  }
  return { params, invoer };
}

// Velden die niet in het pad staan: alleen die kunnen ontbreken of een verkeerd type krijgen.
function invoerVelden(route: AppRoute): [string, z.core.$ZodType][] {
  const inPad = padSleutels(route.contract.path);
  return veldenVan(route).filter(([naam]) => !inPad.includes(naam));
}

export function verplichteVelden(route: AppRoute): string[] {
  return invoerVelden(route)
    .filter(([, veld]) => !isOptioneel(veld))
    .map(([naam]) => naam);
}

// Een waarde die nooit geldig is voor het veld. In een querystring is alles tekst: een string kan daar geen verkeerd
// type hebben (geen waarde), de andere typen krijgen onzin.
function onjuisteWaarde(naam: string, veld: z.core.$ZodType, method: Method): { readonly waarde: unknown } | null {
  const type = kern(veld)._zod.def.type;
  if (!['string', 'number', 'boolean', 'enum', 'literal'].includes(type)) {
    throw new Error(`${SAMPLE_BOODSCHAP} (veld '${naam}', type '${type}')`);
  }
  if (heeftBody(method)) return { waarde: { onjuist: true } };
  return type === 'string' ? null : { waarde: 'ongeldig-§' };
}

export function onjuisteVelden(route: AppRoute): { readonly veld: string; readonly waarde: unknown }[] {
  return invoerVelden(route).flatMap(([naam, veld]) => {
    const onjuist = onjuisteWaarde(naam, veld, route.contract.method);
    return onjuist === null ? [] : [{ veld: naam, waarde: onjuist.waarde }];
  });
}

export const metVeld = (sample: RouteSample, veld: string, waarde: unknown): RouteSample => ({
  ...sample,
  invoer: { ...sample.invoer, [veld]: waarde },
});

export const zonderVeld = (sample: RouteSample, veld: string): RouteSample => ({
  ...sample,
  invoer: Object.fromEntries(Object.entries(sample.invoer).filter(([naam]) => naam !== veld)),
});

// Een body boven MAX_BODY_BYTES (grens uit core/limits, nooit een eigen getal).
export const teGroteBody = (): string => JSON.stringify({ vulling: 'x'.repeat(MAX_BODY_BYTES) });

// ---------------------------------------------------------------------------------------------------------------------
// Antwoorden en de foutvorm (AC-7).
// ---------------------------------------------------------------------------------------------------------------------
export interface Antwoord {
  readonly status: number;
  readonly tekst: string;
  readonly json: unknown;
  readonly requestId: string | null;
}

export async function leesAntwoord(response: Response): Promise<Antwoord> {
  const tekst = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(tekst);
  } catch {
    json = undefined;
  }
  return { status: response.status, tekst, json, requestId: response.headers.get('x-request-id') };
}

// Wat een foutantwoord naar buiten niet mag bevatten: stacktrace, SQL, tabel- of constraintnamen (framework §6).
const LEK =
  /\bat\s+\S+\s+\(|\bstack\b|\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|\bconstraint\b|security_probes|\bpg_|\.ts\b|node_modules|duplicate key|violates|division by zero/i;

const foutBody = z.object({ code: z.string(), requestId: z.string() }).strict();

// Leeg = in orde: precies { code, requestId }, requestId gelijk aan X-Request-Id, publieke code, geen lek.
export function foutvormProblemen(antwoord: Antwoord): string[] {
  const problemen: string[] = [];
  const body = foutBody.safeParse(antwoord.json);
  if (!body.success) return [`body is niet precies { code, requestId }: ${antwoord.tekst.slice(0, 200)}`];
  if (body.data.requestId === '' || body.data.requestId !== antwoord.requestId) {
    problemen.push(
      `requestId '${body.data.requestId}' is niet gelijk aan X-Request-Id '${String(antwoord.requestId)}'`,
    );
  }
  if (!errors.is(body.data.code)) problemen.push(`code '${body.data.code}' is geen publieke code`);
  if (LEK.test(antwoord.tekst)) problemen.push(`het antwoord lekt interne details: ${antwoord.tekst.slice(0, 200)}`);
  return problemen;
}

// ---------------------------------------------------------------------------------------------------------------------
// Actors en verzoeken tegen het echte routeregister (echte Better Auth-sessies, echte database, Mailpit).
// ---------------------------------------------------------------------------------------------------------------------
export interface Actor {
  readonly soort: ActorSoort;
  readonly userId: string;
  readonly email: string;
  readonly browser: Browser;
  // Aantal verzoeken per ratelimit-categorie; een geweigerd verzoek telt ook mee (spec rate-limit).
  readonly hits: Map<RateLimitCategory, number>;
}

export interface Verzoek {
  readonly sample: RouteSample;
  // Een ruwe body in plaats van JSON van `sample.invoer` (kapotte JSON, arraybody, te groot).
  readonly ruw?: string;
}

type Mintbaar = Exclude<ActorSoort, 'geenSessie'>;

function padMet(route: AppRoute, sample: RouteSample): string {
  const pad = route.contract.path.replace(/:([A-Za-z0-9_]+)/g, (_, naam: string) =>
    encodeURIComponent(sample.params[naam] ?? ''),
  );
  const query = heeftBody(route.contract.method)
    ? ''
    : `?${new URLSearchParams(Object.entries(sample.invoer).map(([naam, waarde]) => [naam, String(waarde)])).toString()}`;
  return `/api${pad}${query === '?' ? '' : query}`;
}

function bodyVan(route: AppRoute, verzoek: Verzoek): string | undefined {
  if (verzoek.ruw !== undefined) return verzoek.ruw;
  return heeftBody(route.contract.method) ? JSON.stringify(verzoek.sample.invoer) : undefined;
}

export function createSecurityFixtures() {
  const h = createAccountTestApp();
  const pools = new Map<Mintbaar, Actor[]>();
  const alleIds = new Set<string>();

  function nieuweActor(soort: ActorSoort, account: { userId: string; email: string; browser: Browser }): Actor {
    alleIds.add(account.userId);
    return { soort, ...account, hits: new Map() };
  }

  async function zonderRolAccount() {
    const email = uniqueEmail('beveiliging-zonder-rol');
    const { userId } = await inviteUser(h.auth, { name: 'Zonder Rol', email });
    const token = tokenFrom((await latestMailTo(email)).text);
    await new Browser(h.app).post('/api/auth/reset-password', { token, newPassword: PASSWORD });
    return { email, userId, browser: await h.signIn(email) };
  }

  async function maak(soort: Mintbaar): Promise<Actor> {
    if (soort === 'zonderRol') return nieuweActor(soort, await zonderRolAccount());
    if (soort === 'user') return nieuweActor(soort, await h.account('user'));
    const admin = await h.account('admin');
    if (soort === 'adminMfa') await h.enableTotp(admin.browser);
    return nieuweActor(soort, admin);
  }

  // Een actor van deze soort met nog ruimte onder de rate limit van de categorie; anders een verse (spec: telbudget).
  async function actor(soort: ActorSoort, categorie: RateLimitCategory): Promise<Actor> {
    if (soort === 'geenSessie') {
      return { soort, userId: '', email: '', browser: new Browser(h.app), hits: new Map() };
    }
    const lijst = pools.get(soort) ?? [];
    const gevonden = lijst.find((kandidaat) => (kandidaat.hits.get(categorie) ?? 0) < RATE_LIMITS[categorie]);
    if (gevonden !== undefined) return gevonden;
    const vers = await maak(soort);
    pools.set(soort, [...lijst, vers]);
    return vers;
  }

  async function stuurMetBrowser(browser: Browser, route: AppRoute, verzoek: Verzoek): Promise<Antwoord> {
    const headers = new Headers({
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      origin: APP_ORIGIN,
    });
    headers.set(required('CLIENT_IP_HEADER'), browser.ip);
    if (browser.cookies.size > 0) {
      headers.set('cookie', [...browser.cookies].map(([naam, waarde]) => `${naam}=${waarde}`).join('; '));
    }
    const body = bodyVan(route, verzoek);
    const init = { method: route.contract.method, headers, ...(body === undefined ? {} : { body }) };
    const response = await h.app.fetch(new Request(`${APP_ORIGIN}${padMet(route, verzoek.sample)}`, init));
    return leesAntwoord(response);
  }

  async function stuurAls(soort: ActorSoort, route: AppRoute, verzoek: Verzoek): Promise<Antwoord> {
    const categorie = rateLimitCategory(route.contract);
    const wie = await actor(soort, categorie);
    wie.hits.set(categorie, (wie.hits.get(categorie) ?? 0) + 1);
    return stuurMetBrowser(wie.browser, route, verzoek);
  }

  // Idle verlopen: Better Auth dwingt de idle-termijn af via expiresAt. ageSession() verschuift alleen createdAt/updatedAt
  // (absoluut), dus dit is de aparte helper (spec: fixtures, de harness blijft ongewijzigd).
  async function expireSession(token: string): Promise<void> {
    await h.authDb.query(`update session set "expiresAt" = now() - interval '1 minute' where token = $1`, [token]);
  }

  let bron: Promise<Actor> | undefined;
  // Het account waarvan de extra sessies verlopen; zijn eerste sessie blijft geldig (bewijs dat niets is ingetrokken).
  function verlopenBron(): Promise<Actor> {
    bron ??= h.account('user').then((account) => nieuweActor('user', account));
    return bron;
  }

  // Een verse sessie van het bronaccount, absoluut (> 7 dagen) of idle (expiresAt verstreken) verlopen.
  async function verlopenBrowser(variant: 'absoluut' | 'idle'): Promise<Browser> {
    const { email, userId } = await verlopenBron();
    const browser = await h.signIn(email);
    const token = (await h.sessionsOf(userId)).at(-1)?.token;
    if (token === undefined) throw new Error('verlopen sessie: geen sessie gevonden na het inloggen');
    if (variant === 'absoluut') await h.ageSession(token, SESSION_ABSOLUTE_SECONDS + 3600);
    else await expireSession(token);
    return browser;
  }

  const benoemd = new Map<string, Promise<Actor>>();
  // A en B blijven per rol dezelfde twee accounts; admin-acteurs hebben MFA.
  function eerste(naam: 'A' | 'B', rol: Role): Promise<Actor> {
    const sleutel = `${naam}:${rol}`;
    const bestaand = benoemd.get(sleutel);
    if (bestaand !== undefined) return bestaand;
    const soort = rol === 'admin' ? 'adminMfa' : 'user';
    const nieuw = naam === 'A' ? actor(soort, 'lezen') : maak(soort);
    benoemd.set(sleutel, nieuw);
    return nieuw;
  }

  // Toestand die een handler zou wijzigen en die de suite kan zien: naam, blokkade en sessies van de fixtures, en of er een
  // account voor het voorbeeld-e-mailadres is aangemaakt (uitnodigen). Gelijk voor en na = de handler is niet uitgevoerd.
  async function bijwerkingen(ids: readonly string[] = [...alleIds]) {
    const gebruikers = await h.authDb.query(
      'select id, name, email, blocked_at from "user" where id = any($1) order by id',
      [ids],
    );
    const sessies = await h.authDb.query(
      'select "userId", count(*)::int as aantal from session where "userId" = any($1) group by "userId" order by "userId"',
      [ids],
    );
    const voorbeelden = await h.authDb.query('select count(*)::int as aantal from "user" where email like $1', [
      `${SAMPLE_EMAIL_PREFIX}%`,
    ]);
    return { ids, gebruikers: gebruikers.rows, sessies: sessies.rows, voorbeelden: voorbeelden.rows };
  }

  return {
    ...h,
    actor,
    stuurAls,
    stuurMetBrowser,
    expireSession,
    verlopenBron,
    verlopenBrowser,
    bijwerkingen,
    A: (rol: Role = 'user') => eerste('A', rol),
    B: (rol: Role = 'user') => eerste('B', rol),
  };
}

export type SecurityFixtures = ReturnType<typeof createSecurityFixtures>;

// ---------------------------------------------------------------------------------------------------------------------
// De probe-resource en de probe-app (spec: "Datawijzigingen"). De tabel bestaat alleen binnen een transactie die
// terugdraait; de probe-app gebruikt de test-gateway van asUser(...).auth, want Better Auth ziet de tabel niet.
// ---------------------------------------------------------------------------------------------------------------------
const PROBE_TABEL = 'security_probes';

// De generatorsjabloon, zodat een sjabloonwijziging zichtbaar rood wordt, plus het ene veld uit een vervolgmigratie.
function probeStatements(): string[] {
  const sjabloon = readFileSync(new URL('../../scripts/kit/templates/migratie.sql.tmpl', import.meta.url), 'utf8');
  const uitSjabloon = sjabloon
    .replaceAll('__tabel__', PROBE_TABEL)
    .replaceAll('__naam__', 'security-probe')
    .split('\n')
    .filter((regel) => !regel.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '');
  return [
    ...uitSjabloon,
    `alter table public.${PROBE_TABEL} add column label text not null`,
    `create unique index ${PROBE_TABEL}_owner_label_key on public.${PROBE_TABEL} (owner_id, label)`,
    `grant insert (label), update (label) on public.${PROBE_TABEL} to app_authenticated`,
  ];
}

const leeg = z.object({}).strict();
const nergens = z.null();

// Elke route faalt met een databasefout of een onverwachte uitzondering; de handler bereikt nooit een antwoord.
const probeDubbel = defineRoute(
  defineContract({ method: 'POST', path: '/probes/dubbel', input: leeg, output: nergens, permission: 'app.use' }),
  async ({ tx }) => {
    await tx.execute(sql`insert into public.security_probes (label) values ('dubbel')`);
    await tx.execute(sql`insert into public.security_probes (label) values ('dubbel')`);
    return null;
  },
);
const probeOnbekendDoel = defineRoute(
  defineContract({
    method: 'POST',
    path: '/probes/onbekend-doel',
    input: leeg,
    output: nergens,
    permission: 'accounts:manage',
  }),
  async ({ tx }) => {
    await tx.execute(sql`select app.assign_role('beveiligingstest-bestaat-niet', 'user')`);
    return null;
  },
);
const probeVerboden = defineRoute(
  defineContract({ method: 'POST', path: '/probes/verboden', input: leeg, output: nergens, permission: 'app.use' }),
  async ({ tx, actor }) => {
    await tx.execute(sql`select app.assign_role(${actor.userId}, 'admin')`);
    return null;
  },
);
const probeDeelDoorNul = defineRoute(
  defineContract({ method: 'GET', path: '/probes/deel-door-nul', input: leeg, output: nergens, permission: 'app.use' }),
  async ({ tx }) => {
    await tx.execute(sql`select 1 / 0`);
    return null;
  },
);
const probeUitzondering = defineRoute(
  defineContract({ method: 'GET', path: '/probes/uitzondering', input: leeg, output: nergens, permission: 'app.use' }),
  () => {
    throw new Error('select * from public.security_probes violates constraint security_probes_owner_label_key');
  },
);

export const PROBE_ROUTES = [
  probeDubbel,
  probeOnbekendDoel,
  probeVerboden,
  probeDeelDoorNul,
  probeUitzondering,
] as const;

const notUsed = () => Promise.reject(new Error('niet gebruikt in de probe-app'));
const unusedServices: AppServices = {
  invitations: { invite: notUsed, reinvite: notUsed },
  profile: { rename: notUsed, confirmEmail: notUsed },
  sessions: { list: notUsed, revoke: notUsed, revokeOthers: notUsed, revokeAll: notUsed },
};

export interface Probe {
  readonly db: TestDb;
  // De app voor één testgebruiker: echte pipeline en database, sessie via de test-gateway.
  readonly appVoor: (user: TestUser) => App;
  readonly stuur: (app: App, method: Method, path: string) => Promise<Antwoord>;
  readonly sluit: () => Promise<void>;
}

// Opent een terugdraaiende testtransactie en bouwt de probetabel erin op (als app_migrator, zoals een migratie).
export async function openProbe(): Promise<Probe> {
  const pool: pg.Pool = createPool(required('MIGRATOR_DATABASE_URL'));
  const db = await beginTestDb(pool);
  const beheerder = await db.asUser('admin');
  await db.withUser(beheerder.actor, async (tx) => {
    // Terug naar de sessiegebruiker (app_migrator): DDL kan niet als app_authenticated. Alles draait terug.
    await tx.execute(sql.raw('reset role'));
    for (const statement of probeStatements()) await tx.execute(sql.raw(statement));
  });
  return {
    db,
    appVoor: (user) =>
      createApp<AppServices>({
        appOrigin: APP_ORIGIN,
        auth: user.auth,
        withUser: db.withUser,
        services: unusedServices,
        routes: PROBE_ROUTES,
        errors,
      }),
    stuur: async (app, method, path) =>
      leesAntwoord(
        await app.fetch(
          new Request(`${APP_ORIGIN}/api${path}`, {
            method,
            headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: APP_ORIGIN },
            ...(heeftBody(method) ? { body: '{}' } : {}),
          }),
        ),
      ),
    sluit: async () => {
      await db.rollback();
      await pool.end();
    },
  };
}
