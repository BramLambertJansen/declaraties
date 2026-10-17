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

/** Git-oid van een object (sha1 of sha256, naar de lengte van de verwachte oid). @param {string} soort @param {Uint8Array} data @param {number} lengte */
function objectOid(soort, data, lengte) {
  return createHash(lengte === 64 ? 'sha256' : 'sha1')
    .update(`${soort} ${String(data.length)}\0`)
    .update(data)
    .digest('hex');
}

/**
 * De ruwe inhoud van een object, alleen als die bij zijn oid hoort. Git controleert dat bij gewoon lezen niet, en `.git/objects` is
 * voor de sandbox schrijfbaar: een los, vervalst object onder het anker zou anders een eigen tree laten uitpakken.
 * @param {string} soort @param {string} oid
 */
function gecontroleerd(soort, oid) {
  const data = execFileSync('git', ['cat-file', soort, oid], { cwd: HIER, env: GIT_ENV, stdio: ['ignore', 'pipe', 'ignore'] });
  if (objectOid(soort, data, oid.length) !== oid) throw new Error(`object ${oid} klopt niet met zijn hash`);
  return data;
}

/** Entries van een gecontroleerde tree. @param {string} oid @returns {{ modus: string, naam: string, oid: string }[]} */
function entries(oid) {
  const data = gecontroleerd('tree', oid);
  const breedte = oid.length / 2;
  const lijst = [];
  for (let i = 0; i < data.length; ) {
    const spatie = data.indexOf(0x20, i);
    const nul = data.indexOf(0, spatie);
    if (spatie < 0 || nul < 0) throw new Error(`tree ${oid} is onleesbaar`);
    const id = data.subarray(nul + 1, nul + 1 + breedte).toString('hex');
    lijst.push({ modus: data.subarray(i, spatie).toString(), naam: data.subarray(spatie + 1, nul).toString(), oid: id });
    i = nul + 1 + breedte;
  }
  return lijst;
}

/** Tree-oid van `rails/hooks` in de commit als `<naam>.mjs` erin staat, anders null; elk object op het pad gecontroleerd. @param {string | null} sha @param {string} naam */
function boomVan(sha, naam) {
  if (sha === null) return null;
  try {
    let oid = /^tree ([0-9a-f]+)\n/.exec(gecontroleerd('commit', sha).toString())?.[1];
    for (const deel of ['rails', 'hooks'])
      oid = oid === undefined ? undefined : entries(oid).find((entry) => entry.naam === deel && entry.modus === '40000')?.oid;
    return oid !== undefined && entries(oid).some((entry) => entry.naam === `${naam}.mjs`) ? oid : null;
  } catch {
    return null;
  }
}

/**
 * Het anker; zonder anker, als de hook er niet in staat of bij de start van een sessie ververst. Het rolhek gebruikt nooit het
 * netwerk: zijn timeout van 10 s verstrijken is voor Claude Code fail-open. Zijn anker legt `werkstraat session-start` vast.
 * @param {string} naam @param {boolean} sessieStart
 */
function bron(naam, sessieStart) {
  const anker = leesAnker();
  const huidig = sessieStart ? null : paar(anker, naam);
  if (huidig !== null || naam === 'rolhek') return huidig;
  return paar(ververs(), naam) ?? paar(anker, naam);
}

/** @param {string | null} sha @param {string} naam @returns {{ sha: string, boom: string } | null} */
function paar(sha, naam) {
  const boom = boomVan(sha, naam);
  return sha === null || boom === null ? null : { sha, boom };
}

/** Alle bestanden onder een gecontroleerde tree. @param {string} boom @param {string} [voor] @returns {{ pad: string, oid: string }[]} */
function inhoud(boom, voor = '') {
  return entries(boom).flatMap(({ modus, naam, oid }) => {
    if (modus === '40000') return inhoud(oid, `${voor}${naam}/`);
    if (modus !== '100644' && modus !== '100755') throw new Error(`rails/hooks/${voor}${naam} is geen gewoon bestand op main`);
    return [{ pad: `${voor}${naam}`, oid }];
  });
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
    return lijst.every(({ pad, oid }) => objectOid('blob', readFileSync(path.join(map, pad)), oid.length) === oid);
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
  let anker;
  try {
    const gevonden = bron(naam, naam === 'werkstraat' && process.argv[2] === 'session-start');
    if (gevonden === null) return weiger(naam, dicht, `geen geldig anker met rails/hooks/${naam}.mjs; een nieuwe sessie met netwerk legt het vast`);
    map = uitpakken(gevonden.boom);
    anker = gevonden.sha;
  } catch (error) {
    return weiger(naam, dicht, error instanceof Error ? error.message : String(error));
  }
  const result = spawnSync(process.execPath, [path.join(map, `${naam}.mjs`), ...process.argv.slice(2)], {
    input: invoer,
    stdio: ['pipe', 'inherit', 'inherit'],
    // Het script leest zijn vertrouwde basis (gates, register, runner) uit dit anker, niet uit de lokale origin/main.
    env: { ...process.env, RAILS_ANKER: anker },
  });
  if (result.status === null) return weiger(naam, dicht, `rails/hooks/${naam}.mjs stopte zonder exitcode`);
  if (naam === 'rolhek' && result.status !== 0 && result.status !== 2)
    return weiger(naam, true, `rails/hooks/rolhek.mjs gaf exitcode ${String(result.status)}`);
  process.exitCode = result.status;
}
