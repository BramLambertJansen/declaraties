// pnpm new:resource <naam> (ADR 0016): een resource volgens het gouden pad, in twee fasen (OV-2).
//  - Zonder docs/specs/<naam>.md: alleen het spec-skelet (status voorstel). Bij status voorstel: weigeren.
//  - Bij een goedgekeurde spec (met --rollen): werkstraat-stap 2 (framework §8, OV-1b): contract, handlers die 501 geven,
//    migratie met het tabelpatroon (docs/reviews/2026-10-10-tabelpatroon.md), branded ID, queries, scherm, route, menu-item
//    en teksten. Geen tests: die schrijft de tester.
// Gate-bestanden (permissions.ts, app.ts, tests) schrijft hij niet: hij drukt de exacte wijziging af en de hoofdsessie zet
// die met Edit, zodat het rolhek per bestand akkoord vraagt (OV-4). Bestaat een doel al, dan schrijft hij niets (OV-5).
// Templates in scripts/kit/templates/; check:new-resource bewijst dat de uitvoer gate:fast haalt (OV-7).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { unpluginRouterGeneratorFactory } from '@tanstack/router-plugin';
import * as prettier from 'prettier';
import { ROLES } from '../../src/core/shared/can.ts';
import { unsafeCast } from '../../src/core/shared/unsafe-cast.ts';

const TEMPLATES = path.join(import.meta.dirname, 'templates');
// Meervoud, kebab-case, Engels, zonder verbuiging (OV-5); de tabelnaam met achtervoegsels blijft onder 63 tekens.
const NAAM = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MAX_NAAM = 40;
// Paden onder /api die core al gebruikt.
const GERESERVEERD = new Set(['api', 'auth', 'dev']);
const PAGE_SIZE = 25;

export class NewResourceError extends Error {}

/**
 * @typedef {{ naam: string, Naam: string, naamCamel: string, tabel: string, NAAM: string }} Namen
 * @typedef {{ pad: string, inhoud: string, nieuw: boolean }} Bestand
 * @typedef {{ pad: string, zoek: string, vervang: string }} GateWijziging
 * @typedef {{ fase: 'skelet' | 'bouw', bestanden: Bestand[], gates: GateWijziging[] }} Plan
 * @typedef {{ rollen?: readonly string[] | undefined, nu?: Date }} Opties
 */

/** @param {string} naam @returns {Namen} */
export function namen(naam) {
  const delen = naam.split('-');
  const Naam = delen.map((deel) => deel.charAt(0).toUpperCase() + deel.slice(1)).join('');
  const tabel = delen.join('_');
  return { naam, Naam, naamCamel: Naam.charAt(0).toLowerCase() + Naam.slice(1), tabel, NAAM: tabel.toUpperCase() };
}

/** @param {string} naam */
export function controleerNaam(naam) {
  if (!NAAM.test(naam) || naam.length > MAX_NAAM)
    throw new NewResourceError(
      `'${naam}' is geen geldige naam: meervoud, kebab-case, Engels, hooguit ${String(MAX_NAAM)} tekens (bijv. invoices)`,
    );
  if (GERESERVEERD.has(naam)) throw new NewResourceError(`'${naam}' is gereserveerd (/api/${naam} bestaat in core)`);
}

/**
 * Fase uit de spec (OV-2). De status is alleen lokaal gelezen; dat de eigenaar hem zette, bewijst pas check-spec-approval.
 * @param {string | null} spec
 * @param {string} naam
 * @returns {'skelet' | 'bouw'}
 */
export function fase(spec, naam) {
  if (spec === null) return 'skelet';
  const status = /^status:\s*(\S+)/m.exec(spec)?.[1];
  if (status === 'goedgekeurd') return 'bouw';
  if (status === 'voorstel')
    throw new NewResourceError(
      `docs/specs/${naam}.md staat op voorstel: bouwen pas als de eigenaar hem op goedgekeurd zet`,
    );
  throw new NewResourceError(
    `docs/specs/${naam}.md heeft status '${status ?? '(geen)'}'; de generator bouwt alleen bij goedgekeurd`,
  );
}

