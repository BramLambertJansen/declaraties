import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { onbekendeWerkmapBestanden, werkmapNegeer } from '../../scripts/kit/pr-verify.mjs';

// ADR 0031 besluit 5: pr:verify weigert een vuile werkmap, behalve ongetrackte bestanden onder `werkmapNegeer`
// (uit origin/main). Pure functie: onbekendeWerkmapBestanden(statusPorcelain, negeer) → de paden die blokkeren.
const NEGEER = ['.claude/launch.json', '.claude/loop.md', '.claude/output-styles/', '.claude/routines/'];
const REPO = path.resolve(import.meta.dirname, '../..');

describe('onbekendeWerkmapBestanden: ongetrackt onder de lijst telt niet mee', () => {
  test.each([
    '?? .claude/launch.json',
    '?? .claude/loop.md',
    '?? .claude/routines/dagelijks.md',
    '?? .claude/routines/diep/x.md',
    '?? .claude/output-styles/kort.md',
    '?? .claude/routines/',
  ])('%s: door', (regel) => {
    expect(onbekendeWerkmapBestanden(`${regel}\n`, NEGEER)).toStrictEqual([]);
  });

  test('een lege status is schoon', () => {
    expect(onbekendeWerkmapBestanden('', NEGEER)).toStrictEqual([]);
  });

  test('alleen het blokkerende pad blijft over bij een mengsel', () => {
    const status = '?? .claude/launch.json\n?? .mcp.json\n?? .claude/routines/a.md\n';

    expect(onbekendeWerkmapBestanden(status, NEGEER)).toStrictEqual(['.mcp.json']);
  });
});

describe('onbekendeWerkmapBestanden: al het andere weigert', () => {
  test.each([
    ['.mcp.json', '?? .mcp.json'],
    ['.claude/commands/deploy.md', '?? .claude/commands/deploy.md'],
    ['src/nieuw.ts', '?? src/nieuw.ts'],
    ['.vitest/results.json', '?? .vitest/results.json'],
  ])('ongetrackt elders: %s', (pad, regel) => {
    expect(onbekendeWerkmapBestanden(`${regel}\n`, NEGEER)).toStrictEqual([pad]);
  });

  test.each([
    [' M', '.claude/launch.json'],
    ['M ', '.claude/launch.json'],
    ['A ', '.claude/routines/x.md'],
    ['AM', '.claude/routines/x.md'],
    [' D', '.claude/loop.md'],
    ['D ', '.claude/output-styles/kort.md'],
    ['MM', '.claude/routines/x.md'],
  ])('getrackt gewijzigd (%j) onder een genegeerd pad: %s', (code, pad) => {
    expect(onbekendeWerkmapBestanden(`${code} ${pad}\n`, NEGEER)).toStrictEqual([pad]);
  });

  test('een hernoeming naar een genegeerd pad is getrackt en weigert', () => {
    const blokkerend = onbekendeWerkmapBestanden('R  oud.md -> .claude/routines/x.md\n', NEGEER);

    expect(blokkerend.length).toBeGreaterThan(0);
  });

  test.each(['.claude/launch.json.x', '.claude/launch.jsonx', '.claude/loop.md/extra', '.claude/LAUNCH.json'])(
    'geen exacte match van een bestandspad: %s',
    (pad) => {
      expect(onbekendeWerkmapBestanden(`?? ${pad}\n`, NEGEER)).toStrictEqual([pad]);
    },
  );

  test.each([
    '../buiten.md',
    '.claude/routines/../../src/x.ts',
    '.claude/routines/../launch.json.x',
    '../.claude/routines/x.md',
  ])('pad met ../ weigert: %s', (pad) => {
    expect(onbekendeWerkmapBestanden(`?? ${pad}\n`, NEGEER)).toStrictEqual([pad]);
  });
});

describe('onbekendeWerkmapBestanden: een mapvoorvoegsel matcht op de mapgrens', () => {
  test('.claude/routines/x is een submap-bestand: door', () => {
    expect(onbekendeWerkmapBestanden('?? .claude/routines/x\n', NEGEER)).toStrictEqual([]);
  });

  test.each(['.claude/routinesX', '.claude/routines-oud/x.md', '.claude/output-stylesheet.css', '.claude/routines'])(
    '%s valt buiten de map: weigeren',
    (pad) => {
      expect(onbekendeWerkmapBestanden(`?? ${pad}\n`, NEGEER)).toStrictEqual([pad]);
    },
  );

  test('zonder lijst weigert elk bestand', () => {
    expect(onbekendeWerkmapBestanden('?? .claude/launch.json\n', [])).toStrictEqual(['.claude/launch.json']);
  });
});

