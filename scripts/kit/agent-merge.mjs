// Oordeel agent-merge (ADR 0069 punt 1, spec agent-merge-niet-kritiek AC-1): mag de hoofdsessie deze PR zelf mergen? Puur:
// de diff-guard levert de wijzigingen, de tekst van de bronbestanden en het risico-overzicht. Een toegestane lijst, de rest
// dicht: elk pad moet op `agentMerge.toegestaan` staan en op geen gate, `agentMerge.kritiek` of kritiek pad (ADR 0062); die
// lijsten komen uit de padtabel `paden` (rails/hooks/lib/padtabel.mjs, ADR 0079: toegestaan = besluit agent met schrijven vrij). Een
// goedkeuring telt niet mee; reviews worden hier niet gelezen. Omvang (spec agent-merge-zonder-codex AC-2): hoogstens
// `agentMerge.maxRegels` regels, hoogstens `agentMerge.maxBytes` gewijzigde bytes (spec agent-merge-bytegrens: weinig maar
// zeer lange regels omzeilen de regelgrens niet) en geen binair bestand. Ontbreekt `maxRegels` of `maxBytes`, dan is
// `agentMerge` null en meldt het oordeel de bestaande reden "agentMerge ontbreekt of is onleesbaar"; een omvangreden
// "… niet leesbaar" verschijnt hier alleen als `regels` of `bytes` ontbreekt of geen geheel getal ≥ 0 is. `pr:merge` meldt per
// fout in het blok een eigen reden (`agentMergeFouten`): de omvangreden bij een ongeldige `maxRegels` of `maxBytes`,
// "agentMerge ontbreekt of is onleesbaar" bij een ongeldige lijst. `patchBytes()` is de ene bytetelling voor CI en `pr:merge`.

import { Buffer } from 'node:buffer';
import { agentMergeLijsten, afgeleid, globMatch } from '../../rails/hooks/lib/padtabel.mjs';
import { kritiekPad } from './lane.mjs';

/**
 * @typedef {true | false | 'indien-aanwezig'} CodexModus
 * @typedef {{ toegestaan: string[], kritiek: string[], codex: CodexModus, maxRegels: number,
 *   maxBytes: number }} AgentMerge
 * @typedef {{ gates: string[], testpaden: string[], jsonGates: Record<string, string[]>, voorReview?: string[] | undefined,
 *   altijdVragen?: string[] | undefined, kritiek?: string[] | undefined, agentMerge: AgentMerge | null,
 *   merge: 'eigenaar' | 'niet-kritiek' }} MergeConfig
 * @typedef {{ status: string, pad: string, van?: string }} Wijziging
 * @typedef {{ wijzigingen: Wijziging[], json: Record<string, { voor: string | null, na: string | null }>,
 *   geraakteJson: string[], risico: Record<string, string[]>, regels?: unknown, binair?: unknown, bytes?: unknown }} MergeInvoer
 *   `regels`: toegevoegd plus verwijderd; `binair`: paden van binaire bestanden (spec agent-merge-zonder-codex AC-2);
 *   `bytes`: gewijzigde bytes volgens `patchBytes()` (spec agent-merge-bytegrens AC-3)
 */

export const AGENT_MERGE_ONLEESBAAR = 'agentMerge ontbreekt of is onleesbaar in .claude/gates.json';
export const OMVANG_ONLEESBAAR = 'omvang van de PR niet leesbaar of agentMerge.maxRegels ontbreekt: geen agent-merge';
/** @param {number} regels @param {number} maxRegels */
export const teGroot = (regels, maxRegels) =>
  `PR te groot voor een agent-merge: ${String(regels)} regels, grens ${String(maxRegels)} (agentMerge.maxRegels)`;
export const BYTES_ONLEESBAAR = 'omvang van de PR niet leesbaar of agentMerge.maxBytes ontbreekt: geen agent-merge';
/** @param {number} bytes @param {number} maxBytes */
export const teGrootBytes = (bytes, maxBytes) =>
  `PR te groot voor een agent-merge: ${String(bytes)} bytes gewijzigd, grens ${String(maxBytes)} (agentMerge.maxBytes)`;
/** @param {string} pad */
export const binairReden = (pad) => `binair bestand in de PR: geen agent-merge (${pad})`;

