// Pre-push (lefthook.yml, spec document-status-lokaal): draait dezelfde check-document-status als de verplichte CI-check,
// zodat een spec die niet vóór de eerste code staat (ADR 0062 punt 3) blijkt zolang de commits nog lokaal te herschikken
// zijn. Een spiegel, geen grens: ontbrekende invoer of een kindproces dat niet eindigt valt open; CI blijft dicht.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { repositoryName } from '../../rails/hooks/lib/authority-context.mjs';
import { documentInfo } from '../../rails/hooks/lib/document-state.mjs';

/** @typedef {(args: readonly string[]) => { code: number, output: string }} Git */
/** @typedef {{ base: string, head: string, ref: string, repo: string }} Invoer */

export const VOLGORDE = '(volgorde, ADR 0062 punt 3)';
const KOP = 'pre-push: document-status';
const MAIN = 'refs/remotes/origin/main';
const SHA = /^[0-9a-f]{40}$/;

/** @param {string} reden */
const open = (reden) => ({ melding: `${KOP}: niet gecontroleerd, ${reden}; CI toetst het wel` });

/**
 * De invoer voor de check, of een melding waarom die ontbreekt (AC-6; elke tak valt open).
 * @param {Git} git
 * @returns {Invoer | { melding: string }}
 */
export function lokaleInvoer(git) {
  const main = git(['rev-parse', '--verify', '--quiet', MAIN]);
  const base = main.output.trim();
  if (main.code !== 0 || !SHA.test(base)) return open('geen origin/main');
  const kop = git(['rev-parse', '--verify', '--quiet', 'HEAD']);
  const head = kop.output.trim();
  if (kop.code !== 0 || !SHA.test(head)) return open('geen HEAD');
  const tak = git(['branch', '--show-current']);
  const ref = tak.output.trim();
  if (tak.code !== 0 || ref === '') return open('geen huidige branch (detached HEAD)');
  const remote = git(['config', '--get', 'remote.origin.url']);
  const repo = remote.code === 0 ? repositoryName(remote.output.trim()) : null;
  if (repo === null) return open('geen GitHub-repository in remote.origin.url');
  if (git(['merge-base', '--is-ancestor', 'HEAD', MAIN]).code === 0)
    return open('niets te pushen tegenover origin/main');
  return { base, head, ref, repo };
}

/**
 * Het nummer van precies één open PR uit `gh api …/pulls?head=…` (AC-3), anders null.
 * @param {string | null} uitvoer
 * @returns {number | null}
 */
export function prUitGh(uitvoer) {
  if (uitvoer === null) return null;
  /** @type {unknown} */
  let lijst;
  try {
    lijst = JSON.parse(uitvoer);
  } catch {
    return null;
  }
  if (!Array.isArray(lijst) || lijst.length !== 1) return null;
  /** @type {unknown} */
  const pr = lijst[0];
  if (typeof pr !== 'object' || pr === null || !('number' in pr)) return null;
  const { number } = pr;
  return typeof number === 'number' && Number.isSafeInteger(number) && number >= 1 ? number : null;
}

const HERSTEL =
  'herstel: nog niet gepusht, maak de commits opnieuw met de spec eerst (`git reset --soft $(git merge-base origin/main HEAD)`, ' +
  'commit de spec apart, dan de rest); al gepusht, maak een nieuwe branch vanaf origin/main (geen rebase of force-push, R-WERK-12)';

/**
 * Alleen de volgorde blokkeert (AC-4, AC-5, OV-1); de rest is een waarschuwing, ook een kindproces dat niet afliep (AC-7).
 * @param {{ status: number | null, uitvoer: string }} uitslag
 * @returns {{ exit: 0 | 1, melding: string | null }}
 */
export function oordeel({ status, uitvoer }) {
  const tekst = uitvoer.trim();
  if (status === null)
    return {
      exit: 0,
      melding: `${KOP}: waarschuwing, de check liep niet af (${tekst || 'geen uitvoer'}); CI toetst het wel`,
    };
  if (status === 0) return { exit: 0, melding: null };
  if (tekst.includes(VOLGORDE))
    return { exit: 1, melding: `${KOP}: blokkade, CI keurt dit zo af:\n${tekst}\n${HERSTEL}` };
  return {
    exit: 0,
    melding:
      `${KOP}: waarschuwing, CI keurt dit mogelijk af (lokaal draait de check uit de werkmap, CI uit main):\n${tekst}\n` +
      'loopt de branch achter, haal main dan eerst binnen met `git merge origin/main`',
  };
}

/**
 * Pusht git (pre-push-stdin) de huidige branch op HEAD? Verwijderingen, tags en andere refs niet (AC-2).
 * @param {string} stdin @param {{ ref: string, head: string }} huidig
 */
export function gepushteRef(stdin, { ref, head }) {
  return stdin.split('\n').some((regel) => {
    const [lokaal, sha, remote, oud, ...rest] = regel.trim().split(/\s+/);
    return (
      rest.length === 0 && remote !== undefined && oud !== undefined && lokaal === `refs/heads/${ref}` && sha === head
    );
  });
}

/** @param {Git} git @param {readonly string[]} args */
const regels = (git, args) => {
  const { code, output } = git(args);
  return code === 0 ? output.split('\n').filter(Boolean) : [];
};