/**
 * @param {string | undefined} rollen  bijv. `user,admin`
 * @returns {string[]}
 */
export function parseRollen(rollen) {
  if (rollen === undefined || rollen.trim() === '')
    throw new NewResourceError(`--rollen is verplicht (bijv. --rollen ${ROLES.join(',')}); er is geen standaard`);
  const lijst = rollen.split(',').map((rol) => rol.trim());
  const onbekend = lijst.filter((rol) => !ROLES.some((bekend) => bekend === rol));
  if (onbekend.length > 0)
    throw new NewResourceError(`onbekende rol: ${onbekend.join(', ')} (rollen: ${ROLES.join(', ')})`);
  if (new Set(lijst).size !== lijst.length) throw new NewResourceError(`--rollen noemt een rol twee keer`);
  // Volgorde van ROLES, zodat de permissietabel niet afhangt van de volgorde op de commandoregel.
  return ROLES.filter((rol) => lijst.includes(rol));
}

/** @param {string} sjabloon @param {Namen} n */
function vul(sjabloon, n) {
  return readFileSync(path.join(TEMPLATES, sjabloon), 'utf8')
    .replaceAll('__naamCamel__', n.naamCamel)
    .replaceAll('__Naam__', n.Naam)
    .replaceAll('__NAAM__', n.NAAM)
    .replaceAll('__tabel__', n.tabel)
    .replaceAll('__naam__', n.naam);
}

/** @param {string} root @param {string} pad */
function lees(root, pad) {
  return readFileSync(path.join(root, pad), 'utf8');
}

/** @param {string} root @param {string} pad @returns {string | null} */
function leesAls(root, pad) {
  return existsSync(path.join(root, pad)) ? lees(root, pad) : null;
}

/**
 * Wat er al is en botst; leeg als de naam vrij is.
 * @param {string} root
 * @param {Namen} n
 * @returns {string[]}
 */
export function botsingen(root, n) {
  const paden = [
    `src/shared/contracts/${n.naam}.ts`,
    `src/api/routes/${n.naam}.ts`,
    `src/web/features/${n.naam}`,
    `src/web/routes/_app/${n.naam}.tsx`,
    `src/web/routes/_app/${n.naam}`,
    `src/web/routes/${n.naam}.tsx`,
  ].filter((pad) => existsSync(path.join(root, pad)));
  const permissies = lees(root, 'src/shared/permissions.ts').includes(`'${n.naam}:`) ? [`permissie ${n.naam}:*`] : [];
  const tekst = new RegExp(`^  ${n.naamCamel}: `, 'm').test(lees(root, 'src/web/copy/ui.ts'))
    ? [`teksten copy.${n.naamCamel}`]
    : [];
  const tabel = new RegExp(`\\b(?:table|view)\\s+(?:public|app)\\.${n.tabel}\\b`, 'i');
  const migraties = readdirSync(path.join(root, 'db/migrations'))
    .filter((bestand) => tabel.test(lees(root, `db/migrations/${bestand}`)))
    .map((bestand) => `tabel ${n.tabel} in db/migrations/${bestand}`);
  return [...paden, ...permissies, ...tekst, ...migraties];
}

/**
 * Een tijdstempel na de laatste migratie (dbmate, UTC).
 * @param {string} root
 * @param {Date} nu
 */
export function migratieVersie(root, nu) {
  const nieuw = nu.toISOString().replace(/\D/g, '').slice(0, 14);
  const laatste = readdirSync(path.join(root, 'db/migrations'))
    .map((bestand) => /^(\d{14})_/.exec(bestand)?.[1])
    .filter((versie) => versie !== undefined)
    .sort()
    .at(-1);
  return laatste !== undefined && laatste >= nieuw ? String(BigInt(laatste) + 1n) : nieuw;
}

