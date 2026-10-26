// PreToolUse-hook "rolhek" (framework §8, ADR 0045), voor Edit/Write/MultiEdit/NotebookEdit/Bash en mcp__* van elke rol.
// deny → exit 2 met de reden op stderr (Claude ziet hem); ask → de eigenaar kiest; anders door, eventueel met context.
// Faalt dicht: een interne fout is exit 2 (een hook die crasht mag niets doorlaten). Wat tekstheuristiek niet vangt,
// vangt de diff-guard in CI.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { decide, loadConfig } from './lib/rolhek.mjs';
import { payloadCwd, projectRoot } from './lib/root.mjs';
import { gitText, readAuthority, repositoryName, trustedBase } from './lib/authority-context.mjs';
import { anker } from './lib/objecten.mjs';
import { trustedRunner } from './lib/runner-authority.mjs';

/**
 * @param {string} root
 * @param {string[]} args
 */
function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
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
 * @param {import('./lib/task-authority.mjs').Authority | null} authority
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
 * @param {import('./lib/rolhek.mjs').Config} config
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
function context(root, cwd) {
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

function main() {
  /** @type {unknown} */
  const payload = JSON.parse(readFileSync(0, 'utf8'));
  const cwd = payloadCwd(payload);
  // Niet CLAUDE_PROJECT_DIR maar de git-root van cwd: zie lib/root.mjs.
  const root = projectRoot(cwd);
  const decision = decide(payload, context(root, cwd));
  if (decision.deny.length > 0) {
    process.stderr.write(`rolhek: ${decision.deny.join('\nrolhek: ')}\n`);
    process.exit(2);
  }
  const output = {
    hookEventName: 'PreToolUse',
    ...(decision.ask.length > 0
      ? {
          permissionDecision: 'ask',
          permissionDecisionReason: decision.ask.join('; '),
        }
      : decision.allow === true ? { permissionDecision: 'allow' } : {}),
    ...(decision.context.length > 0 ? { additionalContext: decision.context.join('\n') } : {}),
  };
  if (Object.keys(output).length > 1) process.stdout.write(JSON.stringify({ hookSpecificOutput: output }));
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `rolhek: interne fout, daarom geweigerd: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(2);
}
