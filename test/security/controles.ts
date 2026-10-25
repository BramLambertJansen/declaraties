import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { routes } from '../../src/api/app.ts';
import type { TestDb, TestUser } from '../../src/core/api/db/testing.ts';
import type { Contract, Method } from '../../src/core/shared/contract.ts';
import type { Role } from '../../src/core/shared/can.ts';
import { routeLabel, type Antwoord, type SecurityFixtures } from './fixtures.ts';
import {
  codeVan,
  foutTekst,
  padParameters,
  pgCode,
  rijenVan,
  splitsLabel,
  uitvoerVan,
  zonderRequestId,
} from './hulp.ts';
import type { Actie, ResourceRegel, RouteKlasse } from './resources.ts';

// De controlefuncties van de eigenaarschapssuite (spec security-suite, AC-8 t/m AC-11). Elke functie geeft de problemen als
// tekst terug (leeg = in orde) in plaats van zelf te asserteren, zodat de zelftest (AC-13) kan bewijzen dat ze een gebroken
// variant vangen. Echte database en echte pipeline; alleen de sessie van de probe-app komt uit de test-gateway van asUser.

export type Resources = Readonly<Record<string, ResourceRegel>>;
export type Classificatie = Readonly<Record<string, RouteKlasse>>;
const tweedeSample = z.object({ createTweede: z.record(z.string(), z.unknown()) });

// ---------------------------------------------------------------------------------------------------------------------
// Catalogus en directe databasetoegang (AC-8, AC-10).
// ---------------------------------------------------------------------------------------------------------------------
export interface Spelers {
  readonly db: TestDb;
  readonly A: TestUser;
  readonly B: TestUser;
}

// Elke tabel in public met een kolom owner_id (hetzelfde criterium als de eigenaartabellen-invariant, db/tests/invarianten.sql).
export async function eigenaarTabellen(spelers: Spelers): Promise<string[]> {
  return spelers.db.withUser(spelers.A.actor, async (tx) => {
    const rijen = await rijenVan(
      tx,
      sql`select format('%I.%I', n.nspname, c.relname) as tabel
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attname = 'owner_id' and not a.attisdropped
        where c.relkind in ('r', 'p') and n.nspname = 'public'
        order by 1`,
    );
    return rijen.map((rij) => z.string().parse(rij.tabel));
  });
}

const regelVoor = (resources: Resources, tabel: string): ResourceRegel | undefined =>
  Object.values(resources).find((regel) => regel.tabel === tabel);

function insertSql(tabel: string, kolommen: Readonly<Record<string, unknown>>): SQL {
  const namen = sql.join(
    Object.keys(kolommen).map((naam) => sql.identifier(naam)),
    sql`, `,
  );
  const waarden = sql.join(
    Object.values(kolommen).map((waarde) => sql`${waarde}`),
    sql`, `,
  );
  return sql`insert into ${sql.raw(tabel)} (${namen}) values (${waarden}) returning id`;
}

// De rij zelf (alle kolommen, ook owner_id en created_at) als jsonb: "ongewijzigd" is een vergelijking op de rij, niet op id's.
const rijSql = (tabel: string, id: string): SQL =>
  sql`select to_jsonb(t) as rij from ${sql.raw(tabel)} t where t.id = ${id}`;

interface Poging {
  readonly rijen: Record<string, unknown>[];
  readonly aantal: number;
  readonly pg: string | undefined;
  readonly bericht: string | undefined;
}

// Eén statement als deze gebruiker (een savepoint, dus een fout laat de rest van de testtransactie heel).
async function probeer(db: TestDb, wie: TestUser, statement: SQL): Promise<Poging> {
  try {
    const { rijen, aantal } = await db.withUser(wie.actor, (tx) => uitvoerVan(tx, statement));
    return { rijen, aantal, pg: undefined, bericht: undefined };
  } catch (error) {
    return { rijen: [], aantal: 0, pg: pgCode(error), bericht: foutTekst(error) };
  }
}

const idSchema = z.object({ id: z.string() });

function idUit(poging: Poging): string | undefined {
  const gelezen = idSchema.safeParse(poging.rijen[0]);
  return gelezen.success ? gelezen.data.id : undefined;
}