/**
 * Wijzigt commit `c` de inhoud van de spec (zonder statusregel)? Een verwijdering telt niet.
 * @param {Git} git @param {string} c @param {string} spec
 */
function wijzigtInhoud(git, c, spec) {
  const na = git(['show', `${c}:${spec}`]);
  if (na.code !== 0) return false;
  const voor = git(['show', `${c}^:${spec}`]);
  if (voor.code !== 0) return true;
  const [a, b] = [documentInfo(spec, voor.output), documentInfo(spec, na.output)];
  return a === null || b === null || a.digest !== b.digest;
}

/**
 * Eigen volgordetoets los van de status (AC-6): specs waarvan de eerste inhoudswijziging niet vóór de eerste code staat.
 * @param {Git} git @param {{ base: string, head: string }} invoer
 * @returns {string[]}
 */
export function eigenVolgorde(git, { base, head }) {
  const split = git(['merge-base', base, head]).output.trim();
  if (!SHA.test(split)) return [];
  const bereik = `${split}..${head}`;
  const alle = regels(git, ['log', '--no-merges', '--topo-order', '--reverse', '--format=%H', bereik]);
  const eersteCode = regels(git, [
    'log',
    '--no-merges',
    '--reverse',
    '--format=%H',
    bereik,
    '--',
    '.',
    ':(exclude)docs/',
  ])[0];
  if (eersteCode === undefined || !alle.includes(eersteCode)) return [];
  const specs = regels(git, ['diff', '--name-only', '--no-renames', split, head, '--', 'docs/specs/']).filter((pad) =>
    /^docs\/specs\/[^/_][^/]*\.md$/.test(pad),
  );
  return specs
    .filter((spec) => {
      const commits = regels(git, ['log', '--no-merges', '--reverse', '--format=%H', bereik, '--', spec]);
      const eerste = commits.find((c) => wijzigtInhoud(git, c, spec));
      return eerste !== undefined && alle.indexOf(eerste) >= alle.indexOf(eersteCode);
    })
    .toSorted();
}

/**
 * @param {string} programma @param {readonly string[]} args
 * @param {{ env?: NodeJS.ProcessEnv, timeout?: number }} [opties]
 * @returns {{ status: number | null, stdout: string, stderr: string }} status null: niet gestart, signaal of timeout
 */
export function draai(programma, args, opties = {}) {
  const result = spawnSync(programma, args, {
    encoding: 'utf8',
    env: opties.env ?? process.env,
    timeout: opties.timeout,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.error === undefined ? result.status : null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** @type {Git} */
const git = (args) => {
  const { status, stdout } = draai('git', args);
  return { code: status ?? 1, output: stdout };
};

/** @param {Invoer} invoer */
function vraagPr({ repo, ref }) {
  const eigenaar = repo.split('/')[0] ?? '';
  const query = `head=${encodeURIComponent(`${eigenaar}:${ref}`)}&state=open`;
  const env = { ...process.env, GH_PROMPT_DISABLED: '1' };
  const { status, stdout } = draai('gh', ['api', `repos/${repo}/pulls?${query}`], { env, timeout: 10_000 });
  return prUitGh(status === 0 ? stdout : null);
}

/** @param {Invoer} invoer */
function draaiCheck(invoer) {
  const pr = vraagPr(invoer);
  const check = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-document-status.mjs');
  const env = {
    ...process.env,
    BASE_SHA: invoer.base,
    HEAD_SHA: invoer.head,
    HEAD_REF: invoer.ref,
    REPO: invoer.repo,
    PR_NUMBER: pr === null ? '' : String(pr),
    GITHUB_STEP_SUMMARY: '',
  };
  const { status, stdout, stderr } = draai(process.execPath, [check], { env, timeout: 60_000 });
  return oordeel({ status, uitvoer: stderr.trim() || stdout });
}

/** @param {boolean} prePush */
function main(prePush) {
  const invoer = lokaleInvoer(git);
  if ('melding' in invoer) {
    console.warn(invoer.melding);
    return 0;
  }
  if (prePush && !gepushteRef(readFileSync(0, 'utf8'), invoer)) {
    console.warn(`${KOP}: niet gecontroleerd, deze push gaat niet over de huidige branch op HEAD`);
    return 0;
  }
  const { exit, melding } = draaiCheck(invoer);
  if (melding !== null) console.error(melding);
  if (exit !== 0) return exit;
  const fout = eigenVolgorde(git, invoer);
  if (fout.length > 0)
    console.warn(
      `${KOP}: waarschuwing, ${fout.join(', ')}: de spec staat niet in een commit vóór de eerste code of test; ` +
        `CI keurt dat af zodra de spec goedgekeurd of gebouwd wordt ${VOLGORDE}\n${HERSTEL}`,
    );
  return 0;
}

/**
 * Een onverwachte fout valt open (AC-7): een valse blokkade is alleen met het verboden `--no-verify` te omzeilen.
 * @param {() => number} werk
 * @returns {number}
 */
export function vangOpen(werk) {
  try {
    return werk();
  } catch (error) {
    console.warn(
      `${KOP}: niet gecontroleerd, ${error instanceof Error ? error.message : String(error)}; CI toetst het wel`,
    );
    return 0;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exitCode = vangOpen(() => main(process.argv.includes('--pre-push')));
