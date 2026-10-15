import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';

// Het echte entry-script (.claude/hooks/meting.mjs) via stdin; observeert alleen (ADR 0029 punt 12).
const root = process.cwd();
const SESSIE = 'sess-1';

function tmp(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function repo(head: string | null): string {
  const dir = tmp('meting-repo-');
  if (head !== null) {
    mkdirSync(path.join(dir, '.git'));
    writeFileSync(path.join(dir, '.git', 'HEAD'), head);
  }
  return dir;
}

function run(input: string, env: Record<string, string>) {
  const result = spawnSync('node', [path.join(root, '.claude/hooks/meting.mjs')], {
    cwd: root,
    input,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { status: result.status, stdout: result.stdout };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function regels(dir: string, sessie = SESSIE): Record<string, unknown>[] {
  const file = path.join(dir, `${sessie}.jsonl`);
  if (!existsSync(file)) return [];
  const uit: Record<string, unknown>[] = [];
  for (const regel of readFileSync(file, 'utf8').split('\n')) {
    if (regel === '') continue;
    const waarde: unknown = JSON.parse(regel);
    if (isRecord(waarde)) uit.push(waarde);
  }
  return uit;
}

function event(cwd: string, extra: Record<string, unknown>) {
  return { session_id: SESSIE, cwd, hook_event_name: 'PreToolUse', ...extra };
}

type Geval = { naam: string; payload: (cwd: string) => Record<string, unknown>; verwacht: Record<string, unknown> };

const sleutels: Geval[] = [
  {
    naam: 'Edit: pad relatief aan cwd',
    payload: (cwd) =>
      event(cwd, {
        tool_name: 'Edit',
        tool_use_id: 'tu1',
        tool_input: { file_path: `${cwd}/src/a.ts`, old_string: 'GEHEIM', new_string: 'x' },
      }),
    verwacht: { e: 'PreToolUse', tool: 'Edit', id: 'tu1', k: 'src/a.ts', b: 'stap-3', a: 'hoofdsessie' },
  },
  {
    naam: 'Write: pad buiten de repo wordt buiten-repo',
    payload: (cwd) => event(cwd, { tool_name: 'Write', tool_input: { file_path: '/etc/passwd', content: 'GEHEIM' } }),
    verwacht: { tool: 'Write', k: 'buiten-repo' },
  },
  {
    naam: 'MultiEdit: relatief pad',
    payload: (cwd) => event(cwd, { tool_name: 'MultiEdit', tool_input: { file_path: `${cwd}/docs/x.md`, edits: [] } }),
    verwacht: { tool: 'MultiEdit', k: 'docs/x.md' },
  },
  {
    naam: 'NotebookEdit: notebook_path',
    payload: (cwd) => event(cwd, { tool_name: 'NotebookEdit', tool_input: { notebook_path: `${cwd}/n.ipynb` } }),
    verwacht: { tool: 'NotebookEdit', k: 'n.ipynb' },
  },
  {
    naam: 'Read: relatief pad',
    payload: (cwd) => event(cwd, { tool_name: 'Read', tool_input: { file_path: `${cwd}/package.json` } }),
    verwacht: { tool: 'Read', k: 'package.json' },
  },
  {
    naam: 'Bash: eerste twee woorden',
    payload: (cwd) => event(cwd, { tool_name: 'Bash', tool_input: { command: 'pnpm test:db --filter geheim' } }),
    verwacht: { tool: 'Bash', k: 'pnpm test:db' },
  },
  {
    naam: 'Bash: git push zonder rest',
    payload: (cwd) => event(cwd, { tool_name: 'Bash', tool_input: { command: 'git push origin main' } }),
    verwacht: { k: 'git push' },
  },
  {
    naam: 'Bash: tweede woord met streepje wordt weggelaten',
    payload: (cwd) => event(cwd, { tool_name: 'Bash', tool_input: { command: 'rm -rf /tmp/x' } }),
    verwacht: { k: 'rm' },
  },
  {
    naam: 'Bash: tweede woord met andere tekens wordt weggelaten',
    payload: (cwd) => event(cwd, { tool_name: 'Bash', tool_input: { command: 'curl "https://x?token=abc"' } }),
    verwacht: { k: 'curl' },
  },
  {
    naam: 'Bash: env-toewijzing vooraf',
    payload: (cwd) => event(cwd, { tool_name: 'Bash', tool_input: { command: 'FOO=bar pnpm test' } }),
    verwacht: { k: 'env-toewijzing' },
  },
  {
    naam: 'mcp__: de toolnaam',
    payload: (cwd) => event(cwd, { tool_name: 'mcp__github__get_me', tool_input: { q: 'GEHEIM' } }),
    verwacht: { tool: 'mcp__github__get_me', k: 'mcp__github__get_me' },
  },
  {
    naam: 'overige tool: lege sleutel',
    payload: (cwd) => event(cwd, { tool_name: 'Grep', tool_input: { pattern: 'GEHEIM' } }),
    verwacht: { tool: 'Grep', k: '' },
  },
  {
    naam: 'agent_type wordt a',
    payload: (cwd) => event(cwd, { tool_name: 'Grep', agent_type: 'tester', tool_input: {} }),
    verwacht: { a: 'tester' },
  },
];

const bashGeheimen: [string, string, string[]][] = [
  ['echo hunter2 | sudo -S true', 'echo', ['hunter2']],
  ['printf secretpass', 'printf', ['secretpass']],
  ['htpasswd admin x', 'htpasswd', ['admin']],
  ['cd klantnaam-project', 'cd', ['klantnaam']],
  ['git push', 'git push', []],
  ['pnpm test:db', 'pnpm test:db', []],
  ['gh pr view 5', 'gh pr', []],
];

test.each(bashGeheimen)('Bash %j geeft sleutel %j zonder geheimen', (command, sleutel, geheimen) => {
  const dir = tmp('meting-dir-');

  run(JSON.stringify(event(repo(null), { tool_name: 'Bash', tool_input: { command } })), { METING_DIR: dir });

  expect(regels(dir)).toMatchObject([{ k: sleutel }]);
  for (const geheim of geheimen) expect(readFileSync(path.join(dir, `${SESSIE}.jsonl`), 'utf8')).not.toContain(geheim);
});

test.each(sleutels)('$naam', ({ payload, verwacht }) => {
  const dir = tmp('meting-dir-');
  const cwd = repo('ref: refs/heads/stap-3\n');

  const result = run(JSON.stringify(payload(cwd)), { METING_DIR: dir });

  expect({ status: result.status, stdout: result.stdout }).toStrictEqual({ status: 0, stdout: '' });
  expect(regels(dir)).toHaveLength(1);
  expect(regels(dir)[0]).toMatchObject(verwacht);
  expect(readFileSync(path.join(dir, `${SESSIE}.jsonl`), 'utf8')).not.toMatch(/GEHEIM|token=abc|FOO=bar|bar/);
});

test('regel heeft ISO-tijd, event en sessie', () => {
  const dir = tmp('meting-dir-');
  run(JSON.stringify(event(repo(null), { tool_name: 'Grep' })), { METING_DIR: dir });

  const [regel] = regels(dir);

  expect(regel).toMatchObject({ e: 'PreToolUse', s: SESSIE });
  expect(new Date(String(regel?.['t'])).toISOString()).toBe(regel?.['t']);
});

test.each([
  ['PermissionRequest', 'Bash'],
  ['PermissionDenied', 'Bash'],
  ['PostToolUse', 'Bash'],
  ['PostToolUseFailure', 'Bash'],
])('%s wordt gelogd met sleutel', (naam, tool) => {
  const dir = tmp('meting-dir-');
  const cwd = repo(null);

  run(JSON.stringify(event(cwd, { hook_event_name: naam, tool_name: tool, tool_input: { command: 'pnpm lint' } })), {
    METING_DIR: dir,
  });

  expect(regels(dir)).toMatchObject([{ e: naam, k: 'pnpm lint' }]);
});

test.each(['UserPromptSubmit', 'Stop', 'SessionEnd'])('%s: geen k en geen prompttekst of antwoord', (naam) => {
  const dir = tmp('meting-dir-');
  const payload = event(repo(null), {
    hook_event_name: naam,
    prompt: 'MIJN-GEHEIME-PROMPT',
    last_assistant_message: 'MIJN-GEHEIME-ANTWOORD',
  });

  const result = run(JSON.stringify(payload), { METING_DIR: dir });
  const tekst = existsSync(path.join(dir, `${SESSIE}.jsonl`))
    ? readFileSync(path.join(dir, `${SESSIE}.jsonl`), 'utf8')
    : '';

  expect(result.status).toBe(0);
  expect(regels(dir)).toHaveLength(1);
  expect(regels(dir)[0]).toMatchObject({ e: naam });
  expect(regels(dir)[0]).not.toHaveProperty('k');
  expect(tekst).not.toMatch(/GEHEIME|"prompt"|last_assistant_message/);
});

test('andere events: niets schrijven, exit 0', () => {
  const dir = tmp('meting-dir-');

  const result = run(JSON.stringify(event(repo(null), { hook_event_name: 'SessionStart' })), { METING_DIR: dir });

  expect({ status: result.status, stdout: result.stdout, bestanden: readdirSync(dir) }).toStrictEqual({
    status: 0,
    stdout: '',
    bestanden: [],
  });
});

test('meerdere events: één regel per event, appended', () => {
  const dir = tmp('meting-dir-');
  const cwd = repo(null);

  for (const naam of ['PreToolUse', 'PostToolUse'])
    run(JSON.stringify(event(cwd, { hook_event_name: naam })), { METING_DIR: dir });

  expect(regels(dir).map((regel) => regel['e'])).toStrictEqual(['PreToolUse', 'PostToolUse']);
});

test.each([
  ['ref: refs/heads/feat/x-y\n', 'feat/x-y'],
  ['0123456789abcdef0123456789abcdef01234567\n', 'detached'],
  [null, 'onbekend'],
])('branch uit .git/HEAD %j geeft %s', (head, branch) => {
  const dir = tmp('meting-dir-');

  run(JSON.stringify(event(repo(head), { tool_name: 'Grep' })), { METING_DIR: dir });

  expect(regels(dir)).toMatchObject([{ b: branch }]);
});

test('session_id met vreemde tekens: bestand onbekend.jsonl', () => {
  const dir = tmp('meting-dir-');

  const result = run(JSON.stringify({ session_id: '../../evil', cwd: repo(null), hook_event_name: 'Stop' }), {
    METING_DIR: dir,
  });

  expect({ status: result.status, bestanden: readdirSync(dir) }).toStrictEqual({
    status: 0,
    bestanden: ['onbekend.jsonl'],
  });
});

function zonderDir(cwd: string) {
  return run(JSON.stringify(event(cwd, { hook_event_name: 'Stop' })), { METING_DIR: '' });
}

test('zonder METING_DIR, gewone repo: <cwd>/.git/agent-meting/<sessie>.jsonl', () => {
  const cwd = repo('ref: refs/heads/stap-3\n');

  const result = zonderDir(cwd);

  expect(result).toStrictEqual({ status: 0, stdout: '' });
  expect(regels(path.join(cwd, '.git', 'agent-meting'))).toMatchObject([{ e: 'Stop', b: 'stap-3' }]);
});

test('zonder METING_DIR, worktree met gitdir en commondir: in de common dir', () => {
  const hoofd = tmp('meting-hoofd-');
  const gitdir = path.join(hoofd, '.git', 'worktrees', 'wt');
  mkdirSync(gitdir, { recursive: true });
  writeFileSync(path.join(gitdir, 'commondir'), '../..\n');
  writeFileSync(path.join(gitdir, 'HEAD'), 'ref: refs/heads/wt-branch\n');
  const cwd = tmp('meting-wt-');
  writeFileSync(path.join(cwd, '.git'), `gitdir: ${gitdir}\n`);

  const result = zonderDir(cwd);

  expect(result).toStrictEqual({ status: 0, stdout: '' });
  expect(regels(path.join(hoofd, '.git', 'agent-meting'))).toMatchObject([{ e: 'Stop', b: 'wt-branch' }]);
});

test('zonder METING_DIR en zonder .git: niets geschreven, exit 0', () => {
  const cwd = tmp('meting-geengit-');

  const result = zonderDir(cwd);

  expect({ ...result, bestanden: readdirSync(cwd) }).toStrictEqual({ status: 0, stdout: '', bestanden: [] });
});

test.each([
  ['lege stdin', ''],
  ['ongeldige json', 'geen json'],
  ['json maar geen object', '[1,2]'],
  ['lege payload', '{}'],
  ['onbekend event', JSON.stringify({ session_id: SESSIE, hook_event_name: 'Bestaatniet' })],
  ['ontbrekende velden', JSON.stringify({ hook_event_name: 'PreToolUse' })],
  ['tool_input van verkeerd type', JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: 5 })],
])('fail-open: %s geeft exit 0 zonder stdout', (_naam, input) => {
  const dir = tmp('meting-dir-');

  expect(run(input, { METING_DIR: dir })).toStrictEqual({ status: 0, stdout: '' });
});

test('fail-open: onschrijfbare map geeft exit 0 zonder stdout', () => {
  const blok = path.join(tmp('meting-blok-'), 'bestand');
  writeFileSync(blok, 'geen map');

  const result = run(JSON.stringify(event(repo(null), { hook_event_name: 'Stop' })), {
    METING_DIR: path.join(blok, 'sub'),
  });

  expect(result).toStrictEqual({ status: 0, stdout: '' });
  expect(existsSync(path.join(root, '.claude/hooks/meting.mjs'))).toBe(true);
});

function subRepo(): { root: string; sub: string } {
  const root = repo('ref: refs/heads/stap-3\n');
  const sub = path.join(root, 'sub');
  mkdirSync(sub);
  return { root, sub };
}

test.each([
  ['README.md in de repo-root', (r: string) => `${r}/README.md`, 'README.md'],
  ['bestand in de submap', (r: string) => `${r}/sub/x.ts`, 'sub/x.ts'],
  ['pad buiten de repo', () => '/etc/passwd', 'buiten-repo'],
])('cwd in submap: %s relatief aan de repo-root', (_naam, pad, sleutel) => {
  const dir = tmp('meting-dir-');
  const { root: repoRoot, sub } = subRepo();

  run(JSON.stringify(event(sub, { tool_name: 'Edit', tool_input: { file_path: pad(repoRoot) } })), { METING_DIR: dir });

  expect(regels(dir)).toMatchObject([{ k: sleutel, b: 'stap-3' }]);
});

test.each(['git push --dry-run', 'git push -n', 'git push origin main --dry-run'])(
  'Bash %j: vast label git push --dry-run, geen andere argumenten',
  (command) => {
    const dir = tmp('meting-dir-');

    run(JSON.stringify(event(repo(null), { tool_name: 'Bash', tool_input: { command } })), { METING_DIR: dir });

    expect(regels(dir)).toMatchObject([{ k: 'git push --dry-run' }]);
    expect(readFileSync(path.join(dir, `${SESSIE}.jsonl`), 'utf8')).not.toContain('origin');
  },
);

test.each(['__proto__', 'constructor'])('branchnaam %s in .git/HEAD: gewoon gelogd, exit 0', (naam) => {
  const dir = tmp('meting-dir-');

  const result = run(JSON.stringify(event(repo(`ref: refs/heads/${naam}\n`), { tool_name: 'Grep' })), {
    METING_DIR: dir,
  });

  expect(result.status).toBe(0);
  expect(regels(dir)).toMatchObject([{ b: naam }]);
});
