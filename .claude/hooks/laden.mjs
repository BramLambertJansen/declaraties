// Gedeelde lader voor de hook-stubs (ADR 0033 punt 1): draait `rails/hooks/<naam>.mjs` zoals die op main van de remote staat,
// nooit de versie uit de werkmap, de branch of een omgebogen lokale `origin/main`. Anker en cache staan in `.claude/hooks/.cache/`,
// een map die de sandbox van Claude Code niet laat beschrijven: `main` (de commit-SHA van de remote, ververst bij de start van een
// sessie) en per tree-oid de uitgepakte versie, vóór elke run gecontroleerd tegen de blob-hashes. Rolhek en werkstraat falen dicht.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HIER, '.cache');
const ANKER = path.join(CACHE, 'main');
const COMPLEET = '.compleet';
const OID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
// Geen replace-objecten (anders vervalst `git replace` de uitgepakte inhoud) en nooit om credentials vragen.
const GIT_ENV = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0' };

/** @param {string[]} args @param {number} [timeout] */
function git(args, timeout) {
  return execFileSync('git', args, { cwd: HIER, encoding: 'utf8', env: GIT_ENV, stdio: ['ignore', 'pipe', 'ignore'], timeout });
}

/** @param {string} oid */
function blob(oid) {
  return execFileSync('git', ['cat-file', 'blob', oid], { cwd: HIER, env: GIT_ENV, stdio: ['ignore', 'pipe', 'ignore'] });
}

