// De werkstraat-hooks uit framework §8 (ADR 0045/0057), behalve het rolhek: na elke bewerking, gerichte stopfeedback
// voor de bouwer, de stopcontrole van tester en reviewer, en de feiten bij de start van een sessie. Puur: elk commando
// gaat via `deps.run`, zodat test/hooks/werkstraat.test.ts elke beslissing zonder echte pnpm of git bewijst.
// Nooit database. Netwerk alleen voor de fetch van session-start (harde timeout, nooit om credentials vragen); de rest is
// lint, typecheck, gerelateerde unit-tests en git. De volledige gate:fast blijft in pre-push en CI.

/**
 * @typedef {{ code: number, output: string }} RunResult
 * @typedef {{ timeout?: number, env?: Record<string, string> }} RunOptions
 * @typedef {{ run: (command: string, args: readonly string[], options?: RunOptions) => RunResult, changed: () => string[],
 *   read: (rel: string) => string | null, onthoud?: (sleutel: string) => boolean }} Deps
 * `onthoud`: true als de sleutel nieuw is (en legt hem vast), false als hij er al was; zonder `onthoud` telt alles als nieuw.
 * @typedef {{ exit?: number, stdout?: string, stderr?: string }} HookResult
 */

const MAX_LINES = 40;
const LINTABLE = /\.(?:ts|tsx|mjs|js)$/;
const FORMATTABLE = /\.(?:ts|tsx|mjs|js|json|md|css|ya?ml)$/;
export const REVIEW_HEADING = '## Bevindingen';
const MIGRATIE = /^db\/migrations\/[^/]+\.sql$/;
const MIGRATIE_HINT =
  'migratie gewijzigd: draai `pnpm db:generate`, zodat db/schema.snapshot.sql en src/api/db/schema.ts meegaan ' +
  '(check:snapshot in gate:slow controleert dat). Nieuwe tabel: RLS aan en geforceerd, grants en een pgTAP-test per policy (AGENTS.md).';
// Dezelfde regel als driftWaarschuwing in scripts/kit/check-docs-drift.mjs; de hooks draaien van main en laden alleen rails/hooks.
const DRIFT_GEGENEREERD = new Set(['src/web/routeTree.gen.ts', 'src/api/db/schema.ts']);
const DRIFT_TEST = /\.(test|spec)\.[cm]?[jt]sx?$/;

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
 * De bestanden waar de Stop-feedback over gaat: de werkmap plus wat de branch sinds origin/main heeft gecommit, zodat
 * gecommitte code met een schone werkmap toch gecontroleerd wordt. Zonder origin/main (merge-base faalt) alleen de werkmap.
 * Verwijderde bestanden (`exists` onwaar) vallen weg.
 * @param {Deps['run']} run
 * @param {(rel: string) => boolean} exists
 * @returns {string[]}
 */
export function changedFiles(run, exists) {
  // Geen geciteerde paden: quotePath uit voor status (niet-ASCII letterlijk), -z voor diff (ook spaties en aanhalingstekens).
  const status = run('git', ['-c', 'core.quotePath=false', 'status', '--porcelain', '--untracked-files=all']);
  const local = changedFromStatus(status.output);
  const base = run('git', ['merge-base', 'origin/main', 'HEAD']);
  if (base.code !== 0) return local;
  const diff = run('git', ['diff', '-z', '--name-only', '--diff-filter=d', `${base.output.trim()}...HEAD`]);
  const committed = diff.code === 0 ? diff.output.split('\0').filter((line) => line !== '') : [];
  return [...new Set([...local, ...committed])].filter((file) => exists(file));
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

/** Gewone context voor Claude (exit 0): `additionalContext` van een hook. @param {string} event @param {string} tekst */
function context(event, tekst) {
  return { stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: tekst } }) };
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
  if (typeof file !== 'string' || !file.startsWith(`${root}/`)) return {};
  const rel = file.slice(root.length + 1);
  if (MIGRATIE.test(rel)) return context('PostToolUse', `${rel}: ${MIGRATIE_HINT}`);
  if (!FORMATTABLE.test(file)) return {};
  if (rel.startsWith('node_modules/') || rel.startsWith('.runner-output/')) return {};
  deps.run('pnpm', ['exec', 'prettier', '--write', '--ignore-unknown', '--log-level', 'warn', rel]);
  if (!LINTABLE.test(rel)) return {};
  const lint = deps.run('pnpm', ['exec', 'eslint', '--max-warnings', '0', '--no-warn-ignored', rel]);
  return lint.code === 0 ? {} : { exit: 2, stderr: `ESLint in ${rel}:\n${lastLines(lint.output)}` };
}

