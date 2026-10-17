import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

// ADR 0033 punt 1: hooks draaien van main. Een stub in .claude/hooks/ voert rails/hooks/<naam>.mjs uit zoals die op
// origin/main staat. Echte tijdelijke repo's met een lokale bare remote; het echte netwerk komt er nooit aan te pas.
const STUB_SOURCE = path.join(process.cwd(), '.claude/hooks');
const STUB_FILES = ['rolhek.mjs', 'werkstraat.mjs', 'meting.mjs', 'laden.mjs'];
const NAMES = ['rolhek', 'werkstraat', 'meting'] as const;
type Naam = (typeof NAMES)[number];
const dirs: string[] = [];

const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

const EXIT_MAIN = 7;

function tmp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

/** Een klein hookscript dat zijn omgeving echoot, een helper uit ./lib importeert en met EXIT_MAIN stopt. */
function scriptSource(version: string): string {
  return [
    "import { writeFileSync } from 'node:fs';",
    "import { helper } from './lib/helper.mjs';",
    'const chunks = [];',
    'for await (const chunk of process.stdin) chunks.push(chunk);',
    "if (process.env.RAN_FILE) writeFileSync(process.env.RAN_FILE, '1');",
    'process.stdout.write(JSON.stringify({',
    `  marker: ${JSON.stringify(version)},`,
    '  helper,',
    '  args: process.argv.slice(2),',
    "  stdin: Buffer.concat(chunks).toString('utf8'),",
    '  cwd: process.cwd(),',
    '  env: process.env.HOOK_ENV,',
    '}));',
    "process.stderr.write('stderr-van-main');",
    `process.exit(${String(EXIT_MAIN)});`,
    '',
  ].join('\n');
}

function hookFiles(version: string, names: readonly Naam[] = NAMES): Record<string, string> {
  const files: Record<string, string> = { 'rails/hooks/lib/helper.mjs': "export const helper = 'helper-ok';\n" };
  for (const naam of names) files[`rails/hooks/${naam}.mjs`] = scriptSource(version);
  return files;
}

function write(dir: string, files: Record<string, string>) {
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), content);
  }
}

interface Repo {
  dir: string;
  bare: string;
  other: string;
}

/** Repo met main (stubs + `files`), een bare origin en een tweede kloon waarmee we origin/main kunnen verleggen. */
function makeRepo(files: Record<string, string>, remote = true): Repo {
  const dir = tmp('hvm-repo-');
  git(dir, 'init', '-q', '-b', 'main');
  mkdirSync(path.join(dir, '.claude/hooks'), { recursive: true });
  for (const file of STUB_FILES) {
    const source = path.join(STUB_SOURCE, file);
    if (existsSync(source)) copyFileSync(source, path.join(dir, '.claude/hooks', file));
  }
  write(dir, { 'README.md': 'x\n', ...files });
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  const bare = tmp('hvm-bare-');
  const other = path.join(tmp('hvm-other-'), 'clone');
  if (remote) {
    git(bare, 'init', '-q', '--bare', '-b', 'main');
    git(dir, 'remote', 'add', 'origin', bare);
    git(dir, 'push', '-q', 'origin', 'main');
    git(dir, 'fetch', '-q', 'origin');
    git(path.dirname(other), 'clone', '-q', bare, other);
  }
  return { dir, bare, other };
}

/** Zet nieuwe bestanden op de remote main; met `fetch` ziet de lokale origin/main ze ook. */
function advanceRemote(repo: Repo, files: Record<string, string>, fetch: boolean) {
  write(repo.other, files);
  git(repo.other, 'add', '-A');
  git(repo.other, 'commit', '-q', '-m', 'advance');
  git(repo.other, 'push', '-q', 'origin', 'main');
  if (fetch) git(repo.dir, 'fetch', '-q', 'origin');
}

interface RunOptions {
  args?: string[];
  input?: string;
  cwd?: string;
  env?: Record<string, string>;
}

