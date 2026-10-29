// Gedeelde kern van check:new-resource en check:app-init (docs/specs/app-init-proef.md, OV-3): een tijdelijke kopie van de
// repo (git ls-files, ook nieuwe bestanden) met een link naar node_modules, een package.json-script zonder pnpm, en een
// opruimguard. Geen bijwerkingen bij import. Elk kindproces krijgt de omgeving zonder de repovariabelen van git
// (`git rev-parse --local-env-vars`, zoals test/setup/git-env.ts), zodat een git-hook de kopie niet naar de bron laat wijzen.
import { execFileSync, spawn } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** De naam van de check bij elk prefix, voor de melding van de opruimguard. */
const CHECKNAMEN = new Map([
  ['app-init-proef-', 'check:app-init'],
  ['new-resource-', 'check:new-resource'],
]);

/** @type {Set<import('node:child_process').ChildProcess>} */
const lopend = new Set();

/** De omgeving zonder de repovariabelen van git. Zonder git zelf is er niets weg te halen. */
export function schoneEnv() {
  /** @type {string[]} */
  let namen = [];
  try {
    namen = execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const env = { ...process.env };
  for (const naam of namen) Reflect.deleteProperty(env, naam);
  return env;
}

/**
 * Een kindproces met de schone omgeving, in een eigen procesgroep zodat `stopKinderen()` ook de kleinkinderen raakt.
 * Async: een synchrone aanroep zou signalen op dit proces blokkeren.
 * @param {string} cwd
 * @param {string} commando
 * @param {readonly string[]} args
 * @returns {Promise<number>} exitcode
 */
export function start(cwd, commando, args) {
  return startMetEnv(cwd, [commando, ...args], schoneEnv());
}

/**
 * @param {string} cwd
 * @param {readonly string[]} opdracht commando gevolgd door zijn argumenten
 * @param {NodeJS.ProcessEnv} env
 * @returns {Promise<number>}
 */
function startMetEnv(cwd, opdracht, env) {
  const [commando = '', ...args] = opdracht;
  return new Promise((resolve, reject) => {
    const kind = spawn(commando, args, { cwd, env, stdio: 'inherit', detached: true });
    lopend.add(kind);
    kind.on('error', (error) => {
      lopend.delete(kind);
      reject(error);
    });
    kind.on('close', (code, signaal) => {
      lopend.delete(kind);
      resolve(code ?? (signaal === null ? 1 : 128));
    });
  });
}

/** Stopt alle lopende kindprocessen (en hun procesgroep). */
export function stopKinderen() {
  for (const kind of lopend) {
    try {
      if (kind.pid !== undefined) process.kill(-kind.pid, 'SIGKILL');
    } catch {
      kind.kill('SIGKILL');
    }
  }
  lopend.clear();
}

/**
 * Git in de kopie, met een vaste identiteit en zonder hooks (een hook is hier geen bewaking maar ruis).
 * @param {string} cwd
 * @param {readonly string[]} args
 */
export function git(cwd, args) {
  const instellingen = [
    '-c',
    'user.name=check',
    '-c',
    'user.email=check@example.test',
    '-c',
    'core.hooksPath=/dev/null',
  ];
  execFileSync('git', [...instellingen, ...args], { cwd, stdio: 'inherit', env: schoneEnv() });
}

/**
 * Een script uit package.json, zonder pnpm: pnpm wil in de kopie (node_modules als link) eerst installeren.
 * @param {string} root
 * @param {string} naam
 * @returns {Promise<void>}
 */
export async function script(root, naam) {
  /** @type {{ scripts: Record<string, string> }} */
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const regel = pkg.scripts[naam];
  if (regel === undefined) throw new Error(`package.json: geen script ${naam}`);
  const bin = path.join(root, 'node_modules/.bin');
  const env = { ...schoneEnv(), PATH: `${bin}${path.delimiter}${process.env['PATH'] ?? ''}` };
  for (const stap of regel.split(' && ')) {
    if (stap.startsWith('pnpm ')) await script(root, stap.slice('pnpm '.length));
    else if ((await startMetEnv(root, ['sh', '-c', stap], env)) !== 0) throw new Error(`${naam}: "${stap}" faalde`);
  }
}

/**
 * @param {string} bron
 * @param {string} prefix
 * @returns {string} de map van de kopie, direct onder os.tmpdir()
 */
export function kopie(bron, prefix) {
  const doel = mkdtempSync(path.join(tmpdir(), prefix));
  try {
    vul(bron, doel);
  } catch (error) {
    // Een mislukte kopie laat geen map achter (de aanroeper kent het pad dan nog niet).
    ruimOp(doel, prefix);
    throw error;
  }
  return doel;
}

/**
 * Basis krijgt de HEAD van de bron als ouder, zodat een test die de templatestand in de geschiedenis zoekt
 * (`test/scripts/app-init-template.test.ts` in een app) die ook in de kopie vindt (leerpunt #363). De objecten komen via
 * alternates uit de bron, alleen-lezend; een ondiepe bron geeft zijn shallow-grens mee.
 * @param {string} bron
 * @param {string} doel
 */
function koppelGeschiedenis(bron, doel) {
  const lees = (/** @type {string[]} */ args) =>
    execFileSync('git', args, { cwd: bron, encoding: 'utf8', env: schoneEnv() }).trim();
  const gemeenschappelijk = path.resolve(bron, lees(['rev-parse', '--git-common-dir']));
  mkdirSync(path.join(doel, '.git/objects/info'), { recursive: true });
  writeFileSync(path.join(doel, '.git/objects/info/alternates'), `${path.join(gemeenschappelijk, 'objects')}\n`);
  const shallow = path.join(gemeenschappelijk, 'shallow');
  if (existsSync(shallow)) cpSync(shallow, path.join(doel, '.git/shallow'));
  git(doel, ['update-ref', 'refs/heads/main', lees(['rev-parse', 'HEAD'])]);
}

/**
 * @param {string} bron
 * @param {string} doel
 */
function vul(bron, doel) {
  const bestanden = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: bron,
    encoding: 'utf8',
    env: schoneEnv(),
  })
    .split('\0')
    // node_modules komt als link; in een worktree is het zelf een link en meldt git hem als ongetrackt bestand.
    .filter((pad) => pad !== '' && pad !== 'node_modules');
  for (const pad of bestanden) {
    // Een verwijderd maar nog niet gecommit bestand staat wel in de index, niet op schijf: overslaan.
    if (!existsSync(path.join(bron, pad))) continue;
    mkdirSync(path.dirname(path.join(doel, pad)), { recursive: true });
    cpSync(path.join(bron, pad), path.join(doel, pad), { force: true, errorOnExist: false });
  }
  symlinkSync(path.join(bron, 'node_modules'), path.join(doel, 'node_modules'), 'dir');
  // check:migrations vergelijkt met origin/main: de kopie zonder de gegenereerde bestanden is die basis.
  git(doel, ['init', '-q', '-b', 'main']);
  koppelGeschiedenis(bron, doel);
  git(doel, ['add', '-A']);
  // Leeg als de bron schoon is: basis is dan inhoudelijk gelijk aan de HEAD van de bron.
  git(doel, ['commit', '-q', '--allow-empty', '-m', 'basis']);
  git(doel, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
}