/**
 * Stop: typecheck, lint en de bijbehorende unit-tests op de geraakte bestanden, plus één herinnering bij docs-drift. Stopt
 * direct bij stop_hook_active (geen lus), in plan mode of zonder gewijzigde code.
 * @param {unknown} payload
 * @param {Deps} deps
 * @returns {HookResult}
 */
export function stop(payload, deps) {
  return feedback(payload, deps, true);
}

/**
 * De gerichte feedback van Stop en developer-SubagentStop; alleen de hoofdsessie krijgt de docs-drift-herinnering (zij levert
 * de PR op), een developer-overdracht niet.
 * @param {unknown} payload
 * @param {Deps} deps
 * @param {boolean} herinneren
 * @returns {HookResult}
 */
function feedback(payload, deps, herinneren) {
  if (get(payload, 'stop_hook_active') === true || get(payload, 'permission_mode') === 'plan') return {};
  const changed = deps.changed();
  const code = changed.filter((file) => LINTABLE.test(file) && !file.startsWith('.runner-output/'));
  if (code.length === 0) return {};
  const failures = [
    ['typecheck', deps.run('pnpm', ['exec', 'tsc', '-b'])],
    ['lint', deps.run('pnpm', ['exec', 'eslint', '--max-warnings', '0', '--no-warn-ignored', ...code])],
    ['unit', deps.run('pnpm', ['exec', 'vitest', 'related', '--run', '--project', 'unit', '--project', 'web', ...code])],
  ].filter(([, result]) => typeof result === 'object' && result.code !== 0);
  const drift = herinneren && eersteKeer(payload, deps, 'docs-drift') ? docsDrift(changed) : null;
  const herinnering = drift === null ? [] : [`${drift}. Raakt de wijziging geen gedrag, API of conventies, dan mag je opnieuw stoppen.`];
  if (failures.length === 0) return herinnering.length === 0 ? {} : block(`Herinnering (framework §8): ${herinnering.join('')}`);
  // Elke rode controle krijgt een eigen deel van de 40 regels: een lange lint- of testuitvoer drukt de typefout er niet uit.
  const budget = Math.max(1, Math.floor(MAX_LINES / failures.length) - 1);
  const report = failures.map(([name, result]) => `✗ ${String(name)}\n${typeof result === 'object' ? lastLines(result.output, budget) : ''}`);
  return block(`Nog niet groen (framework §8, Stop-hook):\n${[...report, ...herinnering].join('\n')}`);
}

/**
 * Een herinnering één keer per sessie: zonder sessie-id of `onthoud` altijd. Wordt alleen gevraagd als er gewijzigde code is.
 * @param {unknown} payload
 * @param {Deps} deps
 * @param {string} soort
 */
function eersteKeer(payload, deps, soort) {
  const sessie = get(payload, 'session_id');
  return typeof sessie !== 'string' || deps.onthoud === undefined || deps.onthoud(`${soort}-${sessie}`);
}

/**
 * Docs-drift zoals check:docs-drift (CI, alleen een waarschuwing): code in src/ gewijzigd zonder docs/ of CHANGELOG.md.
 * @param {readonly string[]} files
 * @returns {string | null}
 */
export function docsDrift(files) {
  const code = files.filter((file) => file.startsWith('src/') && !DRIFT_TEST.test(file) && !DRIFT_GEGENEREERD.has(file));
  if (code.length === 0 || files.some((file) => file.startsWith('docs/') || file === 'CHANGELOG.md')) return null;
  return `docs-drift: src/ wijzigt (${String(code.length)} bestand${code.length === 1 ? '' : 'en'}) zonder wijziging in docs/ of CHANGELOG.md; raakt dit gedrag, API of conventies, werk dan de doc in deze PR bij`;
}

/**
 * SubagentStop per rol: developer → gerichte Stop-feedback, zonder volledige eindgate; tester → lint en
 * typecheck groen, nieuwe tests falen alleen op asserties; reviewer → rapport met de kop "## Bevindingen".
 * @param {unknown} payload
 * @param {Deps} deps
 * @returns {HookResult}
 */
export function subagentStop(payload, deps) {
  const role = get(payload, 'agent_type');
  if (role === 'developer') return feedback(payload, deps, false);
  if (role === 'tester') return testerStop(deps);
  if (role === 'reviewer') return reviewerStop(payload);
  return {};
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
  const run = deps.run('pnpm', ['exec', 'vitest', 'run', '--reporter=json', `--outputFile.json=${TESTER_REPORT}`, ...tests]);
  const wrong = nonAssertionFailures(vitestReport(run.output, deps));
  return wrong.length === 0 ? {} : block(`Tester: een nieuwe test faalt niet op een assertie (compileert hij, bestaat de import?):\n${lastLines(wrong.join('\n'))}`);
}

