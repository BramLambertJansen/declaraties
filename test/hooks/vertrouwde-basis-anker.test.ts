import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { readAuthority } from '../../rails/hooks/lib/authority-context.mjs';
import { trustedRunner } from '../../rails/hooks/lib/runner-authority.mjs';

// ADR 0045, voorwaarde bij punt 2 tot 4: de hooks lezen hun vertrouwde basis uit het anker (de SHA die de stub-lader als
// RAILS_ANKER doorgeeft), gecontroleerd tegen de hash van elk object, en niet uit een lokale origin/main die een agent kan
// ombuigen. Contractpunten A1 tot en met A5. Remotes zijn lokale bare repo's; het echte netwerk komt er nooit aan te pas.
const STUB_SOURCE = path.join(process.cwd(), '.claude/hooks');
const ROLHEK_SCRIPT = path.join(process.cwd(), 'rails/hooks/rolhek.mjs');
const OBJECTEN = '../../rails/hooks/lib/objecten.mjs';
const dirs: string[] = [];

const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

function tmp(prefix: string): string {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  dirs.push(dir);
  return dir;
}

function gitIn(cwd: string, input: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, input, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function git(cwd: string, ...args: string[]): string {
  return gitIn(cwd, '', ...args);
}

function write(dir: string, files: Record<string, string>) {
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), content);
  }
}

/** Schrijft de bestanden, commit ze en geeft de SHA van de commit. */
function commit(dir: string, files: Record<string, string>, message = 'c'): string {
  write(dir, files);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--allow-empty', '-m', message);
  return git(dir, 'rev-parse', 'HEAD');
}

function newRepo(): string {
  const dir = tmp('anker-repo-');
  git(dir, 'init', '-q', '-b', 'main');
  return dir;
}

