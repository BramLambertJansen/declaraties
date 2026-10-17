// De werkstraat-hooks uit framework §8 (ADR 0011), behalve het rolhek: na elke bewerking, bij stoppen, "groen vóór klaar"
// voor de developer, de stopcontrole van tester en reviewer, en de feiten bij de start van een sessie. Puur: elk commando
// gaat via `deps.run`, zodat test/hooks/werkstraat.test.ts elke beslissing zonder echte pnpm of git bewijst.
// Nooit database. Netwerk alleen voor de fetch van session-start (harde timeout, nooit om credentials vragen); de rest is
// lint, typecheck, unit (gate:fast) en git.

/**
 * @typedef {{ code: number, output: string }} RunResult
 * @typedef {{ timeout?: number, env?: Record<string, string> }} RunOptions
 * @typedef {{ run: (command: string, args: readonly string[], options?: RunOptions) => RunResult, changed: () => string[],
 *   read: (rel: string) => string | null }} Deps
 * @typedef {{ exit?: number, stdout?: string, stderr?: string }} HookResult
 */

const MAX_LINES = 40;
const LINTABLE = /\.(?:ts|tsx|mjs|js)$/;
const FORMATTABLE = /\.(?:ts|tsx|mjs|js|json|md|css|ya?ml)$/;
export const REVIEW_HEADING = '## Bevindingen';

/**
 * De laatste regels van een uitvoer (framework §8: ≤ 40 regels terug naar het model).
 * @param {string} text
 * @param {number} [count]
 */
export function lastLines(text, count = MAX_LINES) {
  return text.trimEnd().split('\n').slice(-count).join('\n');
}

/**
 * Gewijzigde en nieuwe bestanden uit `git status --porcelain` (verwijderde niet).
 * @param {string} porcelain
 */
export function changedFromStatus(porcelain) {
  return porcelain
    .split('\n')
    .filter((line) => line.length > 3 && !line.startsWith(' D') && !line.startsWith('D '))
    .map((line) => line.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, ''));
}

/**
 * @param {unknown} payload
 * @param {string} key
 * @returns {unknown}
 */
function get(payload, key) {
  if (typeof payload !== 'object' || payload === null) return undefined;
  return Object.entries(payload).find(([name]) => name === key)?.[1];
}

/** @param {string} reason */
function block(reason) {
  return { stdout: JSON.stringify({ decision: 'block', reason }) };
}

/**
 * PostToolUse (Edit/Write): Prettier schrijft het bestand netjes, ESLint meldt wat overblijft (exit 2: Claude ziet het).
 * @param {unknown} payload
 * @param {{ root: string, deps: Deps }} env
 * @returns {HookResult}
 */
export function postEdit(payload, { root, deps }) {
  const file = get(get(payload, 'tool_input'), 'file_path');
  if (typeof file !== 'string' || !file.startsWith(`${root}/`) || !FORMATTABLE.test(file)) return {};
  const rel = file.slice(root.length + 1);
  if (rel.startsWith('node_modules/') || rel.startsWith('.runner-output/')) return {};
  deps.run('pnpm', ['exec', 'prettier', '--write', '--ignore-unknown', '--log-level', 'warn', rel]);
  if (!LINTABLE.test(rel)) return {};
  const lint = deps.run('pnpm', ['exec', 'eslint', '--max-warnings', '0', '--no-warn-ignored', rel]);
  return lint.code === 0 ? {} : { exit: 2, stderr: `ESLint in ${rel}:\n${lastLines(lint.output)}` };
}

/**
 * Stop: typecheck, lint en de bijbehorende unit-tests op de geraakte bestanden. Stopt direct bij stop_hook_active (geen
 * lus), in plan mode of zonder gewijzigde code.
 * @param {unknown} payload
 * @param {Deps} deps
 * @returns {HookResult}
 */
export function stop(payload, deps) {
  if (get(payload, 'stop_hook_active') === true || get(payload, 'permission_mode') === 'plan') return {};
  const code = deps.changed().filter((file) => LINTABLE.test(file) && !file.startsWith('.runner-output/'));
  if (code.length === 0) return {};
  const failures = [
    ['typecheck', deps.run('pnpm', ['exec', 'tsc', '-b'])],
    ['lint', deps.run('pnpm', ['exec', 'eslint', '--max-warnings', '0', '--no-warn-ignored', ...code])],
    ['unit', deps.run('pnpm', ['exec', 'vitest', 'related', '--run', '--project', 'unit', '--project', 'web', ...code])],
  ].filter(([, result]) => typeof result === 'object' && result.code !== 0);
  if (failures.length === 0) return {};
  const report = failures.map(([name, result]) => `✗ ${String(name)}\n${typeof result === 'object' ? result.output : ''}`);
  return block(`Nog niet groen (framework §8, Stop-hook):\n${lastLines(report.join('\n'))}`);
}

/**
 * SubagentStop per rol: developer → gate:fast groen ("groen vóór klaar", ook bij een schone werkmap); tester → lint en
 * typecheck groen, nieuwe tests falen alleen op asserties; reviewer → rapport met de kop "## Bevindingen".
 * @param {unknown} payload
 * @param {Deps} deps
 * @returns {HookResult}
 */
export function subagentStop(payload, deps) {
  const role = get(payload, 'agent_type');
  if (role === 'developer') return developerStop(deps);
  if (role === 'tester') return testerStop(deps);
  if (role === 'reviewer') return reviewerStop(payload);
  return {};
}

/** @param {Deps} deps */
function developerStop(deps) {
  const gate = deps.run('pnpm', ['gate:fast']);
  return gate.code === 0 ? {} : block(`Groen vóór klaar: pnpm gate:fast faalt.\n${lastLines(gate.output)}`);
}

