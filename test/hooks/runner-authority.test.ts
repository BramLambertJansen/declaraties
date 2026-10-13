import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import { automaticRunner, trustedRunner } from '../../.claude/hooks/lib/runner-authority.mjs';

// Alleen tijdelijke Git-fixtures; deze tests starten geen runner, package-manager, netwerk of Docker.
const ROOTS: string[] = [];
const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Runner test',
  GIT_AUTHOR_EMAIL: 'runner@example.test',
  GIT_COMMITTER_NAME: 'Runner test',
  GIT_COMMITTER_EMAIL: 'runner@example.test',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};
const HOST_FILES = [
  'scripts/runner.sh',
  'scripts/kit/helper.mjs',
  'package.json',
  'pnpm-workspace.yaml',
  '.npmrc',
  '.pnpmfile.cjs',
  'mise.toml',
  'compose.yaml',
  'compose.test.yaml',
  'db/test.env',
  'db/docker/Dockerfile',
];
const CHANGES = ['unstaged', 'staged', 'committed'];

function temporaryRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'runner-authority-'));
  ROOTS.push(root);
  return root;
}

function git(root: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENV },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function write(root: string, file: string, text: string): void {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text);
}

function commit(root: string): string {
  git(root, ['add', '.']);
  git(root, ['commit', '-q', '-m', 'test: runner fixture']);
  return git(root, ['rev-parse', 'HEAD']);
}

function fixture(config: string | null = JSON.stringify({ autoRunner: true })) {
  const root = temporaryRoot();
  git(root, ['init', '-q', '-b', 'main']);
  if (config !== null) write(root, '.claude/gates.json', config);
  for (const file of HOST_FILES) write(root, file, '# Vertrouwde fixture; nooit uitvoeren.\n');
  write(root, 'test/example.test.ts', 'export const version = 1;\n');
  const base = commit(root);
  git(root, ['update-ref', 'refs/remotes/origin/main', base]);
  git(root, ['switch', '-q', '-c', 'feat/runner-authority']);
  return { root, base };
}

function change(root: string, options: { file: string; state: string; text?: string }): void {
  write(root, options.file, options.text ?? '# Gewijzigde fixture; nooit uitvoeren.\n');
  if (options.state !== 'unstaged') git(root, ['add', '--', options.file]);
  if (options.state === 'committed') git(root, ['commit', '-q', '-m', 'test: changed fixture']);
}