// B mag niets zien of raken: 0 rijen, of "geen recht" (42501). Een andere fout betekent dat de controle niets bewijst.
// Update en delete lopen zonder where en returning: die lezen geen kolommen, dus alleen de update- en delete-policy beslissen
// (een where of returning haalt de select-policy erbij, en die zou een te ruime update- of delete-policy maskeren). B heeft
// zelf geen rijen, dus elke geraakte rij is van A. Een 42501 bij update telt niet als weigering: B heeft het kolomrecht (dat is
// vooraf gecontroleerd), dus een 42501 betekent dat de policy de rij van A wel liet matchen en pas de with check weigerde.
async function bRaaktNiets(
  spelers: Spelers,
  tabel: string,
  doel: { kolom: string; waarde: unknown },
): Promise<string[]> {
  const bestaat = await probeer(
    spelers.db,
    spelers.B,
    sql`select exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid = ${tabel}::regclass and a.attname = ${doel.kolom}::name and a.attnum > 0 and not a.attisdropped
    ) as ok`,
  );
  const recht = await probeer(
    spelers.db,
    spelers.B,
    sql`select has_column_privilege(${tabel}::text, ${doel.kolom}::text, 'UPDATE') as ok`,
  );
  const ok = z.object({ ok: z.boolean() });
  const bestaatKolom = ok.safeParse(bestaat.rijen[0]);
  const mag = ok.safeParse(recht.rijen[0]);
  const problemen: string[] = [];
  const magUpdaten = mag.success && mag.data.ok;
  if (!bestaatKolom.success || !bestaatKolom.data.ok) {
    problemen.push(
      `${tabel}: kolom ${doel.kolom} uit sample.update bestaat niet in ${tabel}; gebruik de kolomnaam (test/security/resources.ts)`,
    );
  } else if (!magUpdaten) {
    problemen.push(
      `${tabel}: B heeft geen UPDATE-recht op '${doel.kolom}': kies een updatebare kolom in sample.update (test/security/resources.ts)`,
    );
  }
  const nieuw = typeof doel.waarde === 'string' ? `${doel.waarde}-door-b` : doel.waarde;
  const pogingen = [
    ['select', sql`select id from ${sql.raw(tabel)}`],
    ['update', sql`update ${sql.raw(tabel)} set ${sql.identifier(doel.kolom)} = ${nieuw}`],
    ['delete', sql`delete from ${sql.raw(tabel)}`],
  ] as const;
  for (const [actie, statement] of pogingen) {
    if (actie === 'update' && !magUpdaten) continue;
    const poging = await probeer(spelers.db, spelers.B, statement);
    if (poging.aantal > 0) {
      problemen.push(`${tabel}: B raakt via ${actie} ${String(poging.aantal)} rij(en) van A`);
    } else if (poging.bericht !== undefined && (poging.pg !== '42501' || actie === 'update')) {
      problemen.push(`${tabel}: B ${actie} gaf een onverwachte fout: ${poging.bericht}`);
    }
  }
  return problemen;
}

async function eigenTabelProblemen(spelers: Spelers, tabel: string, regel: ResourceRegel): Promise<string[]> {
  const rij = regel.sample.rij ?? regel.sample.create;
  const [kolom, waarde] = Object.entries(regel.sample.update ?? {})[0] ?? [];
  if (kolom === undefined) {
    return [
      `${tabel}: sample.update ontbreekt of is leeg: kies een updatebare kolom in sample.update (test/security/resources.ts)`,
    ];
  }
  const gemaakt = await probeer(spelers.db, spelers.A, insertSql(tabel, rij));
  const id = idUit(gemaakt);
  if (id === undefined) {
    return [`${tabel}: A kan geen eigen rij maken (${gemaakt.bericht ?? 'geen rij teruggekregen'})`];
  }
  const voor = await probeer(spelers.db, spelers.A, rijSql(tabel, id));
  if (voor.rijen.length !== 1)
    return [`${tabel}: A ziet de eigen rij niet terug (select-policy ontbreekt of is te streng)`];
  const problemen = await bRaaktNiets(spelers, tabel, { kolom, waarde });
  const na = await probeer(spelers.db, spelers.A, rijSql(tabel, id));
  if (!isDeepStrictEqual(voor.rijen, na.rijen)) problemen.push(`${tabel}: de rij van A is veranderd door B`);
  return problemen;
}

