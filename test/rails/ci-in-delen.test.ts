import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { DELEN, deel, deelUitArgs, gateFast, snelleGates } from '../../scripts/kit/gate-fast.mjs';
import { CHECK, draaiNode, maakBron, nieuweWerkmap } from '../scripts/proef-fixture';
import { expectAbsent } from '../support/absence';

// Spec ci-in-delen (ADR 0076): de trage CI-jobs in delen, zonder iets over te slaan. Deze tests bewijzen dat de delen samen
// precies het geheel dekken, zonder overlap, en dat de verplichte namen blijven.
const ROOT = path.join(import.meta.dirname, '../..');
const CI = readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');

function job(id: string): string {
  const start = CI.search(new RegExp(`^ {2}${id}:\\s*$`, 'm'));
  expect(start, `job ${id} ontbreekt in ci.yml`).toBeGreaterThanOrEqual(0);
  const rest = CI.slice(start).split('\n').slice(1).join('\n');
  const next = rest.search(/^ {2}[\w-]+:\s*$/m);
  return next === -1 ? rest : rest.slice(0, next);
}

function uniek(lijst: readonly string[]): boolean {
  return new Set(lijst).size === lijst.length;
}

describe('ci-in-delen/AC-1: de delen dekken precies snelleGates()', () => {
  test('ci-in-delen/AC-1 vereniging is snelleGates(), elke gate in precies één deel behalve test:unit', () => {
    const delen = DELEN.map((naam) => deel(naam));
    const scripts = delen.flatMap((d) => d?.scripts ?? []);

    expect(DELEN).toStrictEqual(['checks', 'test-1', 'test-2']);
    expect([...new Set(scripts)].toSorted()).toStrictEqual([...snelleGates()].toSorted());
    expect(scripts.filter((s) => s === 'test:unit')).toHaveLength(2);
    expect(uniek(scripts.filter((s) => s !== 'test:unit'))).toBe(true);
    expect(deel('test-1')?.args).toStrictEqual({ 'test:unit': ['--shard=1/2'] });
    expect(deel('test-2')?.args).toStrictEqual({ 'test:unit': ['--shard=2/2'] });
  });

  test('ci-in-delen/AC-1 een nieuwe snelle gate valt in deel checks', () => {
    expect(deel('checks', ['lint', 'nieuw', 'test:unit'])?.scripts).toStrictEqual(['lint', 'nieuw']);
  });

  test('ci-in-delen/AC-1 check:new-resource gebruikt dezelfde deeldefinitie', () => {
    const bron = readFileSync(path.join(ROOT, 'scripts/kit/check-new-resource.mjs'), 'utf8');
    expect(bron).toContain("import { DELEN, deelUitArgs, snelleGates } from './gate-fast.mjs';");
    expect(bron).toContain('keuze?.deel?.scripts ?? snelleGates()');
  });
});

// Vitest's eigen verdeling (de sequencer van de config), dezelfde die `vitest run --shard` gebruikt.
const VITEST_DELEN = `
import { createVitest } from 'vitest/node';
const uit = {};
for (const shard of ['alle', '1/2', '2/2']) {
  const v = await createVitest('test', { project: ['unit', 'web'], watch: false, run: true, ...(shard === 'alle' ? {} : { shard }) });
  const specs = await v.globTestSpecifications();
  const lijst = shard === 'alle' ? specs : await new v.config.sequence.sequencer(v).shard(specs);
  uit[shard] = lijst.map((s) => s.project.name + ' ' + s.moduleId);
  await v.close();
}
process.stdout.write(JSON.stringify(uit));
`;

describe('ci-in-delen/AC-2: de twee helften van test:unit', () => {
  test('ci-in-delen/AC-2 samen precies alle testbestanden, zonder overlap', () => {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', VITEST_DELEN], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    const uit = new Map<string, string[]>(
      Object.entries(z.record(z.string(), z.array(z.string())).parse(JSON.parse(r.stdout))),
    );
    const [alle = [], een = [], twee = []] = [uit.get('alle'), uit.get('1/2'), uit.get('2/2')];

    expect(alle.length).toBeGreaterThan(100);
    expect(een.length).toBeGreaterThan(0);
    expect(twee.length).toBeGreaterThan(0);
    expect(een.filter((bestand) => twee.includes(bestand))).toStrictEqual([]);
    expect([...een, ...twee].toSorted()).toStrictEqual([...alle].toSorted());
  }, 60_000);
});

