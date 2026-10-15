// check:roadmap (spec docs/specs/roadmap-vinkjes.md, framework §8 "Docs horen bij de wijziging"): een nieuw of gewijzigd `[x]` in
// docs/roadmap.md moet naar bewijs verwijzen (PR-nummer, testpad of checknaam), en een spec die naar `gebouwd` gaat heeft de ene
// bewijsvorm die `pnpm docs:status` schrijft (spec taakmandaat-vervolg, B2). Het vergelijkt met het punt waar de branch van
// origin/main afsplitste, niet met de kop van main. Is origin/main niet te lezen, dan faalt de check: onleesbaar telt als fout
// (zoals check:migrations).
// Heeft de head-roadmap een kop `## Nu`, dan gelden ook de structuurregels van ADR 0029 (`structuurMeldingen`).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { builtReference, documentInfo } from '../../.claude/hooks/lib/document-state.mjs';
import { globMatch } from '../../.claude/hooks/lib/rolhek.mjs';
import { doelPad, looksLikePath, packageScripts, pathExists, SPEC_STATUS } from './check-docs.mjs';
import { gates } from './gates.mjs';

/** @typedef {{ key: string, message: string }} Violation */
/** @typedef {{ lees: (pad: string) => string | null, bestanden: readonly string[] }} Bron */
/** @typedef {Bron & { hernoemd: Readonly<Record<string, string>> }} Head */
/** @typedef {{ regel: number, aangevinkt: boolean, vervallen: boolean, tekst: string }} Item */
/** @typedef {{ scripts: Readonly<Record<string, unknown>>, testpaden: readonly string[], bestanden: readonly string[], register: ReadonlySet<string> }} Kader */

const BASE = 'origin/main';
const ROADMAP = 'docs/roadmap.md';
const SPEC_PAD = /^docs\/specs\/[^_/][^/]*\.md$/;
const ITEM = /^(\s*)- \[([ xX])\] (.*)$/;
// `#`, cijfers, niet direct na een woordteken en niet gevolgd door een woordteken of `-` (dus geen kopanker als `(#4-rails)`).
const PR = /(?<!\w)#\d+(?![\w-])/;
const VERWIJZING = /\broadmap stuk \d+[a-z]*|\bST-\d+/i;

/**
 * Items van een roadmap: een regel `- [ ] ` of `- [x] ` plus de regels die verder zijn ingesprongen (tot een lege regel, een kop, een
 * streepje op dezelfde of lagere inspringing of een regel in kolom 0). De tekst is samengevoegd tot enkele spaties.
 * @param {string | null} tekst
 * @returns {Item[]}
 */
export function leesItems(tekst) {
  if (tekst === null) return [];
  const regels = tekst.split('\n');
  /** @type {Item[]} */
  const items = [];
  regels.forEach((regel, index) => {
    const treffer = ITEM.exec(regel);
    if (treffer === null) return;
    const inspring = treffer[1]?.length ?? 0;
    const delen = [treffer[3] ?? ''];
    for (const volgende of regels.slice(index + 1)) {
      if (volgende.trim() === '' || (/^\s*/.exec(volgende)?.[0].length ?? 0) <= inspring) break;
      delen.push(volgende);
    }
    const samen = delen.join(' ').replace(/\s+/g, ' ').trim();
    items.push({ regel: index + 1, aangevinkt: treffer[2] !== ' ', vervallen: samen.startsWith('~~'), tekst: samen });
  });
  return items;
}

/** @param {string} tekst */
function zonderDoorgehaald(tekst) {
  return tekst.replace(/~~.*?~~/g, ' ');
}

