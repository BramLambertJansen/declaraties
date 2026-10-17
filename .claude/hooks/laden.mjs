// Gedeelde lader voor de hook-stubs (ADR 0033 punt 1): draait `rails/hooks/<naam>.mjs` zoals die op origin/main staat, nooit de
// versie uit de werkmap of de branch. Een hookwijziging werkt dus pas na de merge door de eigenaar. De versie van main wordt per
// tree-oid uitgepakt in `<git common dir>/rails-hooks/<oid>/`, gedeeld door alle worktrees. Het rolhek faalt dicht, de rest open.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const COMPLEET = '.compleet';

/** @param {string[]} args @param {number} [timeout] */
function git(args, timeout) {
  return execFileSync('git', args, { cwd: HIER, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout });
}

/** Tree-oid van `origin/main:rails/hooks` als `<naam>.mjs` erin staat, anders null. @param {string} naam */
function mainBoom(naam) {
  try {
    git(['cat-file', '-e', `refs/remotes/origin/main:rails/hooks/${naam}.mjs`]);
    if (git(['cat-file', '-t', 'refs/remotes/origin/main:rails/hooks']).trim() !== 'tree') return null;
    return git(['rev-parse', '--verify', 'refs/remotes/origin/main:rails/hooks']).trim();
  } catch {
    return null;
  }
}

/** Zonder de hook op de lokale origin/main één keer ophalen (eerste sessie na de merge). @param {string} naam */
function bron(naam) {
  const boom = mainBoom(naam);
  if (boom !== null) return boom;
  try {
    git(['fetch', '--quiet', 'origin', 'main'], 5000);
  } catch {
    return null;
  }
  return mainBoom(naam);
}

/** @param {string} boom @param {string} doel */
function schrijfBoom(boom, doel) {
  const regels = git(['ls-tree', '-r', '-z', '--full-tree', boom]).split('\0').filter(Boolean);
  for (const regel of regels) {
    const [kop = '', pad = ''] = regel.split('\t');
    const [modus, soort, oid = ''] = kop.split(' ');
    if (soort !== 'blob' || modus === '120000') throw new Error(`rails/hooks/${pad} is geen gewoon bestand op origin/main`);
    const bestand = path.join(doel, pad);
    mkdirSync(path.dirname(bestand), { recursive: true });
    writeFileSync(bestand, execFileSync('git', ['cat-file', 'blob', oid], { cwd: HIER, stdio: ['ignore', 'pipe', 'ignore'] }));
  }
  writeFileSync(path.join(doel, COMPLEET), boom);
}

/** Pakt de tree eenmalig uit; atomisch via een tijdelijke map, zodat een half uitgepakte versie nooit draait. @param {string} boom */
function uitpakken(boom) {
  const doel = path.join(path.resolve(HIER, git(['rev-parse', '--git-common-dir']).trim()), 'rails-hooks', boom);
  if (existsSync(path.join(doel, COMPLEET))) return doel;
  const tijdelijk = `${doel}.tmp-${String(process.pid)}-${String(Date.now())}`;
  try {
    schrijfBoom(boom, tijdelijk);
    renameSync(tijdelijk, doel);
  } catch (error) {
    rmSync(tijdelijk, { recursive: true, force: true });
    if (!existsSync(path.join(doel, COMPLEET))) throw error;
  }
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
  process.stderr.write(`hook ${naam} (ADR 0033): ${reden}${dicht ? '; het rolhek faalt dicht' : ''}\n`);
  process.exitCode = dicht ? 2 : 0;
}

/**
 * Draait `rails/hooks/<naam>.mjs` van origin/main met dezelfde args, stdin, env en cwd, en geeft uitvoer en exitcode door.
 * @param {string} naam
 * @param {boolean} dicht true: elke fout van de lader of een crash is exit 2 (rolhek); false: exit 0
 */
export function draai(naam, dicht) {
  const invoer = leesStdin();
  let map;
  try {
    const boom = bron(naam);
    if (boom === null) return weiger(naam, dicht, `rails/hooks/${naam}.mjs staat niet op origin/main, ook niet na git fetch origin main`);
    map = uitpakken(boom);
  } catch (error) {
    return weiger(naam, dicht, error instanceof Error ? error.message : String(error));
  }
  const result = spawnSync(process.execPath, [path.join(map, `${naam}.mjs`), ...process.argv.slice(2)], {
    input: invoer,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (result.status === null) return weiger(naam, dicht, `rails/hooks/${naam}.mjs stopte zonder exitcode`);
  process.exitCode = result.status;
}