// AC-8: voor elke owner-tabel in de catalogus maakt A een rij en raakt B met select, update en delete 0 rijen; de rij van A
// blijft zoals hij was. Een owner-tabel zonder resources-regel is zelf een probleem (AC-11).
export async function tabelEigenaarProblemen(spelers: Spelers, resources: Resources): Promise<string[]> {
  const problemen: string[] = [];
  for (const tabel of await eigenaarTabellen(spelers)) {
    const regel = regelVoor(resources, tabel);
    if (regel === undefined) {
      problemen.push(`${tabel}: owner-tabel zonder regel in resources (test/security/resources.ts)`);
    } else {
      problemen.push(...(await eigenTabelProblemen(spelers, tabel, regel)));
    }
  }
  return problemen;
}

function spoofKolommen(spelers: Spelers): [string, Record<string, unknown>][] {
  return [
    ['owner_id van B', { owner_id: spelers.B.actor.userId }],
    ['de eigen owner_id', { owner_id: spelers.A.actor.userId }],
    ['een zelfgekozen id', { id: randomUUID() }],
    ['een zelfgekozen created_at', { created_at: new Date().toISOString() }],
  ];
}

// Een poging die moet mislukken met 42501 (geen recht, of de with check van de policy).
function verwachtGeenRecht(omschrijving: string, poging: Poging): string[] {
  if (poging.pg === '42501') return [];
  const uitkomst = poging.bericht === undefined ? 'het lukte' : `fout ${poging.pg ?? '?'}: ${poging.bericht}`;
  return [`${omschrijving}: ${uitkomst}, verwacht 42501`];
}

async function spoofTabelProblemen(spelers: Spelers, tabel: string, regel: ResourceRegel): Promise<string[]> {
  const rij = regel.sample.rij ?? regel.sample.create;
  // Eerst de eigen rij: een poging die ten onrechte lukt, botst daarna op de unieke index en blijft toch zichtbaar als probleem.
  const id = idUit(await probeer(spelers.db, spelers.A, insertSql(tabel, rij)));
  if (id === undefined) return [`${tabel}: A kan geen eigen rij maken om te wijzigen`];
  const voor = await probeer(spelers.db, spelers.A, rijSql(tabel, id));
  const problemen: string[] = [];
  for (const [naam, extra] of spoofKolommen(spelers)) {
    const poging = await probeer(spelers.db, spelers.A, insertSql(tabel, { ...rij, ...extra }));
    problemen.push(...verwachtGeenRecht(`${tabel}: A insert met ${naam}`, poging));
  }
  for (const [naam, extra] of spoofKolommen(spelers)) {
    const [kolom, waarde] = Object.entries(extra)[0] ?? [];
    if (kolom === undefined) continue;
    const wijzig = sql`update ${sql.raw(tabel)} set ${sql.identifier(kolom)} = ${waarde} where id = ${id} returning id`;
    problemen.push(
      ...verwachtGeenRecht(`${tabel}: A update met ${naam}`, await probeer(spelers.db, spelers.A, wijzig)),
    );
  }
  const na = await probeer(spelers.db, spelers.A, rijSql(tabel, id));
  if (!isDeepStrictEqual(voor.rijen, na.rijen))
    problemen.push(`${tabel}: de rij van A is veranderd door een mislukte poging`);
  const bZiet = await probeer(spelers.db, spelers.B, sql`select id from ${sql.raw(tabel)}`);
  if (bZiet.rijen.length > 0) problemen.push(`${tabel}: B ziet een rij na de pogingen van A`);
  return problemen;
}

// AC-10 (direct op de database): A kan owner_id, id en created_at niet kiezen, bij insert noch update (42501), en er verandert niets.
export async function spoofDbProblemen(spelers: Spelers, resources: Resources): Promise<string[]> {
  const problemen: string[] = [];
  for (const tabel of await eigenaarTabellen(spelers)) {
    const regel = regelVoor(resources, tabel);
    if (regel === undefined) {
      problemen.push(`${tabel}: owner-tabel zonder regel in resources (test/security/resources.ts)`);
    } else {
      problemen.push(...(await spoofTabelProblemen(spelers, tabel, regel)));
    }
  }
  return problemen;
}

// ---------------------------------------------------------------------------------------------------------------------
// Classificatie (AC-11): fail-closed, nooit overslaan.
// ---------------------------------------------------------------------------------------------------------------------
export interface Inventaris {
  // 'METHODE /pad' van elke route in het register.
  readonly routes: readonly string[];
  readonly classificatie: Classificatie;
  readonly resources: Resources;
  // 'schema.tabel' van elke owner-tabel in de catalogus.
  readonly eigenaarTabellen: readonly string[];
}