beforeEach(() => {
  // Buiten een hook is er geen anker; een test die er een wil, zet hem zelf met vi.stubEnv.
  Reflect.deleteProperty(process.env, 'RAILS_ANKER');
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// ---------- vervalste objecten (zoals test G in hooks-van-main.test.ts) ----------

type Entry = [mode: string, name: string, oid: string];

function treeBody(entries: Entry[]): Buffer {
  return Buffer.concat(
    entries.map(([mode, name, oid]) => Buffer.concat([Buffer.from(`${mode} ${name}\0`), Buffer.from(oid, 'hex')])),
  );
}

/** Vervangt het losse object `oid` door een ander object; git leest een los object zonder de hash te controleren. */
function forgeLoose(dir: string, oid: string, object: { type: string; body: Buffer }) {
  const { type, body } = object;
  const file = path.join(dir, '.git/objects', oid.slice(0, 2), oid.slice(2));
  // rmSync zonder force gooit als het object niet los staat; het echte object blijft dus los, nooit gepakt.
  expect(() => {
    rmSync(file);
  }, `${oid} moet een los object zijn`).not.toThrow();
  writeFileSync(file, deflateSync(Buffer.concat([Buffer.from(`${type} ${String(body.length)}\0`), body])));
}

function mktree(dir: string, entries: Entry[]): string {
  const lines = entries.map(([mode, name, oid]) => {
    const soort = mode === '40000' ? 'tree' : 'blob';
    return `${mode.padStart(6, '0')} ${soort} ${oid}\t${name}\n`;
  });
  return gitIn(dir, lines.join(''), 'mktree');
}

function hashObject(dir: string, text: string): string {
  const file = path.join(tmp('anker-blob-'), 'blob');
  writeFileSync(file, text);
  return git(dir, 'hash-object', '-w', file);
}

// ---------- A1: vertrouwdeTekst ----------

type Lezer = (root: string, sha: string, pad: string) => string | null;
const isLezer = (value: unknown): value is Lezer => typeof value === 'function';
const ONTBREEKT = '<rails/hooks/lib/objecten.mjs ontbreekt of exporteert geen vertrouwdeTekst>';

/** Laadt vertrouwdeTekst dynamisch, zodat een ontbrekende module als falende assertie verschijnt en niet als importfout. */
async function vertrouwdeTekst(root: string, sha: string, pad: string): Promise<string | null> {
  const loaded: unknown = await import(OBJECTEN).catch(() => null);
  const found =
    typeof loaded === 'object' && loaded !== null
      ? Object.entries(loaded).find(([n]) => n === 'vertrouwdeTekst')
      : undefined;
  return isLezer(found?.[1]) ? found[1](root, sha, pad) : ONTBREEKT;
}

function a1Repo() {
  const dir = newRepo();
  const sha = commit(dir, {
    '.claude/gates.json': '{"echt":true}\n',
    'diep/in/map/bestand.txt': 'diep ë\n',
    'script.sh': '#!/bin/sh\n',
  });
  git(dir, 'update-index', '--chmod=+x', 'script.sh');
  symlinkSync('.claude/gates.json', path.join(dir, 'link'));
  git(dir, 'add', 'link');
  git(dir, 'update-index', '--add', '--cacheinfo', `160000,${sha},submodule`);
  git(dir, 'commit', '-q', '-m', 'speciale modi');
  return { dir, sha: git(dir, 'rev-parse', 'HEAD') };
}

describe('A1: vertrouwdeTekst(root, sha, pad)', () => {
  test('A1: geeft de utf8-inhoud van een gewoon bestand, ook diep in een boom en uitvoerbaar', async () => {
    const { dir, sha } = a1Repo();

    expect([
      await vertrouwdeTekst(dir, sha, '.claude/gates.json'),
      await vertrouwdeTekst(dir, sha, 'diep/in/map/bestand.txt'),
      await vertrouwdeTekst(dir, sha, 'script.sh'),
    ]).toStrictEqual(['{"echt":true}\n', 'diep ë\n', '#!/bin/sh\n']);
  });

  test.each([
    { naam: 'een ontbrekend pad', pad: 'bestaat/niet.txt' },
    { naam: 'een ontbrekend bestand in een bestaande map', pad: '.claude/bestaat-niet.json' },
    { naam: 'een tree', pad: 'diep/in' },
    { naam: 'een symlink (120000)', pad: 'link' },
    { naam: 'een submodule (160000)', pad: 'submodule' },
    { naam: 'een pad door een bestand heen', pad: 'script.sh/binnen' },
  ])('A1: $naam geeft null', async ({ pad }) => {
    const { dir, sha } = a1Repo();

    expect(await vertrouwdeTekst(dir, sha, pad)).toBeNull();
  });

  test('A1: een onbekende commit (goede vorm, bestaat niet) en een tree-oid als commit geven null', async () => {
    const { dir, sha } = a1Repo();
    const tree = git(dir, 'rev-parse', `${sha}^{tree}`);

    expect([
      await vertrouwdeTekst(dir, 'a'.repeat(40), '.claude/gates.json'),
      await vertrouwdeTekst(dir, tree, '.claude/gates.json'),
    ]).toStrictEqual([null, null]);
  });

  test('A1: een los vervalst blob-object geeft null (git zelf geeft de vervalste inhoud)', async () => {
    const { dir, sha } = a1Repo();
    const blob = git(dir, 'rev-parse', `${sha}:.claude/gates.json`);
    forgeLoose(dir, blob, { type: 'blob', body: Buffer.from('{"vervalst":true}\n') });
    expect(git(dir, 'cat-file', 'blob', blob)).toContain('vervalst');

    expect(await vertrouwdeTekst(dir, sha, '.claude/gates.json')).toBeNull();
    expect(await vertrouwdeTekst(dir, sha, 'diep/in/map/bestand.txt')).toBe('diep ë\n');
  });

  test('A1: een los vervalst tree-object op het pad geeft null', async () => {
    const { dir, sha } = a1Repo();
    const evil = hashObject(dir, '{"vervalst":true}\n');
    const claude = git(dir, 'rev-parse', `${sha}:.claude`);
    forgeLoose(dir, claude, { type: 'tree', body: treeBody([['100644', 'gates.json', evil]]) });
    expect(git(dir, 'show', `${sha}:.claude/gates.json`)).toContain('vervalst');

    expect(await vertrouwdeTekst(dir, sha, '.claude/gates.json')).toBeNull();
  });

  test('A1: een los vervalst commit-object geeft null', async () => {
    const { dir, sha } = a1Repo();
    const evil = hashObject(dir, '{"vervalst":true}\n');
    const claude = mktree(dir, [['100644', 'gates.json', evil]]);
    const root = mktree(dir, [['40000', '.claude', claude]]);
    const who = 't <t@example.com> 0 +0000';
    forgeLoose(dir, sha, {
      type: 'commit',
      body: Buffer.from(`tree ${root}\nauthor ${who}\ncommitter ${who}\n\nvervalst\n`),
    });
    expect(git(dir, 'show', `${sha}:.claude/gates.json`)).toContain('vervalst');

    expect(await vertrouwdeTekst(dir, sha, '.claude/gates.json')).toBeNull();
  });
});

// ---------- A2: de stub-lader geeft het anker door ----------

const NAMES = ['rolhek', 'werkstraat', 'meting'] as const;
const ECHO_SCRIPT = [
  'const chunks = [];',
  'for await (const chunk of process.stdin) chunks.push(chunk);',
  'process.stdout.write(JSON.stringify({ anker: process.env.RAILS_ANKER ?? null }));',
  'process.exit(0);',
  '',
].join('\n');

function stubRepo() {
  const dir = newRepo();
  mkdirSync(path.join(dir, '.claude/hooks'), { recursive: true });
  for (const file of ['rolhek.mjs', 'werkstraat.mjs', 'meting.mjs', 'laden.mjs'])
    copyFileSync(path.join(STUB_SOURCE, file), path.join(dir, '.claude/hooks', file));
  write(dir, { '.gitignore': '.claude/hooks/.cache/\n' });
  for (const naam of NAMES) write(dir, { [`rails/hooks/${naam}.mjs`]: ECHO_SCRIPT });
  commit(dir, { 'README.md': 'x\n' });
  const bare = tmp('anker-bare-');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  git(dir, 'remote', 'add', 'origin', bare);
  git(dir, 'push', '-q', 'origin', 'main');
  git(dir, 'fetch', '-q', 'origin');
  return dir;
}

function runStub(dir: string, naam: string, extra: { args?: string[]; env?: Record<string, string> } = {}) {
  const result = spawnSync(process.execPath, [path.join(dir, '.claude/hooks', `${naam}.mjs`), ...(extra.args ?? [])], {
    input: '',
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENV, ...extra.env },
  });
  return { status: result.status, stdout: result.stdout };
}

describe('A2: de stub-lader zet RAILS_ANKER op de anker-SHA', () => {
  test.each(NAMES)('A2: %s krijgt de SHA uit .claude/hooks/.cache/main als RAILS_ANKER', (naam) => {
    const dir = stubRepo();
    runStub(dir, 'werkstraat', { args: ['session-start'] });
    const anker = readFileSync(path.join(dir, '.claude/hooks/.cache/main'), 'utf8').trim();

    const result = runStub(dir, naam);

    expect(anker).toBe(git(dir, 'rev-parse', 'origin/main'));
    expect(result.stdout).toBe(JSON.stringify({ anker }));
  });

  test('A2: een RAILS_ANKER uit de omgeving van de aanroeper wordt overschreven door het anker', () => {
    const dir = stubRepo();
    runStub(dir, 'werkstraat', { args: ['session-start'] });
    const anker = readFileSync(path.join(dir, '.claude/hooks/.cache/main'), 'utf8').trim();

    const result = runStub(dir, 'rolhek', { env: { RAILS_ANKER: 'f'.repeat(40) } });

    expect(result.stdout).toBe(JSON.stringify({ anker }));
  });
});

// ---------- A3: readAuthority ----------

const REGISTRY = (check: string) => JSON.stringify({ version: 1, requiredChecks: [check], decisions: [] });
const GEEN_REGISTER = { version: 1, requiredChecks: [], decisions: [] };

/** Twee commits: het anker (A) en een verder gekomen origin/main (B) met andere inhoud. */
function twoBases() {
  const dir = newRepo();
  const a = commit(
    dir,
    { '.claude/gates.json': 'anker-gates\n', '.claude/decisions.json': REGISTRY('anker-check') },
    'anker',
  );
  const b = commit(
    dir,
    { '.claude/gates.json': 'origin-gates\n', '.claude/decisions.json': REGISTRY('origin-check') },
    'origin',
  );
  git(dir, 'update-ref', 'refs/remotes/origin/main', b);
  return { dir, a, b };
}

const lokaal = { repository: 'acme/app', branch: 'feat/x' };

describe('A3: readAuthority zonder base met RAILS_ANKER', () => {
  test('A3: een geldig anker is de vertrouwde basis: trusted en het register komen uit dat anker, niet uit origin/main', () => {
    const { dir, a } = twoBases();
    vi.stubEnv('RAILS_ANKER', a);

    const authority = readAuthority({ root: dir, ...lokaal });

    expect(authority?.trusted('.claude/gates.json')).toBe('anker-gates\n');
    expect(authority?.registry.requiredChecks).toStrictEqual(['anker-check']);
  });

  test('A3: een omgebogen lokale origin/main telt niet', () => {
    const { dir, a } = twoBases();
    git(dir, 'update-ref', 'refs/remotes/origin/main', a);
    const evil = commit(dir, { '.claude/gates.json': 'omgebogen\n' }, 'omgebogen');
    git(dir, 'update-ref', 'refs/remotes/origin/main', evil);
    vi.stubEnv('RAILS_ANKER', a);

    expect(readAuthority({ root: dir, ...lokaal })?.trusted('.claude/gates.json')).toBe('anker-gates\n');
  });

  test('A3: een vervalst blob-object onder het anker geeft null voor dat bestand, de rest blijft leesbaar', () => {
    const { dir, a } = twoBases();
    forgeLoose(dir, git(dir, 'rev-parse', `${a}:.claude/gates.json`), {
      type: 'blob',
      body: Buffer.from('vervalst\n'),
    });
    vi.stubEnv('RAILS_ANKER', a);

    const authority = readAuthority({ root: dir, ...lokaal });

    expect(authority?.trusted('.claude/gates.json')).toBeNull();
    expect(authority?.registry.requiredChecks).toStrictEqual(['anker-check']);
  });

  test('A3: een vervalst register-object onder het anker geeft geen register uit het anker (leeg register)', () => {
    const { dir, a } = twoBases();
    forgeLoose(dir, git(dir, 'rev-parse', `${a}:.claude/decisions.json`), {
      type: 'blob',
      body: Buffer.from(REGISTRY('vervalst')),
    });
    vi.stubEnv('RAILS_ANKER', a);

    expect(readAuthority({ root: dir, ...lokaal })?.registry).toStrictEqual(GEEN_REGISTER);
  });

  test.each([
    { naam: 'geen oid', waarde: 'geen-oid' },
    { naam: 'te kort', waarde: 'abc123' },
    { naam: 'goede vorm maar onbekend object', waarde: 'a'.repeat(40) },
  ])(
    'A3: een gezet maar ongeldig of onleesbaar anker ($naam) geeft null, geen terugval op origin/main',
    ({ waarde }) => {
      const { dir } = twoBases();
      vi.stubEnv('RAILS_ANKER', waarde);

      expect(readAuthority({ root: dir, ...lokaal })).toBeNull();
    },
  );

  test('A3: een anker dat een tree-oid is (geen commit) geeft null', () => {
    const { dir, a } = twoBases();
    vi.stubEnv('RAILS_ANKER', git(dir, 'rev-parse', `${a}^{tree}`));

    expect(readAuthority({ root: dir, ...lokaal })).toBeNull();
  });

  test('A3: zonder RAILS_ANKER ongewijzigd: origin/main is de basis', () => {
    const { dir } = twoBases();

    const authority = readAuthority({ root: dir, ...lokaal });

    expect(authority?.trusted('.claude/gates.json')).toBe('origin-gates\n');
    expect(authority?.registry.requiredChecks).toStrictEqual(['origin-check']);
  });

  test('A3: met een expliciete base ongewijzigd: base wint, ook als RAILS_ANKER gezet is', () => {
    const { dir, a, b } = twoBases();
    vi.stubEnv('RAILS_ANKER', a);

    const authority = readAuthority({ root: dir, base: b, ...lokaal });

    expect(authority?.trusted('.claude/gates.json')).toBe('origin-gates\n');
    expect(authority?.registry.requiredChecks).toStrictEqual(['origin-check']);
  });
});

// ---------- A4: trustedRunner ----------

const GATES_RUNNER = (aan: boolean) => JSON.stringify({ autoRunner: aan });

/** Anker C1 met `anker`, daarop een main-commit C2 met `origin` als omgebogen/verder gekomen origin/main; HEAD staat op een branch van C1. */
function runnerRepo(config: { anker: boolean; origin: boolean }) {
  const dir = newRepo();
  const c1 = commit(
    dir,
    { '.claude/gates.json': GATES_RUNNER(config.anker), 'package.json': '{}\n', 'test/x.test.ts': 'x\n' },
    'c1',
  );
  const c2 = commit(dir, { '.claude/gates.json': GATES_RUNNER(config.origin) }, 'c2');
  git(dir, 'update-ref', 'refs/remotes/origin/main', c2);
  git(dir, 'switch', '-q', '-c', 'feat/runner', c1);
  return { dir, c1, c2 };
}

describe('A4: trustedRunner(root) met RAILS_ANKER', () => {
  test('A4: autoRunner true op het anker, false op een omgebogen origin/main: true', () => {
    const { dir, c1 } = runnerRepo({ anker: true, origin: false });
    vi.stubEnv('RAILS_ANKER', c1);

    expect(trustedRunner(dir)).toBe(true);
  });

  test('A4: autoRunner false op het anker, true op een omgebogen origin/main: false', () => {
    const { dir, c1 } = runnerRepo({ anker: false, origin: true });
    vi.stubEnv('RAILS_ANKER', c1);

    expect(trustedRunner(dir)).toBe(false);
  });

  test('A4: de hostcode-vergelijking gebruikt de merge-base met het anker, niet die met origin/main', () => {
    const dir = newRepo();
    const c1 = commit(dir, { '.claude/gates.json': GATES_RUNNER(true), 'package.json': '{"v":1}\n' }, 'c1');
    const c2 = commit(dir, { 'package.json': '{"v":2}\n' }, 'c2');
    git(dir, 'update-ref', 'refs/remotes/origin/main', c2);
    // HEAD = c1 + niets: gelijk aan het anker. Tegen origin/main (c2) zou package.json als gewijzigd tellen.
    git(dir, 'switch', '-q', '-c', 'feat/runner', c1);
    vi.stubEnv('RAILS_ANKER', c1);

    expect(trustedRunner(dir)).toBe(true);
  });

  test('A4: een vervalst gates.json-object onder het anker geeft false (gecontroleerd gelezen)', () => {
    const { dir, c1 } = runnerRepo({ anker: false, origin: false });
    forgeLoose(dir, git(dir, 'rev-parse', `${c1}:.claude/gates.json`), {
      type: 'blob',
      body: Buffer.from(GATES_RUNNER(true)),
    });
    expect(git(dir, 'show', `${c1}:.claude/gates.json`)).toBe(GATES_RUNNER(true));
    vi.stubEnv('RAILS_ANKER', c1);

    expect(trustedRunner(dir)).toBe(false);
  });

  test('A4: een gezet maar onleesbaar anker geeft false, ook als origin/main autoRunner true heeft', () => {
    const { dir } = runnerRepo({ anker: true, origin: true });
    vi.stubEnv('RAILS_ANKER', 'a'.repeat(40));

    expect(trustedRunner(dir)).toBe(false);
  });

  test('A4: zonder RAILS_ANKER ongewijzigd: origin/main bepaalt', () => {
    const aan = runnerRepo({ anker: false, origin: true });
    const uit = runnerRepo({ anker: true, origin: false });

    expect([trustedRunner(aan.dir), trustedRunner(uit.dir)]).toStrictEqual([true, false]);
  });
});

// ---------- A5: het rolhek-script ----------

const echteConfig = (): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(readFileSync('.claude/gates.json', 'utf8'));
  return typeof parsed === 'object' && parsed !== null ? { ...parsed } : {};
};
const VOOR = (voorReview: string[]) => JSON.stringify({ ...echteConfig(), voorReview }, null, 2);

