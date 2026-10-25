// Lane-herkenning (ADR 0046 punt 14, 15 en 5: besluit-PR met meerdere documenten). Puur: de aanroeper levert de wijzigingen en de besluitdocumenten.
// Bereik (eigenaarbesluit, ruimer dan de letter van punt 6): alles wat niet in src/core, voorReview of docs/adr/ staat; bestaande
// tests en migraties blijven dicht. Een pad buiten `gates` telt alleen binnen src/, docs/, db/ of CHANGELOG.md: onbekende
// dotfiles en configs (.vscode, .envrc, .mcp.json, postcss.config.*) kunnen vóór review effect hebben en vallen dicht.
// De overige gate-paden zonder voorReview (deploy, renovate, src/api/server.ts) vallen onder CODEOWNERS en de diff-guard.

import { globMatch } from '../../rails/hooks/lib/rolhek.mjs';
import { functionalUiReason } from '../../rails/hooks/lib/functional-ui.mjs';
import { readRegistry } from '../../rails/hooks/lib/task-authority.mjs';

/** @typedef {{ status: string, pad: string, van?: string }} Wijziging */
/** @typedef {{ lane: 'feature' | 'framework' | null, reden: string }} Uitslag */

const BEKEND = [/^src\//, /^docs\//, /^db\//, /^CHANGELOG\.md$/];
const INSTRUCTIES = /(?:^|\/)(?:(?:CLAUDE|AGENTS)[^/]*\.md|\.claude\/.*)$/;
const RECORD = '.claude/decisions.json';

/** @param {readonly string[]} globs @param {string} pad */
const inLijst = (globs, pad) => globs.some((glob) => globMatch(glob, pad));

/**
 * Waarom een pad buiten de feature-lane valt, of null als het erbinnen valt (punt 6 en 7).
 * @param {Wijziging} wijziging @param {import('../../rails/hooks/lib/rolhek.mjs').Config} config @param {boolean} ui
 */
function buitenBereik({ status, pad }, config, ui) {
  if (inLijst(config.voorReview ?? config.gates, pad)) return `${pad} staat in voorReview`;
  if (!ui && pad.startsWith('src/core/')) return `${pad} ligt in src/core`;
  if (pad.startsWith('docs/adr/')) return `${pad} is een ADR`;
  if (inLijst(config.testpaden, pad))
    return status === 'A' || ui ? null : `${pad}: een bestaande test wijzigen of verwijderen`;
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
 * @param {{ changes: Wijziging[], besluiten: readonly string[], mini: boolean, config: import('../../rails/hooks/lib/rolhek.mjs').Config, repository?: string, functioneleUi?: boolean }} invoer
 * @returns {Uitslag}
 */
export function laneVan({ changes, besluiten, mini, config, repository, functioneleUi = false }) {
  const [besluit, ...rest] = besluiten;
  if (besluit === undefined) return { lane: null, reden: 'geen document krijgt een eigenaarstatus in deze PR' };
  const overige = paden(changes).filter(({ pad }) => !besluiten.includes(pad));
  const vreemd = overige.find(({ pad }) => pad !== RECORD);
  if (vreemd === undefined) return { lane: 'framework', reden: 'besluit-PR: alleen besluitdocumenten en hun record' };
  if (rest.length > 0)
    return {
      lane: null,
      reden: `${vreemd.pad} hoort niet in een besluit-PR met ${besluiten.join(', ')}; de feature-lane is één mini-spec`,
    };
  if (!mini) return { lane: null, reden: `${vreemd.pad} hoort niet in een PR met een in-PR-status (geen mini-spec)` };
  const migraties = overige.filter(({ status, pad }) => status === 'A' && inLijst(config.migraties, pad));
  if (migraties.length > 1) return { lane: null, reden: 'de feature-lane bevat hoogstens één nieuwe migratie' };
  const scope = functioneleUi ? functionalUiReason({ changes, repository, spec: besluit }) : null;
  if (scope !== null) return { lane: null, reden: scope };
  const reden = overige
    .map((wijziging) => buitenBereik(wijziging, config, functioneleUi))
    .find((melding) => melding !== null);
  return reden === undefined
    ? { lane: 'feature', reden: functioneleUi ? 'functionele UI (ADR 0056)' : 'mini-spec binnen het bereik van punt 6' }
    : { lane: null, reden };
}

/** Het frontmatterveld `sjabloon: mini` van een spec (ADR 0046 punt 13); alleen echte frontmatter op regel 1 telt. @param {string} text */
export function isMiniSpec(text) {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const end = lines.indexOf('---', 1);
  return lines[0] === '---' && end > 0 && lines.slice(1, end).includes('sjabloon: mini');
}

const RETENTION_INSERT = /(?:^|;)\s*insert\s+into\s+app\.retention\s+values\s*\([^;]*$/i;

/** Een tekstwaarde wordt `?`; alleen een kale naam (`public.notes`, `app`) in een insert op `app.retention` blijft letterlijk. @param {string} inhoud @param {string} tot */
function waarde(inhoud, tot) {
  return /^[a-z0-9_.]+$/.test(inhoud) && RETENTION_INSERT.test(tot) ? `'${inhoud}'` : '?';
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
      // Alleen de vaste FK uit het generatorsjabloon is quoted. Anders zou lowercasing twee verschillende
      // PostgreSQL-objecten gelijk maken, zoals better_auth."twoFactor" en better_auth."twofactor".
      if (teken === '"' && (sql.slice(i, einde + 1) !== '"user"' || !/\breferences\s+better_auth\.$/i.test(uit)))
        return null;
      uit += teken === "'" ? waarde(sql.slice(i + 1, einde), uit) : sql.slice(i, einde + 1);
      i = einde;
    } else uit += teken;
  }
  return uit.split(';').map((deel) => deel.replace(/\s+/g, ' ').trim().toLowerCase());
}

const NAAM = '(public\\.[a-z_][a-z0-9_]*)';
const NAAM_ZONDER_QUOTES = '([a-z_][a-z0-9_]*\\.[a-z_][a-z0-9_]*)';
const MAAK = new RegExp(`^create table ${NAAM} \\((.*)\\)$`);
const KOLOMMEN = '[a-z_][a-z0-9_]*(?:, [a-z_][a-z0-9_]*)*';
const INDEX = new RegExp(`^create (?:unique )?index [a-z_][a-z0-9_]* on ${NAAM} \\((${KOLOMMEN})\\)$`);
const GRANT = new RegExp(`^grant (.+) on (?:table )?${NAAM} to app_authenticated$`);
const KOLOMGRANT = `(?:insert|update) \\(${KOLOMMEN}\\)`;
const KOLOMGRANTS = new RegExp(`^${KOLOMGRANT}(?:, ${KOLOMGRANT})*$`);
const POLICY = new RegExp(
  `^create policy [a-z_][a-z0-9_]* on ${NAAM} for (select|insert|update|delete) to app_authenticated (.+)$`,
);
const EIGENAAR = '(owner_id = (select app.current_user_id()))';
const PREDICATEN = {
  select: `using ${EIGENAAR}`,
  insert: `with check ${EIGENAAR}`,
  update: `using ${EIGENAAR} with check ${EIGENAAR}`,
  delete: `using ${EIGENAAR}`,
};
const BASISKOLOMMEN =
  /^\s*id uuid primary key default gen_random_uuid\(\)\s*,\s*owner_id text not null default app\.current_user_id\(\) references better_auth\."user"\s*\(id\) on delete cascade\s*,\s*created_at timestamptz not null default now\(\)(.*)$/;
const EXTRA_KOLOM =
  /^([a-z_][a-z0-9_]*) (?:text|integer|int|bigint|boolean|uuid|timestamptz)(?: not null)?(?: default (?:\?|true|false|-?\d+))?$/;
const VASTE_KOLOMMEN = ['id', 'owner_id', 'created_at'];
const RETENTION_FORCE = /^alter table app\.retention (?:no )?force row level security$/;
const NO_FORCE = 'alter table app.retention no force row level security';
const FORCE = 'alter table app.retention force row level security';
const RETENTION_RIJ = new RegExp(
  `^insert into app\\.retention values\\s*\\(\\s*'${NAAM_ZONDER_QUOTES}'\\s*,\\s*null\\s*,\\s*null\\s*,\\s*'app'\\s*,\\s*(?:\\?|'[a-z0-9_.]+')\\s*\\)$`,
);

/** Alleen de vaste owner-kolommen plus eenvoudige app-velden; expressies en andere vormen vragen review. @param {string} statement */
function eigenaarTabel(statement) {
  const match = MAAK.exec(statement);
  if (match?.[1] === undefined || match[2] === undefined) return null;
  const rest = BASISKOLOMMEN.exec(match[2])?.[1]?.trim();
  if (rest === undefined || (rest !== '' && !rest.startsWith(','))) return null;
  const extra =
    rest === ''
      ? []
      : rest
          .slice(1)
          .split(',')
          .map((kolom) => EXTRA_KOLOM.exec(kolom.trim())?.[1]);
  if (extra.some((naam) => naam === undefined || VASTE_KOLOMMEN.includes(naam))) return null;
  if (new Set(extra).size !== extra.length) return null;
  return { naam: match[1], kolommen: [...VASTE_KOLOMMEN, ...extra], statement };
}

/** @typedef {NonNullable<ReturnType<typeof eigenaarTabel>>} EigenaarTabel */

/** @param {string} deel @param {EigenaarTabel} tabel */
function grantToegestaan(deel, tabel) {
  const match = GRANT.exec(deel);
  const rechten = match?.[1] ?? '';
  if (match?.[2] !== tabel.naam) return false;
  if (/^(?:select|delete)(?:, (?:select|delete))*$/.test(rechten)) return true;
  if (!KOLOMGRANTS.test(rechten)) return false;
  return [...rechten.matchAll(/\(([^)]+)\)/g)].every(([, kolommen = '']) =>
    kolommen.split(', ').every((kolom) => tabel.kolommen.includes(kolom) && !VASTE_KOLOMMEN.includes(kolom)),
  );
}

