// PreToolUse-hook "rolhek" (framework §8, ADR 0011), voor Edit/Write/MultiEdit/NotebookEdit/Bash en mcp__* van elke rol.
// deny → exit 2 met de reden op stderr (Claude ziet hem); ask → de eigenaar kiest; anders door, eventueel met context.
// Faalt dicht: een interne fout is exit 2 (een hook die crasht mag niets doorlaten). Wat tekstheuristiek niet vangt,
// vangt de diff-guard in CI.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { decide, loadConfig } from './lib/rolhek.mjs';
import { payloadCwd, projectRoot } from './lib/root.mjs';

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
 * @param {string} root
 * @param {string} cwd
 */
function context(root, cwd) {
  return {
    root,
    cwd,
    config: loadConfig(readFileSync(path.join(root, '.claude/gates.json'), 'utf8')),
    read: (/** @type {string} */ rel) => {
      try {
        return readFileSync(path.join(root, rel), 'utf8');
      } catch {
        return null;
      }
    },
    committed: (/** @type {string} */ rel) => safe(() => git(root, ['cat-file', '-e', `HEAD:${rel}`]) === ''),
    isDir: (/** @type {string} */ rel) => safe(() => statSync(path.join(root, rel)).isDirectory()),
    branch: gitBranch(root),
  };
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
      : {}),
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