/** @param {string} sha */
function heeftCommit(sha) {
  try {
    git(['cat-file', '-e', `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function leesAnker() {
  try {
    const sha = readFileSync(ANKER, 'utf8').trim();
    return OID.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

/** Vraagt de SHA van main aan de remote, haalt het object zo nodig op en legt hem vast als anker; null bij een fout. */
function ververs() {
  try {
    const sha = git(['ls-remote', 'origin', 'refs/heads/main'], 4000).split('\t')[0]?.trim() ?? '';
    if (!OID.test(sha)) return null;
    if (!heeftCommit(sha)) git(['fetch', '--quiet', 'origin', '+refs/heads/main:refs/remotes/origin/main'], 4000);
    if (!heeftCommit(sha)) return null;
    mkdirSync(CACHE, { recursive: true });
    const tijdelijk = `${ANKER}.tmp-${String(process.pid)}`;
    writeFileSync(tijdelijk, sha);
    renameSync(tijdelijk, ANKER);
    return sha;
  } catch {
    return null;
  }
}

/** Tree-oid van `rails/hooks` in de commit als `<naam>.mjs` erin staat, anders null. @param {string | null} sha @param {string} naam */
function boomVan(sha, naam) {
  if (sha === null) return null;
  try {
    git(['cat-file', '-e', `${sha}:rails/hooks/${naam}.mjs`]);
    if (git(['cat-file', '-t', `${sha}:rails/hooks`]).trim() !== 'tree') return null;
    return git(['rev-parse', '--verify', `${sha}:rails/hooks`]).trim();
  } catch {
    return null;
  }
}

/** Het anker, ververst bij de start van een sessie, zonder anker of als de hook er niet in staat. @param {string} naam @param {boolean} sessieStart */
function bron(naam, sessieStart) {
  const anker = leesAnker();
  const huidig = sessieStart ? null : boomVan(anker, naam);
  if (huidig !== null) return huidig;
  return boomVan(ververs(), naam) ?? boomVan(anker, naam);
}

/** @param {string} boom @returns {{ pad: string, oid: string }[]} */
function inhoud(boom) {
  return git(['ls-tree', '-r', '-z', '--full-tree', boom])
    .split('\0')
    .filter(Boolean)
    .map((regel) => {
      const [kop = '', pad = ''] = regel.split('\t');
      const [modus, soort, oid = ''] = kop.split(' ');
      if (soort !== 'blob' || modus === '120000') throw new Error(`rails/hooks/${pad} is geen gewoon bestand op main`);
      return { pad, oid };
    });
}

/** Git-blob-oid van inhoud (sha1 of sha256, naar de lengte van de verwachte oid). @param {Uint8Array} data @param {number} lengte */
function blobOid(data, lengte) {
  return createHash(lengte === 64 ? 'sha256' : 'sha1')
    .update(`blob ${String(data.length)}\0`)
    .update(data)
    .digest('hex');
}

/** Precies de bestanden van de tree (plus de marker), met de juiste inhoud, zonder symlinks of extra's. @param {string} map @param {{ pad: string, oid: string }[]} lijst */
function intact(map, lijst) {
  try {
    const items = readdirSync(map, { recursive: true, withFileTypes: true });
    if (items.some((item) => !item.isFile() && !item.isDirectory())) return false;
    const op = items
      .filter((item) => item.isFile())
      .map((item) => path.relative(map, path.join(item.parentPath, item.name)).split(path.sep).join('/'));
    const verwacht = new Set([...lijst.map(({ pad }) => pad), COMPLEET]);
    if (op.length !== verwacht.size || op.some((pad) => !verwacht.has(pad))) return false;
    return lijst.every(({ pad, oid }) => blobOid(readFileSync(path.join(map, pad)), oid.length) === oid);
  } catch {
    return false;
  }
}

/** @param {{ pad: string, oid: string }[]} lijst @param {string} doel @param {string} boom */
function schrijf(lijst, doel, boom) {
  for (const { pad, oid } of lijst) {
    const bestand = path.join(doel, pad);
    mkdirSync(path.dirname(bestand), { recursive: true });
    writeFileSync(bestand, blob(oid));
  }
  writeFileSync(path.join(doel, COMPLEET), boom);
}

/** Hergebruikt een intacte cache; anders opnieuw uitpakken, atomisch via een tijdelijke map. @param {string} boom */
function uitpakken(boom) {
  const lijst = inhoud(boom);
  const doel = path.join(CACHE, boom);
  if (intact(doel, lijst)) return doel;
  rmSync(doel, { recursive: true, force: true });
  const tijdelijk = `${doel}.tmp-${String(process.pid)}-${String(Date.now())}`;
  try {
    schrijf(lijst, tijdelijk, boom);
    renameSync(tijdelijk, doel);
  } catch (error) {
    rmSync(tijdelijk, { recursive: true, force: true });
    if (!intact(doel, lijst)) throw error;
  }
  if (!intact(doel, lijst)) throw new Error('de uitgepakte versie klopt niet met main');
  return doel;
}

function leesStdin() {
  try {
    return readFileSync(0);
  } catch {
    return new Uint8Array();
  }
}

/** @param {string} naam @param {boolean} dicht @param {string} reden */
function weiger(naam, dicht, reden) {
  process.stderr.write(`hook ${naam} (ADR 0033): ${reden}${dicht ? '; de hook faalt dicht' : ''}\n`);
  process.exitCode = dicht ? 2 : 0;
}

/**
 * Draait `rails/hooks/<naam>.mjs` van main met dezelfde args, stdin, env en cwd, en geeft uitvoer en exitcode door. Het rolhek
 * kent alleen 0 en 2: elke andere exitcode van het script (ook een crash) wordt daar 2.
 * @param {string} naam
 * @param {boolean} dicht true: een fout van de lader is exit 2 (rolhek, werkstraat); false: exit 0 (meting)
 */
export function draai(naam, dicht) {
  const invoer = leesStdin();
  let map;
  try {
    const boom = bron(naam, naam === 'werkstraat' && process.argv[2] === 'session-start');
    if (boom === null) return weiger(naam, dicht, `rails/hooks/${naam}.mjs staat niet op main van de remote, of die is onbereikbaar`);
    map = uitpakken(boom);
  } catch (error) {
    return weiger(naam, dicht, error instanceof Error ? error.message : String(error));
  }
  const result = spawnSync(process.execPath, [path.join(map, `${naam}.mjs`), ...process.argv.slice(2)], {
    input: invoer,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (result.status === null) return weiger(naam, dicht, `rails/hooks/${naam}.mjs stopte zonder exitcode`);
  if (naam === 'rolhek' && result.status !== 0 && result.status !== 2)
    return weiger(naam, true, `rails/hooks/rolhek.mjs gaf exitcode ${String(result.status)}`);
  process.exitCode = result.status;
}