/** @param {string} deel @param {EigenaarTabel} tabel */
function policyActie(deel, tabel) {
  const match = POLICY.exec(deel);
  const actie = match?.[2];
  if (match?.[1] !== tabel.naam || actie === undefined) return null;
  const predicaat = Object.entries(PREDICATEN).find(([naam]) => naam === actie)?.[1];
  return match[3] === predicaat ? actie : null;
}

/** Het eerste deel van een migratie: dbmate leest `-- migrate:down` als regel met eventueel tekst erachter. @param {string} tekst */
function upDeel(tekst) {
  return tekst.replaceAll('\r\n', '\n').split(/^--[ \t]*migrate:down(?:[ \t]*$|[ \t]+\S)/m)[0] ?? '';
}

/** @param {string} deel @param {EigenaarTabel} tabel */
function toegestaan(deel, tabel) {
  if (deel === tabel.statement) return true;
  if (RETENTION_FORCE.test(deel)) return true;
  const rij = RETENTION_RIJ.exec(deel)?.[1];
  if (rij !== undefined) return rij === tabel.naam;
  if (['enable', 'force'].some((actie) => deel === `alter table ${tabel.naam} ${actie} row level security`))
    return true;
  const index = INDEX.exec(deel);
  if (index?.[1] === tabel.naam) return (index[2] ?? '').split(', ').every((kolom) => tabel.kolommen.includes(kolom));
  return grantToegestaan(deel, tabel) || policyActie(deel, tabel) !== null;
}

