// Pre-push (lefthook.yml): waarschuwt als de branch achterloopt op origin/main, zodat main binnenkomt vóór CI het merge-
// resultaat test. Nooit een blokkade (altijd exit 0) en nooit om credentials vragen; zonder origin/main geen melding.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** @typedef {(args: readonly string[], opties?: { timeout?: number, env?: Record<string, string> }) => { code: number, output: string }} Git */

/**
 * @param {number} achter
 * @returns {string | null}
 */
export function achterstandMelding(achter) {
  if (!Number.isFinite(achter) || achter <= 0) return null;
  return `pre-push: ${String(achter)} ${achter === 1 ? 'commit' : 'commits'} achter op origin/main; haal ze binnen met \`git merge origin/main\` (nooit rebase) en draai de checks opnieuw`;
}

/**
 * Haalt origin/main op (harde timeout, geen prompt) en telt wat de branch mist; een mislukte fetch valt terug op de laatste.
 * @param {Git} run
 * @returns {string | null}
 */
export function achterstand(run) {
  run(['fetch', '--quiet', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main'], {
    timeout: 10_000,
    env: { GIT_TERMINAL_PROMPT: '0' },
  });
  const telling = run(['rev-list', '--count', 'HEAD..origin/main']);
  return telling.code === 0 ? achterstandMelding(Number(telling.output.trim())) : null;
}

/** @type {Git} */
function git(args, opties = {}) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    env: { ...process.env, ...opties.env },
    timeout: opties.timeout,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { code: result.status ?? 1, output: result.stdout ?? '' };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const melding = achterstand(git);
    if (melding !== null) console.warn(`⚠ ${melding}`);
  } catch {
    // Alleen een waarschuwing: een fout hier hindert de push nooit.
  }
}