/** Vast uitvoerbestand voor het JSON-rapport: vitest 5 schrijft het daarheen en meldt op stdout alleen waar. */
const TESTER_REPORT = '.vitest/json/tester-run.json';

/**
 * Het JSON-rapport van de tester-run: uit het uitvoerbestand als vitest meldt dat hij dat schreef (een bestand van een eerdere
 * run telt dus niet), anders de uitvoer zelf (oudere vitest zet het rapport op stdout).
 * @param {string} output
 * @param {Deps} deps
 */
function vitestReport(output, deps) {
  return output.includes(TESTER_REPORT) ? (deps.read(TESTER_REPORT) ?? output) : output;
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

const CHECK_GROEN = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const CHECK_ROOD = new Set(['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR']);
const PR_STAAT = new Map([['OPEN', 'open'], ['MERGED', 'gemerged'], ['CLOSED', 'gesloten']]);
const PR_REVIEW = new Map([['APPROVED', 'goedgekeurd'], ['CHANGES_REQUESTED', 'wijzigingen gevraagd'], ['REVIEW_REQUIRED', 'review nodig']]);

/** CheckRun (`name`, `status`, `conclusion`) of StatusContext (`context`, `state`) → groen, rood of bezig. @param {unknown} check */
function checkUitslag(check) {
  const uitslag = get(check, 'conclusion') ?? get(check, 'state');
  if (typeof uitslag === 'string' && CHECK_ROOD.has(uitslag)) return 'rood';
  return typeof uitslag === 'string' && CHECK_GROEN.has(uitslag) ? 'groen' : 'bezig';
}

/** @param {unknown} lijst */
function checksTekst(lijst) {
  if (!Array.isArray(lijst) || lijst.length === 0) return 'geen checks';
  const rood = lijst.filter((check) => checkUitslag(check) === 'rood').map((check) => String(get(check, 'name') ?? get(check, 'context') ?? '?'));
  const groen = lijst.filter((check) => checkUitslag(check) === 'groen').length;
  const bezig = lijst.length - groen - rood.length;
  return `checks ${String(groen)} groen, ${String(rood.length)} rood${rood.length === 0 ? '' : ` (${rood.join(', ')})`}, ${String(bezig)} bezig`;
}

/**
 * De open PR van de branch in één regel, uit `gh pr view --json number,state,isDraft,reviewDecision,statusCheckRollup`;
 * onleesbaar → ''.
 * @param {string} output
 * @returns {string}
 */
export function prStatus(output) {
  /** @type {unknown} */
  let pr;
  try {
    pr = JSON.parse(output);
  } catch {
    return '';
  }
  const nummer = get(pr, 'number');
  if (typeof nummer !== 'number') return '';
  const staat = String(get(pr, 'state') ?? '');
  const review = PR_REVIEW.get(String(get(pr, 'reviewDecision') ?? ''));
  const kop = `PR #${String(nummer)} (${PR_STAAT.get(staat) ?? staat.toLowerCase()}${get(pr, 'isDraft') === true ? ', concept' : ''})`;
  const regel = `${kop}: ${checksTekst(get(pr, 'statusCheckRollup'))}${review === undefined ? '' : `; review: ${review}`}`;
  return staat === 'MERGED' ? `${regel} — gemerged: begin nieuw werk vanaf een verse origin/main` : regel;
}

/** De PR-regel voor een featurebranch; gh met een harde timeout en zonder prompt, fail-open. @param {Deps} deps @param {string} branch */
function prRegel(deps, branch) {
  if (branch === 'main' || branch === 'HEAD' || branch === '') return '';
  const gh = deps.run('gh', ['pr', 'view', '--json', 'number,state,isDraft,reviewDecision,statusCheckRollup'], {
    timeout: 5000,
    env: { GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' },
  });
  return gh.code === 0 ? prStatus(gh.output) : '';
}

/**
 * SessionStart: de feiten als context (framework §8): branch, open PR, open wijzigingen, specs, laatste checkuitslag en de lokale stack.
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
      `Branch: ${branch}${branch === 'main' ? ' (begin nieuw werk met `git fetch origin main && git switch -c <naam> origin/main`)' : ''}`,
      mainLag(deps),
      prRegel(deps, branch),
      `Gewijzigde bestanden: ${changed.length === 0 ? 'geen' : changed.slice(0, 20).join(', ')}`,
      specs,
      status,
      doctor,
      'Vraag alleen taakrelevante feiten: node scripts/kit/feiten.mjs gates specs fase; componenten alleen bij UI (framework §8).',
    ]
      .filter((line) => line !== '')
      .join('\n'),
  };
}
