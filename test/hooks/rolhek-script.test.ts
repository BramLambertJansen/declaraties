import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';

// Het echte hook-script (rails/hooks/rolhek.mjs) met echte stdin-payloads: exitcode en uitvoer zoals Claude Code ze leest.
// Exit 2 blokkeert; een interne fout is ook exit 2 (faalt dicht, framework §8).
const root = process.cwd();
// De test hangt niet af van de echte origin: in de template-repo staat de onderhoudsmodus aan (ADR 0033 punt 2) en geeft een
// voorReview-pad geen ask. Zo ziet het script de origin van een app, waar de modus uit staat.
const APP_ORIGIN = {
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'remote.origin.url',
  GIT_CONFIG_VALUE_0: 'https://github.com/acme/app.git',
};

function run(
  input: string,
  origin: Record<string, string> = APP_ORIGIN,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('node', ['rails/hooks/rolhek.mjs'], {
    input,
    encoding: 'utf8',
    env: { ...process.env, ...origin, CLAUDE_PROJECT_DIR: root },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const bash = (command: string) => JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: root });

test('verboden: exit 2 met de reden op stderr', () => {
  const result = run(bash('git push origin main'));

  expect([result.status, result.stderr.trim()]).toStrictEqual([2, 'rolhek: push naar main is verboden; open een PR']);
});

test('beschermd pad in voorReview voor de hoofdsessie: permissionDecision ask', () => {
  const result = run(bash('echo x > scripts/x.ts'));
  const output: unknown = JSON.parse(result.stdout);

  expect(result.status).toBe(0);
  expect(output).toMatchObject({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask' } });
});

test('beschermd pad in voorReview in de template-repo (onderhoudsmodus): alleen een melding, geen ask', () => {
  const template = { ...APP_ORIGIN, GIT_CONFIG_VALUE_0: 'https://github.com/BramLambertJansen/template.git' };
  const result = run(bash('echo x > scripts/x.ts'), template);

  expect(result.status).toBe(0);
  expect(result.stdout).not.toContain('"permissionDecision":"ask"');
  expect(result.stdout).toContain('noem het in de PR');
});

test('bestaande test wijzigen: door, met context voor de PR', () => {
  const payload = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: `${root}/test/hooks/rolhek.test.ts`, old_string: 'Rolhek', new_string: 'Het rolhek' },
    cwd: root,
  });
  const result = run(payload);

  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ hookSpecificOutput: { hookEventName: 'PreToolUse' } });
  expect(result.stdout).toContain('is een bestaande test: noem de wijziging met reden in de PR');
});

test('gewoon commando: door, zonder uitvoer', () => {
  expect(run(bash('ls'))).toStrictEqual({ status: 0, stdout: '', stderr: '' });
});

// ADR 0016 (gevolgen): paden tellen vanaf de git-root van de sessie (een worktree), niet vanaf CLAUDE_PROJECT_DIR. Vanaf
// CLAUDE_PROJECT_DIR lag src/core/ van de worktree buiten de repo (of onder .claude/**) en klopte het oordeel niet.
test('in een andere worktree: scripts/ van die worktree is een gate in voorReview (ask)', () => {
  const worktree = mkdtempSync(path.join(tmpdir(), 'rolhek-worktree-'));
  spawnSync('git', ['init', '-q'], { cwd: worktree });
  cpSync('.claude/gates.json', path.join(worktree, '.claude/gates.json'));
  const payload = JSON.stringify({
    tool_name: 'Write',
    tool_input: { file_path: path.join(worktree, 'scripts/x.ts'), content: 'export {};\n' },
    cwd: worktree,
  });
  const result = run(payload);

  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ hookSpecificOutput: { permissionDecision: 'ask' } });
});

test('kapotte invoer: faalt dicht (exit 2)', () => {
  const result = run('geen json');

  expect([result.status, result.stderr.startsWith('rolhek: interne fout, daarom geweigerd')]).toStrictEqual([2, true]);
});

test('.claude/settings.json registreert het rolhek voor Edit, Write en Bash', () => {
  const settings = readFileSync('.claude/settings.json', 'utf8');

  expect(settings).toContain('"matcher": "Edit|Write|MultiEdit|NotebookEdit|Bash|mcp__.*"');
  expect(settings).toContain('.claude/hooks/rolhek.mjs');
});

// WS-06: MCP-tools onder het rolhek. Een subagent mag er niet bij (exit 2); de hoofdsessie vraagt de eigenaar (ask).
const mcpCall = (tool: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ tool_name: tool, tool_input: {}, cwd: root, ...extra });

test('MCP-tool door een subagent: exit 2 met de reden op stderr', () => {
  const result = run(mcpCall('mcp__claude_ai_Supabase__apply_migration', { agent_type: 'developer' }));

  expect([result.status, result.stderr.startsWith('rolhek: ')]).toStrictEqual([2, true]);
  expect(result.stderr).not.toContain('interne fout');
});

test('MCP-tool door de hoofdsessie: permissionDecision ask', () => {
  const result = run(mcpCall('mcp__claude_ai_Supabase__apply_migration'));

  expect(result.status).toBe(0);
  expect(result.stdout).toContain('permissionDecision');
  expect(JSON.parse(result.stdout)).toMatchObject({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask' },
  });
});

test('.claude/settings.json: de rolhek-matcher vangt mcp__.*', () => {
  const settings: unknown = JSON.parse(readFileSync('.claude/settings.json', 'utf8'));
  const hooks = JSON.stringify(settings);

  expect(hooks).toMatch(/"matcher":"[^"]*\|mcp__\.\*"[^}]*rolhek\.mjs/);
});

test('.claude/gates.json: mcpLezen is een lijst van toolnamen (standaard leeg)', () => {
  const gates: unknown = JSON.parse(readFileSync('.claude/gates.json', 'utf8'));

  expect(gates).toMatchObject({ mcpLezen: [] });
});

// Fail-closed: zonder leesbare gates.json mag een MCP-tool nooit door.
function inTempRepo(gatesText: string | null): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'rolhek-mcp-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  if (gatesText !== null) {
    mkdirSync(path.join(dir, '.claude'));
    writeFileSync(path.join(dir, '.claude/gates.json'), gatesText);
  }
  return dir;
}

test.each([
  { name: 'ontbrekende gates.json', text: null },
  { name: 'onleesbare gates.json', text: '{kapot' },
])('MCP-tool met $name: exit 2, ook voor de hoofdsessie', ({ text }) => {
  const dir = inTempRepo(text);
  const result = run(mcpCall('mcp__claude_ai_Supabase__execute_sql', { cwd: dir }));

  expect(result.status).toBe(2);
});

test('MCP-tool in een worktree zonder mcpLezen-sleutel: nooit stilzwijgend door', () => {
  const dir = inTempRepo(readFileSync('.claude/gates.json', 'utf8').replace(/"mcpLezen"\s*:\s*\[[^\]]*\]\s*,?/, ''));
  const sub = run(mcpCall('mcp__claude_ai_Supabase__execute_sql', { cwd: dir, agent_type: 'developer' }));
  const main = run(mcpCall('mcp__claude_ai_Supabase__execute_sql', { cwd: dir }));

  expect(sub.status).toBe(2);
  expect(main.status === 2 || main.stdout.includes('"permissionDecision":"ask"')).toBe(true);
});
