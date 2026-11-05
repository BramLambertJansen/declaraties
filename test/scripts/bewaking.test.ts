import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bewakingMelding, bewakingMeldingIn } from '../../scripts/kit/bewaking.mjs';
import { afterEach, describe, expect, test } from 'vitest';

// Spec bewaking-zichtbaar (leerpunt #462). Elke test zet CLAUDECODE, CLAUDE_CODE_SESSION_ID en METING_DIR zelf, zodat de
// uitslag niet afhangt van de sessie die de tests draait.
const REPO = path.join(import.meta.dirname, '../..');
const NU = Date.parse('2026-11-04T12:00:00Z');
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tijdelijk() {
  const dir = mkdtempSync(path.join(tmpdir(), 'bewaking-'));
  dirs.push(dir);
  return dir;
}

/** Een meetbestand met wijzigingstijd `ouderdom` ms vóór NU. */
function meting(map: string, naam: string, ouderdom: number) {
  mkdirSync(map, { recursive: true });
  const pad = path.join(map, naam);
  writeFileSync(pad, '{}\n');
  const tijd = new Date(NU - ouderdom);
  utimesSync(pad, tijd, tijd);
  return pad;
}

const BASIS = {
  inClaudeCode: true,
  recenteMeting: true,
  buitenWerkmapSchrijfbaar: false,
  map: '/r/.git/agent-meting',
  ouder: '/home',
};

describe('bewakingMelding (AC-1)', () => {
  test('buiten Claude Code: null, ook als alles ontbreekt', () => {
    expect(
      bewakingMelding({ ...BASIS, inClaudeCode: false, recenteMeting: false, buitenWerkmapSchrijfbaar: true }),
    ).toBeNull();
  });

  test('hooks draaien en sandbox schermt af: null', () => {
    expect(bewakingMelding(BASIS)).toBeNull();
  });

  test.each([
    { naam: 'geen meting', feiten: { recenteMeting: false }, hooks: true, sandbox: false },
    { naam: 'ouder schrijfbaar', feiten: { buitenWerkmapSchrijfbaar: true }, hooks: false, sandbox: true },
    { naam: 'beide', feiten: { recenteMeting: false, buitenWerkmapSchrijfbaar: true }, hooks: true, sandbox: true },
  ])('$naam: één regel met precies de gevonden delen en de gevolgen', ({ feiten, hooks, sandbox }) => {
    const regel = bewakingMelding({ ...BASIS, ...feiten }) ?? '';

    expect(regel).toMatch(/^⚠ bewaking niet actief in deze sessie:/);
    expect(regel).not.toContain('\n');
    expect(
      regel.includes(
        'projecthooks uit .claude/settings.json draaien niet (geen recente meting in /r/.git/agent-meting)',
      ),
    ).toBe(hooks);
    expect(regel.includes('de Bash-sandbox schermt niet af (/home is schrijfbaar)')).toBe(sandbox);
    for (const deel of [
      'Rolhek, toets op effect en werkstraat-hooks',
      'R-WERK-23',
      'kooi (R-TOOL-03)',
      'docs/ENVIRONMENT.md',
    ])
      expect(regel).toContain(deel);
  });

  test('zonder opslagmap noemt de melding dat', () => {
    expect(bewakingMelding({ ...BASIS, recenteMeting: false, map: null })).toContain('(geen opslagmap)');
  });
});

