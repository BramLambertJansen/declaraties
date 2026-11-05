import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { bestand, opslagmap, regel } from '../../rails/hooks/lib/meting.mjs';

// claude-sandbox-werkstraat/AC-9 (meetprotocoldeel): vergelijk ontvangen hookevents per sessie en checkoutbranch.
// Dit toetst de meetengine met eventfixtures; runtimeversies, echte commits/pushes/PR's en CI vereisen native PR-bewijs.
const script = path.resolve('scripts/kit/meting.mjs');
const dirs: string[] = [];
type Context = { cwd: string; sessie: string; tijd: Date };
type BashCall = { id: string; command: string; events: string[] };

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'meting-sandbox-werkstraat-'));
  dirs.push(root);
  const primary = path.join(root, 'primary');
  const worktree = path.join(root, 'worktree');
  const gitdir = path.join(primary, '.git/worktrees/na');
  mkdirSync(gitdir, { recursive: true });
  mkdirSync(worktree);
  writeFileSync(path.join(primary, '.git/HEAD'), 'ref: refs/heads/codex/sandbox-voor\n');
  writeFileSync(path.join(gitdir, 'HEAD'), 'ref: refs/heads/codex/sandbox-na\n');
  writeFileSync(path.join(gitdir, 'commondir'), '../..\n');
  writeFileSync(path.join(worktree, '.git'), `gitdir: ${gitdir}\n`);
  return { primary, worktree };
}

function schrijf(context: Context, event: Record<string, unknown>) {
  const payload = { cwd: context.cwd, session_id: context.sessie, permission_mode: 'acceptEdits', ...event };
  const entry = regel(payload, context.tijd);
  const file = bestand(payload, {});
  if (entry === null || file === null) throw new Error('Meetfixture moet een geldige meetregel opleveren');
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(entry)}\n`);
}

function bash(context: Context, call: BashCall) {
  for (const hook_event_name of call.events)
    schrijf(context, {
      hook_event_name,
      tool_name: 'Bash',
      tool_use_id: call.id,
      tool_input: { command: call.command },
    });
}

function overzicht(cwd: string, args: string[]) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 2500,
    // Geen echte gh of netwerk: een ontbrekende CLI moet onbekende CI blijven opleveren.
    env: { ...process.env, METING_DIR: '', METING_GH: path.join(cwd, 'gh-ontbreekt') },
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
  return result.stdout;
}

test('gedeelde worktree-opslag houdt voor/na en hergebruikte tool-ID’s gescheiden, zonder ontbrekend bewijs te vergoelijken', () => {
  const f = fixture();
  const voor = { cwd: f.primary, sessie: 'voor', tijd: new Date('2026-10-29T09:00:00Z') };
  const na = { cwd: f.worktree, sessie: 'na', tijd: new Date('2026-10-29T10:00:00Z') };
  expect(opslagmap(voor.cwd, {})).toBe(opslagmap(na.cwd, {}));
  bash(voor, {
    id: 'check',
    command: 'pnpm format:check',
    events: ['PreToolUse', 'PermissionRequest', 'PermissionDenied'],
  });
  bash(voor, { id: 'commit', command: 'git commit -m "test: voor"', events: ['PreToolUse'] });
  bash(voor, { id: 'push', command: 'git push --dry-run origin HEAD', events: ['PreToolUse', 'PostToolUse'] });
  schrijf(voor, { hook_event_name: 'Stop' });
  for (const [id, command] of [
    ['check', 'pnpm format:check'],
    ['commit', 'git commit -m "test: na"'],
    ['push', 'git push origin HEAD'],
  ])
    bash(na, { id: id ?? '', command: command ?? '', events: ['PreToolUse', 'PostToolUse'] });
  schrijf(na, { hook_event_name: 'Stop' });

  const data: unknown = JSON.parse(overzicht(f.worktree, ['--json']));
  expect(data).toMatchObject({
    sessies: {
      voor: {
        prompts: 1,
        promptsPerSleutel: { 'pnpm format:check': 1 },
        promptsPerModus: { acceptEdits: 1 },
        weigeringen: 2,
        weigeringenPerSleutel: { 'pnpm format:check': 1, 'git commit': 1 },
        pushes: 0,
        ciRondes: 'onbekend',
        beurten: 1,
        branches: { 'codex/sandbox-voor': { prompts: 1, weigeringen: 2, pushes: 0, ciRondes: 'onbekend' } },
      },
      na: {
        prompts: 0,
        promptsPerModus: {},
        weigeringen: 0,
        pushes: 1,
        ciRondes: 'onbekend',
        beurten: 1,
        branches: { 'codex/sandbox-na': { prompts: 0, weigeringen: 0, pushes: 1, ciRondes: 'onbekend' } },
      },
    },
  });
  const ontbreekt: unknown = JSON.parse(overzicht(f.primary, ['--json', '--sessie', 'ontbreekt']));
  expect(ontbreekt).toEqual({ sessies: {} });
  const tekst = overzicht(f.primary, ['--sessie', 'ontbreekt']);
  expect(tekst).toContain('Geen metingen');
  expect(tekst).not.toMatch(/prompts 0|pushes 0|ci-rondes 0/);
});
