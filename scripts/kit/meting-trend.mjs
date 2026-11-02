// Kwaliteitstrend over de laatste twintig gemergde PR's (ADR 0065 punt 4, leesbudget/AC-7): `pnpm meting --trend`.
// Per maat het gemiddelde over de nieuwste tien tegenover de tien daarvoor; hoger is "let op: <maat> steeg". Maten:
// CI-rood (`gh run list` per head-branch, conclusion failure), Codex-bevindingen (reviewreacties van CODEX_LOGIN via
// `gh api .../pulls/<nr>/comments`) en reviewrondes (lokale meetdata; zonder data "onbekend", nooit 0). Een gh-fout geeft
// "onbekend" voor die PR. Minder dan twintig PR's: "te weinig data". Leest nooit meer dan twintig PR's; geen exitcode.
import { execFileSync } from 'node:child_process';

/** De login van de Codex-reviewbot op GitHub (vastgelegd met een test). */
export const CODEX_LOGIN = 'chatgpt-codex-connector[bot]';
const AANTAL = 20;
const HELFT = 10;

/** @typedef {number | 'onbekend'} Waarde */
/** @typedef {{ nummer: number, ciRood: Waarde, codex: Waarde, reviewrondes: Waarde }} Pr */
/** @typedef {{ gh: string, timeout: number }} GhOpties */

/** @type {readonly { sleutel: 'ciRood' | 'codex' | 'reviewrondes', naam: string }[]} */
const MATEN = [
  { sleutel: 'ciRood', naam: 'CI-rood' },
  { sleutel: 'codex', naam: 'Codex-bevindingen' },
  { sleutel: 'reviewrondes', naam: 'reviewrondes' },
];

/** @param {unknown} x @param {string} naam */
function veld(x, naam) {
  return typeof x === 'object' && x !== null ? new Map(Object.entries(x)).get(naam) : undefined;
}

/** Aantal reacties van CODEX_LOGIN. @param {readonly unknown[]} reacties */
export function telCodex(reacties) {
  return reacties.filter((r) => veld(veld(r, 'user'), 'login') === CODEX_LOGIN).length;
}

/** Gemiddelde van de bekende waarden; zonder bekende waarde "onbekend". @param {readonly Waarde[]} waarden @returns {Waarde} */
function gemiddelde(waarden) {
  const bekend = waarden.filter((w) => typeof w === 'number');
  return bekend.length === 0 ? 'onbekend' : bekend.reduce((a, b) => a + b, 0) / bekend.length;
}

/** @param {Waarde} w */
function getal(w) {
  return typeof w === 'number' ? String(Math.round(w * 100) / 100) : w;
}

/**
 * De trend over de nieuwste twintig PR's (nieuwste eerst).
 * @param {readonly Pr[]} prs
 */
export function trend(prs) {
  const lijst = prs.slice(0, AANTAL);
  const teWeinigData = lijst.length < AANTAL;
  const maten = Object.fromEntries(
    MATEN.map(({ sleutel }) => {
      const laatste = gemiddelde(lijst.slice(0, HELFT).map((p) => p[sleutel]));
      const vorige = gemiddelde(lijst.slice(HELFT).map((p) => p[sleutel]));
      const steeg = !teWeinigData && typeof laatste === 'number' && typeof vorige === 'number' && laatste > vorige;
      return [sleutel, { laatste, vorige, steeg }];
    }),
  );
  const meldingen = MATEN.filter(({ sleutel }) => maten[sleutel]?.steeg === true).map(
    ({ sleutel, naam }) =>
      `let op: ${naam} steeg: gemiddeld ${getal(maten[sleutel]?.laatste ?? 'onbekend')} over de laatste tien gemergde PR's, ${getal(maten[sleutel]?.vorige ?? 'onbekend')} over de tien daarvoor`,
  );
  return { aantal: lijst.length, teWeinigData, maten, meldingen };
}

/** JSON-uitvoer van `<gh> <args>` (zonder shell, met timeout), of null bij een fout. @param {GhOpties} opties @param {readonly string[]} args */
function gh({ gh: bin, timeout }, args) {
  try {
    /** @type {unknown} */
    const uit = JSON.parse(execFileSync(bin, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'] }));
    return uit;
  } catch {
    return null;
  }
}

/** Rode runs op een branch. @param {GhOpties} opties @param {string} branch @returns {Waarde} */
function ciRood(opties, branch) {
  if (branch === '' || branch.startsWith('-')) return 'onbekend';
  const runs = gh(opties, ['run', 'list', `--branch=${branch}`, '--json', 'conclusion', '--limit', '100']);
  return Array.isArray(runs) ? runs.filter((r) => veld(r, 'conclusion') === 'failure').length : 'onbekend';
}

/** Codex-bevindingen op een PR. @param {GhOpties} opties @param {number} nummer @returns {Waarde} */
function codex(opties, nummer) {
  const reacties = gh(opties, ['api', `repos/{owner}/{repo}/pulls/${String(nummer)}/comments?per_page=100`]);
  return Array.isArray(reacties) ? telCodex(reacties) : 'onbekend';
}

/**
 * De nieuwste twintig gemergde PR's met hun maten; null als `gh pr list` faalt. Bij minder dan twintig volgen geen
 * verdere gh-aanroepen.
 * @param {GhOpties} opties
 * @param {(branch: string) => Waarde} reviewrondes
 * @returns {Pr[] | null}
 */
export function prsUitGh(opties, reviewrondes) {
  const velden = 'number,headRefName,mergedAt';
  const lijst = gh(opties, ['pr', 'list', '--state', 'merged', '--limit', String(AANTAL), '--json', velden]);
  if (!Array.isArray(lijst)) return null;
  const prs = lijst
    .map((p) => ({
      nummer: Number(veld(p, 'number')),
      branch: String(veld(p, 'headRefName') ?? ''),
      t: veld(p, 'mergedAt'),
    }))
    .sort((a, b) => String(b.t).localeCompare(String(a.t)))
    .slice(0, AANTAL);
  if (prs.length < AANTAL)
    return prs.map(({ nummer }) => ({ nummer, ciRood: 'onbekend', codex: 'onbekend', reviewrondes: 'onbekend' }));
  return prs.map(({ nummer, branch }) => ({
    nummer,
    ciRood: ciRood(opties, branch),
    codex: codex(opties, nummer),
    reviewrondes: reviewrondes(branch),
  }));
}

/** @param {ReturnType<typeof trend> | null} t */
export function trendTekst(t) {
  if (t === null) return 'meting --trend: gh pr list gaf geen bruikbare uitvoer; trend onbekend\n';
  if (t.teWeinigData)
    return `te weinig data: ${String(t.aantal)} gemergde PR's, de trend vraagt er ${String(AANTAL)}\n`;
  const regels = MATEN.map(({ sleutel, naam }) => {
    const m = t.maten[sleutel];
    return `${naam}: laatste tien ${getal(m?.laatste ?? 'onbekend')}, tien daarvoor ${getal(m?.vorige ?? 'onbekend')}`;
  });
  return `${[`Trend over ${String(AANTAL)} gemergde PR's (gemiddelde per PR):`, ...regels, ...t.meldingen].join('\n')}\n`;
}
