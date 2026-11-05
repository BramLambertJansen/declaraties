// Momentopname van de werkmap voor de toets op effect (ADR 0066, spec rolhek-effect AC-1, AC-2, AC-7): welke paden
// afwijken van HEAD, met inhoud en mode, plus de index, de refs, de genegeerde lijst en een vaste lijst die het rolhek stuurt.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readlinkSync, statSync } from 'node:fs';
import path from 'node:path';

// Grens van AC-7: daarboven valt de toets dicht.
export const MAX_PADEN = 5000;
export const MAX_MS = 5000;
// Ook als git ze negeert (AC-1): bestanden die het rolhek zelf sturen. Onder de git-common-dir met voorvoegsel `.git/`.
const GIT_VAST = ['config', 'commondir', 'hooks', 'info'];
const WERKMAP_VAST = ['.claude/settings.local.json', '.claude/hooks/.cache'];
// Git zonder programma's uit de config (B1) en zonder GIT_*-omgeving.
const GIT_VEILIG = ['--no-replace-objects', '-c', 'core.fsmonitor=false', '-c', 'diff.external=', '-c', 'core.quotepath=false'];

/**
 * @typedef {{ wt: string, idx: string }} Entry `wt`: `<mode>:<blob>` of `weg`; `idx`: `<mode> <blob> <stage>` of ''.
 * @typedef {{ head: string, refs: Record<string, string>, paden: Record<string, Entry>, index: Record<string, string>,
 *   genegeerd: string[], teGroot: boolean }} Snapshot
 * @typedef {(args: readonly string[], input?: string) => string} Git
 */

/** @param {string} root @returns {Git} */
export function gitIn(root) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  return (args, input) => {
    const result = spawnSync('git', [...GIT_VEILIG, ...args], {
      cwd: root,
      encoding: 'utf8',
      env,
      input,
      maxBuffer: 256 * 1024 * 1024,
      // Een FIFO of een hangend proces breekt de toets binnen de grens van AC-7 af (dicht, via de catch-all).
      timeout: MAX_MS,
    });
    if (result.status !== 0) throw new Error(`git ${args[0] ?? ''}: ${result.stderr.trim()}`);
    return result.stdout;
  };
}

/**
 * De ruwe bytes van een blob (zonder utf8-decodering), voor de controle van de hash.
 * @param {string} root @param {string} blob
 */
export function blobBytes(root, blob) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const result = spawnSync('git', [...GIT_VEILIG, 'cat-file', 'blob', blob], { cwd: root, env, maxBuffer: 256 * 1024 * 1024, timeout: MAX_MS });
  if (result.status !== 0) throw new Error(`git cat-file ${blob}: onleesbaar`);
  return result.stdout;
}

/** @param {string} text */
const nulDelen = (text) => text.split('\0').filter((part) => part !== '');

/**
 * Paden uit `git status --porcelain=v1 -z`; bij een hernoeming beide paden. `alleen`: alleen regels met dit voorvoegsel.
 * @param {string} text @param {string | null} alleen
 */
export function statusPaden(text, alleen) {
  const delen = nulDelen(text);
  /** @type {string[]} */
  const paden = [];
  for (let index = 0; index < delen.length; index += 1) {
    const regel = delen[index] ?? '';
    const code = regel.slice(0, 2);
    if (alleen === null || code === alleen) paden.push(regel.slice(3));
    if (code.includes('R') || code.includes('C')) {
      index += 1;
      if (alleen === null) paden.push(delen[index] ?? '');
    }
  }
  return paden;
}

/** De index per pad (`git ls-files --stage -z`) en de paden met een vlag `h` of `S` (`git ls-files -v -z`). @param {Git} git */
function indexVan(git) {
  /** @type {Record<string, string>} */
  const index = {};
  for (const regel of nulDelen(git(['ls-files', '--stage', '-z']))) {
    const tab = regel.indexOf('\t');
    const pad = regel.slice(tab + 1);
    index[pad] = index[pad] === undefined ? regel.slice(0, tab) : `${index[pad]}|${regel.slice(0, tab)}`;
  }
  const vlaggen = nulDelen(git(['ls-files', '-v', '-z']))
    .filter((regel) => /^[a-zS]/.test(regel))
    .map((regel) => regel.slice(2));
  return { index, vlaggen };
}

/** @param {string} dir @param {string} voor @returns {string[]} */
function bestandenOnder(dir, voor) {
  /** @type {import('node:fs').Stats} */
  let stat;
  try {
    stat = lstatSync(dir);
  } catch {
    return [];
  }
  if (!stat.isDirectory()) return [voor];
  return readdirSync(dir).flatMap((naam) => bestandenOnder(path.join(dir, naam), `${voor}/${naam}`));
}

/**
 * Inhoud en mode van een pad in de werkmap: `<mode>:<blob>`, een symlink zelf (lstat), een map als `map`, of `weg`. De
 * blob gaat met `git hash-object -w` de objectdatabase in, zodat de inhoud van vóór een commando leesbaar blijft (AC-1).
 * Alleen een gewoon bestand wordt gehasht; een FIFO, socket of apparaat telt als `<mode>:anders`. Met `alleenLezen` (pr:verify)
 * zonder `-w`.
 * @param {{ root: string, git: Git, gitDir: string, alleenLezen?: boolean }} repo @param {readonly string[]} paden
 * @returns {Record<string, string>}
 */
