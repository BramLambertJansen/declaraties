import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { commitFout } from '../../scripts/kit/commit-msg.mjs';

// Ontwikkelgemak 6: de commit-msg-hook houdt conventional commits af (AGENTS.md, Repo en grenzen).

describe('commitFout', () => {
  test.each([
    'fix(hooks): x',
    'docs(st-09): x',
    'feat!: x',
    'feat(api)!: breaking',
    'chore: x',
    'test: x',
    'refactor(src/web): x',
    'perf: x',
    'build: x',
    'ci: x',
    'style: x',
    'revert: x',
    'feat(a.b-c/d): x',
    'Merge branch main into feat/x',
    'Revert "feat: x"',
    'fixup! feat: x',
    'squash! wat dan ook',
    'amend! fix: y',
    '# commentaar van git\n\nfix(hooks): kop na commentaar\n\nmet body',
    '\n\nchore: lege regels ervoor\n',
  ])('goed: %j', (bericht) => {
    expect(commitFout(bericht)).toBeNull();
  });

  test.each([
    'update stuff',
    'Fix: x',
    'feat(Hooks): x',
    'feat:x',
    'feat: ',
    'feat(): x',
    'feature: x',
    '',
    '# alleen commentaar\n',
    'fixup!feat: x',
  ])('fout: %j', (bericht) => {
    const fout = commitFout(bericht);

    expect(fout).toContain('conventional commits');
    expect(fout).toContain('fix(hooks): ');
  });
});

const root = process.cwd();
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function script(bericht: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'commit-msg-'));
  dirs.push(dir);
  const bestand = path.join(dir, 'COMMIT_EDITMSG');
  writeFileSync(bestand, bericht);
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/kit/commit-msg.mjs'), bestand], {
    cwd: root,
    encoding: 'utf8',
  });
  return { status: result.status, stderr: result.stderr };
}

describe('script scripts/kit/commit-msg.mjs', () => {
  test('goed bericht: exit 0 zonder melding', () => {
    expect(script('feat(hooks): commit-msg-hook\n\nbody\n')).toStrictEqual({ status: 0, stderr: '' });
  });

  test('fout bericht: exit 1 met de melding op stderr', () => {
    const result = script('update stuff\n');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('conventional commits');
  });
});