describe('werkmapNegeer: de lijst komt uit origin/main, nooit uit de werkmap', () => {
  const ROOTS: string[] = [];
  const GIT_ENV = {
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 't@example.test',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 't@example.test',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
  };

  function git(root: string, args: string[]): string {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, ...GIT_ENV },
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }

  function fixture(onMain: string | null, inWorkdir: string | null) {
    const root = mkdtempSync(path.join(tmpdir(), 'pr-verify-werkmap-'));
    ROOTS.push(root);
    git(root, ['init', '-q', '-b', 'main']);
    mkdirSync(path.join(root, '.claude'), { recursive: true });
    writeFileSync(path.join(root, 'README.md'), 'x\n');
    if (onMain !== null) writeFileSync(path.join(root, '.claude/gates.json'), onMain);
    git(root, ['add', '.']);
    git(root, ['commit', '-q', '-m', 'base']);
    const base = git(root, ['rev-parse', 'HEAD']);
    git(root, ['update-ref', 'refs/remotes/origin/main', base]);
    git(root, ['switch', '-q', '-c', 'feat/x']);
    if (inWorkdir !== null) writeFileSync(path.join(root, '.claude/gates.json'), inWorkdir);
    return { root, base };
  }

  afterEach(() => {
    for (const root of ROOTS.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  test('geeft de lijst van origin/main', () => {
    const { root, base } = fixture(JSON.stringify({ werkmapNegeer: ['.claude/launch.json'] }), null);

    expect(werkmapNegeer(root, base)).toStrictEqual(['.claude/launch.json']);
  });

  test.each([
    { naam: 'ongecommitte wijziging', stap: 'werkmap' },
    { naam: 'gecommitte wijziging', stap: 'commit' },
  ])('een uitgebreide lijst in de werkmap-versie ($naam) wordt genegeerd', ({ stap }) => {
    const main = JSON.stringify({ werkmapNegeer: ['.claude/launch.json'] });
    const lokaal = JSON.stringify({ werkmapNegeer: ['.claude/launch.json', 'src/', '.mcp.json'] });
    const { root, base } = fixture(main, lokaal);
    if (stap === 'commit') {
      git(root, ['add', '.']);
      git(root, ['commit', '-q', '-m', 'lokaal']);
    }

    expect(werkmapNegeer(root, base)).toStrictEqual(['.claude/launch.json']);
  });

  test('main zonder sleutel geeft een lege lijst, ook als de werkmap er een heeft', () => {
    const { root, base } = fixture(JSON.stringify({ autoRunner: true }), JSON.stringify({ werkmapNegeer: ['src/'] }));

    expect(werkmapNegeer(root, base)).toStrictEqual([]);
  });

  test.each([
    { naam: 'kapotte JSON', main: '{"werkmapNegeer":[' },
    { naam: 'geen array', main: '{"werkmapNegeer":".claude/launch.json"}' },
    { naam: 'array met niet-tekst', main: '{"werkmapNegeer":[1,null]}' },
    { naam: 'gates.json ontbreekt op main', main: null },
  ])('onleesbaar of ongeldig ($naam): lege lijst', ({ main }) => {
    const { root, base } = fixture(main, JSON.stringify({ werkmapNegeer: ['src/'] }));

    expect(werkmapNegeer(root, base)).toStrictEqual([]);
  });
});

describe('repo-feiten: beginlijst en .gitignore', () => {
  test('.claude/gates.json bevat precies de beginlijst van ADR 0031 besluit 5', () => {
    const gates: unknown = JSON.parse(readFileSync(path.join(REPO, '.claude/gates.json'), 'utf8'));
    const lijst = typeof gates === 'object' && gates !== null && 'werkmapNegeer' in gates ? gates.werkmapNegeer : null;

    expect(lijst).toStrictEqual([
      '.claude/launch.json',
      '.claude/loop.md',
      '.claude/output-styles/',
      '.claude/routines/',
      '.claude/scheduled_tasks.json',
      '.claude/workflows/',
    ]);
  });

  test('.mcp.json en .claude/commands/ staan niet in de lijst', () => {
    const text = readFileSync(path.join(REPO, '.claude/gates.json'), 'utf8');

    expect(text).not.toContain('.mcp.json');
    expect(text).not.toContain('.claude/commands');
  });

  test('.vitest/ staat in .gitignore', () => {
    const regels = readFileSync(path.join(REPO, '.gitignore'), 'utf8')
      .split('\n')
      .map((regel) => regel.trim());

    expect(regels).toContain('.vitest/');
  });
});