export function classificatieProblemen(inventaris: Inventaris): string[] {
  const { classificatie, resources } = inventaris;
  const geclassificeerd = new Set(Object.keys(classificatie));
  const ontbreekt = inventaris.routes
    .filter((label) => !geclassificeerd.has(label))
    .map((label) => `route '${label}' staat niet in routeClassificatie (test/security/resources.ts)`);
  const zonderResource = Object.entries(classificatie).flatMap(([label, klasse]) =>
    klasse.scope === 'eigenaar' && !Object.hasOwn(resources, klasse.resource)
      ? [
          `route '${label}' wijst naar resource '${klasse.resource}', die niet in resources staat (test/security/resources.ts)`,
        ]
      : [],
  );
  const zonderRegel = inventaris.eigenaarTabellen
    .filter((tabel) => regelVoor(resources, tabel) === undefined)
    .map((tabel) => `owner-tabel '${tabel}' heeft geen regel in resources (test/security/resources.ts)`);
  const verouderd = Object.keys(classificatie)
    .filter((label) => !inventaris.routes.includes(label))
    .map((label) => `routeClassificatie bevat '${label}', maar die route staat niet in het register`);
  const zonderTweede = Object.entries(resources)
    .filter(([, regel]) => !tweedeSample.safeParse(regel.sample).success)
    .map(([naam]) => `${naam}: sample.createTweede ontbreekt; twee rijen per eigenaar zijn vereist voor paginering`);
  return [...ontbreekt, ...verouderd, ...zonderResource, ...zonderRegel, ...zonderTweede];
}