describe('bewakingMeldingIn (AC-2, AC-3)', () => {
  test('CLAUDECODE niet 1: null zonder iets te lezen', () => {
    expect(bewakingMeldingIn('/bestaat/niet', { CLAUDECODE: undefined, METING_DIR: '/bestaat/niet' }, NU)).toBeNull();
    expect(bewakingMeldingIn('/bestaat/niet', { CLAUDECODE: '0', METING_DIR: '/bestaat/niet' }, NU)).toBeNull();
  });

  // De sandboxuitslag hangt af van de machine (als root is elke map schrijfbaar); deze tests toetsen alleen het hooksdeel.
  test('eigen meetbestand van 120 s oud: geen hooksdeel', () => {
    const map = tijdelijk();
    meting(map, 'sessie-1.jsonl', 120_000);
    const env = { CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'sessie-1', METING_DIR: map };

    expect(bewakingMeldingIn(REPO, env, NU) ?? '').not.toContain('projecthooks');
  });

  test('ouder schrijfbaar: sandboxdeel met die map', () => {
    const map = tijdelijk();
    meting(map, 'sessie-1.jsonl', 0);
    const root = path.join(tijdelijk(), 'repo');
    mkdirSync(root);
    const env = { CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'sessie-1', METING_DIR: map };

    const regel = bewakingMeldingIn(root, env, NU) ?? '';
    expect(regel).toContain(`de Bash-sandbox schermt niet af (${path.dirname(root)} is schrijfbaar)`);
    expect(regel).not.toContain('projecthooks');
  });

  test.each([
    { naam: 'eigen bestand te oud', maak: (map: string) => meting(map, 'sessie-1.jsonl', 120_001), sessie: 'sessie-1' },
    {
      naam: 'alleen een andere sessie recent',
      maak: (map: string) => meting(map, 'ander.jsonl', 0),
      sessie: 'sessie-1',
    },
    {
      naam: 'map bestaat niet',
      maak: (map: string) => {
        rmSync(map, { recursive: true });
      },
      sessie: 'sessie-1',
    },
    { naam: 'lege map', maak: () => undefined, sessie: undefined },
    {
      naam: 'zonder sessie-id: bestand ouder dan 10 s',
      maak: (map: string) => meting(map, 'ander.jsonl', 10_001),
      sessie: undefined,
    },
    { naam: 'zonder sessie-id: geen .jsonl', maak: (map: string) => meting(map, 'ander.txt', 0), sessie: undefined },
    {
      naam: 'zonder sessie-id: kapotte link',
      maak: (map: string) => {
        symlinkSync(path.join(map, 'weg'), path.join(map, 'kapot.jsonl'));
      },
      sessie: undefined,
    },
    {
      naam: 'eigen bestand is een kapotte link',
      maak: (map: string) => {
        symlinkSync(path.join(map, 'weg'), path.join(map, 'sessie-1.jsonl'));
      },
      sessie: 'sessie-1',
    },
  ])('$naam: melding over hooks (valt dicht)', ({ maak, sessie }) => {
    const map = tijdelijk();
    maak(map);
    const env = { CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: sessie, METING_DIR: map };

    expect(bewakingMeldingIn(REPO, env, NU)).toContain(
      `projecthooks uit .claude/settings.json draaien niet (geen recente meting in ${map})`,
    );
  });

  test('onleesbare map (een bestand) zonder sessie-id: melding over hooks', () => {
    const map = path.join(tijdelijk(), 'geen-map');
    writeFileSync(map, '');

    expect(
      bewakingMeldingIn(REPO, { CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: undefined, METING_DIR: map }, NU),
    ).toContain('projecthooks');
  });

  test('zonder sessie-id telt elk recent .jsonl binnen 10 s', () => {
    const map = tijdelijk();
    meting(map, 'ander.jsonl', 10_000);

    expect(
      bewakingMeldingIn(REPO, { CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: '', METING_DIR: map }, NU) ?? '',
    ).not.toContain('projecthooks');
  });

  test('zonder METING_DIR en buiten een repo: geen opslagmap', () => {
    const regel =
      bewakingMeldingIn(tijdelijk(), { CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'x', METING_DIR: undefined }, NU) ?? '';

    expect(regel).toContain('(geen opslagmap)');
  });

  test('zonder METING_DIR in een repo: <git common dir>/agent-meting, zoals de meethook', () => {
    const root = path.join(tijdelijk(), 'repo');
    mkdirSync(root);
    spawnSync('git', ['init', '-q'], { cwd: root });
    const env = { CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'sessie-1', METING_DIR: undefined };

    expect(bewakingMeldingIn(root, env, NU)).toContain(
      `geen recente meting in ${path.join(root, '.git', 'agent-meting')})`,
    );
    meting(path.join(root, '.git', 'agent-meting'), 'sessie-1.jsonl', 0);
    expect(bewakingMeldingIn(root, env, NU) ?? '').not.toContain('projecthooks');
  });

  test('access op de ouder faalt: geen sandboxdeel', () => {
    const map = tijdelijk();
    const env = { CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'sessie-1', METING_DIR: map };

    const regel = bewakingMeldingIn(path.join(map, 'bestaat-niet', 'repo'), env, NU) ?? '';
    expect(regel).toContain('projecthooks');
    expect(regel).not.toContain('Bash-sandbox');
  });
});