const TEST_GEWIJZIGD = new Set(['M', 'D', 'R', 'T']);
// Een nieuwe test mag alleen als code op de vaste testplekken; `docs/adr/x.spec.md` of `.claude/agents/x.test.md` niet.
const NIEUWE_TEST = /^(?:src|test|e2e|db\/tests)\/.+\.(?:ts|tsx|sql)$/;
// Bestanden die een tool of agent op naam vanzelf laadt, waar ze ook staan (ADR 0069 punt 1).
const VANZELF_GELADEN = [
  /(?:^|\/)\./, // een map of bestand dat met een punt begint (.claude/, .mcp.json, .npmrc, .vscode/)
  /(?:^|\/)(?:CLAUDE|AGENTS)[^/]*\.md$/i,
  /(?:^|\/)[^/]*\.config\.[^/]+$/i,
  /(?:^|\/)package\.json$/i,
  /(?:^|\/)tsconfig[^/]*\.json$/i,
];
const CONTRACT = /^src\/shared\/contracts\//;
const PERMISSIE = /permission/i;

/** @param {readonly string[]} globs @param {string} pad */
const past = (globs, pad) => globs.some((glob) => globMatch(glob, pad));

/** @param {unknown} waarde @returns {waarde is string[]} */
const tekstLijst = (waarde) => Array.isArray(waarde) && waarde.every((item) => typeof item === 'string');

/** @param {unknown} ruw @param {string} sleutel */
function veld(ruw, sleutel) {
  return typeof ruw === 'object' && ruw !== null && !Array.isArray(ruw)
    ? Object.entries(ruw).find(([k]) => k === sleutel)?.[1]
    : undefined;
}

/** Een geheel getal ≥ `minimum` (geen tekst, geen breuk). @param {unknown} waarde @param {number} minimum @returns {waarde is number} */
export const geheelVanaf = (waarde, minimum) => Number.isInteger(waarde) && Number(waarde) >= minimum;

/**
 * `agentMerge.codex`: `false` en `"indien-aanwezig"` zoals ze staan, elke andere of ontbrekende waarde `true` (faalt dicht,
 * spec agent-merge-zonder-codex AC-1); `check-docs` toetst de vorm apart.
 * @param {unknown} waarde @returns {CodexModus}
 */
export function leesCodex(waarde) {
  if (waarde === false) return false;
  return waarde === 'indien-aanwezig' ? 'indien-aanwezig' : true;
}

/**
 * Gewijzigde bytes van een hunk-tekst (spec agent-merge-bytegrens AC-2): elke regel die met `+` of `-` begint telt met de
 * UTF-8-bytes ná dat eerste teken, een `\r` incluis; `@@`-regels, contextregels en `\ No newline at end of file` tellen
 * niet. De tekst bevat geen kopregels: de diff-guard slaat ze over, REST levert ze niet.
 * @param {string} tekst @returns {number}
 */
export function patchBytes(tekst) {
  let bytes = 0;
  for (const regel of tekst.split('\n'))
    if (regel.startsWith('+') || regel.startsWith('-')) bytes += Buffer.byteLength(regel.slice(1), 'utf8');
  return bytes;
}

/**
 * `toegestaan` en `kritiek` uit de padtabel (`agentMergeLijsten`, ADR 0079), of de fout van de lezer (beide vormen tegelijk,
 * `paden` geen object). @param {unknown} ruw
 * @returns {{ toegestaan: string[] | undefined, kritiek: string[] | undefined, fout: string | null }}
 */