/** @param {string[]} statements @param {EigenaarTabel} tabel */
function eigenaarIsolatie(statements, tabel) {
  if (
    !['enable', 'force'].every((actie) => statements.includes(`alter table ${tabel.naam} ${actie} row level security`))
  )
    return 'de nieuwe tabel moet ENABLE en FORCE ROW LEVEL SECURITY hebben';
  const acties = new Set(statements.flatMap((deel) => policyActie(deel, tabel) ?? []));
  if (!Object.keys(PREDICATEN).every((actie) => acties.has(actie)))
    return 'de nieuwe tabel vraagt vier afzonderlijke eigenaarpolicies voor select, insert, update en delete';
  const grants = statements.flatMap((deel) => GRANT.exec(deel)?.[1]?.split(', ') ?? []);
  return ['select', 'delete'].every((recht) => grants.includes(recht))
    ? null
    : 'de nieuwe tabel vraagt expliciete select- en delete-grants aan app_authenticated';
}

/** Geen losstaande toggles, dubbele registratie of insert onder FORCE RLS. @param {string[]} statements */
function retentionVolgorde(statements) {
  const retention = statements.filter((deel) => RETENTION_FORCE.test(deel) || RETENTION_RIJ.test(deel));
  if (retention.length === 0) return null;
  return retention.length === 3 &&
    retention[0] === NO_FORCE &&
    RETENTION_RIJ.test(retention[1] ?? '') &&
    retention[2] === FORCE
    ? null
    : 'app.retention vraagt precies NO FORCE, één registratie van de nieuwe tabel, en FORCE in die volgorde';
}

