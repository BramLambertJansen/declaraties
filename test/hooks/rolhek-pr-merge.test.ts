import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { MERGE_FILES, trustedMerge } from '../../rails/hooks/lib/runner-authority.mjs';

// ADR 0069 punt 4, spec agent-merge-niet-kritiek AC-4: alleen de hoofdsessie, alleen `pnpm pr:merge <nr>`, en zonder prompt
// alleen met modus `niet-kritiek` in het anker en ongewijzigde scripts, rails en hostbestanden. Andere merge-routes blijven dicht.
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));

/** De lijsten met tekst onder één sectie van een JSON-bestand. */
function lijsten(tekst: string, sectie: string): Record<string, string[]> {
  const ruw: unknown = JSON.parse(tekst);
  const blok: unknown =
    typeof ruw === 'object' && ruw !== null ? Object.entries(ruw).find(([k]) => k === sectie)?.[1] : undefined;
  if (typeof blok !== 'object' || blok === null) return {};
  return Object.fromEntries(
    Object.entries(blok).flatMap(([k, v]: [string, unknown]) =>
      Array.isArray(v) && v.every((x) => typeof x === 'string') ? [[k, v.map(String)]] : [],
    ),
  );
}

function verdict(command: string, opties: { agent?: string; vertrouwd?: boolean; cwd?: string } = {}) {
  const decision = decide(
    { tool_name: 'Bash', tool_input: { command }, agent_type: opties.agent ?? '' },
    {
      root: '/repo',
      cwd: opties.cwd ?? '/repo',
      config,
      read: () => null,
      committed: () => false,
      isDir: () => false,
      branch: 'feat/x',
      mergeTrusted: opties.vertrouwd ?? true,
    },
  );
  if (decision.deny.length > 0) return { uitslag: 'deny', reden: decision.deny.join('; ') };
  if (decision.ask.length > 0) return { uitslag: 'ask', reden: decision.ask.join('; ') };
  return { uitslag: decision.allow === true ? 'allow' : 'context', reden: '' };
}

describe('agent-merge-niet-kritiek/AC-4 rolhek op pnpm pr:merge', () => {
  test.each(['pnpm pr:merge 12', '  pnpm  pr:merge 7 '])('hoofdsessie, vertrouwd: allow (%s)', (command) => {
    expect(verdict(command).uitslag).toBe('allow');
  });

  test('hoofdsessie, niet vertrouwd (modus of bestanden wijken af): deny met de reden', () => {
    const uitslag = verdict('pnpm pr:merge 12', { vertrouwd: false });
    expect(uitslag.uitslag).toBe('deny');
    expect(uitslag.reden).toMatch(/hostbestanden \(package\.json, \.npmrc/);
  });

  test('buiten de repo-root: deny', () => {
    expect(verdict('pnpm pr:merge 12', { cwd: '/repo/src' }).uitslag).toBe('deny');
  });

  test.each(['developer', 'tester', 'architect', 'reviewer', 'docs', 'onbekend'])(
    'subagent %s: altijd deny',
    (agent) => {
      const uitslag = verdict('pnpm pr:merge 12', { agent });
      expect(uitslag.uitslag).toBe('deny');
      expect(uitslag.reden).toMatch(/hoofdsessie|lezen|niet/);
    },
  );

  test.each([
    'node scripts/kit/pr-merge.mjs 12',
    'pnpm pr:merge 12 && echo klaar',
    'pnpm pr:merge 12 --force',
    'npm run pr:merge 12',
    'pnpm run pr:merge 12',
    'pnpm pr:merge 012',
    'pnpm pr:merge $(echo 12)',
    'env X=1 node scripts/kit/pr-merge.mjs 12',
    '/usr/bin/node scripts/kit/pr-merge.mjs 12',
    'sh -c "pnpm pr:merge 12"',
    "bash -c 'node scripts/kit/pr-merge.mjs 12'",
    'cd scripts/kit && node pr-merge.mjs 12',
    'pnpm p\\r:merge 12',
    "git -c alias.x='!node scripts/kit/pr-merge.mjs 12' x",
    'rg --pre node x scripts/kit/pr-merge.mjs',
    'LESSOPEN="|node %s" less scripts/kit/pr-merge.mjs',
    'node scripts/kit/pr-mer*.mjs 12',
    'node scripts/kit/pr-merg?.mjs 12',
    'node scripts/kit/pr-mer[g]e.mjs 12',
    'cd scripts/kit && node pr-*.mjs 12',
    'pnpm pr:*e 12',
  ])('andere vorm: deny (%s)', (command) => {
    expect(verdict(command).uitslag).toBe('deny');
  });

  test.each(['gh pr merge 12 --squash', 'gh api -X PUT repos/o/r/pulls/12/merge', 'gh pr merge 12 --auto'])(
    'andere merge-routes blijven voor de hoofdsessie dicht (%s)',
    (command) => {
      expect(verdict(command).uitslag).toBe('deny');
    },
  );

  test.each([
    'cat scripts/kit/pr-merge.mjs',
    'git log -- scripts/kit/pr-merge.mjs',
    'grep -n x scripts/kit/pr-merge.mjs',
  ])('lezen blijft vrij (%s)', (command) => {
    expect(verdict(command).uitslag).not.toBe('deny');
  });

  test('settings.json: deny voor gh pr merge, ask en sandbox-uitzondering voor pnpm pr:merge, niet in allow', () => {
    const tekst = readFileSync('.claude/settings.json', 'utf8');
    const settings = { permissions: lijsten(tekst, 'permissions'), sandbox: lijsten(tekst, 'sandbox') };
    expect(settings.permissions['deny']).toEqual(
      expect.arrayContaining(['Bash(gh pr merge*)', 'Bash(gh api *merge*)']),
    );
    expect(settings.permissions['ask']).toContain('Bash(pnpm pr:merge *)');
    expect(settings.sandbox['excludedCommands']).toContain('pnpm pr:merge *');
    expect(settings.permissions['allow']?.some((regel) => regel.includes('pr:merge'))).toBe(false);
  });
});

// trustedMerge op een echte git-fixture: anker = main, branch eraf.
const ROOTS: string[] = [];
const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Merge test',
  GIT_AUTHOR_EMAIL: 'merge@example.test',
  GIT_COMMITTER_NAME: 'Merge test',
  GIT_COMMITTER_EMAIL: 'merge@example.test',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

afterEach(() => {
  for (const root of ROOTS.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(root: string, args: string[]) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } }).trim();
}