describe('feiten.mjs (AC-4)', () => {
  function feiten(args: string[], env: Record<string, string | undefined>) {
    return spawnSync('node', ['scripts/kit/feiten.mjs', ...args], {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_CODE_SESSION_ID: 'test-bewaking', ...env },
    });
  }

  test('CLAUDECODE=1 en lege METING_DIR: melding op stderr, geldige JSON, exitcode 0', () => {
    const uit = feiten(['adr', '--json'], { CLAUDECODE: '1', METING_DIR: tijdelijk() });

    expect(uit.status).toBe(0);
    expect(uit.stderr).toMatch(/^⚠ bewaking niet actief in deze sessie:/m);
    const lees = (): unknown => JSON.parse(uit.stdout);
    expect(lees).not.toThrow();
  });

  test('melding ook bij hoofdstuk, vóór de tekst', () => {
    const uit = feiten(['hoofdstuk', '1'], { CLAUDECODE: '1', METING_DIR: tijdelijk() });

    expect(uit.status).toBe(0);
    expect(uit.stderr).toContain('⚠ bewaking niet actief in deze sessie:');
  });

  test('zonder CLAUDECODE: geen melding', () => {
    const uit = feiten(['adr', '--json'], { CLAUDECODE: undefined, METING_DIR: tijdelijk() });

    expect(uit.status).toBe(0);
    expect(uit.stderr).not.toContain('bewaking');
  });

  test('de melding staat vóór de toolchaincontrole', () => {
    const bron = readFileSync(path.join(REPO, 'scripts/kit/feiten.mjs'), 'utf8');

    expect(bron.indexOf("import('./bewaking.mjs')")).toBeGreaterThan(-1);
    expect(bron.indexOf("import('./bewaking.mjs')")).toBeLessThan(bron.indexOf('toolchainProbleemIn(fileURLToPath'));
  });
});

describe('feiten.mjs fouttak (AC-4)', () => {
  test('bewaking.mjs ontbreekt: waarschuwing op stderr, feiten draait door', () => {
    const root = tijdelijk();
    const kit = path.join(root, 'scripts/kit');
    mkdirSync(kit, { recursive: true });
    for (const naam of ['feiten.mjs', 'toolchain.mjs'])
      writeFileSync(path.join(kit, naam), readFileSync(path.join(REPO, 'scripts/kit', naam)));
    writeFileSync(path.join(root, 'mise.toml'), readFileSync(path.join(REPO, 'mise.toml')));

    const metCc = spawnSync('node', ['scripts/kit/feiten.mjs', 'specs'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CLAUDECODE: '1' },
    });
    const zonderCc = spawnSync('node', ['scripts/kit/feiten.mjs', 'specs'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CLAUDECODE: undefined },
    });

    expect(metCc.stderr).toMatch(/^⚠ bewaking niet te controleren: /m);
    expect(metCc.stderr).toContain('✗ toolchain ontbreekt');
    expect(zonderCc.stderr).not.toContain('bewaking');
  });
});

describe('docs (AC-5)', () => {
  // CHANGELOG.md niet: app:init herschrijft hem in een app (check:new-resource).
  test.each(['docs/ENVIRONMENT.md'])('%s noemt de melding van feiten.mjs', (bestand) => {
    expect(readFileSync(path.join(REPO, bestand), 'utf8').includes('⚠ bewaking niet actief in deze sessie')).toBe(true);
  });
});
