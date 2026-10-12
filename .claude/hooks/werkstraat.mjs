// Entry voor de werkstraat-hooks (framework §8): `node .claude/hooks/werkstraat.mjs <post-edit|stop|subagent-stop|session-start>`.
// De beslissingen staan in lib/werkstraat.mjs (getest in test/hooks/werkstraat.test.ts); hier alleen stdin, commando's en uitvoer.
// Root: de git-root van `cwd` uit de payload (een worktree), terugval CLAUDE_PROJECT_DIR en dan process.cwd() (lib/root.mjs).
// Een fout in de hook: bij stop en subagent-stop blokkeert hij met de fout (Claude Code stopt zelf na 8 keer), bij de
// andere meldt hij hem alleen; die blokkeren nooit iets.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { payloadCwd, projectRoot } from './lib/root.mjs';
import { changedFromStatus, postEdit, sessionStart, stop, subagentStop } from './lib/werkstraat.mjs';

const event = process.argv[2] ?? '';

/** @param {string} root */
function makeDeps(root) {
  /**
   * @param {string} command
   * @param {readonly string[]} args
   */
  const run = (command, args) => {
    const result = spawnSync(command, args, {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 32 * 1024 * 1024,
    });
    return { code: result.status ?? 1, output: `${result.stdout}${result.stderr}` };
  };
  return {
    run,
    changed: () => changedFromStatus(run('git', ['status', '--porcelain', '--untracked-files=all']).output),
    read: (/** @type {string} */ rel) => {
      try {
        return readFileSync(path.join(root, rel), 'utf8');
      } catch {
        return null;
      }
    },
  };
}

/** Lege stdin (session-start kan zonder payload komen) telt als `{}`; kapotte JSON is een fout. */
function readPayload() {
  const text = readFileSync(0, 'utf8');
  /** @type {unknown} */
  const payload = text.trim() === '' ? {} : JSON.parse(text);
  return payload;
}

/** @param {unknown} payload */
function handle(payload) {
  const root = projectRoot(payloadCwd(payload), process.cwd());
  const deps = makeDeps(root);
  switch (event) {
    case 'post-edit':
      return postEdit(payload, { root, deps });
    case 'stop':
      return stop(payload, deps);
    case 'subagent-stop':
      return subagentStop(payload, deps);
    case 'session-start':
      return sessionStart(deps);
    default:
      throw new Error(`onbekende hook "${event}"`);
  }
}

try {
  const result = handle(readPayload());
  if (result.stdout !== undefined) process.stdout.write(result.stdout);
  if (result.stderr !== undefined) process.stderr.write(`${result.stderr}\n`);
  process.exit(result.exit ?? 0);
} catch (error) {
  const message = `werkstraat-hook ${event}: ${error instanceof Error ? error.message : String(error)}`;
  if (event === 'stop' || event === 'subagent-stop') {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: `${message} (meld dit; de hook zelf faalt)` }));
    process.exit(0);
  }
  process.stderr.write(`${message}\n`);
  process.exit(event === 'post-edit' ? 2 : 0);
}