// Een route zonder strict input laat een onbekend veld (owner_id!) stilletjes door: createApp en defineContract weigeren dat bij
// opstart, deze controle bewijst het ook voor wat er in het register staat.
export function strictProblemen(
  lijst: readonly { readonly contract: Pick<Contract, 'method' | 'path' | 'input'> }[],
): string[] {
  return lijst
    .filter(({ contract }) => contract.input.def.catchall?._zod.def.type !== 'never')
    .map(({ contract }) => `route '${contract.method} ${contract.path}': input is niet strict`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Eigenaarschap via de API (AC-9, AC-10): A en B bellen dezelfde routes; de zender bepaalt hoe (probe-app of echt register).
// ---------------------------------------------------------------------------------------------------------------------
export type Wie = 'A' | 'B';

export interface Aanroep {
  readonly method: Method;
  // Het pad met :parameters, zoals in het contract.
  readonly pad: string;
  readonly params: Readonly<Record<string, string>>;
  readonly invoer: Readonly<Record<string, unknown>>;
}

export type Zender = (wie: Wie, aanroep: Aanroep) => Promise<Antwoord>;

export interface EigenaarOpzet {
  readonly zend: Zender;
  readonly classificatie: Classificatie;
  readonly resources: Resources;
  readonly gebruikers: { readonly A: string; readonly B: string };
}

// De zender voor het echte register: echte Better Auth-sessies en cookies van A en B uit de fixtures.
export function echteZender(t: SecurityFixtures, rol: Role = 'user'): Zender {
  return async (wie, aanroep) => {
    const label = `${aanroep.method} ${aanroep.pad}`;
    const route = routes.find((kandidaat) => routeLabel(kandidaat) === label);
    if (route === undefined) throw new Error(`route '${label}' staat niet in het register`);
    const actor = await (wie === 'A' ? t.A(rol) : t.B(rol));
    return t.stuurMetBrowser(actor.browser, route, { sample: { params: aanroep.params, invoer: aanroep.invoer } });
  };
}

interface Context {
  readonly o: EigenaarOpzet;
  readonly naam: string;
  readonly regel: ResourceRegel;
  readonly kaart: ReadonlyMap<Actie, string>;
  readonly ids: { readonly A: string[]; readonly B: string[] };
}

const MAX_PAGINAS = 25;
const pagina = z.object({ items: z.array(z.unknown()), nextCursor: z.string().nullable() });

function labelVan(ctx: Context, actie: Actie): string {
  const label = ctx.kaart.get(actie);
  if (label === undefined) throw new Error(`${ctx.naam}: geen route met actie '${actie}' in de classificatie`);
  return label;
}

function idParameter(label: string): string {
  const namen = padParameters(splitsLabel(label).pad);
  const [naam] = namen;
  if (namen.length !== 1 || naam === undefined)
    throw new Error(`${label}: verwacht precies één padparameter voor het id`);
  return naam;
}

async function stuur(
  ctx: Context,
  wie: Wie,
  doel: { readonly actie: Actie; readonly id?: string; readonly invoer?: Readonly<Record<string, unknown>> },
): Promise<Antwoord> {
  const label = labelVan(ctx, doel.actie);
  const params = doel.id === undefined ? {} : { [idParameter(label)]: doel.id };
  return ctx.o.zend(wie, { ...splitsLabel(label), params, invoer: doel.invoer ?? {} });
}

async function maakRij(ctx: Context, wie: Wie, invoer: Readonly<Record<string, unknown>>): Promise<void> {
  const antwoord = await stuur(ctx, wie, { actie: 'create', invoer });
  const gelezen = idSchema.safeParse(antwoord.json);
  if (antwoord.status !== 200 || !gelezen.success) {
    throw new Error(
      `${ctx.naam}: ${wie} kon geen rij maken (${String(antwoord.status)} ${antwoord.tekst.slice(0, 160)})`,
    );
  }
  if (ctx.ids[wie].includes(gelezen.data.id)) throw new Error(`${ctx.naam}: create gaf tweemaal hetzelfde id`);
  ctx.ids[wie].push(gelezen.data.id);
}

// Het bereiden van een resource: de routes per actie, en altijd twee verschillende rijen voor A en voor B.
async function bereid(o: EigenaarOpzet, naam: string): Promise<Context> {
  const regel = Object.entries(o.resources).find(([sleutel]) => sleutel === naam)?.[1];
  if (regel === undefined) throw new Error(`resource '${naam}' staat niet in resources (test/security/resources.ts)`);
  if (!tweedeSample.safeParse(regel.sample).success) throw new Error(`${naam}: sample.createTweede ontbreekt`);
  const kaart = new Map<Actie, string>();
  for (const [label, klasse] of Object.entries(o.classificatie)) {
    if (klasse.scope !== 'eigenaar' || klasse.resource !== naam) continue;
    if (kaart.has(klasse.actie)) throw new Error(`${naam}: twee routes met actie '${klasse.actie}' (${label})`);
    kaart.set(klasse.actie, label);
  }
  const ctx: Context = { o, naam, regel, kaart, ids: { A: [], B: [] } };
  if (labelVan(ctx, 'list') !== regel.lijst) throw new Error(`${naam}: lijst '${regel.lijst}' is niet de list-route`);
  for (const wie of ['A', 'B'] as const) {
    await maakRij(ctx, wie, regel.sample.create);
    await maakRij(ctx, wie, regel.sample.createTweede);
  }
  return ctx;
}

// Alle pagina's van de lijst als deze gebruiker, via de cursor (limit 1 laat de paginering echt werken).
async function lijstItems(ctx: Context, wie: Wie, extra: Readonly<Record<string, unknown>>): Promise<unknown[][]> {
  const paginas: unknown[][] = [];
  const gezien = new Set<string>();
  let cursor: string | undefined;
  do {
    const invoer = { limit: 1, ...extra, ...(cursor === undefined ? {} : { cursor }) };
    const antwoord = await stuur(ctx, wie, { actie: 'list', invoer });
    const gelezen = pagina.safeParse(antwoord.json);
    if (antwoord.status !== 200 || !gelezen.success) {
      throw new Error(`${ctx.naam}: lijst als ${wie} gaf ${String(antwoord.status)} ${antwoord.tekst.slice(0, 160)}`);
    }
    paginas.push(gelezen.data.items);
    cursor = gelezen.data.nextCursor ?? undefined;
    if (cursor !== undefined && gezien.has(cursor))
      throw new Error(`${ctx.naam}: de lijst herhaalt een cursor (niet-terminerende paginering)`);
    if (cursor !== undefined) gezien.add(cursor);
  } while (cursor !== undefined && paginas.length < MAX_PAGINAS);
  if (cursor !== undefined) throw new Error(`${ctx.naam}: de lijst eindigt niet na ${String(MAX_PAGINAS)} pagina's`);
  return paginas;
}

const idsUit = (paginas: readonly unknown[][]): string[] => paginas.flat().map((item) => idSchema.parse(item).id);

function eersteTekst(invoer: Readonly<Record<string, unknown>>): string | undefined {
  return Object.values(invoer).find((waarde): waarde is string => typeof waarde === 'string');
}

// De lijst van B bevat niets van A: gewoon, met q gelijk aan een waarde van A, en over meerdere pagina's.
async function lijstProblemen(ctx: Context): Promise<string[]> {
  const q = eersteTekst(ctx.regel.sample.create);
  const problemen: string[] = [];
  const varianten: [string, Record<string, unknown>][] = [['zonder zoekterm', {}]];
  if (q !== undefined) varianten.push(['met q gelijk aan een waarde van A', { q }]);
  for (const [omschrijving, extra] of varianten) {
    const paginas = await lijstItems(ctx, 'B', extra);
    const ids = idsUit(paginas);
    const vreemd = ids.filter((id) => !ctx.ids.B.includes(id));
    if (vreemd.length > 0)
      problemen.push(
        `${ctx.naam}: de lijst van B ${omschrijving} bevat ${String(vreemd.length)} rij(en) die niet van B zijn`,
      );
    if (ctx.ids.A.some((id) => ids.includes(id)))
      problemen.push(`${ctx.naam}: de lijst van B ${omschrijving} bevat een rij van A`);
    if (extra.q === undefined && ctx.ids.B.length > 1 && paginas.length < 2) {
      problemen.push(`${ctx.naam}: de lijst met limit 1 gaf geen tweede pagina; de cursor is niet geprobeerd`);
    }
  }
  return problemen;
}

function nietGevonden(naam: string, actie: Actie, antwoorden: { echt: Antwoord; onbekend: Antwoord }): string[] {
  const { echt, onbekend } = antwoorden;
  const problemen: string[] = [];
  if (echt.status !== 404 || codeVan(echt) !== 'NOT_FOUND') {
    problemen.push(
      `${naam}: B ${actie} op een rij van A gaf ${String(echt.status)} ${codeVan(echt) ?? '?'}, verwacht 404 NOT_FOUND`,
    );
  }
  if (echt.status !== onbekend.status || !isDeepStrictEqual(zonderRequestId(echt), zonderRequestId(onbekend))) {
    problemen.push(`${naam}: B ${actie} op een rij van A geeft een ander antwoord dan op een onbekend id (enumeratie)`);
  }
  return problemen;
}

// B gebruikt het id van A voor lezen, wijzigen en verwijderen: 404, gelijk aan het antwoord op een onbekend id.
async function idProblemen(ctx: Context): Promise<string[]> {
  const [aId] = ctx.ids.A;
  if (aId === undefined) throw new Error(`${ctx.naam}: A heeft geen rij`);
  const problemen: string[] = [];
  for (const actie of ['read', 'update', 'delete'] as const) {
    if (!ctx.kaart.has(actie)) continue;
    const invoer = actie === 'update' ? ctx.regel.sample.update : {};
    if (invoer === undefined) throw new Error(`${ctx.naam}: sample.update ontbreekt (test/security/resources.ts)`);
    const echt = await stuur(ctx, 'B', { actie, id: aId, invoer });
    const onbekend = await stuur(ctx, 'B', { actie, id: randomUUID(), invoer });
    problemen.push(...nietGevonden(ctx.naam, actie, { echt, onbekend }));
  }
  return problemen;
}

// De rij van A zelf, via de lijst (alle velden): voor en na moet gelijk zijn.
async function rijenVanA(ctx: Context): Promise<unknown[]> {
  const items = (await lijstItems(ctx, 'A', {})).flat();
  return items.sort((x, y) => idSchema.parse(x).id.localeCompare(idSchema.parse(y).id));
}

async function resourceProblemen(o: EigenaarOpzet, naam: string): Promise<string[]> {
  const ctx = await bereid(o, naam);
  const voor = await rijenVanA(ctx);
  const problemen: string[] = [];
  if (voor.length !== ctx.ids.A.length) {
    problemen.push(
      `${naam}: A ziet ${String(voor.length)} rijen in de lijst maar maakte er ${String(ctx.ids.A.length)}`,
    );
  }
  problemen.push(...(await idProblemen(ctx)), ...(await lijstProblemen(ctx)));
  if (!isDeepStrictEqual(voor, await rijenVanA(ctx))) problemen.push(`${naam}: de rijen van A zijn veranderd door B`);
  return problemen;
}

const resourcesVan = (classificatie: Classificatie): string[] => [
  ...new Set(Object.values(classificatie).flatMap((klasse) => (klasse.scope === 'eigenaar' ? [klasse.resource] : []))),
];

// Een controle die afbreekt (setup mislukt, onverwacht antwoord) is een probleem met de reden, geen stille uitval.
async function bewaakt(naam: string, werk: () => Promise<string[]>): Promise<string[]> {
  try {
    return await werk();
  } catch (error) {
    return [`${naam}: controle afgebroken: ${foutTekst(error)}`];
  }
}

// AC-9: voor elke resource met eigenaar-routes: B krijgt 404 NOT_FOUND op het id van A (gelijk aan een onbekend id), de lijst
// van B bevat niets van A (ook met cursor en q), en de rijen van A blijven zoals ze waren.
export async function eigenaarApiProblemen(o: EigenaarOpzet): Promise<string[]> {
  const problemen: string[] = [];
  for (const naam of resourcesVan(o.classificatie)) {
    problemen.push(...(await bewaakt(naam, () => resourceProblemen(o, naam))));
  }
  return problemen;
}

async function verwachtValidatie(ctx: Context, wie: Wie, poging: Parameters<typeof stuur>[2]): Promise<string[]> {
  const antwoord = await stuur(ctx, wie, poging);
  if (antwoord.status === 400 && codeVan(antwoord) === 'VALIDATION') return [];
  const velden = Object.keys(poging.invoer ?? {}).join(', ');
  return [
    `${ctx.naam}: ${poging.actie} met velden (${velden}) gaf ${String(antwoord.status)} ${codeVan(antwoord) ?? '?'}, verwacht 400 VALIDATION`,
  ];
}

// De basislijn van de spoof-controle: dezelfde input zonder spoof-veld moet gewoon lukken (200). Anders zou een 400 op een
// ander veld (enum, formaat, max) de controle vals groen maken terwijl de route owner_id wel aanneemt.
async function geldigeBasis(ctx: Context, doel: Parameters<typeof stuur>[2]): Promise<string[]> {
  const antwoord = await stuur(ctx, 'A', doel);
  if (antwoord.status === 200) return [];
  return [
    `${ctx.naam}: ${doel.actie} zonder spoof-veld gaf ${String(antwoord.status)} ${codeVan(antwoord) ?? '?'}; sample.spoof/sample.update moet een geldige input zijn (test/security/resources.ts)`,
  ];
}

async function spoofResourceProblemen(o: EigenaarOpzet, naam: string): Promise<string[]> {
  const ctx = await bereid(o, naam);
  const { spoof } = ctx.regel.sample;
  const update = ctx.regel.sample.update ?? {};
  if (spoof === undefined)
    throw new Error(`${naam}: sample.spoof ontbreekt, een geldige en unieke create-input (test/security/resources.ts)`);
  const [aId] = ctx.ids.A;
  const metUpdate = aId !== undefined && ctx.kaart.has('update');
  const problemen = await geldigeBasis(ctx, { actie: 'create', invoer: spoof });
  if (metUpdate) problemen.push(...(await geldigeBasis(ctx, { actie: 'update', id: aId, invoer: update })));
  const voor = await rijenVanA(ctx);
  const waarden = { owner_id: o.gebruikers.B, id: randomUUID(), created_at: new Date().toISOString() };
  for (const [veld, waarde] of Object.entries(waarden)) {
    problemen.push(...(await verwachtValidatie(ctx, 'A', { actie: 'create', invoer: { ...spoof, [veld]: waarde } })));
    if (!metUpdate || veld === 'id') continue;
    problemen.push(
      ...(await verwachtValidatie(ctx, 'A', { actie: 'update', id: aId, invoer: { ...update, [veld]: waarde } })),
    );
  }
  if (!isDeepStrictEqual(voor, await rijenVanA(ctx)))
    problemen.push(`${naam}: een spoof via de input heeft een rij van A gewijzigd of toegevoegd`);
  return problemen;
}

// AC-10 (via de API): owner_id, id en created_at in de input zijn onbekende velden: 400 VALIDATION, en er verandert niets.
// (Bij update komt het id uit het pad en overschrijft het veld id in de body; daar is alleen owner_id en created_at te spoofen.)
export async function spoofApiProblemen(o: EigenaarOpzet): Promise<string[]> {
  const problemen: string[] = [];
  for (const naam of resourcesVan(o.classificatie)) {
    problemen.push(...(await bewaakt(naam, () => spoofResourceProblemen(o, naam))));
  }
  return problemen;
}