function werkmapStaat(repo, paden) {
  /** @type {Record<string, string>} */
  const staat = {};
  /** @type {string[]} */
  const gewoon = [];
  for (const pad of paden) {
    const vol = pad.startsWith('.git/') ? path.join(repo.gitDir, pad.slice(5)) : path.join(repo.root, pad);
    try {
      const stat = lstatSync(vol);
      const mode = (stat.mode & 0o777777).toString(8);
      if (stat.isSymbolicLink()) staat[pad] = `${mode}:link-${createHash('sha256').update(readlinkSync(vol)).digest('hex')}`;
      else if (stat.isDirectory()) staat[pad] = `${mode}:map`;
      else if (!stat.isFile()) staat[pad] = `${mode}:anders`;
      else {
        staat[pad] = mode;
        gewoon.push(vol);
      }
    } catch {
      staat[pad] = 'weg';
    }
  }
  const blobs = hashes(repo, gewoon);
  const volNaarPad = new Map(paden.map((pad) => [pad.startsWith('.git/') ? path.join(repo.gitDir, pad.slice(5)) : path.join(repo.root, pad), pad]));
  gewoon.forEach((vol, index) => {
    const pad = volNaarPad.get(vol) ?? '';
    staat[pad] = `${staat[pad] ?? ''}:${blobs[index] ?? ''}`;
  });
  return staat;
}

/**
 * Blob-id's van gewone bestanden: in één `--stdin-paths`, behalve een pad met een nieuwe regel (dat splitst stdin), dat apart.
 * @param {{ git: Git, alleenLezen?: boolean }} repo @param {readonly string[]} bestanden
 */
function hashes(repo, bestanden) {
  const schrijf = repo.alleenLezen === true ? [] : ['-w'];
  const gewoon = bestanden.filter((vol) => !vol.includes('\n'));
  const lijst = gewoon.length === 0 ? [] : repo.git(['hash-object', ...schrijf, '--stdin-paths'], `${gewoon.join('\n')}\n`).trim().split('\n');
  const perPad = new Map(gewoon.map((vol, index) => [vol, lijst[index] ?? '']));
  return bestanden.map((vol) => perPad.get(vol) ?? repo.git(['hash-object', ...schrijf, '--', vol]).trim());
}

/**
 * De map van de opslag en de vaste lijst. Is `.git` een map, dan die map zelf: `.git/commondir` mag de opslag niet verleggen
 * naar een plek die de sandbox wel mag schrijven. Alleen in een worktree (`.git` is een bestand) de git-common-dir; die ligt
 * buiten de werkmap.
 * @param {{ root: string, git: Git }} repo
 */
export function gitDirVan(repo) {
  const eigen = path.join(repo.root, '.git');
  try {
    if (statSync(eigen).isDirectory()) return eigen;
  } catch {
    // geen .git: dan git zelf
  }
  return path.resolve(repo.root, repo.git(['rev-parse', '--git-common-dir']).trim());
}

/**
 * De werkmapstaat van losse paden, zoals in een momentopname (zonder objecten te schrijven): voor de vensters van AC-2.
 * @param {{ root: string, git: Git }} repo @param {readonly string[]} paden
 */
export function padStaten(repo, paden) {
  if (paden.length === 0) return {};
  return werkmapStaat({ root: repo.root, git: repo.git, gitDir: gitDirVan(repo), alleenLezen: true }, paden);
}

/**
 * De momentopname van AC-1. `teGroot` als er meer dan MAX_PADEN paden zijn (AC-7); dan zonder inhoud.
 * @param {{ root: string, git: Git, alleenLezen?: boolean }} repo
 * @returns {Snapshot}
 */
export function momentopname(repo) {
  const { git, root } = repo;
  const gitDir = gitDirVan(repo);
  const head = git(['rev-parse', '--verify', '-q', 'HEAD']).trim();
  const refs = Object.fromEntries(git(['for-each-ref', '--format=%(objectname) %(refname)'])
    .split('\n')
    .filter((regel) => regel !== '')
    .map((regel) => [regel.slice(regel.indexOf(' ') + 1), regel.slice(0, regel.indexOf(' '))]));
  const { index, vlaggen } = indexVan(git);
  const afwijkend = statusPaden(git(['status', '--porcelain=v1', '-z', '--untracked-files=all']), null);
  const genegeerd = statusPaden(git(['status', '--porcelain=v1', '-z', '--ignored=traditional', '--untracked-files=normal']), '!!');
  const vast = [
    ...GIT_VAST.flatMap((naam) => bestandenOnder(path.join(gitDir, naam), `.git/${naam}`)),
    ...WERKMAP_VAST.flatMap((pad) => bestandenOnder(path.join(root, pad), pad)),
  ];
  const paden = [...new Set([...afwijkend, ...genegeerd.filter((pad) => !pad.endsWith('/')), ...vlaggen, ...vast])];
  if (paden.length > MAX_PADEN) return { head, refs, paden: {}, index, genegeerd, teGroot: true };
  const staat = werkmapStaat({ root, git, gitDir, alleenLezen: repo.alleenLezen === true }, paden);
  return {
    head,
    refs,
    paden: Object.fromEntries(paden.map((pad) => [pad, { wt: staat[pad] ?? 'weg', idx: index[pad] ?? '' }])),
    index,
    genegeerd,
    teGroot: false,
  };
}