/** @param {string} tekst */
function backtickTokens(tekst) {
  return [...tekst.matchAll(/`([^`]+)`/g)].map(([, token = '']) => token);
}

/**
 * Een token met `/` is een exact pad of een map; een kale naam gaat via `pathExists` zoals in check-docs.
 * @param {string} token
 * @param {readonly string[]} bestanden
 */
function bestaat(token, bestanden) {
  if (!token.includes('/')) return pathExists(token, bestanden);
  const doel = doelPad(token);
  return bestanden.some((bestand) => bestand === doel || bestand.startsWith(`${doel}/`));
}

/**
 * @param {string} token
 * @param {Kader} kader
 */
function isTestpad(token, kader) {
  const kaal = token.replace(/\/$/, '');
  const map = token.endsWith('/');
  const glob = kader.testpaden.some((patroon) => globMatch(patroon, kaal) || (map && globMatch(patroon, `${kaal}/x`)));
  return glob && bestaat(token, kader.bestanden);
}

/**
 * @param {string} token `pnpm <naam>` of `<naam>`
 * @param {Kader} kader
 */
function isChecknaam(token, kader) {
  const naam = /^(?:pnpm\s+)?([\w:-]+)$/.exec(token)?.[1];
  if (naam === undefined || !Object.hasOwn(kader.scripts, naam)) return false;
  return kader.register.has(naam) || naam === 'gate:fast' || naam === 'gate:slow' || /^(?:check|test):/.test(naam);
}

/**
 * @param {string} tekst
 * @param {Kader} kader
 */
function heeftAdr(tekst, kader) {
  return [...tekst.matchAll(/\bADR (\d{4})\b/g)].some(([, nummer = '']) =>
    kader.bestanden.some((bestand) => bestand.startsWith(`docs/adr/${nummer}-`) && bestand.endsWith('.md')),
  );
}

/**
 * @param {Item} item
 * @param {Kader} kader
 */
export function heeftBewijs(item, kader) {
  if (item.vervallen) return PR.test(item.tekst) || heeftAdr(item.tekst, kader);
  const tekst = zonderDoorgehaald(item.tekst);
  return PR.test(tekst) || backtickTokens(tekst).some((token) => isTestpad(token, kader) || isChecknaam(token, kader));
}

/**
 * @param {Item} item
 * @param {Kader} kader
 * @returns {Violation[]}
 */
function itemMeldingen(item, kader) {
  /** @type {Violation[]} */
  const meldingen = [];
  if (!heeftBewijs(item, kader))
    meldingen.push({
      key: `roadmap:bewijs:${item.regel}`,
      message: `${ROADMAP}:${item.regel}: vinkje zonder bewijs; zet er een testpad, checknaam (pnpm …) of PR-nummer (#…) achter`,
    });
  const genoemd = new Set(backtickTokens(zonderDoorgehaald(item.tekst)).filter((token) => looksLikePath(token)));
  for (const pad of genoemd)
    if (!bestaat(pad, kader.bestanden))
      meldingen.push({
        key: `roadmap:pad:${item.regel}:${pad}`,
        message: `${ROADMAP}:${item.regel}: vinkje noemt \`${pad}\`, dat niet bestaat`,
      });
  return meldingen;
}

/**
 * De ene bewijsvorm voor een spec naar gebouwd: één geldige statusregel `status: gebouwd # #<PR>; gevalideerd: <sha>`,
 * gelezen met dezelfde code als `check-document-status` (`documentInfo` en `builtReference`).
 * @param {string} bestand
 * @param {string} spec
 */
function heeftBouwbewijs(bestand, spec) {
  return documentInfo(bestand, spec)?.status === 'gebouwd' && builtReference(spec) !== null;
}

/**
 * @param {{ basis: Bron, head: Head }} bronnen
 * @returns {Violation[]}
 */
function specMeldingen({ basis, head }) {
  const roadmapGewijzigd = basis.lees(ROADMAP) !== head.lees(ROADMAP);
  return head.bestanden
    .filter((bestand) => SPEC_PAD.test(bestand))
    .flatMap((bestand) => {
      const tekst = head.lees(bestand) ?? '';
      if (SPEC_STATUS.exec(tekst)?.[1] !== 'gebouwd') return [];
      const oud = basis.lees(head.hernoemd[bestand] ?? bestand);
      if (oud !== null && SPEC_STATUS.exec(oud)?.[1] === 'gebouwd') return [];
      /** @type {Violation[]} */
      const meldingen = [];
      if (!heeftBouwbewijs(bestand, tekst))
        meldingen.push({
          key: `spec:bewijs:${bestand}`,
          message: `${bestand}: naar gebouwd zonder bouwbewijs; zet de status met pnpm docs:status (status: gebouwd # #<PR>; gevalideerd: <sha>)`,
        });
      const verwijzing = VERWIJZING.exec(tekst)?.[0];
      if (verwijzing !== undefined && !roadmapGewijzigd)
        meldingen.push({
          key: `spec:roadmap:${bestand}`,
          message: `${bestand}: naar gebouwd en noemt ${verwijzing}, maar ${ROADMAP} wijzigt niet in deze PR`,
        });
      return meldingen;
    });
}

const VEREISTE_KOPPEN = ['Nu', 'Volgende', 'Geparkeerd', 'Besluiten'];
const MAX_NU_OPEN = 3;
const KOP = /^## (.+?)\s*$/;
const NU = /^## Nu\s*$/m;
const STAND = /\bstand 20\d\d-\d\d-\d\d/i;
const TERUG_ALS = /terug als:\s*\S/i;

/**
 * De `## `-kop waaronder elke regel valt (index 0 is regel 1); lege tekst vóór de eerste kop.
 * @param {readonly string[]} regels
 * @returns {string[]}
 */
function sectiePerRegel(regels) {
  let huidig = '';
  return regels.map((regel) => {
    const kop = KOP.exec(regel);
    if (kop !== null) huidig = kop[1] ?? '';
    return huidig;
  });
}

