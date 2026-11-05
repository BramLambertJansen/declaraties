// Bewaking zichtbaar (leerpunt #462, spec bewaking-zichtbaar): meldt in een Claude Code-sessie dat de projecthooks uit
// .claude/settings.json niet draaien of de Bash-sandbox niet afschermt, zodat een sessie die niet claimt (R-WERK-23).
// Alleen ingebouwde Node-modules: feiten.mjs roept dit aan vóór de toolchaincontrole, ook zonder node_modules.
import { accessSync, constants, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { bestand, opslagmap } from '../../rails/hooks/lib/meting.mjs';

/** Venster voor het eigen meetbestand; zonder sessie-id telt elk bestand, met een krap venster (AC-2). */
const VENSTER_SESSIE_MS = 120_000;
const VENSTER_ELK_MS = 10_000;

/**
 * @param {{ inClaudeCode: boolean, recenteMeting: boolean, buitenWerkmapSchrijfbaar: boolean, map: string | null, ouder: string }} feiten
 * @returns {string | null}
 */
export function bewakingMelding({ inClaudeCode, recenteMeting, buitenWerkmapSchrijfbaar, map, ouder }) {
  if (!inClaudeCode) return null;
  /** @type {string[]} */
  const delen = [];
  if (!recenteMeting)
    delen.push(
      `projecthooks uit .claude/settings.json draaien niet (geen recente meting in ${map ?? '(geen opslagmap)'})`,
    );
  if (buitenWerkmapSchrijfbaar) delen.push(`de Bash-sandbox schermt niet af (${ouder} is schrijfbaar)`);
  if (delen.length === 0) return null;
  return (
    `⚠ bewaking niet actief in deze sessie: ${delen.join('; ')}. Rolhek, toets op effect en werkstraat-hooks houden niets ` +
    `tegen: claim ze niet (R-WERK-23); destructieve of overgenomen commando's alleen in de kooi (R-TOOL-03). Zie docs/ENVIRONMENT.md.`
  );
}

/** Wijzigingstijd in ms, of null als `stat` faalt (kapotte link, geen rechten). @param {string} pad */
function mtime(pad) {
  try {
    return statSync(pad).mtimeMs;
  } catch {
    return null;
  }
}

/** @param {string} pad @param {number} nu @param {number} venster */
function recent(pad, nu, venster) {
  const tijd = mtime(pad);
  return tijd !== null && nu - tijd <= venster;
}

/** Valt dicht: geen map, onleesbare map of geen recent bestand is onwaar (AC-3). @param {string | null} map @param {string | null} eigen @param {number} nu */
function recenteMetingIn(map, eigen, nu) {
  if (map === null) return false;
  if (eigen !== null) return recent(eigen, nu, VENSTER_SESSIE_MS);
  try {
    return readdirSync(map).some((naam) => naam.endsWith('.jsonl') && recent(path.join(map, naam), nu, VENSTER_ELK_MS));
  } catch {
    return false;
  }
}

/** @param {string} pad */
function schrijfbaar(pad) {
  try {
    accessSync(pad, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} root
 * @param {Record<string, string | undefined>} env
 * @param {number} nu ms sinds epoch
 * @returns {string | null}
 */
export function bewakingMeldingIn(root, env, nu) {
  const inClaudeCode = env['CLAUDECODE'] === '1';
  if (!inClaudeCode) return null;
  const map = opslagmap(root, env);
  const sessie = env['CLAUDE_CODE_SESSION_ID'];
  const eigen =
    map !== null && sessie !== undefined && sessie !== '' ? bestand({ session_id: sessie, cwd: root }, env) : null;
  const ouder = path.dirname(path.resolve(root));
  return bewakingMelding({
    inClaudeCode,
    recenteMeting: recenteMetingIn(map, eigen, nu),
    buitenWerkmapSchrijfbaar: schrijfbaar(ouder),
    map,
    ouder,
  });
}