describe('ci-in-delen/AC-3 en AC-4: lokaal en bij een onbekend deel', () => {
  test('ci-in-delen/AC-3 zonder --deel geen deelkeuze; met een deel noemt de slotregel dat deel', async () => {
    expect(deelUitArgs([])).toBeNull();
    let tekst = '';
    const code = await gateFast(
      { scripts: ['lint'], naam: 'gate:fast (checks)' },
      (script) => Promise.resolve({ script, code: 0, output: '', seconds: 0 }),
      (t) => {
        tekst += t;
      },
    );
    expect(code).toBe(0);
    expect(tekst).toContain('✓ gate:fast (checks) groen\n');
  });

  test.each([
    ['scripts/kit/gate-fast.mjs', 'gate:fast'],
    ['scripts/kit/check-new-resource.mjs', 'check:new-resource'],
  ])('ci-in-delen/AC-4 %s --deel onbekend: exitcode ≠ 0 en de melding, zonder gate', (script, naam) => {
    const r = spawnSync(process.execPath, [script, '--deel', 'onbekend'], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(`✗ ${naam}: onbekend deel onbekend; kies checks, test-1 of test-2`);
    expect(r.stdout).toBe('');
  });
});

describe('ci-in-delen/AC-5 t/m AC-7: ci.yml', () => {
  test.each([
    ['gate-fast', 'gate:fast', 'gate-fast-part'],
    ['new-resource', 'check:new-resource', 'new-resource-part'],
    ['gate-slow', 'gate:slow', 'gate-slow-part'],
  ])(
    'ci-in-delen/AC-5 samenvattende job %s heet %s, needs %s, if always(), rood tenzij success',
    (id, naam, deelJob) => {
      const blok = job(id);
      expect(blok).toMatch(new RegExp(`^ {4}name: ${naam}$`, 'm'));
      expect(blok).toMatch(new RegExp(`^ {4}needs: ${deelJob}$`, 'm'));
      expect(blok).toMatch(/^ {4}if: always\(\)$/m);
      expect(blok).toContain(`RESULT: \${{ needs.${deelJob}.result }}`);
      expect(blok).toMatch(/if \[ "\$RESULT" != "success" \]; then[\s\S]*exit 1/);
    },
  );

  test.each(['gate-fast-part', 'new-resource-part', 'gate-slow-part'])(
    'ci-in-delen/AC-5 matrixjob %s: fail-fast false, geen if op jobniveau, geen paths-filter',
    (id) => {
      const blok = job(id);
      expect(blok).toMatch(/^ {6}fail-fast: false$/m);
      expectAbsent(blok, /^ {4}if:/m, {
        recognizes: ['    if: always()', "    if: github.event_name == 'push'"],
        allows: ["      - if: matrix.deel == 'checks'", '    needs: gate-fast-part'],
      });
      expectAbsent(CI, /^\s+paths(-ignore)?:/m, {
        recognizes: ['    paths:', '      paths-ignore:'],
        allows: ['          path: .runner-output/'],
      });
    },
  );

  test.each(['gate-fast-part', 'new-resource-part'])(
    'ci-in-delen/AC-6 %s draait precies de delen checks, test-1 en test-2 met de volledige geschiedenis',
    (id) => {
      const blok = job(id);
      expect(blok).toMatch(/^ {8}deel: \[checks, test-1, test-2\]$/m);
      expect(blok).toContain('--deel "$DEEL"');
      expect(blok).toMatch(/^ {10}fetch-depth: 0$/m);
      expect(blok).toContain('node scripts/kit/kooi.mjs --proef');
    },
  );

  test('ci-in-delen/AC-6 build, docs-drift en leespad alleen in deel checks', () => {
    const blok = job('gate-fast-part');
    expect(blok).toMatch(/- if: matrix\.deel == 'checks'\n\s+run: pnpm build\n/);
    expect(blok).toMatch(/- if: matrix\.deel == 'checks'\n\s+run: pnpm check:docs-drift\n/);
    expect(blok).toMatch(/- if: always\(\) && matrix\.deel == 'checks'\n\s+run: pnpm leespad\n/);
  });
});

// Dummywaarden alleen om de lijst op te bouwen: e2e/support leest ze bij het laden, maar --list verbindt nergens mee.
const LIJST_ENV = {
  APP_ORIGIN: 'http://localhost:5173',
  AUTH_DATABASE_URL: 'postgres://lijst@127.0.0.1:1/lijst',
  AUTH_SECRET: 'alleen-voor-de-lijst-0123456789abcdef',
  CLIENT_IP_HEADER: 'x-lijst-ip',
  MAILPIT_URL: 'http://127.0.0.1:1',
  MIGRATOR_DATABASE_URL: 'postgres://lijst@127.0.0.1:1/lijst',
};

function e2eLijst(uiDeel: string): string[] {
  const cli = path.join(ROOT, 'node_modules/@playwright/test/cli.js');
  const r = spawnSync(process.execPath, [cli, 'test', '--list'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...LIJST_ENV, UI_DEEL: uiDeel, RUNNER: '' },
  });
  expect(r.status, r.stderr + r.stdout).toBe(0);
  return r.stdout.split('\n').filter((regel) => regel.includes(' › '));
}

