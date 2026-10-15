// Meten per sessie en branch (ADR 0029 punt 12): de pure delen van de meethook (.claude/hooks/meting.mjs) en de opslag
// die het overzicht (scripts/kit/meting.mjs) leest. Alleen tellingen en sleutels: nooit prompt- of antwoordtekst,
// commando-argumenten buiten het prefix, bestandsinhoud of geheimen. Getest in test/hooks/meting.test.ts.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { payloadCwd } from './root.mjs';

const TOOL_EVENTS = new Set(['PreToolUse', 'PermissionRequest', 'PermissionDenied', 'PostToolUse', 'PostToolUseFailure']);
const EVENTS = new Set([...TOOL_EVENTS, 'UserPromptSubmit', 'Stop', 'SessionEnd']);
// Alleen bij deze programma's is het tweede woord een subcommando; bij andere kan het een geheim of een naam zijn.
const SUBCOMMANDO = new Set(['git', 'pnpm', 'npm', 'npx', 'gh', 'mise', 'corepack', 'dbmate', 'yarn']);
const PAD_VELD = new Map([
  ['Edit', 'file_path'],
  ['Write', 'file_path'],
  ['MultiEdit', 'file_path'],
  ['Read', 'file_path'],
  ['NotebookEdit', 'notebook_path'],
]);

/** @param {unknown} value @returns {Record<string, unknown>} */
function record(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {};
}

/** @param {unknown} value */
function text(value) {
  return typeof value === 'string' ? value : undefined;
}

/** De dichtstbijzijnde map met `.git` vanaf `cwd`; null buiten een repo. @param {string} cwd */
export function repoRoot(cwd) {
  for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, '.git'))) return dir;
    if (path.dirname(dir) === dir) return null;
  }
}

/** De git-dir van `root`; een worktree (`.git` als bestand) volgt `gitdir:`. @param {string} root */
function gitDir(root) {
  const dir = path.join(root, '.git');
  if (!statSync(dir).isFile()) return dir;
  const verwijzing = /^gitdir:\s*(.+)$/m.exec(readFileSync(dir, 'utf8'))?.[1]?.trim() ?? '';
  return path.resolve(root, verwijzing);
}

/** De gedeelde git-dir: `<gitdir>/commondir` als die bestaat (een worktree), anders de git-dir zelf. @param {string} dir */
function commonDir(dir) {
  const bestand = path.join(dir, 'commondir');
  return existsSync(bestand) ? path.resolve(dir, readFileSync(bestand, 'utf8').trim()) : dir;
}

/** Branch uit `HEAD` in de git-dir, zonder git-proces. @param {string | null} root */
export function branch(root) {
  if (root === null) return 'onbekend';
  try {
    const head = readFileSync(path.join(gitDir(root), 'HEAD'), 'utf8').trim();
    const ref = /^ref: refs\/heads\/(.+)$/.exec(head)?.[1];
    if (ref !== undefined) return ref;
    return /^[0-9a-f]{40,64}$/.test(head) ? 'detached' : 'onbekend';
  } catch {
    return 'onbekend';
  }
}

/** Bash: hoogstens twee veilige woorden (het tweede alleen na een programma uit SUBCOMMANDO); `X=..` kan een geheim zijn. @param {string} command */
export function bashSleutel(command) {
  const [eerste = '', tweede = '', ...rest] = command.trim().split(/\s+/);
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(eerste)) return 'env-toewijzing';
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(eerste)) return '';
  // Een proefpush is geen CI-ronde: vast label; de argumenten worden alleen gelezen, nooit opgeslagen.
  if (eerste === 'git' && tweede === 'push' && rest.some((w) => w === '--dry-run' || w === '-n')) return 'git push --dry-run';
  return SUBCOMMANDO.has(eerste) && /^[a-z][a-z0-9:_-]*$/.test(tweede) ? `${eerste} ${tweede}` : eerste;
}

/** Pad relatief aan de repo-root (zonder repo: aan cwd); daarbuiten `buiten-repo`. @param {unknown} pad @param {string} cwd */
function padSleutel(pad, cwd) {
  if (typeof pad !== 'string' || pad === '') return '';
  const rel = path.relative(repoRoot(cwd) ?? path.resolve(cwd), path.resolve(cwd, pad));
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return 'buiten-repo';
  return rel === '' ? '.' : rel.split(path.sep).join('/');
}

/** @param {string} tool @param {Record<string, unknown>} input @param {string} cwd */
export function sleutel(tool, input, cwd) {
  if (tool.startsWith('mcp__')) return tool;
  if (tool === 'Bash') return bashSleutel(text(input['command']) ?? '');
  const veld = PAD_VELD.get(tool);
  return veld === undefined ? '' : padSleutel(input[veld], cwd);
}

/** @param {unknown} value */
function sessieId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value) ? value : 'onbekend';
}

/** De permission_mode als vaste modusnaam (alleen letters); anders undefined en wordt `m` weggelaten. @param {unknown} value */
function modus(value) {
  return typeof value === 'string' && /^[a-zA-Z]+$/.test(value) ? value : undefined;
}

/**
 * Eén meetregel `{t,e,s,b,a,m,tool,id,k}` (`m` alleen bij een geldige permission_mode), of null voor een event dat niet
 * gemeten wordt.
 * @param {unknown} payload
 * @param {Date} nu
 */
export function regel(payload, nu) {
  const p = record(payload);
  const e = text(p['hook_event_name']);
  if (e === undefined || !EVENTS.has(e)) return null;
  const cwd = payloadCwd(payload);
  const basis = {
    t: nu.toISOString(),
    e,
    s: sessieId(p['session_id']),
    b: branch(repoRoot(cwd)),
    a: text(p['agent_type']) ?? 'hoofdsessie',
  };
  const m = modus(p['permission_mode']);
  if (m !== undefined) Object.assign(basis, { m });
  if (!TOOL_EVENTS.has(e)) return basis;
  const tool = text(p['tool_name']);
  const k = tool === undefined ? '' : sleutel(tool, record(p['tool_input']), cwd);
  return { ...basis, tool, id: text(p['tool_use_id']), k };
}

/**
 * De map met de meetbestanden: `METING_DIR`, anders `<git common dir>/agent-meting` vanaf `cwd` (buiten git-tracking, ook
 * voor een worktree dezelfde map). Buiten een repo null: dan wordt niets geschreven of gelezen.
 * @param {string} cwd
 * @param {Record<string, string | undefined>} env
 */
export function opslagmap(cwd, env) {
  const eigen = env['METING_DIR'];
  if (eigen !== undefined && eigen !== '') return eigen;
  const root = repoRoot(cwd);
  return root === null ? null : path.join(commonDir(gitDir(root)), 'agent-meting');
}

/**
 * Het bestand voor deze payload: `<opslagmap>/<session_id>.jsonl`, of null zonder opslagmap.
 * @param {unknown} payload
 * @param {Record<string, string | undefined>} env
 */
export function bestand(payload, env) {
  const map = opslagmap(payloadCwd(payload), env);
  return map === null ? null : path.join(map, `${sessieId(record(payload)['session_id'])}.jsonl`);
}
