import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

// ADR 0033 punt 1: hooks draaien van main. Een stub in .claude/hooks/ voert rails/hooks/<naam>.mjs uit zoals die op
// de remote main staat (anker .claude/hooks/.cache/main, cache .claude/hooks/.cache/<tree-oid>/). Echte tijdelijke repo's met een lokale bare remote; het echte netwerk komt er nooit aan te pas.
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

/** Standaard exitcode van het script van main: het rolhek gebruikt 2, de andere hooks 7. */
function defaultExit(naam: Naam): string {
  return naam === 'rolhek' ? '2' : '7';
}

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

/** Een klein hookscript dat zijn omgeving echoot, een helper uit ./lib importeert en met HOOK_EXIT stopt. */
function scriptSource(version: string): string {
  return [
    "import { writeFileSync } from 'node:fs';",
    "import { helper } from './lib/helper.mjs';",
    'const chunks = [];',
    'for await (const chunk of process.stdin) chunks.push(chunk);',
    "if (process.env.RAN_FILE) writeFileSync(process.env.RAN_FILE, '1');",
    "if (process.env.HOOK_CRASH) throw new Error('crash-van-main');",
    'process.stdout.write(JSON.stringify({',
    `  marker: ${JSON.stringify(version)},`,
    '  helper,',
    '  args: process.argv.slice(2),',
    "  stdin: Buffer.concat(chunks).toString('utf8'),",
    '  cwd: process.cwd(),',
    '  env: process.env.HOOK_ENV,',
    '}));',
    "process.stderr.write('stderr-van-main');",
    "process.exit(Number(process.env.HOOK_EXIT ?? '0'));",
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

/** Repo met main (stubs + `files`), een bare origin en een tweede kloon waarmee we de remote main kunnen verleggen. */
function makeRepo(files: Record<string, string>): Repo {
  const dir = tmp('hvm-repo-');
  git(dir, 'init', '-q', '-b', 'main');
  mkdirSync(path.join(dir, '.claude/hooks'), { recursive: true });
  for (const file of STUB_FILES) {
    const source = path.join(STUB_SOURCE, file);
    if (existsSync(source)) copyFileSync(source, path.join(dir, '.claude/hooks', file));
  }
  write(dir, { 'README.md': 'x\n', ...files });
  // De cache en het anker horen niet in git (anders wijzigt een run de werkmap).
  writeFileSync(path.join(dir, '.gitignore'), '.claude/hooks/.cache/\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  const bare = tmp('hvm-bare-');
  const other = path.join(tmp('hvm-other-'), 'clone');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  git(dir, 'remote', 'add', 'origin', bare);
  git(dir, 'push', '-q', 'origin', 'main');
  git(dir, 'fetch', '-q', 'origin');
  git(path.dirname(other), 'clone', '-q', bare, other);
  return { dir, bare, other };
}

/** Zet nieuwe bestanden op de remote main; met `fetch` ziet de lokale origin/main ze ook. */
function advanceRemote(repo: Repo, files: Record<string, string>, fetch = false) {
  write(repo.other, files);
  git(repo.other, 'add', '-A');
  git(repo.other, 'commit', '-q', '-m', 'advance');
  git(repo.other, 'push', '-q', 'origin', 'main');
  if (fetch) git(repo.dir, 'fetch', '-q', 'origin');
}

function pushSymlink(repo: Repo) {
  const link = path.join(repo.other, 'rails/hooks/lib/link');
  mkdirSync(path.dirname(link), { recursive: true });
  symlinkSync('/etc/passwd', link);
  git(repo.other, 'add', '-A');
  git(repo.other, 'commit', '-q', '-m', 'symlink');
  git(repo.other, 'push', '-q', 'origin', 'main');
}

function breakRemote(repo: Repo) {
  git(repo.dir, 'remote', 'set-url', 'origin', path.join(repo.bare, 'bestaat-niet'));
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
    env: { ...process.env, ...GIT_ENV, HOOK_EXIT: defaultExit(naam), ...options.env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function expected(version: string, fields: { args: string[]; stdin: string; cwd: string; env: string }) {
  return JSON.stringify({ marker: version, helper: 'helper-ok', ...fields });
}

const cacheDir = (repo: Repo) => path.join(repo.dir, '.claude/hooks/.cache');
const anchorFile = (repo: Repo) => path.join(cacheDir(repo), 'main');
const remoteSha = (repo: Repo) => git(repo.bare, 'rev-parse', 'main');
const treeMap = (repo: Repo, sha: string) =>
  path.join(cacheDir(repo), git(repo.other, 'rev-parse', `${sha}:rails/hooks`));
const cacheMaps = (repo: Repo) =>
  existsSync(cacheDir(repo)) ? readdirSync(cacheDir(repo)).filter((entry) => /^[0-9a-f]{40}$/.test(entry)) : [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('punt 1: de stub draait rails/hooks/<naam>.mjs van main, transparant', () => {
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
        status: Number(defaultExit(naam)),
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
      2,
      expected('main-versie', { args: [], stdin: '', cwd: realpathSync(elders), env: 'e' }),
    ]);
  });
});

describe('punt 1/E: exitcodes van het script', () => {
  test('E: rolhek met een exitcode van het script anders dan 0 of 2 (7) wordt exit 2, uitvoer blijft doorgegeven', () => {
    const repo = makeRepo(hookFiles('main-versie'));

    const result = run(repo, 'rolhek', { env: { HOOK_EXIT: '7' } });

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"marker":"main-versie"');
    expect(result.stderr).toContain('stderr-van-main');
  });

  test('E: rolhek met exit 0 van het script blijft 0', () => {
    const repo = makeRepo(hookFiles('main-versie'));

    const result = run(repo, 'rolhek', { env: { HOOK_EXIT: '0' } });

    expect([result.status, result.stdout]).toStrictEqual([0, expect.stringContaining('"marker":"main-versie"')]);
  });

  test('E: een crash van rolhek.mjs wordt exit 2', () => {
    const repo = makeRepo(hookFiles('main-versie'));

    const result = run(repo, 'rolhek', { env: { HOOK_CRASH: '1' } });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('crash-van-main');
  });

  test.each(['werkstraat', 'meting'] as const)(
    'E: %s geeft de exitcode van het script ongewijzigd door (7 en 0)',
    (naam) => {
      const repo = makeRepo(hookFiles('main-versie'));

      const zeven = run(repo, naam, { env: { HOOK_EXIT: '7' } });
      const nul = run(repo, naam, { env: { HOOK_EXIT: '0' } });

      expect([zeven.status, nul.status]).toStrictEqual([7, 0]);
    },
  );
});

describe('punt 2: lokale wijzigingen hebben geen effect', () => {
  test('2: een ongecommitte en een op de branch gecommitte wijziging aan rails/hooks worden genegeerd', () => {
    const repo = makeRepo(hookFiles('main-versie'));
    git(repo.dir, 'checkout', '-q', '-b', 'feat/x');
    write(repo.dir, hookFiles('branch-versie'));
    git(repo.dir, 'add', '-A');
    git(repo.dir, 'commit', '-q', '-m', 'branch');
    write(repo.dir, hookFiles('werkmap-versie'));

    const result = run(repo, 'rolhek');

    expect(result.stdout).toContain('"marker":"main-versie"');
    expect(result.stdout).not.toContain('branch-versie');
    expect(result.stdout).not.toContain('werkmap-versie');
  });
});

describe('punt A: anker van de remote, niet van de lokale origin/main', () => {
  test('A: een lokale refs/remotes/origin/main met andere hooks wint niet van de remote', () => {
    const repo = makeRepo(hookFiles('main-versie'));
    git(repo.dir, 'checkout', '-q', '-b', 'lokaal');
    write(repo.dir, hookFiles('lokale-versie'));
    git(repo.dir, 'add', '-A');
    git(repo.dir, 'commit', '-q', '-m', 'lokaal');
    git(repo.dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    git(repo.dir, 'checkout', '-q', 'main');

    const result = run(repo, 'rolhek');

    expect(result.stdout).toContain('"marker":"main-versie"');
    expect(result.stdout).not.toContain('lokale-versie');
  });

  test('A: het anker .claude/hooks/.cache/main krijgt de commit-SHA van de remote main', () => {
    const repo = makeRepo(hookFiles('main-versie'));

    run(repo, 'rolhek');

    expect(readFileSync(anchorFile(repo), 'utf8').trim()).toBe(remoteSha(repo));
  });

  test('A: bij een bestaand anker draait een gewone aanroep de oude versie; werkstraat session-start ververst het anker', () => {
    const repo = makeRepo(hookFiles('main-versie'));
    run(repo, 'rolhek');
    advanceRemote(repo, hookFiles('main-versie-2'));

    const gewoon = run(repo, 'rolhek');
    run(repo, 'werkstraat', { args: ['session-start'] });
    const ververst = readFileSync(anchorFile(repo), 'utf8').trim();
    const daarna = run(repo, 'rolhek');

    expect(gewoon.stdout).toContain('"marker":"main-versie"');
    expect(ververst).toBe(remoteSha(repo));
    expect(daarna.stdout).toContain('"marker":"main-versie-2"');
  });

  test('A: mislukt het verversen en bestaat er een anker, dan blijft het oude anker gelden', () => {
    const repo = makeRepo(hookFiles('main-versie'));
    run(repo, 'rolhek');
    const oud = readFileSync(anchorFile(repo), 'utf8').trim();
    advanceRemote(repo, hookFiles('main-versie-2'));
    breakRemote(repo);

    run(repo, 'werkstraat', { args: ['session-start'] });
    const result = run(repo, 'rolhek');

    expect(readFileSync(anchorFile(repo), 'utf8').trim()).toBe(oud);
    expect(result.stdout).toContain('"marker":"main-versie"');
    expect(result.stdout).not.toContain('main-versie-2');
  });

  test('A: staat de hook niet in de tree van het anker, dan wordt het anker ververst', () => {
    const repo = makeRepo(hookFiles('main-versie', ['werkstraat']));
    run(repo, 'werkstraat');
    advanceRemote(repo, hookFiles('main-versie-2', ['rolhek']));

    const result = run(repo, 'rolhek');

    expect(result.stdout).toContain('"marker":"main-versie-2"');
  });
});

describe('punt B: cache naast de stub, op tree-oid van het anker', () => {
  test('B: uitgepakt in .claude/hooks/.cache/<tree-oid>/ (niet in de git common dir) en bij de tweede aanroep hergebruikt', () => {
    const repo = makeRepo(hookFiles('main-versie'));
    const map = treeMap(repo, remoteSha(repo));

    run(repo, 'rolhek');
    const eerste = statSync(path.join(map, 'rolhek.mjs'));
    const tweede = run(repo, 'rolhek');
    const na = statSync(path.join(map, 'rolhek.mjs'));

    expect(tweede.stdout).toContain('"marker":"main-versie"');
    expect(cacheMaps(repo)).toStrictEqual([path.basename(map)]);
    expect([na.ino, na.mtimeMs]).toStrictEqual([eerste.ino, eerste.mtimeMs]);
    expect(existsSync(path.join(repo.dir, '.git/rails-hooks'))).toBe(false);
  });

  test('B: een nieuwe remote main met andere inhoud geeft een nieuwe map en de nieuwe versie draait', () => {
    const repo = makeRepo(hookFiles('main-versie'));
    run(repo, 'rolhek');
    advanceRemote(repo, hookFiles('main-versie-2'));
    run(repo, 'werkstraat', { args: ['session-start'] });

    const result = run(repo, 'rolhek');

    expect(result.stdout).toContain('"marker":"main-versie-2"');
    expect(cacheMaps(repo)).toHaveLength(2);
  });
});

describe('punt C: integriteit van een bestaande cachemap', () => {
  const tampers: Record<string, (map: string) => void> = {
    'een gewijzigd bestand': (map) => {
      writeFileSync(path.join(map, 'rolhek.mjs'), "console.log('gemanipuleerd');\n");
    },
    'een verwijderd bestand': (map) => {
      rmSync(path.join(map, 'lib/helper.mjs'));
    },
    'een extra bestand': (map) => {
      writeFileSync(path.join(map, 'extra.mjs'), "console.log('extra');\n");
    },
  };

  test.each(Object.keys(tampers))('C: %s: de lader pakt opnieuw uit en draait de echte versie van main', (naam) => {
    const repo = makeRepo(hookFiles('main-versie'));
    const map = treeMap(repo, remoteSha(repo));
    run(repo, 'rolhek');
    tampers[naam]?.(map);

    const result = run(repo, 'rolhek');

    expect(result.stdout).toContain('"marker":"main-versie"');
    expect(result.stdout).toContain('"helper":"helper-ok"');
    expect(result.stdout).not.toContain('gemanipuleerd');
    expect(existsSync(path.join(map, 'extra.mjs'))).toBe(false);
  });
});

describe('punt D: replace-objecten tellen niet', () => {
  test('D: git replace op de blob van rolhek.mjs verandert niet wat er draait (lege cache)', () => {
    const repo = makeRepo(hookFiles('main-versie'));
    const nep = path.join(tmp('hvm-nep-'), 'nep.mjs');
    writeFileSync(nep, scriptSource('vervangen-versie'));
    const echt = git(repo.dir, 'rev-parse', 'origin/main:rails/hooks/rolhek.mjs');
    git(repo.dir, 'replace', echt, git(repo.dir, 'hash-object', '-w', nep));

    const result = run(repo, 'rolhek');

    expect(result.stdout).toContain('"marker":"main-versie"');
    expect(result.stdout).not.toContain('vervangen-versie');
  });
});

describe('punt 4: relatieve imports', () => {
  test('4: ./lib/helper.mjs wordt in de uitgepakte versie gevonden', () => {
    const repo = makeRepo(hookFiles('main-versie'));

    const result = run(repo, 'werkstraat');

    expect(result.status).toBe(7);
    expect(result.stdout).toContain('"helper":"helper-ok"');
  });
});

describe('punt E: faalgedrag (rolhek en werkstraat dicht, meting open)', () => {
  const uitkomst = (naam: Naam) => (naam === 'meting' ? 0 : 2);

  function verwacht(naam: Naam, ran: string, result: ReturnType<typeof run>) {
    expect([result.status, existsSync(ran)]).toStrictEqual([uitkomst(naam), false]);
    if (naam !== 'meting') expect(result.stderr.trim()).not.toBe('');
  }

  test.each(NAMES)('E: %s zonder anker en met onbereikbare remote', (naam) => {
    const ran = path.join(tmp('hvm-ran-'), 'ran');
    const repo = makeRepo(hookFiles('main-versie'));
    breakRemote(repo);

    verwacht(naam, ran, run(repo, naam, { env: { RAN_FILE: ran } }));
  });

  test.each(NAMES)('E: %s als zijn script niet op main staat (ook na verversen)', (naam) => {
    const ran = path.join(tmp('hvm-ran-'), 'ran');
    const repo = makeRepo(
      hookFiles(
        'main-versie',
        NAMES.filter((andere) => andere !== naam),
      ),
    );

    verwacht(naam, ran, run(repo, naam, { env: { RAN_FILE: ran } }));
  });

  test.each(NAMES)('E: %s als main onder rails/hooks een symlink bevat', (naam) => {
    const ran = path.join(tmp('hvm-ran-'), 'ran');
    const repo = makeRepo(hookFiles('main-versie'));
    pushSymlink(repo);

    verwacht(naam, ran, run(repo, naam, { env: { RAN_FILE: ran } }));
  });
});

describe('punt F: bootstrap zonder anker', () => {
  test.each(NAMES)('F: %s haalt main op als de lokale origin/main rails/hooks mist en draait main-versie', (naam) => {
    const repo = makeRepo({});
    expect(() => git(repo.dir, 'rev-parse', 'origin/main:rails/hooks')).toThrow();
    advanceRemote(repo, hookFiles('main-versie'));

    const result = run(repo, naam);

    expect(result.status).toBe(Number(defaultExit(naam)));
    expect(result.stdout).toContain('"marker":"main-versie"');
  });
});