/**
 * Eerste regel van een item zonder `- [ ] `, met enkele spaties; `null` als de regel geen item is.
 * @param {string} regel
 */
function eersteRegel(regel) {
  const treffer = ITEM.exec(regel);
  return treffer === null ? null : (treffer[3] ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Een aanleiding verwijst naar een PR/issue (`#12`), een bestaand pad tussen backticks of een meting.
 * @param {string} tekst samengevoegde itemtekst
 * @param {readonly string[]} bestanden
 */
function heeftAanleiding(tekst, bestanden) {
  const deel = /aanleiding:(.*)$/i.exec(tekst)?.[1];
  if (deel === undefined) return false;
  return PR.test(deel) || /\bmeting\b/i.test(deel) || backtickTokens(deel).some((token) => bestaat(token, bestanden));
}

/**
 * @param {number} regel
 * @param {string} key
 * @param {string} tekst
 * @returns {Violation}
 */
function regelMelding(regel, key, tekst) {
  return { key: `roadmap:${key}:${regel}`, message: `${ROADMAP}:${regel}: ${tekst}` };
}

/**
 * R1 en R2: hooguit drie open items (kolom 0) onder `## Nu`, en `terug als:` met tekst bij elk geparkeerd item.
 * @param {{ items: readonly Item[], regels: readonly string[], secties: readonly string[] }} roadmap
 * @returns {Violation[]}
 */
function sectieMeldingen({ items, regels, secties }) {
  /** @type {Violation[]} */
  const meldingen = [];
  const open = items.filter(
    (item) =>
      secties[item.regel - 1] === 'Nu' && !item.aangevinkt && (regels[item.regel - 1] ?? '').startsWith('- [ ]'),
  );
  if (open.length > MAX_NU_OPEN)
    meldingen.push({
      key: 'roadmap:nu-open',
      message: `${ROADMAP}: ${open.length} open items onder ## Nu, maximaal ${MAX_NU_OPEN}; rond eerst iets af of verplaats het naar ## Volgende`,
    });
  for (const item of items)
    if (secties[item.regel - 1] === 'Geparkeerd' && !TERUG_ALS.test(item.tekst))
      meldingen.push(regelMelding(item.regel, 'geparkeerd', 'geparkeerd item zonder `terug als:` met een voorwaarde'));
  return meldingen;
}

/**
 * R4: een nieuw open item onder `## Nu` of `## Volgende` (eerste regel niet in de basis) heeft een aanleiding met verwijzing.
 * @param {{ items: readonly Item[], regels: readonly string[], secties: readonly string[] }} roadmap
 * @param {string | null} basisTekst
 * @param {readonly string[]} bestanden
 * @returns {Violation[]}
 */
function aanleidingMeldingen({ items, regels, secties }, basisTekst, bestanden) {
  const eerder = new Set((basisTekst ?? '').split('\n').map(eersteRegel));
  return items
    .filter((item) => !item.aangevinkt && ['Nu', 'Volgende'].includes(secties[item.regel - 1] ?? ''))
    .filter((item) => !eerder.has(eersteRegel(regels[item.regel - 1] ?? '')))
    .filter((item) => !heeftAanleiding(item.tekst, bestanden))
    .map((item) =>
      regelMelding(
        item.regel,
        'aanleiding',
        'nieuw open item zonder `aanleiding:` met #nummer, bestaand pad of meting',
      ),
    );
}

/**
 * Structuurregels (ADR 0029): alleen actief als de head-roadmap `## Nu` heeft; verdwijnt die kop, dan is dat een fout.
 * @param {{ basis: Bron, head: Head }} bronnen
 * @returns {Violation[]}
 */
function structuurMeldingen({ basis, head }) {
  const tekst = head.lees(ROADMAP) ?? '';
  const basisTekst = basis.lees(ROADMAP);
  if (!NU.test(tekst))
    return NU.test(basisTekst ?? '')
      ? [{ key: 'roadmap:structuur', message: `${ROADMAP}: structuur verwijderd; de kop ## Nu ontbreekt (ADR 0029)` }]
      : [];
  const regels = tekst.split('\n');
  const roadmap = { items: leesItems(tekst), regels, secties: sectiePerRegel(regels) };
  const koppen = new Set(regels.map((regel) => KOP.exec(regel)?.[1]));
  return [
    ...VEREISTE_KOPPEN.filter((naam) => !koppen.has(naam)).map((naam) => ({
      key: `roadmap:kop:${naam}`,
      message: `${ROADMAP}: vereiste kop ## ${naam} ontbreekt (ADR 0029)`,
    })),
    ...sectieMeldingen(roadmap),
    ...regels.flatMap((regel, index) =>
      STAND.test(regel)
        ? [regelMelding(index + 1, 'stand', 'gedateerd statusproza (Stand <datum>); status hoort in de PR')]
        : [],
    ),
    ...aanleidingMeldingen(roadmap, basisTekst, head.bestanden),
  ];
}

/**
 * Pure kern: geen git, geen fs.
 * @param {{ basis: Bron, head: Head, scripts: Readonly<Record<string, unknown>>, testpaden: readonly string[] }} invoer
 * @returns {Violation[]}
 */
export function roadmapMeldingen({ basis, head, scripts, testpaden }) {
  const kader = { scripts, testpaden, bestanden: head.bestanden, register: new Set(gates.map((gate) => gate.script)) };
  const eerder = new Set(
    leesItems(basis.lees(ROADMAP))
      .filter((item) => item.aangevinkt)
      .map((item) => item.tekst),
  );
  const nieuw = leesItems(head.lees(ROADMAP)).filter((item) => item.aangevinkt && !eerder.has(item.tekst));
  return [
    ...nieuw.flatMap((item) => itemMeldingen(item, kader)),
    ...specMeldingen({ basis, head }),
    ...structuurMeldingen({ basis, head }),
  ];
}

/**
 * @param {string} root
 * @param {readonly string[]} args
 */
function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * `git diff -M --name-status -z`: records `R<score>`, oud pad, nieuw pad; de rest heeft één pad.
 * @param {string} root
 * @param {string} afsplitsing
 * @returns {Record<string, string>} nieuw pad naar oud pad
 */
function hernoemingen(root, afsplitsing) {
  const velden = git(root, ['diff', '-M', '--name-status', '-z', afsplitsing]).split('\0');
  /** @type {Record<string, string>} */
  const hernoemd = {};
  for (let i = 0; i < velden.length;) {
    const status = velden[i] ?? '';
    if (status.startsWith('R') || status.startsWith('C')) {
      if (status.startsWith('R')) hernoemd[velden[i + 2] ?? ''] = velden[i + 1] ?? '';
      i += 3;
    } else i += 2;
  }
  return hernoemd;
}

/**
 * Een package.json die geen JSON is, geeft geen checknamen (de aanroeper vangt de fout van `packageScripts` op).
 * @param {string | null} tekst
 * @returns {Record<string, unknown>}
 */
function leesScripts(tekst) {
  try {
    return packageScripts(tekst ?? '');
  } catch {
    return {};
  }
}

/**
 * Dunne git-laag: vult `basis` (afsplitspunt met base) en `head` (git ls-files met de inhoud van schijf) voor `roadmapMeldingen`.
 * @param {string} [root]
 * @param {string} [base]
 * @returns {Violation[]}
 */
export function roadmapVanRepo(root = '.', base = BASE) {
  let afsplitsing;
  try {
    afsplitsing = git(root, ['merge-base', base, 'HEAD']).trim();
  } catch {
    return [
      {
        key: 'roadmap:basis',
        message: `${base} is niet te lezen; roadmap-vinkjes niet gecontroleerd (git fetch origin main of fetch-depth: 0)`,
      },
    ];
  }
  /** @param {string} pad */
  const leesHead = (pad) => (existsSync(path.join(root, pad)) ? readFileSync(path.join(root, pad), 'utf8') : null);
  /** @param {string} pad */
  const leesBasis = (pad) => {
    try {
      return git(root, ['show', `${afsplitsing}:${pad}`]);
    } catch {
      return null;
    }
  };
  const bestanden = (/** @type {string[]} */ args) => git(root, args).split('\0').filter(Boolean);
  const head = {
    lees: leesHead,
    bestanden: bestanden(['ls-files', '-z']).filter((pad) => existsSync(path.join(root, pad))),
    hernoemd: hernoemingen(root, afsplitsing),
  };
  const basis = { lees: leesBasis, bestanden: bestanden(['ls-tree', '-r', '--name-only', '-z', afsplitsing]) };
  /** @type {unknown} */
  const gatesJson = JSON.parse(readFileSync(path.join(import.meta.dirname, '../../.claude/gates.json'), 'utf8'));
  const testpaden =
    typeof gatesJson === 'object' &&
    gatesJson !== null &&
    'testpaden' in gatesJson &&
    Array.isArray(gatesJson.testpaden)
      ? gatesJson.testpaden.map(String)
      : [];
  return roadmapMeldingen({
    basis,
    head,
    scripts: leesScripts(head.lees('package.json')),
    testpaden,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const meldingen = roadmapVanRepo();
  const voorvoegsel = process.env.GITHUB_ACTIONS === 'true' ? '::error::' : '✗ check:roadmap: ';
  if (meldingen.length > 0) {
    for (const { message } of meldingen) console.error(`${voorvoegsel}${message}`);
    process.exit(1);
  }
  console.info('✓ check:roadmap: elk nieuw vinkje en elke gebouwde spec verwijst naar bewijs');
}