function write(root: string, file: string, text: string) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

function fixture(modus = 'niet-kritiek') {
  const root = mkdtempSync(path.join(tmpdir(), 'pr-merge-'));
  ROOTS.push(root);
  git(root, ['init', '-q', '-b', 'main']);
  const gates = JSON.stringify({ merge: modus });
  write(root, '.claude/gates.json', gates);
  write(root, 'package.json', '{"scripts":{"pr:merge":"node scripts/kit/pr-merge.mjs"}}\n');
  write(root, '.npmrc', '# fixture\n');
  write(root, 'scripts/kit/pr-merge.mjs', '// fixture; nooit uitvoeren\n');
  write(root, 'rails/hooks/lib/x.mjs', '// fixture\n');
  write(root, 'src/web/x.ts', 'export {};\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-q', '-m', 'test: fixture']);
  const sha = git(root, ['rev-parse', 'HEAD']);
  git(root, ['switch', '-q', '-c', 'feat/x']);
  return { root, basis: { sha, read: (rel: string) => (rel === '.claude/gates.json' ? gates : null) } };
}

describe('agent-merge-niet-kritiek/AC-4 trustedMerge', () => {
  test('MERGE_FILES dekt de hostbestanden, scripts en rails', () => {
    expect(MERGE_FILES).toEqual(
      expect.arrayContaining(['package.json', '.npmrc', '.pnpmfile.cjs', 'mise.toml', 'scripts', 'rails']),
    );
  });

  test('ongewijzigd en modus niet-kritiek: vertrouwd; app-code wijzigen mag', () => {
    const { root, basis } = fixture();
    write(root, 'src/web/x.ts', 'export const a = 1;\n');
    git(root, ['commit', '-qam', 'feat: app']);
    expect(trustedMerge(root, basis)).toBe(true);
  });

  test.each(['gh', 'git', 'node'])('een geplante node_modules/.bin/%s: niet vertrouwd', (naam) => {
    const { root, basis } = fixture();
    write(root, `node_modules/.bin/${naam}`, '#!/bin/sh\n');
    expect(trustedMerge(root, basis)).toBe(false);
  });

  test('modus eigenaar of zonder basis: niet vertrouwd', () => {
    const { root, basis } = fixture('eigenaar');
    expect(trustedMerge(root, basis)).toBe(false);
    expect(trustedMerge(root, null)).toBe(false);
  });

  test.each([
    ['package.json', '{"scripts":{"pr:merge":"node x.mjs"}}\n'],
    ['.npmrc', 'node-options=--require ./x.cjs\n'],
    ['scripts/kit/pr-merge.mjs', '// gewijzigd\n'],
    ['rails/hooks/lib/x.mjs', '// gewijzigd\n'],
    ['.pnpmfile.cjs', 'module.exports = {};\n'],
  ])('%s gewijzigd (lokaal of gecommit): niet vertrouwd', (bestand, inhoud) => {
    const lokaal = fixture();
    write(lokaal.root, bestand, inhoud);
    expect(trustedMerge(lokaal.root, lokaal.basis)).toBe(false);
    const gecommit = fixture();
    write(gecommit.root, bestand, inhoud);
    git(gecommit.root, ['add', '.']);
    git(gecommit.root, ['commit', '-q', '-m', 'test: gewijzigd']);
    expect(trustedMerge(gecommit.root, gecommit.basis)).toBe(false);
  });
});