describe('ci-in-delen/AC-7: de twee helften van ui:check', () => {
  test('ci-in-delen/AC-7 samen precies de lijst zonder deel, zonder overlap', () => {
    const [alle, een, twee] = [e2eLijst(''), e2eLijst('1/2'), e2eLijst('2/2')];

    expect(alle.length).toBeGreaterThan(10);
    expect(een.length).toBeGreaterThan(0);
    expect(twee.length).toBeGreaterThan(0);
    expect(een.filter((t) => twee.includes(t))).toStrictEqual([]);
    expect([...een, ...twee].toSorted()).toStrictEqual([...alle].toSorted());
  }, 60_000);

  test('ci-in-delen/AC-7 een ongeldig UI_DEEL faalt in plaats van stil alles of niets te draaien', () => {
    const cli = path.join(ROOT, 'node_modules/@playwright/test/cli.js');
    const r = spawnSync(process.execPath, [cli, 'test', '--list'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, ...LIJST_ENV, UI_DEEL: '3/2', RUNNER: '' },
    });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain('UI_DEEL moet 1/2 of 2/2 zijn');
  });

  test('ci-in-delen/AC-7 compose geeft UI_DEEL door aan de runner', () => {
    expect(readFileSync(path.join(ROOT, 'compose.yaml'), 'utf8')).toContain('UI_DEEL: ${UI_DEEL:-}');
  });
});

// Eén deel in de kopie van check:new-resource: de driver roept draaiProef aan met de scripts en argumenten van een deel.
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function draaiDeel(naam: string, scripts: Record<string, string>) {
  const werkmap = nieuweWerkmap(dirs);
  maakBron(werkmap, {
    scripts,
    probes: {
      'args.mjs': "console.log('argumenten: ' + process.argv.slice(2).join(' '));\n",
      'rood.mjs': 'process.exit(1);\n',
    },
  });
  const driver = path.join(werkmap.base, 'driver.mjs');
  writeFileSync(
    driver,
    [
      `import { draaiProef } from ${JSON.stringify(CHECK)};`,
      `import { deel } from ${JSON.stringify(path.join(ROOT, 'scripts/kit/gate-fast.mjs'))};`,
      'const [bron, naam] = process.argv.slice(2);',
      "const d = deel(naam, ['lint', 'test:unit']);",
      'process.exitCode = await draaiProef(bron, d.scripts, {',
      '  genereer: async () => {},',
      '  naam: `check:new-resource (${naam})`,',
      "  onderwerp: 'time-entries',",
      '  deel: naam,',
      '  args: d.args,',
      '});',
      '',
    ].join('\n'),
  );
  return draaiNode([driver, werkmap.bron, naam], werkmap.bron, { TMPDIR: werkmap.tmp });
}

describe('ci-in-delen/AC-6: een deel in de kopie van check:new-resource', () => {
  test('ci-in-delen/AC-6 test-1 geeft --shard=1/2 door en noemt het deel in de slotregel', () => {
    const r = draaiDeel('test-1', { lint: 'node probe/rood.mjs', 'test:unit': 'node probe/args.mjs' });
    expect(r.code, r.alles).toBe(0);
    expect(r.stdout).toContain('argumenten: --shard=1/2');
    expect(r.stdout).toContain('check:new-resource (test-1): time-entries haalt deel test-1 van gate:fast na app:init');
  });

  test('ci-in-delen/AC-6 een gate die alleen in deel checks rood is, maakt alleen dat deel rood', () => {
    const scripts = { lint: 'node probe/rood.mjs', 'test:unit': 'node probe/args.mjs' };
    const checks = draaiDeel('checks', scripts);
    expect(checks.code).not.toBe(0);
    expect(checks.stderr).toContain('✗ check:new-resource (checks): lint faalt na');
    expect(draaiDeel('test-2', scripts).code).toBe(0);
  });
});