/**
 * Voeg `invoeging` in vóór de laatste `anker` vóór `tot` (of in het hele bestand).
 * @param {{ tekst: string, pad: string }} bestand
 * @param {{ anker: string, tot?: string }} plek
 * @param {string} invoeging
 */
function voegIn(bestand, plek, invoeging) {
  const grens = plek.tot === undefined ? bestand.tekst.length : bestand.tekst.indexOf(plek.tot);
  const index = grens < 0 ? -1 : bestand.tekst.lastIndexOf(plek.anker, grens);
  if (index < 0)
    throw new NewResourceError(`${bestand.pad}: '${plek.anker.trim()}' niet gevonden; voeg de resource daar zelf toe`);
  return bestand.tekst.slice(0, index) + invoeging + bestand.tekst.slice(index);
}

/**
 * Vervang de inhoud van een lijst `<begin>[ … ]<eind>` door de inhoud plus `extra`.
 * @param {{ tekst: string, pad: string }} bestand
 * @param {RegExp} lijst  met één groep: de inhoud tussen de haken
 * @param {string} extra
 */
function breidLijstUit(bestand, lijst, extra) {
  const match = lijst.exec(bestand.tekst);
  if (match?.[1] === undefined)
    throw new NewResourceError(`${bestand.pad}: ${String(lijst)} niet gevonden; voeg de resource daar zelf toe`);
  const inhoud = match[1].trim().replace(/,$/, '');
  const nieuw = match[0].replace(match[1], inhoud === '' ? extra : `${inhoud}, ${extra}`);
  return bestand.tekst.replace(match[0], () => nieuw);
}

/** @param {string} tekst @param {string} pad */
function bestand(tekst, pad) {
  return { tekst, pad };
}

/** @param {string} root @param {Namen} n */
function contractenIndex(root, n) {
  const pad = 'src/shared/contracts/index.ts';
  const namenLijst = ['List', 'Create', 'Update', 'Delete'].map((soort) => `${n.naamCamel}${soort}Contract`);
  const metImport = voegIn(
    bestand(lees(root, pad), pad),
    { anker: '\n\n' },
    `\nimport { ${namenLijst.join(', ')} } from './${n.naam}.ts';`,
  );
  return breidLijstUit(
    bestand(metImport, pad),
    /export const contracts = \[([^\]]*)\] as const;/,
    namenLijst.join(', '),
  );
}

/** @param {string} root @param {Namen} n */
function ids(root, n) {
  const pad = 'src/shared/ids.ts';
  const regels = `export const ${n.Naam}Id = brandedId('${n.Naam}Id');\nexport type ${n.Naam}Id = z.infer<typeof ${n.Naam}Id>;\n`;
  const bestaand = leesAls(root, pad);
  if (bestaand !== null) return `${bestaand.trimEnd()}\n\n${regels}`;
  return [
    "import type { z } from 'zod';",
    "import { brandedId } from '#core/shared/ids.ts';",
    '',
    '// Branded IDs van de app (framework §4, src/core/shared/ids.ts); de kolommen staan in db/ids.json.',
    regels,
  ].join('\n');
}

/** @param {string} root @param {Namen} n */
function idsJson(root, n) {
  /** @type {{ brands: Record<string, string> }} */
  const json = JSON.parse(lees(root, 'db/ids.json'));
  const kolom = `public.${n.tabel}.id`;
  if (kolom in json.brands) throw new NewResourceError(`db/ids.json: ${kolom} staat er al`);
  return `${JSON.stringify({ ...json, brands: { ...json.brands, [kolom]: `${n.Naam}Id` } }, null, 2)}\n`;
}

/** @param {string} root @param {Namen} n */
function limits(root, n) {
  const pad = 'src/shared/limits.ts';
  const constante = `${n.NAAM}_PAGE_SIZE`;
  const metConstante = voegIn(
    bestand(lees(root, pad), pad),
    { anker: 'export const APP_LIMITS' },
    `// ${n.naam} (pnpm new:resource): vaste paginagrootte van de lijst (review tabelpatroon, B4).\nexport const ${constante} = ${String(PAGE_SIZE)};\n`,
  );
  return breidLijstUit(bestand(metConstante, pad), /export const APP_LIMITS = \{([^}]*)\} as const;/, constante);
}

