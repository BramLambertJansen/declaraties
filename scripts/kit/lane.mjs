// Lane-herkenning (ADR 0029 punt 6 en 7). Puur: de aanroeper levert de wijzigingen en de besluitdocumenten.
// Bereik (eigenaarbesluit, ruimer dan de letter van punt 6): alles wat niet in src/core, voorReview of docs/adr/ staat; bestaande
// tests en migraties blijven dicht. Een pad buiten `gates` telt alleen binnen src/, docs/, db/ of CHANGELOG.md: onbekende
// dotfiles en configs (.vscode, .envrc, .mcp.json, postcss.config.*) kunnen vóór review effect hebben en vallen dicht.
// De overige gate-paden zonder voorReview (deploy, renovate, src/api/server.ts) vallen onder CODEOWNERS en de diff-guard.

import { globMatch } from '../../rails/hooks/lib/rolhek.mjs';

/** @typedef {{ status: string, pad: string, van?: string }} Wijziging */
/** @typedef {{ lane: 'feature' | 'framework' | null, reden: string }} Uitslag */

const BEKEND = [/^src\//, /^docs\//, /^db\//, /^CHANGELOG\.md$/];
const INSTRUCTIES = /(?:^|\/)(?:(?:CLAUDE|AGENTS)[^/]*\.md|\.claude\/.*)$/;
const RECORD = '.claude/decisions.json';

/** @param {readonly string[]} globs @param {string} pad */
const inLijst = (globs, pad) => globs.some((glob) => globMatch(glob, pad));

/**
 * Waarom een pad buiten de feature-lane valt, of null als het erbinnen valt (punt 6 en 7).
 * @param {Wijziging} wijziging @param {import('../../rails/hooks/lib/rolhek.mjs').Config} config
 */
function buitenBereik({ status, pad }, config) {
  if (inLijst(config.voorReview ?? config.gates, pad)) return `${pad} staat in voorReview`;
  if (pad.startsWith('src/core/')) return `${pad} ligt in src/core`;
  if (pad.startsWith('docs/adr/')) return `${pad} is een ADR`;
  if (inLijst(config.testpaden, pad))
    return status === 'A' ? null : `${pad}: een bestaande test wijzigen of verwijderen`;
  if (inLijst(config.migraties, pad)) return status === 'A' ? null : `${pad}: een migratie wijzigen of verwijderen`;
  if (status === 'D' && pad.startsWith('docs/specs/')) return `${pad}: een bestaande spec verwijderen`;
  if (INSTRUCTIES.test(pad)) return `${pad} wijzigt instructies van de agent`;
  return inLijst(config.gates, pad) || BEKEND.some((patroon) => patroon.test(pad))
    ? null
    : `${pad} is een onbekend pad buiten gates; het kan vóór review effect hebben`;
}

/** Bij een rename of kopie tellen beide paden (zoals `verifyScope`). @param {Wijziging[]} changes */
function paden(changes) {
  return changes.flatMap(({ status, pad, van }) =>
    van === undefined
      ? [{ status, pad }]
      : [
          { status, pad },
          { status, pad: van },
        ],
  );
}

/**
 * @param {{ changes: Wijziging[], besluiten: readonly string[], mini: boolean, config: import('../../rails/hooks/lib/rolhek.mjs').Config }} invoer
 * @returns {Uitslag}
 */
export function laneVan({ changes, besluiten, mini, config }) {
  const [besluit, ...rest] = besluiten;
  if (besluit === undefined) return { lane: null, reden: 'geen document krijgt een eigenaarstatus in deze PR' };
  if (rest.length > 0)
    return { lane: null, reden: `meer dan één document krijgt een eigenaarstatus: ${besluiten.join(', ')}` };
  const overige = paden(changes).filter(({ pad }) => pad !== besluit);
  const vreemd = overige.find(({ pad }) => pad !== RECORD);
  if (vreemd === undefined) return { lane: 'framework', reden: 'alleen het besluit en eventueel zijn record' };
  if (!mini) return { lane: null, reden: `${vreemd.pad} hoort niet in een PR met een in-PR-status (geen mini-spec)` };
  const reden = overige.map((wijziging) => buitenBereik(wijziging, config)).find((melding) => melding !== null);
  return reden === undefined
    ? { lane: 'feature', reden: 'mini-spec binnen het bereik van punt 6' }
    : { lane: null, reden };
}

/** Het frontmatterveld `sjabloon: mini` van een spec (ADR 0029 punt 5); alleen echte frontmatter op regel 1 telt. @param {string} text */
export function isMiniSpec(text) {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const end = lines.indexOf('---', 1);
  return lines[0] === '---' && end > 0 && lines.slice(1, end).includes('sjabloon: mini');
}

const RETENTION_INSERT = /(?:^|;)\s*insert\s+into\s+app\.retention\s+values\s*\([^;]*$/i;

/** Een tekstwaarde wordt `?`; alleen een kale naam (`public.notes`, `app`) in een insert op `app.retention` blijft letterlijk. @param {string} inhoud @param {string} tot */
function waarde(inhoud, tot) {
  return /^[a-z0-9_.]+$/i.test(inhoud) && RETENTION_INSERT.test(tot) ? `'${inhoud}'` : '?';
}

/**
 * Splitst SQL in statements, zonder commentaar en met tekstwaarden vervangen door `?`. Quotes worden gevolgd, zodat `--` of `;`
 * in een tekst geen statement verbergt. Dollar-quotes, blokcommentaar en E-strings (backslash-escapes) zijn niet te volgen en
 * geven null (faalt dicht).
 * @param {string} sql @returns {string[] | null}
 */
function statementsVan(sql) {
  let uit = '';
  for (let i = 0; i < sql.length; i += 1) {
    const teken = sql[i] ?? '';
    if (teken === '$' || sql.startsWith('/*', i)) return null;
    if (sql.startsWith('--', i)) {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      uit += '\n';
    } else if (teken === "'" || teken === '"') {
      if (teken === "'" && /[eE]$/.test(uit) && !/[\w]/.test(uit.at(-2) ?? ' ')) return null;
      let einde = i + 1;
      while (einde < sql.length && !(sql[einde] === teken && sql[einde + 1] !== teken))
        einde += sql[einde] === teken ? 2 : 1;
      if (einde >= sql.length) return null;
      uit += teken === "'" ? waarde(sql.slice(i + 1, einde), uit) : sql.slice(i, einde + 1);
      i = einde;
    } else uit += teken;
  }
  return uit.split(';').map((deel) => deel.replace(/\s+/g, ' ').trim().toLowerCase());
}

const NAAM = '((?:[a-z_][a-z0-9_]*|"[^"]+")(?:\\.(?:[a-z_][a-z0-9_]*|"[^"]+"))?)';
const NAAM_ZONDER_QUOTES = '([a-z_][a-z0-9_]*\\.[a-z_][a-z0-9_]*)';
const ROLLEN = '(?:app_[a-z_]+)(?:, app_[a-z_]+)*';
const REGELS = [
  { patroon: new RegExp(`^create table ${NAAM} \\(.*\\)$`), doel: 'maak' },
  { patroon: new RegExp(`^create (?:unique )?index [a-z0-9_]+ on ${NAAM} `), doel: 'op' },
  { patroon: new RegExp(`^alter table ${NAAM} (?:enable|force) row level security$`), doel: 'op' },
  { patroon: new RegExp(`^grant [a-z_, ()]+ on (?:table )?${NAAM} to ${ROLLEN}$`), doel: 'op' },
  { patroon: new RegExp(`^create policy [a-z0-9_]+ on ${NAAM} `), doel: 'op' },
];
const RETENTION_FORCE = /^alter table app\.retention (?:no )?force row level security$/;
const RETENTION_RIJ = new RegExp(
  `^insert into app\\.retention values\\s*\\(\\s*'${NAAM_ZONDER_QUOTES}'\\s*,\\s*null\\s*,\\s*null\\s*,\\s*'app'\\s*,\\s*(?:\\?|'[a-z0-9_.]+')\\s*\\)$`,
);
const NIET_IN_TABEL = /\b(?:inherits|partition|like)\b/;

/** Het eerste deel van een migratie: dbmate leest `-- migrate:down` als regel met eventueel tekst erachter. @param {string} tekst */
function upDeel(tekst) {
  return tekst.replaceAll('\r\n', '\n').split(/^--[ \t]*migrate:down(?:[ \t]*$|[ \t]+\S)/m)[0] ?? '';
}

/** Mag dit statement? Eigen nieuwe tabel via REGELS, plus de smalle bewaarcatalogus-uitzondering (alleen `no force`/`force` op `app.retention` en een rij voor een eigen tabel). @param {string} deel @param {Set<string>} gemaakt */
function toegestaan(deel, gemaakt) {
  if (RETENTION_FORCE.test(deel)) return true;
  const rij = RETENTION_RIJ.exec(deel)?.[1];
  if (rij !== undefined) return gemaakt.has(rij);
  if (NIET_IN_TABEL.test(deel) && deel.startsWith('create table')) return false;
  const regel = REGELS.find(({ patroon }) => patroon.test(deel));
  const naam = regel?.patroon.exec(deel)?.[1];
  return regel !== undefined && naam !== undefined && gemaakt.has(naam);
}

/** Laat de migratie `app.retention` met `no force` achter? Dan is de laatste toggle geen `force`. @param {string[]} statements */
function eindigtOpNoForce(statements) {
  const toggles = statements.filter((deel) => RETENTION_FORCE.test(deel));
  return toggles.at(-1)?.includes(' no force ') === true;
}

/**
 * Een migratie in de feature-lane maakt alleen een nieuwe tabel (ADR 0029 punt 5): `create table (…)` en daarna index, RLS,
 * grants aan app-rollen en policies, uitsluitend op die tabel. Functies, triggers, `security definer`, rolgrants, kopieën
 * (`as select`, `like`, `inherits`, `partition`) en alles op bestaande objecten blijven framework-lane. Faalt dicht.
 * @param {string} tekst @returns {string | null} de reden, of null
 */
export function migratieOvertreding(tekst) {
  const statements = statementsVan(upDeel(tekst));
  if (statements === null) return 'migratie met dollar-quotes, blokcommentaar of E-strings is niet te beoordelen';
  const gevuld = statements.filter((deel) => deel !== '');
  const gemaakt = new Set(gevuld.flatMap((deel) => REGELS[0]?.patroon.exec(deel)?.[1] ?? []));
  const fout = gevuld.find((deel) => !toegestaan(deel, gemaakt));
  if (gemaakt.size === 0) return 'migratie maakt geen nieuwe tabel';
  if (fout === undefined && eindigtOpNoForce(gevuld))
    return 'migratie laat app.retention met `no force row level security` achter: de laatste toggle moet `force` zijn';
  return fout === undefined ? null : `migratie bevat meer dan een nieuwe tabel: "${fout.slice(0, 60)}"`;
}

/**
 * Wijzigt het register alleen de records van `file`? (ADR 0029 punt 7(i): "hooguit zijn record").
 * @param {{ basis: string | null, head: string | null, file: string }} invoer
 */
export function recordAlleenBesluit({ basis, head, file }) {
  try {
    const oud = JSON.parse(basis ?? '');
    const nieuw = JSON.parse(head ?? '');
    const rest = (/** @type {{ decisions: { file: string }[] }} */ register) =>
      JSON.stringify({ ...register, decisions: register.decisions.filter((entry) => entry.file !== file) });
    return rest(oud) === rest(nieuw);
  } catch {
    return false;
  }
}