/** @param {string} pad */
function echt(pad) {
  try {
    return realpathSync(pad);
  } catch {
    return path.resolve(pad);
  }
}

/**
 * Verwijdert alleen een map direct onder os.tmpdir() met het eigen prefix; anders weigeren. rmSync volgt de
 * node_modules-link niet, dus de bron blijft heel.
 * @param {string} pad
 * @param {string} prefix
 * @returns {boolean} true = verwijderd
 */
export function ruimOp(pad, prefix) {
  const absoluut = path.resolve(pad);
  const eigen = echt(path.dirname(absoluut)) === echt(tmpdir()) && path.basename(absoluut).startsWith(prefix);
  if (!eigen) {
    console.error(
      `✗ ${CHECKNAMEN.get(prefix) ?? 'check:app-init'}: weigert ${pad} te verwijderen: niet de eigen tijdelijke map`,
    );
    return false;
  }
  // Een net gestopt kind kan nog een bestand schrijven; een paar nieuwe pogingen vangen ENOTEMPTY af.
  rmSync(absoluut, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  return true;
}

/**
 * Ruimt de kopie op bij SIGINT/SIGTERM (exit 130/143) en stopt eerst de lopende kinderen. Installeer hem vóór `kopie()`
 * en meld de map met `zet()` zodra `kopie()` terugkeert: een signaal tijdens het synchrone kopiëren wordt pas daarna
 * afgehandeld, dus dan is de map bekend. `ontkoppel()` haalt de handlers weer weg.
 * @param {string} prefix
 * @param {boolean} bewaar
 * @returns {{ zet: (doel: string) => void, ontkoppel: () => void }}
 */
export function bijSignaal(prefix, bewaar) {
  /** @type {string | undefined} */
  let doel;
  /** @type {ReadonlyArray<readonly [NodeJS.Signals, number]>} */
  const signalen = [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ];
  const handlers = signalen.map(([signaal, code]) => {
    const handler = () => {
      stopKinderen();
      if (doel !== undefined && !bewaar) ruimOp(doel, prefix);
      process.exit(code);
    };
    process.once(signaal, handler);
    return { signaal, handler };
  });
  return {
    zet(pad) {
      doel = pad;
    },
    ontkoppel() {
      for (const { signaal, handler } of handlers) process.off(signaal, handler);
    },
  };
}