interface Opzet {
  /** gates.json op origin/main (de lokale, ombuigbare ref) */
  origin: string;
  /** gates.json van het anker; ontbreekt: het anker bevat geen .claude/gates.json */
  anker: string | null;
  /** gates.json in de werkmap (ongecommit) */
  werk?: string;
}

/** Repo met origin/main (eerste commit, github-url zonder netwerk), het anker als tweede commit en een werkmap. */
function scriptRepo(opzet: Opzet) {
  const dir = newRepo();
  commit(dir, { '.claude/gates.json': opzet.origin, 'README.md': 'x\n' }, 'origin');
  const bare = tmp('anker-bare-');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  git(dir, 'remote', 'add', 'origin', bare);
  git(dir, 'push', '-q', 'origin', 'main');
  git(dir, 'fetch', '-q', 'origin');
  git(dir, 'remote', 'set-url', 'origin', 'https://github.com/acme/app.git');
  git(dir, 'switch', '-q', '-c', 'feat/x');
  if (opzet.anker === null) {
    git(dir, 'rm', '-q', '.claude/gates.json');
    git(dir, 'commit', '-q', '--allow-empty', '-m', 'anker zonder gates');
  } else commit(dir, { '.claude/gates.json': opzet.anker }, 'anker');
  const anker = git(dir, 'rev-parse', 'HEAD');
  if (opzet.werk !== undefined) write(dir, { '.claude/gates.json': opzet.werk });
  return { dir, anker };
}