/** @param {string} root @param {Namen} n */
function copyUi(root, n) {
  const pad = 'src/web/copy/ui.ts';
  return voegIn(
    bestand(lees(root, pad), pad),
    { anker: '\n} as const;' },
    `\n  // ${n.naam} (pnpm new:resource): vervang door de teksten uit de spec, letterlijk.\n  ${n.naamCamel}: {\n    title: '${n.naam}',\n    empty: 'Nog niets.',\n    created: 'Aangemaakt',\n    more: 'Meer laden',\n    loading: 'Bezig met laden…',\n    shown: (count: number, more: boolean) => \`\${String(count)} ${n.naam} getoond.\${more ? ' Er zijn er meer.' : ''}\`,\n    search: 'Zoeken',\n    sort: 'Sorteren',\n    sorts: { nieuwste: 'Nieuwste eerst', oudste: 'Oudste eerst' },\n    emptyFiltered: 'Niets gevonden. Pas je zoekopdracht aan.',\n  },`,
  );
}

/** @param {string} root @param {Namen} n */
function nav(root, n) {
  const pad = 'src/web/lib/nav.ts';
  const tekst = lees(root, pad);
  const icoon = /import \{([^}]*)\} from 'lucide-react';/;
  const metIcoon = /\bList\b/.test(icoon.exec(tekst)?.[1] ?? '')
    ? tekst
    : breidLijstUit(bestand(tekst, pad), icoon, 'List');
  return voegIn(
    bestand(metIcoon, pad),
    { anker: '\n];' },
    `\n  { label: copy.${n.naamCamel}.title, href: '/${n.naam}', permission: '${n.naam}:read', icon: List },`,
  );
}

/**
 * @param {string} root
 * @param {Namen} n
 * @param {readonly string[]} rollen
 * @returns {Record<string, string>} pad → nieuwe inhoud
 */
function gateInhoud(root, n, rollen) {
  const regels = `\n  // ${n.naam} (spec docs/specs/${n.naam}.md, pnpm new:resource).\n  '${n.naam}:read': { roles: [${rollen.map((rol) => `'${rol}'`).join(', ')}] },\n  '${n.naam}:write': { roles: [${rollen.map((rol) => `'${rol}'`).join(', ')}] },`;
  const testRegels = `\n  '${n.naam}:read': [${rollen.map((rol) => `'${rol}'`).join(', ')}],\n  '${n.naam}:write': [${rollen.map((rol) => `'${rol}'`).join(', ')}],`;
  const permissies = 'src/shared/permissions.ts';
  const test = 'src/shared/permissions.test.ts';
  return {
    [permissies]: voegIn(
      bestand(lees(root, permissies), permissies),
      { anker: '\n});', tot: 'export type Permission' },
      regels,
    ),
    [test]: voegIn(bestand(lees(root, test), test), { anker: '\n};', tot: 'const entries' }, testRegels),
    'src/api/app.ts': app(root, n),
    ...menuTest(root, n, rollen),
  };
}

/** @param {string} root @param {Namen} n */
function app(root, n) {
  const pad = 'src/api/app.ts';
  const routes = ['List', 'Create', 'Update', 'Delete'].map((soort) => `${n.naamCamel}${soort}Route`);
  const metImport = voegIn(
    bestand(lees(root, pad), pad),
    { anker: '\nimport type { AppServices }' },
    `\nimport { ${routes.join(', ')} } from './routes/${n.naam}.ts';`,
  );
  return breidLijstUit(bestand(metImport, pad), /export const routes = \[([^\]]*)\] as const;/, routes.join(', '));
}

