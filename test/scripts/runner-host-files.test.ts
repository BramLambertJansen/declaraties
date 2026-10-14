import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

// docs/specs/taakmandaat-vervolg.md, B3: mandate-follow-up/AC-15 (twee HOST_FILES-lijsten blijven gelijk), AC-16 (compose.*.yaml
// als pathspec), AC-17 en AC-24 (genegeerde en onveilige hostbestanden). Zoals runner-guard.test.ts: tijdelijke repo's met een
// docker-stub; "voorbij de guard" is waarneembaar doordat de stub elke aanroep logt.
const ROOT = path.join(import.meta.dirname, '../..');
const SCRIPT = readFileSync(path.join(ROOT, 'scripts/runner.sh'), 'utf8');
const AUTHORITY_MODULE = ['../../.claude/hooks/lib', 'runner-authority.mjs'].join('/');
const dirs: string[] = [];

const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// --- AC-15: de twee lijsten blijven gelijk ---------------------------------------------------------------------------------------

/** De `HOST_FILES=( … )`-array letterlijk uit runner.sh: tot de sluitende `)`, `#`-commentaar genegeerd, quotes gestript. */
function hostFilesUit(script: string): string[] {
  const begin = script.indexOf('HOST_FILES=(');
  if (begin === -1) throw new Error('HOST_FILES=( ontbreekt');
  const rest = script.slice(begin + 'HOST_FILES=('.length);
  const body = rest.slice(0, rest.indexOf(')'));
  return body
    .split('\n')
    .map((regel) => regel.replace(/#.*$/, ''))
    .flatMap((regel) => regel.split(/\s+/))
    .filter((woord) => woord !== '')
    .map((woord) => woord.replace(/^(['"])(.*)\1$/, '$2'));
}

function gelijk(links: readonly string[], rechts: readonly string[]): boolean {
  return links.length === rechts.length && [...links].sort().join('\n') === [...rechts].sort().join('\n');
}

async function hostFilesVanHook(): Promise<string[]> {
  const geladen: unknown = await import(/* @vite-ignore */ AUTHORITY_MODULE);
  const lijst: unknown =
    typeof geladen === 'object' && geladen !== null ? Reflect.get(geladen, 'HOST_FILES') : undefined;
  if (!Array.isArray(lijst)) throw new Error('runner-authority.mjs exporteert HOST_FILES niet als lijst');
  const items: unknown[] = lijst;
  return items.map(String);
}

describe('mandate-follow-up/AC-15: HOST_FILES in runner.sh en in de hook zijn dezelfde verzameling', () => {
  test('de lijsten zijn gelijk (quotes gestript, als verzameling)', async () => {
    expect(gelijk(hostFilesUit(SCRIPT), await hostFilesVanHook())).toBe(true);
  });

  test('de parser leest een meerregelige array met commentaar en quotes', () => {
    const fixture = 'HOST_FILES=(scripts \'compose.*.yaml\' # commentaar\n  "db/test.env" package.json)\nrest=(x)\n';
    expect(hostFilesUit(fixture)).toStrictEqual(['scripts', 'compose.*.yaml', 'db/test.env', 'package.json']);
  });

  test('een fixture waarin één entry ontbreekt wordt als verschillend herkend', async () => {
    const zonderEen = SCRIPT.replace(/ playwright\.config\.ts/, '');
    expect(hostFilesUit(zonderEen)).not.toContain('playwright.config.ts');
    expect(gelijk(hostFilesUit(zonderEen), await hostFilesVanHook())).toBe(false);
  });
});

// --- runner.sh in tijdelijke repo's -------------------------------------------------------------------------------------------

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
}

function schrijf(repo: string, rel: string, text: string): void {
  mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  writeFileSync(path.join(repo, rel), text);
}

function commit(repo: string, message: string): void {
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', message);
}

interface Omgeving {
  repo: string;
  stubs: string;
}

/** main (= origin/main) met runner.sh, host-bestanden en `basis`; daarna de branch feat/x. `voorPush` wijzigt de repo vóór de commit. */
function maakRepo(voorPush: (repo: string) => void = () => undefined): Omgeving {
  const repo = mkdtempSync(path.join(tmpdir(), 'runner-hosts-'));
  const stubs = mkdtempSync(path.join(tmpdir(), 'runner-stubs-'));
  const bare = mkdtempSync(path.join(tmpdir(), 'runner-bare-'));
  dirs.push(repo, stubs, bare);
  git(repo, 'init', '-q', '-b', 'main');
  schrijf(repo, 'scripts/runner.sh', SCRIPT);
  schrijf(repo, 'scripts/x.sh', 'echo oud\n');
  schrijf(repo, 'package.json', '{}\n');
  voorPush(repo);
  commit(repo, 'baseline');
  writeFileSync(path.join(stubs, 'docker'), '#!/usr/bin/env bash\necho "docker $*" >> "$STUB_DIR/log"\n');
  chmodSync(path.join(stubs, 'docker'), 0o755);
  writeFileSync(path.join(stubs, 'log'), '');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  git(repo, 'remote', 'add', 'origin', bare);
  git(repo, 'push', '-q', 'origin', 'main');
  git(repo, 'fetch', '-q', 'origin');
  git(repo, 'checkout', '-q', '-b', 'feat/x');
  return { repo, stubs };
}

interface Uitkomst {
  status: number | null;
  stderr: string;
  reachedDocker: boolean;
}

function run(omgeving: Omgeving, opties: { ci?: boolean; flag?: string; cwd?: string } = {}): Uitkomst {
  const args = ['scripts/runner.sh', 'ui', ...(opties.flag === undefined ? [] : [opties.flag])];
  const cwd = opties.cwd ?? omgeving.repo;
  const result = spawnSync('bash', args, {
    cwd,
    encoding: 'utf8',
    env: {
      HOME: omgeving.stubs,
      PATH: `${omgeving.stubs}:/usr/bin:/bin`,
      STUB_DIR: omgeving.stubs,
      PWD: cwd,
      ...GIT_ENV,
      ...(opties.ci === true ? { CI: 'true' } : {}),
    },
  });
  const reachedDocker = readFileSync(path.join(omgeving.stubs, 'log'), 'utf8').length > 0;
  return { status: result.status, stderr: result.stderr, reachedDocker };
}

const STOPT = { status: 1, reachedDocker: false };
const MODI = [
  ['lokaal', false],
  ['met CI=true', true],
] as const;

describe('mandate-follow-up/AC-16: een verwijderd compose.<x>.yaml valt niet uit de vergelijking', () => {
  test('compose.a.yaml verwijderd t.o.v. de merge-base: stopt vóór docker met "wijken af van origin/main (merge-base)" en D-regel', () => {
    const omgeving = maakRepo((repo) => {
      schrijf(repo, 'compose.a.yaml', 'services: {}\n');
      schrijf(repo, 'compose.b.yaml', 'services: {}\n');
    });
    git(omgeving.repo, 'rm', '-q', 'compose.a.yaml');
    commit(omgeving.repo, 'verwijder compose.a.yaml');

    const resultaat = run(omgeving);

    expect({ status: resultaat.status, reachedDocker: resultaat.reachedDocker }).toStrictEqual(STOPT);
    expect(resultaat.stderr).toContain('wijken af van origin/main (merge-base)');
    expect(resultaat.stderr).toContain('D\tcompose.a.yaml');
  });
});

describe.each(MODI)('mandate-follow-up/AC-17: genegeerde en onveilige hostbestanden, %s', (_naam, ci) => {
  test('(a) een genegeerd bestand onder een hostpad: stopt met de letterlijke melding', () => {
    const omgeving = maakRepo((repo) => {
      schrijf(repo, '.gitignore', '*.log\n');
    });
    schrijf(omgeving.repo, 'scripts/x.log', 'genegeerd\n');

    const resultaat = run(omgeving, { ci });

    expect({ status: resultaat.status, reachedDocker: resultaat.reachedDocker }).toStrictEqual(STOPT);
    expect(resultaat.stderr).toContain('✗ Genegeerde bestanden in hostpaden; de host zou ze ongezien gebruiken:');
    expect(resultaat.stderr).toContain('scripts/x.log');
    expect(resultaat.stderr).toContain('  → verwijder ze of gebruik de wegwerp-CI (ADR 0027).');
  });

  test('(b) een in de basis gecommit hostbestand dat een symlink is: stopt met de letterlijke melding', () => {
    const omgeving = maakRepo((repo) => {
      symlinkSync('elders.sh', path.join(repo, 'scripts/link.sh'));
    });

    const resultaat = run(omgeving, { ci });

    expect({ status: resultaat.status, reachedDocker: resultaat.reachedDocker }).toStrictEqual(STOPT);
    expect(resultaat.stderr).toContain('✗ Hostpad is een symlink of geen veilig pad: scripts/link.sh');
    expect(resultaat.stderr).toContain('  → gebruik de wegwerp-CI (ADR 0027); geen agentoverride.');
  });
});

describe('mandate-follow-up/AC-17: --sta-wijzigingen-toe slaat de nieuwe controles over', () => {
  test('genegeerd bestand en symlink: gaat door naar docker', () => {
    const omgeving = maakRepo((repo) => {
      schrijf(repo, '.gitignore', '*.log\n');
      symlinkSync('elders.sh', path.join(repo, 'scripts/link.sh'));
    });
    schrijf(omgeving.repo, 'scripts/x.log', 'genegeerd\n');

    const resultaat = run(omgeving, { flag: '--sta-wijzigingen-toe' });

    expect({ status: resultaat.status, reachedDocker: resultaat.reachedDocker }).toStrictEqual({
      status: 0,
      reachedDocker: true,
    });
  });
});

describe.each(MODI)(
  'mandate-follow-up/AC-24: pad buiten het veilige alfabet en een repository via een symlink, %s',
  (_naam, ci) => {
    test('een hostbestand met een spatie in de naam: stopt met "Hostpad is een symlink of geen veilig pad"', () => {
      const omgeving = maakRepo((repo) => {
        schrijf(repo, 'scripts/a b.sh', 'echo\n');
      });

      const resultaat = run(omgeving, { ci });

      expect({ status: resultaat.status, reachedDocker: resultaat.reachedDocker }).toStrictEqual(STOPT);
      expect(resultaat.stderr).toContain('Hostpad is een symlink of geen veilig pad');
    });

    test('de repository wordt via een symlink aangeroepen (pwd -P wijkt af van $PWD): stopt met dezelfde melding', () => {
      const omgeving = maakRepo();
      const buiten = mkdtempSync(path.join(tmpdir(), 'runner-link-'));
      dirs.push(buiten);
      const link = path.join(buiten, 'repo-link');
      symlinkSync(omgeving.repo, link);

      const resultaat = run(omgeving, { ci, cwd: link });

      expect({ status: resultaat.status, reachedDocker: resultaat.reachedDocker }).toStrictEqual(STOPT);
      expect(resultaat.stderr).toContain('Hostpad is een symlink of geen veilig pad');
    });
  },
);