function padLijsten(ruw) {
  try {
    return { ...agentMergeLijsten(ruw), fout: null };
  } catch (error) {
    return { toegestaan: undefined, kritiek: undefined, fout: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * `agentMerge` uit .claude/gates.json: het blok (`codex`, `maxRegels`, `maxBytes`) met `toegestaan` en `kritiek` uit de
 * padtabel (in de oude vorm uit het blok), of null als iets ontbreekt of een andere vorm heeft (faalt dicht); ook null zonder
 * `maxRegels` of `maxBytes` als geheel getal ≥ 1 (spec agent-merge-zonder-codex AC-1, agent-merge-bytegrens AC-1).
 * @param {unknown} ruw
 * @returns {AgentMerge | null}
 */
export function leesAgentMerge(ruw) {
  const blok = veld(ruw, 'agentMerge');
  const { toegestaan, kritiek } = padLijsten(ruw);
  const maxRegels = veld(blok, 'maxRegels');
  const maxBytes = veld(blok, 'maxBytes');
  if (toegestaan === undefined || kritiek === undefined || !geheelVanaf(maxRegels, 1) || !geheelVanaf(maxBytes, 1))
    return null;
  return { toegestaan, kritiek, codex: leesCodex(veld(blok, 'codex')), maxRegels, maxBytes };
}

/**
 * Waarom `leesAgentMerge()` null geeft, per fout één reden (leeg als het blok geldig is): de fout van de padtabellezer (beide
 * vormen tegelijk), `AGENT_MERGE_ONLEESBAAR` bij een ontbrekend blok of (oude vorm) een ongeldige `toegestaan` of `kritiek`,
 * `OMVANG_ONLEESBAAR` bij een ongeldige `maxRegels`, `BYTES_ONLEESBAAR` bij een ongeldige `maxBytes`.
 * @param {unknown} ruw
 * @returns {string[]}
 */
export function agentMergeFouten(ruw) {
  const blok = veld(ruw, 'agentMerge');
  const { toegestaan, kritiek, fout } = padLijsten(ruw);
  const lijsten = toegestaan !== undefined && kritiek !== undefined && typeof blok === 'object' && blok !== null;
  return [
    ...(fout === null ? [] : [fout]),
    ...(lijsten ? [] : [AGENT_MERGE_ONLEESBAAR]),
    ...(geheelVanaf(veld(blok, 'maxRegels'), 1) ? [] : [OMVANG_ONLEESBAAR]),
    ...(geheelVanaf(veld(blok, 'maxBytes'), 1) ? [] : [BYTES_ONLEESBAAR]),
  ];
}

/** `merge` uit .claude/gates.json; ontbrekend of onbekend telt als `eigenaar` (ADR 0069 punt 3). @param {unknown} ruw */
export function leesModus(ruw) {
  return veld(ruw, 'merge') === 'niet-kritiek' ? 'niet-kritiek' : 'eigenaar';
}

/**
 * De gate-lijsten uit de padtabel (`afgeleid`, ADR 0079); een fout van de lezer (beide vormen tegelijk, `paden` geen object,
 * in de oude vorm een ongeldige lijst) valt dicht: elk pad een gate en kritiek. @param {unknown} ruw
 */
function gateLijsten(ruw) {
  try {
    const { gates, voorReview, altijdVragen, kritiek } = afgeleid(ruw);
    return { gates, voorReview, altijdVragen, kritiek };
  } catch {
    return { gates: ['**'], voorReview: undefined, altijdVragen: undefined, kritiek: ['**'] };
  }
}

/** @param {string} tekst @returns {MergeConfig} */
export function leesMergeConfig(tekst) {
  /** @type {unknown} */
  const ruw = JSON.parse(tekst);
  /** @param {string} sleutel */
  const lijst = (sleutel) => {
    const waarde = veld(ruw, sleutel);
    return tekstLijst(waarde) ? waarde : undefined;
  };
  const jsonGates = veld(ruw, 'jsonGates');
  return {
    ...gateLijsten(ruw),
    testpaden: lijst('testpaden') ?? [],
    jsonGates:
      typeof jsonGates === 'object' && jsonGates !== null && !Array.isArray(jsonGates)
        ? Object.fromEntries(Object.entries(jsonGates).map(([k, v]) => [k, tekstLijst(v) ? v : []]))
        : {},
    agentMerge: leesAgentMerge(ruw),
    merge: leesModus(ruw),
  };
}

/** @param {string} pad @param {string} status @param {MergeConfig} config */
export function nieuweTest(pad, status, config) {
  return (status === 'A' || status === 'C') && past(config.testpaden, pad) && NIEUWE_TEST.test(pad);
}

/**
 * Waarom één pad niet agent-mergebaar is, of null.
 * @param {string} pad @param {string} status @param {MergeConfig & { agentMerge: AgentMerge }} config
 */
export function padReden(pad, status, config) {
  if (VANZELF_GELADEN.some((patroon) => patroon.test(pad))) return `${pad} wordt op naam vanzelf geladen`;
  if (past(config.testpaden, pad))
    return nieuweTest(pad, status, config)
      ? null
      : `${pad}: een bestaande test of een test buiten de vaste testplekken`;
  if (!past(config.agentMerge.toegestaan, pad)) return `${pad} staat niet op agentMerge.toegestaan`;
  if (past(config.gates, pad)) return `${pad} is een gate-pad`;
  if (past(config.agentMerge.kritiek, pad) || CONTRACT.test(pad)) return `${pad} staat op agentMerge.kritiek`;
  return kritiekPad(pad, config) ? `${pad} is een kritiek pad (ADR 0062)` : null;
}

/** Regels die alleen in de ene versie staan (als multiset). @param {string} a @param {string} b */
function alleenIn(a, b) {
  const rest = new Map();
  for (const regel of b.split('\n')) rest.set(regel, (rest.get(regel) ?? 0) + 1);
  return a.split('\n').filter((regel) => {
    const n = rest.get(regel) ?? 0;
    if (n === 0) return true;
    rest.set(regel, n - 1);
    return false;
  });
}

/** Bronbestanden onder src/ met een toegevoegde of verwijderde regel met `permission`. @param {MergeInvoer['json']} json */
export function permissieRegels(json) {
  return Object.entries(json)
    .filter(([pad]) => pad.startsWith('src/'))
    .filter(([, { voor, na }]) =>
      [...alleenIn(voor ?? '', na ?? ''), ...alleenIn(na ?? '', voor ?? '')].some((regel) => PERMISSIE.test(regel)),
    )
    .map(([pad]) => pad)
    .sort();
}

/**
 * Omvang: meer dan `maxRegels` regels of `maxBytes` bytes, een binair bestand of een onleesbare telling sluit uit (spec
 * agent-merge-zonder-codex AC-2, agent-merge-bytegrens AC-3); precies `maxRegels` of `maxBytes` mag.
 * @param {MergeInvoer} invoer @param {Pick<AgentMerge, 'maxRegels' | 'maxBytes'>} grenzen
 */
export function omvangRedenen({ regels, binair, bytes }, { maxRegels, maxBytes }) {
  const bytesReden = !geheelVanaf(bytes, 0)
    ? [BYTES_ONLEESBAAR]
    : bytes > maxBytes
      ? [teGrootBytes(bytes, maxBytes)]
      : [];
  if (!geheelVanaf(regels, 0) || !tekstLijst(binair)) return [OMVANG_ONLEESBAAR, ...bytesReden];
  return [...(regels > maxRegels ? [teGroot(regels, maxRegels)] : []), ...bytesReden, ...binair.map(binairReden)];
}

/**
 * Het oordeel: `ja` alleen zonder enige reden (spec agent-merge-niet-kritiek AC-1, agent-merge-zonder-codex AC-2).
 * @param {MergeInvoer} invoer @param {MergeConfig} config
 * @returns {{ oordeel: 'ja' | 'nee', redenen: string[] }}
 */
export function agentMergeOordeel(invoer, config) {
  const agentMerge = config.agentMerge;
  if (agentMerge === null) return { oordeel: 'nee', redenen: [AGENT_MERGE_ONLEESBAAR] };
  const volledig = { ...config, agentMerge };
  // Bij een hernoeming verdwijnt het oude pad ook; de bron van een kopie blijft ongewijzigd staan.
  const paden = invoer.wijzigingen.flatMap(({ status, pad, van }) => [
    { status, pad },
    ...(status === 'R' && van !== undefined ? [{ status, pad: van }] : []),
  ]);
  const redenen = [
    ...paden.flatMap(({ status, pad }) => {
      const reden = padReden(pad, status, volledig);
      const test = TEST_GEWIJZIGD.has(status) && past(config.testpaden, pad);
      return [
        ...(reden === null ? [] : [reden]),
        ...(test && reden === null ? [`${pad}: bestaande test geraakt`] : []),
      ];
    }),
    ...invoer.geraakteJson.map((sleutel) => `bewaakte sleutel ${sleutel}`),
    ...Object.entries(invoer.risico).flatMap(([soort, items]) =>
      items.map((item) => `risico-overzicht (${soort}): ${item}`),
    ),
    ...permissieRegels(invoer.json).map((pad) => `${pad}: regel met permission toegevoegd of verwijderd`),
    ...omvangRedenen(invoer, agentMerge),
  ];
  const uniek = [...new Set(redenen)];
  return { oordeel: uniek.length === 0 ? 'ja' : 'nee', redenen: uniek };
}