/**
 * De menutest (spec accountbeheer, AC-2/AC-3) noemt de links per rol letterlijk; het nieuwe menu-item komt erbij voor elke
 * rol uit --rollen. De rol van een verwachting is die van de laatste `show(…, <rol>)` ervoor.
 * @param {string} root
 * @param {Namen} n
 * @param {readonly string[]} rollen
 * @returns {Record<string, string>}
 */
function menuTest(root, n, rollen) {
  const pad = 'src/web/routes.test.tsx';
  const tekst = leesAls(root, pad);
  if (tekst === null) return {};
  const nieuw = tekst.replace(/\.toStrictEqual\(\[('Home'[^\]]*)\]\)/g, (geheel, lijst, index) => {
    const rol = [...tekst.slice(0, Number(index)).matchAll(/show\('[^']*', (\w+)\)/g)].at(-1)?.[1];
    return rol !== undefined && rollen.includes(rol) ? `.toStrictEqual([${String(lijst)}, '${n.naam}'])` : geheel;
  });
  return nieuw === tekst ? {} : { [pad]: nieuw };
}

/**
 * Kleinste vervanging van hele regels die `oud` in `nieuw` verandert en precies één keer in `oud` staat (voor Edit).
 * @param {string} pad
 * @param {string} oud
 * @param {string} nieuw
 * @returns {GateWijziging}
 */
export function hunk(pad, oud, nieuw) {
  const a = oud.split('\n');
  const b = nieuw.split('\n');
  let begin = 0;
  while (begin < a.length && begin < b.length && a[begin] === b[begin]) begin++;
  let eind = 0;
  while (eind < a.length - begin && eind < b.length - begin && a[a.length - 1 - eind] === b[b.length - 1 - eind])
    eind++;
  for (;;) {
    const zoek = a.slice(begin, a.length - eind).join('\n');
    const uniek = zoek.trim() !== '' && oud.split(zoek).length === 2;
    if (uniek || (begin === 0 && eind === 0)) return { pad, zoek, vervang: b.slice(begin, b.length - eind).join('\n') };
    if (begin > 0) begin--;
    if (eind > 0) eind--;
  }
}

/**
 * @param {string} tekst
 * @param {GateWijziging} wijziging
 */
export function pasToe(tekst, wijziging) {
  if (tekst.split(wijziging.zoek).length !== 2)
    throw new NewResourceError(`${wijziging.pad}: de te vervangen tekst staat er niet precies één keer in`);
  return tekst.replace(wijziging.zoek, () => wijziging.vervang);
}

/** @param {string} root @param {string} pad @param {string} inhoud */
async function opgemaakt(root, pad, inhoud) {
  if (!/\.(?:ts|tsx|json)$/.test(pad)) return inhoud;
  const filepath = path.join(root, pad);
  const config = await prettier.resolveConfig(filepath);
  return prettier.format(inhoud, { ...config, filepath });
}

/**
 * Welke bestanden fase 2 maakt, wijzigt en als gate-wijziging afdrukt (OV-3b: docs/gouden-pad.md noemt ze allemaal).
 * @param {Namen} n
 * @param {string} versie  tijdstempel van de migratie
 */
export function bestandsplan(n, versie) {
  return {
    nieuw: [
      `src/shared/contracts/${n.naam}.ts`,
      `db/migrations/${versie}_${n.tabel}.sql`,
      `src/api/routes/${n.naam}.ts`,
      `src/web/features/${n.naam}/queries.ts`,
      `src/web/features/${n.naam}/${n.naam}-page.tsx`,
      `src/web/routes/_app/${n.naam}.tsx`,
    ],
    gewijzigd: [
      'src/shared/contracts/index.ts',
      'src/shared/ids.ts',
      'src/shared/limits.ts',
      'db/ids.json',
      'src/web/copy/ui.ts',
      'src/web/lib/nav.ts',
    ],
    gates: ['src/shared/permissions.ts', 'src/shared/permissions.test.ts', 'src/api/app.ts', 'src/web/routes.test.tsx'],
  };
}

/**
 * @param {string} root
 * @param {Namen} n
 * @param {Date} nu
 * @returns {Record<string, { inhoud: string, nieuw: boolean }>}
 */
function bouwBestanden(root, n, nu) {
  const versie = migratieVersie(root, nu);
  /** @param {string} inhoud */
  const nieuw = (inhoud) => ({ inhoud, nieuw: true });
  /** @param {string} inhoud */
  const gewijzigd = (inhoud) => ({ inhoud, nieuw: false });
  return {
    [`src/shared/contracts/${n.naam}.ts`]: nieuw(vul('contract.ts.tmpl', n)),
    'src/shared/contracts/index.ts': gewijzigd(contractenIndex(root, n)),
    'src/shared/ids.ts': { inhoud: ids(root, n), nieuw: !existsSync(path.join(root, 'src/shared/ids.ts')) },
    'src/shared/limits.ts': gewijzigd(limits(root, n)),
    'db/ids.json': gewijzigd(idsJson(root, n)),
    [`db/migrations/${versie}_${n.tabel}.sql`]: nieuw(vul('migratie.sql.tmpl', n)),
    [`src/api/routes/${n.naam}.ts`]: nieuw(vul('route.ts.tmpl', n)),
    [`src/web/features/${n.naam}/queries.ts`]: nieuw(vul('queries.ts.tmpl', n)),
    [`src/web/features/${n.naam}/${n.naam}-page.tsx`]: nieuw(vul('page.tsx.tmpl', n)),
    [`src/web/routes/_app/${n.naam}.tsx`]: nieuw(vul('web-route.tsx.tmpl', n)),
    'src/web/copy/ui.ts': gewijzigd(copyUi(root, n)),
    'src/web/lib/nav.ts': gewijzigd(nav(root, n)),
  };
}

/**
 * Het plan, zonder iets te schrijven (ook de basis van --dry-run).
 * @param {string} root
 * @param {string} naam
 * @param {Opties} [opties]
 * @returns {Promise<Plan>}
 */
export async function plan(root, naam, opties = {}) {
  controleerNaam(naam);
  const n = namen(naam);
  const huidig = fase(leesAls(root, `docs/specs/${naam}.md`), naam);
  const bezet = botsingen(root, n);
  if (bezet.length > 0) throw new NewResourceError(`bestaat al, er is niets geschreven:\n  ${bezet.join('\n  ')}`);
  if (huidig === 'skelet') {
    if (opties.rollen !== undefined)
      throw new NewResourceError('--rollen hoort bij fase 2; eerst het spec-skelet en een goedgekeurde spec');
    return {
      fase: huidig,
      bestanden: [{ pad: `docs/specs/${naam}.md`, inhoud: vul('spec.md.tmpl', n), nieuw: true }],
      gates: [],
    };
  }
  const rollen = parseRollen(opties.rollen?.join(','));
  const ruw = bouwBestanden(root, n, opties.nu ?? new Date());
  const bestanden = await Promise.all(
    Object.entries(ruw).map(async ([pad, { inhoud, nieuw }]) => ({
      pad,
      inhoud: await opgemaakt(root, pad, inhoud),
      nieuw,
    })),
  );
  const gates = await Promise.all(
    Object.entries(gateInhoud(root, n, rollen)).map(async ([pad, inhoud]) =>
      hunk(pad, lees(root, pad), await opgemaakt(root, pad, inhoud)),
    ),
  );
  return { fase: huidig, bestanden, gates };
}

/**
 * src/web/routeTree.gen.ts opnieuw, met de generator van de al geïnstalleerde router-plugin, zonder Vite (OV-6). Dezelfde
 * opties als in vite.config.ts; test/rails/new-resource.test.ts bewijst dat de uitvoer gelijk is aan de gecommitte.
 * @param {string} root
 * @param {string} [uit]
 */
export async function routeTree(root, uit = path.join(root, 'src/web/routeTree.gen.ts')) {
  // De generator schrijft via een tijdelijk bestand en hernoemt dat; dat kan alleen binnen één bestandssysteem.
  const tmpDir = mkdtempSync(path.join(path.dirname(uit), '.route-tree-'));
  try {
    const plugins = unpluginRouterGeneratorFactory(
      {
        target: 'react',
        routesDirectory: path.join(root, 'src/web/routes'),
        generatedRouteTree: uit,
        autoCodeSplitting: true,
        tmpDir,
      },
      { framework: 'vite' },
    );
    const hook = (Array.isArray(plugins) ? plugins[0] : plugins)?.vite?.configResolved;
    const configResolved = typeof hook === 'function' ? hook : hook?.handler;
    if (configResolved === undefined) throw new Error('@tanstack/router-plugin: geen vite.configResolved meer');
    /** @type {Parameters<typeof configResolved>[0]} */
    const config = unsafeCast({ root }, 'de route-generator leest uit de Vite-config alleen root');
    await configResolved.call(unsafeCast({}, 'de route-generator gebruikt de plugin-context niet'), config);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** @param {string} root @param {Plan} p */
export async function schrijf(root, p) {
  for (const { pad, inhoud } of p.bestanden) {
    mkdirSync(path.dirname(path.join(root, pad)), { recursive: true });
    writeFileSync(path.join(root, pad), inhoud);
  }
  const routes = p.bestanden
    .map(({ pad }) => /^src\/web\/routes\/(.+)\.tsx$/.exec(pad)?.[1])
    .filter((id) => id !== undefined);
  if (routes.length === 0) return;
  await routeTree(root);
  // De generator vangt zijn eigen fouten af (console.error); zonder de nieuwe route is de boom niet bijgewerkt.
  const boom = lees(root, 'src/web/routeTree.gen.ts');
  const ontbreekt = routes.filter((id) => !boom.includes(`'/${id}'`));
  if (ontbreekt.length > 0)
    throw new Error(`src/web/routeTree.gen.ts mist ${ontbreekt.join(', ')}; zie de fout hierboven`);
}

/** @param {Plan} p @param {boolean} proef */
function verslag(p, proef) {
  const kop = proef ? 'Plan (--dry-run, er is niets geschreven):' : 'Geschreven:';
  const regels = [kop, ...p.bestanden.map(({ pad, nieuw }) => `  ${nieuw ? 'nieuw   ' : 'gewijzigd'} ${pad}`)];
  if (p.fase === 'skelet')
    return [...regels, '', 'Vul de spec in; de eigenaar zet hem op goedgekeurd. Draai daarna opnieuw met --rollen.'];
  const gates = p.gates.flatMap(({ pad, zoek, vervang }) => ['', `--- ${pad}`, 'vervang:', zoek, 'door:', vervang]);
  return [
    ...regels,
    ...(!proef && p.bestanden.some(({ pad }) => pad.startsWith('src/web/routes/'))
      ? ['  gewijzigd src/web/routeTree.gen.ts']
      : []),
    '',
    'Gate-bestanden: zet deze wijzigingen met Edit (het rolhek vraagt per bestand akkoord; noem de testwijzigingen met reden in de PR):',
    ...gates,
    '',
    'Daarna: pnpm db:generate (runner) en pnpm gate:fast. De tester schrijft de tests (framework §8); de handlers geven 501 tot dan.',
  ];
}

/** @param {readonly string[]} argv */
async function main(argv) {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: { rollen: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } },
  });
  const [naam, ...rest] = positionals;
  if (naam === undefined || rest.length > 0)
    throw new NewResourceError('gebruik: pnpm new:resource <naam> [--rollen user,admin] [--dry-run]');
  const p = await plan('.', naam, values.rollen === undefined ? {} : { rollen: values.rollen.split(',') });
  if (!values['dry-run']) await schrijf('.', p);
  console.log(verslag(p, values['dry-run']).join('\n'));
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof NewResourceError) && !(error instanceof TypeError)) throw error;
    console.error(`new:resource: ${error.message}`);
    process.exitCode = 1;
  }
}