afterEach(() => {
  for (const root of ROOTS.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('automaticRunner: uitsluitend zelfstandige vaste runnercommando’s', () => {
  test.each([
    'pnpm test:db',
    'pnpm ui:check',
    'pnpm gate:slow',
    'pnpm run test:db',
    'pnpm run ui:check',
    'pnpm run gate:slow',
    '  pnpm   test:db  ',
    ' pnpm  run   ui:check ',
    '\t pnpm run gate:slow \r\n',
  ])('%j mag automatisch', (command) => {
    expect(automaticRunner(command)).toBe(true);
  });

  test.each([
    '',
    'pnpm',
    'pnpm test:unit',
    'pnpm gate:fast',
    'pnpm db:generate',
    'pnpm check:snapshot',
    'scripts/runner.sh db',
    'pnpm test:db --sta-wijzigingen-toe',
    'pnpm run test:db -- --sta-wijzigingen-toe',
    'pnpm test:db --help',
    'pnpm test:db extra',
    'pnpm --dir . test:db',
    'CI=true pnpm test:db',
    'env pnpm test:db',
    'command pnpm test:db',
    'pnpm test:db; echo klaar',
    'pnpm test:db;',
    'pnpm test:db && pnpm ui:check',
    'pnpm test:db || true',
    'pnpm test:db &',
    'pnpm test:db | cat',
    'pnpm test:db > resultaat.txt',
    'pnpm test:db 2>/dev/null',
    'pnpm test:db < invoer.txt',
    'pnpm test:db\npnpm ui:check',
    'pnpm\ttest:db',
    'pnpm "test:db"',
    "pnpm 'test:db'",
    '"pnpm test:db"',
    'pnpm test:db ""',
    'pnpm test:db # commentaar',
    'pnpm test:db$(echo extra)',
    'pnpm test:db`echo extra`',
    '(pnpm test:db)',
    'bash -c "pnpm test:db"',
  ])('%j geeft geen automatische toestemming', (command) => {
    expect(automaticRunner(command)).toBe(false);
  });
});

describe('trustedRunner: toestemming en hostcode uit de echte vertrouwde Git-basis', () => {
  test('een schone featurebranch met autoRunner true op origin/main is vertrouwd', () => {
    const { root } = fixture();

    expect(trustedRunner(root)).toBe(true);
  });

  test('een tracked hostsymlink op origin/main blijft geweigerd bij een schone tree zonder hostdiff', () => {
    const { root } = fixture();
    git(root, ['switch', '-q', 'main']);
    rmSync(path.join(root, '.npmrc'));
    symlinkSync('test/example.test.ts', path.join(root, '.npmrc'));
    const symlinkBase = commit(root);
    git(root, ['update-ref', 'refs/remotes/origin/main', symlinkBase]);
    git(root, ['switch', '-q', '-c', 'feat/host-symlink']);

    expect(git(root, ['ls-files', '--stage', '--', '.npmrc'])).toMatch(/^120000 /);
    expect(git(root, ['status', '--porcelain', '--untracked-files=all'])).toBe('');
    expect(git(root, ['diff', '--name-only', 'origin/main', 'HEAD'])).toBe('');
    expect(trustedRunner(root)).toBe(false);
  });

  test.each(CHANGES)('een lokale autoRunner-vervalsing (%s) geeft geen recht als main false is', (state) => {
    const { root } = fixture(JSON.stringify({ autoRunner: false }));
    change(root, { file: '.claude/gates.json', text: JSON.stringify({ autoRunner: true }), state });

    expect(trustedRunner(root)).toBe(false);
  });

  test('een lokale gates-config bepaalt het recht niet wanneer de vertrouwde basis true is', () => {
    const { root } = fixture();
    write(root, '.claude/gates.json', JSON.stringify({ autoRunner: false }));

    expect(trustedRunner(root)).toBe(true);
  });

  test('intrekking op actuele origin/main geldt ook voor een branch op de oude toegestane basis', () => {
    const { root, base } = fixture();
    expect(trustedRunner(root)).toBe(true);
    git(root, ['switch', '-q', 'main']);
    write(root, '.claude/gates.json', JSON.stringify({ autoRunner: false }));
    const withdrawn = commit(root);
    git(root, ['update-ref', 'refs/remotes/origin/main', withdrawn]);
    git(root, ['switch', '-q', 'feat/runner-authority']);

    expect(git(root, ['merge-base', 'origin/main', 'HEAD'])).toBe(base);
    expect(trustedRunner(root)).toBe(false);
  });

  test.each([
    { name: 'geen flag', config: '{}' },
    { name: 'false', config: '{"autoRunner":false}' },
    { name: 'true als tekst', config: '{"autoRunner":"true"}' },
    { name: 'true als getal', config: '{"autoRunner":1}' },
    { name: 'null als flag', config: '{"autoRunner":null}' },
    { name: 'kapotte JSON', config: '{"autoRunner":true' },
    { name: 'array', config: '[{"autoRunner":true}]' },
    { name: 'nullconfig', config: 'null' },
    { name: 'ontbrekende config', config: null },
  ])('$name op de vertrouwde basis wordt geweigerd', ({ config }) => {
    const { root } = fixture(config);

    expect(trustedRunner(root)).toBe(false);
  });

  test.each(HOST_FILES.flatMap((file) => CHANGES.map((state) => ({ file, state }))))(
    '$state wijziging aan $file trekt het recht in',
    ({ file, state }) => {
      const { root } = fixture();
      change(root, { file, state });

      expect(trustedRunner(root)).toBe(false);
    },
  );

  test.each([
    'scripts/new-runner.mjs',
    'scripts/kit/nested/new-runner.mjs',
    'scripts/example.test.ts',
    'compose.override.yaml',
    'compose.local.yaml',
    'db/docker/new-host-file',
  ])('untracked hostbestand %s wordt geweigerd', (file) => {
    const { root } = fixture();
    write(root, file, '# Ongelezen bestand; nooit uitvoeren.\n');

    expect(trustedRunner(root)).toBe(false);
  });

  test('een genegeerd ongetrackt hostbestand kan de vertrouwde runner niet aanvullen', () => {
    const { root } = fixture();
    write(root, '.git/info/exclude', 'compose.override.yaml\n');
    write(root, 'compose.override.yaml', '# Genegeerde host-overlay; nooit uitvoeren.\n');

    expect(git(root, ['status', '--porcelain', '--untracked-files=all', '--', 'compose.override.yaml'])).toBe('');
    expect(trustedRunner(root)).toBe(false);
  });

  test.each(CHANGES)('een gewone testwijziging (%s) blokkeert de geïsoleerde runner niet', (state) => {
    const { root } = fixture();
    change(root, { file: 'test/example.test.ts', state });

    expect(trustedRunner(root)).toBe(true);
  });

  test('een nieuw untracked testbestand blokkeert de geïsoleerde runner niet', () => {
    const { root } = fixture();
    write(root, 'test/new.test.ts', 'export {};\n');

    expect(trustedRunner(root)).toBe(true);
  });

  test.each(['unstaged', 'staged'])('verwijderen van hostcode (%s) trekt het recht in', (state) => {
    const { root } = fixture();
    rmSync(path.join(root, 'scripts/runner.sh'));
    if (state === 'staged') git(root, ['add', '--', 'scripts/runner.sh']);

    expect(trustedRunner(root)).toBe(false);
  });

  test('hernoemen van hostcode buiten scripts trekt het recht in', () => {
    const { root } = fixture();
    git(root, ['mv', 'scripts/runner.sh', 'test/renamed-runner.sh']);
    commit(root);

    expect(trustedRunner(root)).toBe(false);
  });

  test('zonder origin/main ontstaat geen runnerrecht', () => {
    const { root } = fixture();
    git(root, ['update-ref', '-d', 'refs/remotes/origin/main']);

    expect(trustedRunner(root)).toBe(false);
  });

  test('een map zonder Git-repository geeft geen runnerrecht', () => {
    const root = temporaryRoot();
    write(root, '.claude/gates.json', JSON.stringify({ autoRunner: true }));

    expect(trustedRunner(root)).toBe(false);
  });

  test('een context waarin git niet beschikbaar is geeft geen runnerrecht', () => {
    const { root } = fixture();
    const moduleUrl = pathToFileURL(path.resolve('.claude/hooks/lib/runner-authority.mjs')).href;
    const source = `import { trustedRunner } from ${JSON.stringify(moduleUrl)}; process.stdout.write(String(trustedRunner(${JSON.stringify(root)})));`;
    const result = execFileSync(process.execPath, ['--input-type=module', '-e', source], {
      encoding: 'utf8',
      env: { ...process.env, PATH: root },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(result).toBe('false');
  });

  test('een schone gekoppelde worktree gebruikt dezelfde vertrouwde basis', () => {
    const { root, base } = fixture();
    const worktree = temporaryRoot();
    git(root, ['worktree', 'add', '-q', '-b', 'feat/runner-worktree', worktree, base]);

    expect(trustedRunner(worktree)).toBe(true);
  });
});
