// Kooi voor destructieve en overgenomen commando's (ADR 0072, spec kooi): het commando draait onder bubblewrap met het hele
// bestandssysteem alleen-lezen en één schrijfbare werkmap onder de tijdelijke map. De grens ligt in de kernel, niet in een
// analyse van de commandotekst. Zonder werkende kooi draait niets (dicht vallen, AC-3). Zonder dependencies.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROEF_PAD = '/usr/.kooi-proef';
const STANDAARD_TIMEOUT = 30_000;
const PROC_ALLEEN_LEZEN = ['/proc/sys', '/proc/sysrq-trigger', '/proc/irq', '/proc/bus'];
export const MELDING_GEEN_BWRAP =
  '✗ kooi: bubblewrap ontbreekt; het commando is niet uitgevoerd → installeer het (scripts/bootstrap.sh lokaal, scripts/cloud-setup.sh in de cloud), zie docs/ENVIRONMENT.md';
export const MELDING_PROEF = '✗ kooi: de proef schreef buiten de werkmap; het commando is niet uitgevoerd';

/** @type {'goed' | string | null} */
let proefUitslag = null;

/** @param {string} p */
function echt(p) {
  return realpathSync(p);
}

/** @param {string} binnen @param {string} buiten */
function binnenIn(binnen, buiten) {
  const rel = path.relative(buiten, binnen);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * De werkmap moet een echte submap van de tijdelijke map zijn (AC-2), en mag de repository, de thuismap of `/` niet zijn of bevatten.
 * @param {string} werkmap
 * @returns {string} de werkmap na realpath
 */
export function controleerWerkmap(werkmap) {
  const map = echt(werkmap);
  const tmp = echt(tmpdir());
  if (tmp === '/')
    throw new Error('✗ kooi: de tijdelijke map van het systeem is /; zet TMPDIR op een echte tijdelijke map');
  if (!binnenIn(map, tmp)) throw new Error(`✗ kooi: werkmap ${map} is geen submap van ${tmp}`);
  for (const verboden of ['/', homedir(), ROOT]) {
    const v = existsSync(verboden) ? echt(verboden) : verboden;
    if (map === v || binnenIn(v, map)) throw new Error(`✗ kooi: werkmap ${map} is of bevat ${v}`);
  }
  return map;
}

/**
 * Mappen van de toolchain onder de thuismap: weer alleen-lezen zichtbaar na de lege thuismap. Alleen de installatiemap van
 * mise, de map van deze `node` en absolute PATH-mappen; een relatieve PATH-map (`.`) zou de hele thuismap terugbrengen.
 * @param {string} home
 */
function toolchainMappen(home) {
  const mappen = new Set();
  const kandidaten = [path.join(home, '.local', 'share', 'mise'), path.dirname(process.execPath)];
  for (const deel of (process.env['PATH'] ?? '').split(':')) if (path.isAbsolute(deel)) kandidaten.push(deel);
  for (const kandidaat of kandidaten) {
    if (!existsSync(kandidaat)) continue;
    const map = echt(kandidaat);
    if (binnenIn(map, home)) mappen.add(map);
  }
  for (const map of [...mappen])
    for (const ander of mappen) if (ander !== map && binnenIn(map, ander)) mappen.delete(map);
  return [...mappen].sort();
}

/**
 * De argumenten van bubblewrap, in de volgorde van AC-1: eerst alles alleen-lezen, dan de lege mappen, dan de toolchain, als
 * laatste de werkmap.
 * @param {string} werkmap
 */
export function bwrapArgs(werkmap) {
  const home = existsSync(homedir()) ? echt(homedir()) : homedir();
  const leeg = ['/tmp', '/run', '/var/run', home];
  const runtime = process.env['XDG_RUNTIME_DIR'];
  if (runtime !== undefined && runtime !== '' && existsSync(runtime)) leeg.push(echt(runtime));
  const args = ['--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc'];
  // Een verse /proc is schrijfbaar voor root, ook zonder capabilities: sysctl's zoals kernel.core_pattern toetsen alleen de
  // bestandsrechten. Dezelfde delen die bubblewrap zonder root alleen-lezen maakt, hier ook.
  for (const deel of PROC_ALLEEN_LEZEN) if (existsSync(deel)) args.push('--ro-bind', deel, deel);
  for (const map of new Set(leeg.filter((m) => existsSync(m)).map(echt))) args.push('--tmpfs', map);
  for (const map of toolchainMappen(home)) args.push('--ro-bind', map, map);
  args.push('--bind', werkmap, werkmap);
  args.push('--unshare-all', '--cap-drop', 'ALL', '--die-with-parent', '--new-session', '--chdir', werkmap);
  return args;
}

/** @param {string} werkmap @param {Record<string, string>} env */
function omgeving(werkmap, env) {
  // De map van deze `node` vooraan: een mise-shim vindt zijn configuratie in de kooi niet (lege thuismap).
  const pad = `${path.dirname(process.execPath)}:${process.env['PATH'] ?? '/usr/bin:/bin'}`;
  return { PATH: pad, ...env, HOME: werkmap, TMPDIR: '/tmp' };
}

/** @param {string} werkmap @param {string} commando @param {{ env: Record<string, string>, timeout: number }} opties */
function draai(werkmap, commando, { env, timeout }) {
  return spawnSync('bwrap', [...bwrapArgs(werkmap), '--', 'bash', '-c', commando], {
    encoding: 'utf8',
    env: omgeving(werkmap, env),
    timeout,
    killSignal: 'SIGKILL',
  });
}

/**
 * Oordeel over de proef (AC-3): de proef schreef in de werkmap en kreeg op de systeemmap `Read-only file system`.
 * @param {{ error?: Error, stdout: string, stderr: string }} r
 * @param {boolean} binnenGeschreven
 * @returns {'goed' | string}
 */
export function beoordeelProef(r, binnenGeschreven) {
  if (r.error !== undefined) {
    const code = /** @type {NodeJS.ErrnoException} */ (r.error).code;
    return code === 'ENOENT'
      ? MELDING_GEEN_BWRAP
      : `✗ kooi: bubblewrap start niet (${String(code)}); het commando is niet uitgevoerd`;
  }
  if (!binnenGeschreven) return `✗ kooi: bubblewrap start niet; het commando is niet uitgevoerd (${r.stderr.trim()})`;
  return r.stdout.includes('Read-only file system') ? 'goed' : MELDING_PROEF;
}

/**
 * Proef (AC-3): binnen de werkmap schrijven lukt, in een systeemmap schrijven faalt op een alleen-lezen bestandssysteem.
 * `bouw` en `pad` zijn er voor de test die de proef tegen een kapotte kooi draait (R-PRINC-04).
 * @param {(werkmap: string) => string[]} [bouw]
 * @param {string} [pad]
 */
export function proef(bouw = bwrapArgs, pad = PROEF_PAD) {
  const map = echt(mkdtempSync(path.join(tmpdir(), 'kooi-proef-')));
  const bestondAl = existsSync(pad);
  try {
    const r = spawnSync('bwrap', [...bouw(map), '--', 'bash', '-c', `: > binnen && { : > ${pad}; } 2>&1`], {
      encoding: 'utf8',
      env: omgeving(map, {}),
      timeout: STANDAARD_TIMEOUT,
      killSignal: 'SIGKILL',
    });
    return beoordeelProef(r, existsSync(path.join(map, 'binnen')));
  } finally {
    if (!bestondAl && existsSync(pad)) rmSync(pad, { force: true });
    rmSync(map, { recursive: true, force: true });
  }
}

/** Gooit als de kooi niet afschermt; één proef per proces. */
export function eisKooi() {
  proefUitslag ??= proef();
  if (proefUitslag !== 'goed') throw new Error(proefUitslag);
}

/**
 * Draait `commando` met `bash -c` in de kooi (AC-1). Gooit bij een ongeldige werkmap, een kooi die niet afschermt en bij de
 * timeout (bubblewrap en alle kindprocessen zijn dan gestopt); anders de uitslag, ook bij een status die niet 0 is.
 * @param {string} commando
 * @param {{ werkmap: string, env?: Record<string, string>, timeout?: number }} opties
 * @returns {{ status: number | null, stdout: string, stderr: string }}
 */
export function inKooi(commando, { werkmap, env = {}, timeout = STANDAARD_TIMEOUT }) {
  const map = controleerWerkmap(werkmap);
  eisKooi();
  const r = draai(map, commando, { env, timeout });
  if (r.error !== undefined) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** CLI: `--proef`, of `--werkmap <map> -- <commando>`. @param {string[]} argv */
function main(argv) {
  try {
    if (argv[0] === '--proef') {
      eisKooi();
      console.log('✓ kooi: de proef schermt af');
      return 0;
    }
    const scheiding = argv.indexOf('--');
    if (argv[0] !== '--werkmap' || argv[1] === undefined || scheiding !== 2 || argv.length < 4) {
      console.error('gebruik: node scripts/kit/kooi.mjs --proef | --werkmap <map> -- <commando>');
      return 2;
    }
    const r = inKooi(argv.slice(3).join(' '), { werkmap: argv[1] });
    process.stdout.write(r.stdout);
    process.stderr.write(r.stderr);
    return r.status ?? 1;
  } catch (fout) {
    console.error(fout instanceof Error ? fout.message : String(fout));
    return 1;
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