function runRolhek(dir: string, env: Record<string, string>) {
  const payload = { tool_name: 'Write', tool_input: { file_path: `${dir}/scripts/x.ts`, content: 'x\n' }, cwd: dir };
  const base: Record<string, string | undefined> = { ...process.env, ...GIT_ENV, CLAUDE_PROJECT_DIR: dir };
  delete base['RAILS_ANKER'];
  const result = spawnSync('node', [ROLHEK_SCRIPT], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...base, ...env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const asks = (stdout: string) => stdout.includes('"permissionDecision":"ask"');

describe('A5: rolhek-script met RAILS_ANKER: configuratie uit het anker, nooit uit de werkmap', () => {
  test('A5: gates.json van het anker bepaalt voorReview: scripts/** in het anker maar niet in origin/main of werkmap: ask', () => {
    const { dir, anker } = scriptRepo({
      origin: VOOR(['AGENTS.md']),
      anker: VOOR(['scripts/**']),
      werk: VOOR(['AGENTS.md']),
    });

    const result = runRolhek(dir, { RAILS_ANKER: anker });

    expect([result.status, asks(result.stdout)]).toStrictEqual([0, true]);
  });

  test('A5: andersom: scripts/** in origin/main en werkmap maar niet in het anker: geen ask', () => {
    const { dir, anker } = scriptRepo({
      origin: VOOR(['scripts/**']),
      anker: VOOR(['AGENTS.md']),
      werk: VOOR(['scripts/**']),
    });

    const result = runRolhek(dir, { RAILS_ANKER: anker });

    expect([result.status, asks(result.stdout)]).toStrictEqual([0, false]);
    expect(result.stdout).toContain('beschermd pad');
  });

  test.each([
    { naam: 'een ontbrekend object', waarde: (): string => 'a'.repeat(40) },
    { naam: 'geen oid', waarde: (): string => 'geen-oid' },
  ])('A5: een gezet maar $naam anker: exit 2 en geen terugval op de geldige gates.json in de werkmap', ({ waarde }) => {
    const { dir } = scriptRepo({
      origin: VOOR(['scripts/**']),
      anker: VOOR(['scripts/**']),
      werk: VOOR(['scripts/**']),
    });

    const result = runRolhek(dir, { RAILS_ANKER: waarde() });

    expect(result.status).toBe(2);
    expect(result.stderr.trim()).not.toBe('');
  });

  test('A5: een anker zonder .claude/gates.json: exit 2, geen terugval op werkmap of origin/main', () => {
    const { dir, anker } = scriptRepo({ origin: VOOR(['scripts/**']), anker: null, werk: VOOR(['scripts/**']) });

    expect(runRolhek(dir, { RAILS_ANKER: anker }).status).toBe(2);
  });

  test('A5: een vervalst gates.json-object onder het anker: exit 2', () => {
    const { dir, anker } = scriptRepo({ origin: VOOR(['scripts/**']), anker: VOOR(['scripts/**']) });
    forgeLoose(dir, git(dir, 'rev-parse', `${anker}:.claude/gates.json`), {
      type: 'blob',
      body: Buffer.from(VOOR([])),
    });

    expect(runRolhek(dir, { RAILS_ANKER: anker }).status).toBe(2);
  });

  test('A5: zonder RAILS_ANKER ongewijzigd: de configuratie komt uit origin/main, niet uit de werkmap', () => {
    const { dir } = scriptRepo({ origin: VOOR(['scripts/**']), anker: VOOR(['AGENTS.md']), werk: VOOR(['AGENTS.md']) });

    const result = runRolhek(dir, {});

    expect([result.status, asks(result.stdout)]).toStrictEqual([0, true]);
  });

  test('A5: zonder RAILS_ANKER en zonder bruikbare origin/main ongewijzigd: de werkmap-gates.json telt', () => {
    const dir = newRepo();
    write(dir, { '.claude/gates.json': VOOR(['scripts/**']) });

    const result = runRolhek(dir, {});

    expect([result.status, asks(result.stdout)]).toStrictEqual([0, true]);
    expect(existsSync(path.join(dir, '.claude/gates.json'))).toBe(true);
  });
});