function run(repo: Repo, naam: Naam, options: RunOptions = {}) {
  const stub = path.join(repo.dir, '.claude/hooks', `${naam}.mjs`);
  const result = spawnSync(process.execPath, [stub, ...(options.args ?? [])], {
    input: options.input ?? '',
    cwd: options.cwd ?? repo.dir,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENV, ...options.env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function expected(version: string, fields: { args: string[]; stdin: string; cwd: string; env: string }) {
  return JSON.stringify({ marker: version, helper: 'helper-ok', ...fields });
}

function cacheRoot(repo: Repo): string {
  const common = git(repo.dir, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  return path.join(common, 'rails-hooks');
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('hooks-van-main punt 1: stub draait rails/hooks/<naam>.mjs van origin/main, transparant', () => {
  test.each(NAMES)(
    '1: %s geeft args, stdin, env en cwd door en laat stdout, stderr en exitcode ongewijzigd',
    (naam) => {
      const repo = makeRepo(hookFiles('main-versie'));
      const sub = path.join(repo.dir, 'sub');
      mkdirSync(sub);

      const result = run(repo, naam, {
        args: ['--a', 'b c'],
        input: 'stdin-inhoud',
        cwd: sub,
        env: { HOOK_ENV: 'env-waarde' },
      });

      expect(result).toStrictEqual({
        status: EXIT_MAIN,
        stdout: expected('main-versie', {
          args: ['--a', 'b c'],
          stdin: 'stdin-inhoud',
          cwd: realpathSync(sub),
          env: 'env-waarde',
        }),
        stderr: 'stderr-van-main',
      });
    },
  );

  test('1: de repo volgt uit de map van de stub, niet uit de cwd', () => {
    const repo = makeRepo(hookFiles('main-versie'));
    const elders = tmp('hvm-elders-');

    const result = run(repo, 'rolhek', { cwd: elders, env: { HOOK_ENV: 'e' } });

    expect([result.status, result.stdout]).toStrictEqual([
      EXIT_MAIN,
      expected('main-versie', { args: [], stdin: '', cwd: realpathSync(elders), env: 'e' }),
    ]);
  });
});

describe('hooks-van-main punt 2: lokale wijzigingen hebben geen effect', () => {
  test('2: een ongecommitte en een op de branch gecommitte wijziging aan rails/hooks worden genegeerd', () => {
    const repo = makeRepo(hookFiles('main-versie'));
    git(repo.dir, 'checkout', '-q', '-b', 'feat/x');
    write(repo.dir, hookFiles('branch-versie'));
    git(repo.dir, 'add', '-A');
    git(repo.dir, 'commit', '-q', '-m', 'branch');
    write(repo.dir, hookFiles('werkmap-versie'));

    const result = run(repo, 'rolhek');

    expect(result.status).toBe(EXIT_MAIN);
    expect(result.stdout).toContain('"marker":"main-versie"');
    expect(result.stdout).not.toContain('branch-versie');
    expect(result.stdout).not.toContain('werkmap-versie');
  });
});

describe('hooks-van-main punt 3: cache op tree-oid in de git common dir', () => {
  test('3: uitgepakt in <common dir>/rails-hooks/<tree-oid> en bij de tweede aanroep hergebruikt', () => {
    const repo = makeRepo(hookFiles('main-versie'));
    const tree = git(repo.dir, 'rev-parse', 'origin/main:rails/hooks');
    const map = path.join(cacheRoot(repo), tree);

    run(repo, 'rolhek');
    const naEerste = existsSync(path.join(map, 'rolhek.mjs'));
    mkdirSync(map, { recursive: true });
    writeFileSync(path.join(map, 'sentinel'), 'x');
    const tweede = run(repo, 'rolhek');

    expect(naEerste).toBe(true);
    expect(tweede.stdout).toContain('"marker":"main-versie"');
    expect(readdirSync(cacheRoot(repo))).toStrictEqual([tree]);
    expect(existsSync(path.join(map, 'sentinel'))).toBe(true);
  });

  test('3: een nieuwe origin/main met andere inhoud geeft een nieuwe map en de nieuwe versie draait', () => {
    const repo = makeRepo(hookFiles('main-versie'));
    run(repo, 'rolhek');

    advanceRemote(repo, hookFiles('main-versie-2'), true);
    const result = run(repo, 'rolhek');

    expect(result.stdout).toContain('"marker":"main-versie-2"');
    expect(readdirSync(cacheRoot(repo))).toHaveLength(2);
  });

  test('3: een worktree deelt de cache met de hoofdrepo', () => {
    const repo = makeRepo(hookFiles('main-versie'));
    const wt = path.join(tmp('hvm-wt-'), 'wt');
    git(repo.dir, 'worktree', 'add', '-q', '-b', 'feat/wt', wt);
    const tree = git(repo.dir, 'rev-parse', 'origin/main:rails/hooks');
    const worktreeRepo: Repo = { ...repo, dir: wt };

    const result = run(worktreeRepo, 'rolhek');

    expect(result.stdout).toContain('"marker":"main-versie"');
    expect(existsSync(path.join(cacheRoot(repo), tree, 'rolhek.mjs'))).toBe(true);
    expect(existsSync(path.join(wt, '.git', 'rails-hooks'))).toBe(false);
  });
});

describe('hooks-van-main punt 4: relatieve imports', () => {
  test('4: ./lib/helper.mjs wordt in de uitgepakte versie gevonden', () => {
    const repo = makeRepo(hookFiles('main-versie'));

    const result = run(repo, 'werkstraat');

    expect(result.status).toBe(EXIT_MAIN);
    expect(result.stdout).toContain('"helper":"helper-ok"');
  });
});

describe('hooks-van-main punt 5: faalgedrag', () => {
  test('5: rolhek faalt dicht zonder origin/main (exit 2, reden op stderr)', () => {
    const repo = makeRepo(hookFiles('main-versie'), false);

    const result = run(repo, 'rolhek');

    expect(result.status).toBe(2);
    expect(result.stderr.trim()).not.toBe('');
  });

  test('5: rolhek faalt dicht als rails/hooks/rolhek.mjs niet op origin/main staat, ook na een fetch', () => {
    const repo = makeRepo(hookFiles('main-versie', ['werkstraat']));

    const result = run(repo, 'rolhek');

    expect(result.status).toBe(2);
    expect(result.stderr.trim()).not.toBe('');
    expect(result.stdout).not.toContain('main-versie');
  });

  test('5: rolhek faalt dicht als origin/main onder rails/hooks een symlink bevat', () => {
    const ran = path.join(tmp('hvm-ran-'), 'ran');
    const repo = makeRepo(hookFiles('main-versie'));
    const link = path.join(repo.other, 'rails/hooks/lib/link');
    mkdirSync(path.dirname(link), { recursive: true });
    symlinkSync('/etc/passwd', link);
    git(repo.other, 'add', '-A');
    git(repo.other, 'commit', '-q', '-m', 'symlink');
    git(repo.other, 'push', '-q', 'origin', 'main');
    git(repo.dir, 'fetch', '-q', 'origin');

    const result = run(repo, 'rolhek', { env: { RAN_FILE: ran } });

    expect(result.status).toBe(2);
    expect(result.stderr.trim()).not.toBe('');
    expect(existsSync(ran)).toBe(false);
  });

  test.each(['werkstraat', 'meting'] as const)('5: %s faalt open zonder origin/main (exit 0)', (naam) => {
    const ran = path.join(tmp('hvm-ran-'), 'ran');
    const repo = makeRepo(hookFiles('main-versie'), false);

    const result = run(repo, naam, { env: { RAN_FILE: ran } });

    expect([result.status, existsSync(ran)]).toStrictEqual([0, false]);
  });

  test.each(['werkstraat', 'meting'] as const)(
    '5: %s faalt open als zijn script niet op origin/main staat (exit 0)',
    (naam) => {
      const ran = path.join(tmp('hvm-ran-'), 'ran');
      const repo = makeRepo(hookFiles('main-versie', ['rolhek']));

      const result = run(repo, naam, { env: { RAN_FILE: ran } });

      expect([result.status, existsSync(ran)]).toStrictEqual([0, false]);
    },
  );

  test.each(['werkstraat', 'meting'] as const)(
    '5: %s faalt open bij een symlink onder rails/hooks en draait niets',
    (naam) => {
      const ran = path.join(tmp('hvm-ran-'), 'ran');
      const repo = makeRepo(hookFiles('main-versie'));
      const link = path.join(repo.other, 'rails/hooks/lib/link');
      mkdirSync(path.dirname(link), { recursive: true });
      symlinkSync('/etc/passwd', link);
      git(repo.other, 'add', '-A');
      git(repo.other, 'commit', '-q', '-m', 'symlink');
      git(repo.other, 'push', '-q', 'origin', 'main');
      git(repo.dir, 'fetch', '-q', 'origin');

      const result = run(repo, naam, { env: { RAN_FILE: ran } });

      expect([result.status, existsSync(ran)]).toStrictEqual([0, false]);
    },
  );
});

describe('hooks-van-main punt 6: ontbrekend script lokaal, aanwezig op de remote', () => {
  test.each(NAMES)('6: %s haalt origin/main eenmalig op en draait daarna de opgehaalde versie', (naam) => {
    const repo = makeRepo(hookFiles('oud', []));
    expect(() => git(repo.dir, 'rev-parse', `origin/main:rails/hooks/${naam}.mjs`)).toThrow();
    advanceRemote(repo, hookFiles('main-versie'), false);

    const result = run(repo, naam);

    expect(result.status).toBe(EXIT_MAIN);
    expect(result.stdout).toContain('"marker":"main-versie"');
    expect(git(repo.dir, 'rev-parse', `origin/main:rails/hooks/${naam}.mjs`)).not.toBe('');
  });
});
