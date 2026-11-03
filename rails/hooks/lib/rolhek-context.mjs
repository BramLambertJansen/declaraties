// Context van het rolhek (ADR 0045): configuratie uit het anker, vertrouwde basis, lezen uit de werkmap. Gedeeld door de
// PreToolUse-hook en de toets op effect (ADR 0066).
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from './rolhek.mjs';
import { gitText, readAuthority, repositoryName, trustedBase } from './authority-context.mjs';
import { anker } from './objecten.mjs';
import { trustedRunner } from './runner-authority.mjs';

/**
 * @param {string} root
 * @param {string[]} args
 */
function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    // `ls-files` over een grote app-repo past niet in de standaard 1 MiB.
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

/** @param {() => boolean} probe */
function safe(probe) {
  try {
    return probe();
  } catch {
    return false;
  }
}

/**
 * De configuratie en of die uit het anker komt. Binnen een hook (anker gezet) alleen uit het anker, gecontroleerd gelezen, anders een
 * fout (het rolhek faalt dan dicht); daarbuiten de vertrouwde basis van readAuthority, met terugval op de werkmap.
 * @param {string} root
 * @param {{ read: (file: string) => string | null } | null} basis
 * @param {import('./task-authority.mjs').Authority | null} authority
 */
function configuratie(root, basis, authority) {
  if (anker() !== null) {
    const text = basis?.read('.claude/gates.json') ?? null;
    if (text === null) throw new Error('geen gecontroleerde .claude/gates.json in het anker (ADR 0045)');
    return { config: loadConfig(text), vertrouwd: true };
  }
  const trusted = authority?.trusted('.claude/gates.json') ?? null;
  return trusted === null
    ? { config: loadConfig(readFileSync(path.join(root, '.claude/gates.json'), 'utf8')), vertrouwd: false }
    : { config: loadConfig(trusted), vertrouwd: true };
}

/**
 * Onderhoudsmodus (ADR 0045 punt 8): alleen uit de configuratie van het anker en alleen als origin die repository is.
 * @param {import('./rolhek.mjs').Config} config
 * @param {boolean} vertrouwd
 * @param {string} root
 */
function onderhoudActief(config, vertrouwd, root) {
  const doel = config.onderhoud?.repository;
  const origin = repositoryName(gitText(root, ['config', '--get', 'remote.origin.url'])?.trim() ?? '');
  return vertrouwd && doel !== undefined && origin !== null && origin.toLowerCase() === doel.toLowerCase();
}

/**
 * @param {string} root
 * @param {string} cwd
 */
export function rolhekContext(root, cwd) {
  /** @type {boolean | undefined} */
  let trusted;
  const authority = readAuthority({ root });
  const basis = trustedBase(root, undefined);
  const { config, vertrouwd } = configuratie(root, basis, authority);
  return {
    root,
    cwd,
    config,
    onderhoud: onderhoudActief(config, vertrouwd, root),
    read: (/** @type {string} */ rel) => {
      try {
        return readFileSync(path.join(root, rel), 'utf8');
      } catch {
        return null;
      }
    },
    committed: committedIn(root, basis?.sha ?? null),
    isDir: (/** @type {string} */ rel) => safe(() => statSync(path.join(root, rel)).isDirectory()),
    // Een map als doel (rm -r, find -delete, cp -r): wat eronder staat, getrackt of nieuw en niet genegeerd (R-ROL-08).
    files: (/** @type {string} */ rel) =>
      git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', rel === '' ? '.' : rel])
        .split('\0')
        .filter((file) => file !== ''),
    branch: gitBranch(root),
    authority,
    runnerTrusted: () => (trusted ??= trustedRunner(root, basis)),
  };
}

/**
 * Een migratie is gecommit als hij in de merge-base met het anker of met origin/main staat (de strengste van beide), zoals
 * check:migrations kijkt (WS-04 punt 5). Zijn beide onleesbaar, dan terugval op HEAD en 'zonder-origin' ("git fetch origin").
 * @param {string} root
 * @param {string | null} basis
 * @returns {(rel: string) => boolean | 'zonder-origin'}
 */
function committedIn(root, basis) {
  /** @type {string[] | undefined} */
  let bases;
  const exists = (/** @type {string} */ tree, /** @type {string} */ rel) =>
    safe(() => git(root, ['cat-file', '-e', `${tree}:${rel}`]) === '');
  return (rel) => {
    bases ??= [basis, 'origin/main'].flatMap((ref) => {
      const sha = ref === null ? null : mergeBase(root, ref);
      return sha === null ? [] : [sha];
    });
    if (bases.length > 0) return bases.some((tree) => exists(tree, rel));
    return exists('HEAD', rel) ? 'zonder-origin' : false;
  };
}

/** @param {string} root @param {string} basis */
function mergeBase(root, basis) {
  try {
    return git(root, ['merge-base', basis, 'HEAD']) || null;
  } catch {
    return null;
  }
}

/** @param {string} root */
function gitBranch(root) {
  try {
    return git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch {
    return '';
  }
}