/** @param {Deps} deps */
function testerStop(deps) {
  const changed = deps.changed();
  const tests = changed.filter((file) => /\.test\.tsx?$/.test(file) && !file.endsWith('.int.test.ts'));
  const code = changed.filter((file) => LINTABLE.test(file));
  const typecheck = deps.run('pnpm', ['exec', 'tsc', '-b']);
  const lint = code.length === 0 ? { code: 0, output: '' } : deps.run('pnpm', ['exec', 'eslint', '--max-warnings', '0', '--no-warn-ignored', ...code]);
  if (typecheck.code !== 0 || lint.code !== 0)
    return block(`Tester: lint en typecheck moeten groen zijn.\n${lastLines(`${typecheck.output}\n${lint.output}`)}`);
  if (tests.length === 0) return {};
  const run = deps.run('pnpm', ['exec', 'vitest', 'run', '--reporter=json', ...tests]);
  const wrong = nonAssertionFailures(run.output);
  return wrong.length === 0 ? {} : block(`Tester: een nieuwe test faalt niet op een assertie (compileert hij, bestaat de import?):\n${lastLines(wrong.join('\n'))}`);
}

/**
 * Mislukte tests uit de JSON-reporter van Vitest die niet op een assertie falen (bijv. een import die niet bestaat).
 * @param {string} output
 * @returns {string[]}
 */
export function nonAssertionFailures(output) {
  const start = output.indexOf('{');
  if (start === -1) return ['geen uitvoer van vitest'];
  /** @type {unknown} */
  let report;
  try {
    report = JSON.parse(output.slice(start));
  } catch {
    return ['onleesbare uitvoer van vitest'];
  }
  const files = get(report, 'testResults');
  if (!Array.isArray(files)) return ['onleesbare uitvoer van vitest'];
  return files.flatMap((file) => fileFailures(file));
}

/** @param {unknown} file */
function fileFailures(file) {
  const name = String(get(file, 'name') ?? '?');
  const tests = get(file, 'assertionResults');
  // Een bestand zonder testresultaten maar met een foutmelding is niet geladen (syntax, import).
  if (!Array.isArray(tests) || tests.length === 0) {
    const message = get(file, 'message');
    return typeof message === 'string' && message !== '' ? [`${name}: ${message.split('\n')[0] ?? ''}`] : [];
  }
  return tests
    .filter((test) => get(test, 'status') === 'failed')
    .flatMap((test) => {
      const messages = get(test, 'failureMessages');
      const first = Array.isArray(messages) ? String(messages[0] ?? '') : '';
      return /AssertionError|expected/i.test(first) ? [] : [`${name} › ${String(get(test, 'title') ?? '?')}: ${first.split('\n')[0] ?? ''}`];
    });
}

/** @param {unknown} payload */
function reviewerStop(payload) {
  const message = get(payload, 'last_assistant_message');
  if (typeof message === 'string' && message.includes(REVIEW_HEADING)) return {};
  return block(`Reviewer: sluit af met het rapport onder de kop "${REVIEW_HEADING}" (per bevinding bestand:regel en het pad van invoer naar fout, of "Geen blokkerende bevindingen").`);
}

/**
 * Haalt origin/main op en meldt een achterstand van de branch. Fail-open: een harde procestimeout, nooit om credentials
 * vragen (HTTPS-prompt; de timeout begrenst een SSH-passphrase, zonder het SSH-commando van de gebruiker te overschrijven), en zonder bekende origin/main (een app zonder remote) geen melding.
 * @param {Deps} deps
 * @returns {string}
 */
function mainLag(deps) {
  const fetched = deps.run('git', ['fetch', '--quiet', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main'], {
    timeout: 5000,
    env: { GIT_TERMINAL_PROMPT: '0' },
  });
  const counts = deps.run('git', ['rev-list', '--left-right', '--count', 'origin/main...HEAD']);
  if (counts.code !== 0) return '';
  const behind = Number(counts.output.trim().split(/\s+/)[0]);
  const stale = fetched.code === 0 ? '' : 'origin/main ophalen mislukt (stand van de laatste fetch). ';
  if (!Number.isFinite(behind) || behind === 0) return stale.trim();
  return `${stale}Let op: ${behind} commits achter op origin/main; haal ze binnen voor je bouwt (git merge origin/main, nooit rebase).`;
}

/**
 * SessionStart: de feiten als context (framework §8): branch, open wijzigingen, specs, laatste checkuitslag en de lokale stack.
 * @param {Deps} deps
 * @returns {HookResult}
 */
export function sessionStart(deps) {
  const branch = deps.run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).output.trim();
  const changed = deps.changed();
  const specs = deps.run('node', ['scripts/kit/feiten.mjs', 'specs']).output.trim();
  const lastRun = deps.read('.runner-output/test-results/.last-run.json');
  const status = lastRun === null ? 'geen e2e-uitslag' : `laatste e2e: ${/"status":\s*"(\w+)"/.exec(lastRun)?.[1] ?? 'onbekend'}`;
  const doctor = deps.run('scripts/doctor.sh', ['--quick']).output.trim();
  return {
    stdout: [
      `Branch: ${branch}${branch === 'main' ? ' (maak een branch voor je wijzigt)' : ''}`,
      mainLag(deps),
      `Gewijzigde bestanden: ${changed.length === 0 ? 'geen' : changed.slice(0, 20).join(', ')}`,
      specs,
      status,
      doctor,
      'Begin met de feiten: node scripts/kit/feiten.mjs (framework §8).',
    ]
      .filter((line) => line !== '')
      .join('\n'),
  };
}
