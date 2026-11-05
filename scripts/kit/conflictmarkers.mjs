// Conflictmarkers (leerpunt #495): een merge die markers laat staan in Markdown, YAML of JSON haalde geen enkele check;
// Prettier slaat `*.md` en `docs/` over en tsc/ESLint zien alleen code. Deze check leest elk getrackt tekstbestand en
// faalt op een regel die in kolom 1 begint met `<<<<<<<` of `>>>>>>>` (met of zonder label erachter), en op `|||||||`
// (diff3) of exact `=======` tussen zulke markers. Een losse `=======` is geen marker: in Markdown is dat een
// setext-kop. Kanaal `strikt` van `pnpm ratchet`: nooit in de baseline en geen uitzonderingslijst. Moet een document
// markers tonen, dan springt het ze in (codeblok met vier spaties of binnen een citaat), dan staan ze niet in kolom 1.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** @typedef {{ key: string, message: string }} Violation */

const BEGIN = /^<{7}(?: |$)/;
const EIND = /^>{7}(?: |$)/;
const MIDDEN = /^(?:={7}|\|{7}(?: .*)?)$/;

/** Bytes die git ook gebruikt om binair te herkennen: een NUL in het begin. */
const BINAIR_PROEF = 8000;

/**
 * Regelnummers (vanaf 1) met een conflictmarker.
 * @param {string} text
 * @returns {number[]}
 */
export function markerRegels(text) {
  /** @type {number[]} */
  const regels = [];
  let binnen = false;
  text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .forEach((regel, index) => {
      if (BEGIN.test(regel)) binnen = true;
      else if (EIND.test(regel)) binnen = false;
      else if (!(binnen && MIDDEN.test(regel))) return;
      regels.push(index + 1);
    });
  return regels;
}

/** @param {Buffer} inhoud */
function isBinair(inhoud) {
  return inhoud.subarray(0, BINAIR_PROEF).includes(0);
}

/**
 * Overtredingen in alle getrackte tekstbestanden onder `root`.
 * @param {string} root
 * @returns {Violation[]}
 */
export function conflictMarkerViolations(root) {
  const files = execFileSync('git', ['ls-files', '-z', '--deduplicate'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .split('\0')
    .filter(Boolean);
  return files.flatMap((file) => {
    /** @type {Buffer} */
    let inhoud;
    try {
      inhoud = readFileSync(path.join(root, file));
    } catch (error) {
      // Alleen: verwijderd in de werkmap maar nog getrackt, of een map (submodule, symlink naar een map). Elke andere
      // leesfout breekt de check af in plaats van het bestand stil over te slaan.
      if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'EISDIR')) return [];
      throw error;
    }
    if (isBinair(inhoud)) return [];
    return markerRegels(inhoud.toString('utf8')).map((regel) => ({
      key: `${file}:${String(regel)}`,
      message: 'conflictmarker uit een merge; los het conflict op en haal de marker weg (leerpunt #495)',
    }));
  });
}
