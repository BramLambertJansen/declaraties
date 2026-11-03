// Oordeel agent-merge (ADR 0069 punt 1, spec agent-merge-niet-kritiek AC-1): mag de hoofdsessie deze PR zelf mergen? Puur:
// de diff-guard levert de wijzigingen, de tekst van de bronbestanden en het risico-overzicht. Een toegestane lijst, de rest
// dicht: elk pad moet op `agentMerge.toegestaan` staan en op geen gate, `agentMerge.kritiek` of kritiek pad (ADR 0062). Een
// goedkeuring telt niet mee; reviews worden hier niet gelezen.

import { globMatch } from '../../rails/hooks/lib/rolhek.mjs';
import { kritiekPad } from './lane.mjs';

/**
 * @typedef {{ toegestaan: string[], kritiek: string[], codex: boolean }} AgentMerge
 * @typedef {{ gates: string[], testpaden: string[], jsonGates: Record<string, string[]>, voorReview?: string[] | undefined,
 *   altijdVragen?: string[] | undefined, agentMerge: AgentMerge | null, merge: 'eigenaar' | 'niet-kritiek' }} MergeConfig
 * @typedef {{ status: string, pad: string, van?: string }} Wijziging
 * @typedef {{ wijzigingen: Wijziging[], json: Record<string, { voor: string | null, na: string | null }>,
 *   geraakteJson: string[], risico: Record<string, string[]> }} MergeInvoer
 */

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

/**
 * `agentMerge` uit .claude/gates.json, of null als het ontbreekt of een andere vorm heeft (faalt dicht).
 * @param {unknown} ruw
 * @returns {AgentMerge | null}
 */
export function leesAgentMerge(ruw) {
  const blok = veld(ruw, 'agentMerge');
  const toegestaan = veld(blok, 'toegestaan');
  const kritiek = veld(blok, 'kritiek');
  const codex = veld(blok, 'codex');
  if (!tekstLijst(toegestaan) || !tekstLijst(kritiek) || typeof codex !== 'boolean') return null;
  return { toegestaan, kritiek, codex };
}

/** `merge` uit .claude/gates.json; ontbrekend of onbekend telt als `eigenaar` (ADR 0069 punt 3). @param {unknown} ruw */
export function leesModus(ruw) {
  return veld(ruw, 'merge') === 'niet-kritiek' ? 'niet-kritiek' : 'eigenaar';
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
    gates: lijst('gates') ?? ['**'],
    testpaden: lijst('testpaden') ?? [],
    jsonGates:
      typeof jsonGates === 'object' && jsonGates !== null && !Array.isArray(jsonGates)
        ? Object.fromEntries(Object.entries(jsonGates).map(([k, v]) => [k, tekstLijst(v) ? v : []]))
        : {},
    voorReview: lijst('voorReview'),
    altijdVragen: lijst('altijdVragen'),
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
 * Het oordeel: `ja` alleen zonder enige reden (spec agent-merge-niet-kritiek AC-1).
 * @param {MergeInvoer} invoer @param {MergeConfig} config
 * @returns {{ oordeel: 'ja' | 'nee', redenen: string[] }}
 */
export function agentMergeOordeel(invoer, config) {
  const agentMerge = config.agentMerge;
  if (agentMerge === null)
    return { oordeel: 'nee', redenen: ['agentMerge ontbreekt of is onleesbaar in .claude/gates.json'] };
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
  ];
  const uniek = [...new Set(redenen)];
  return { oordeel: uniek.length === 0 ? 'ja' : 'nee', redenen: uniek };
}