/**
 * Een migratie in de feature-lane maakt alleen een nieuwe tabel (ADR 0046 punt 13): `create table (…)` en daarna index, RLS,
 * grants aan app-rollen en policies, uitsluitend op die tabel. Functies, triggers, `security definer`, rolgrants, kopieën
 * (`as select`, `like`, `inherits`, `partition`) en alles op bestaande objecten blijven framework-lane. Faalt dicht.
 * @param {string} tekst @returns {string | null} de reden, of null
 */
export function migratieOvertreding(tekst) {
  const statements = statementsVan(upDeel(tekst));
  if (statements === null)
    return 'migratie met quoted identifiers, dollar-quotes, blokcommentaar of E-strings vraagt review';
  const gevuld = statements.filter((deel) => deel !== '');
  const gemaakt = gevuld.filter((deel) => deel.startsWith('create table '));
  if (gemaakt.length !== 1) return 'migratie moet precies één nieuwe tabel maken';
  const tabel = eigenaarTabel(gevuld[0] ?? '');
  if (tabel === null) return 'migratie moet beginnen met het owner-tabelpatroon uit new:resource';
  const fout = gevuld.find((deel) => !toegestaan(deel, tabel));
  if (fout !== undefined) return `migratie valt buiten het owner-tabelpatroon: "${fout.slice(0, 60)}"`;
  return eigenaarIsolatie(gevuld, tabel) ?? retentionVolgorde(gevuld);
}

/**
 * Wijzigt het register alleen de records van `file` (of van elk bestand in de lijst)? (ADR 0046 punt 15 en 5).
 * @param {{ basis: string | null, head: string | null, file: string | readonly string[] }} invoer
 */
export function recordAlleenBesluit({ basis, head, file }) {
  const bestanden = typeof file === 'string' ? [file] : file;
  try {
    const oud = readRegistry(basis ?? '');
    const nieuw = readRegistry(head ?? '');
    const rest = (/** @type {{ decisions: { file: string }[] }} */ register) =>
      JSON.stringify({ ...register, decisions: register.decisions.filter((entry) => !bestanden.includes(entry.file)) });
    return rest(oud) === rest(nieuw);
  } catch {
    return false;
  }
}
