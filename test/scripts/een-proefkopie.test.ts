import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  bewaardPad,
  CHECK,
  draaiNode,
  git,
  maakBron,
  nieuweWerkmap,
  overgebleven,
  ROOT,
  type Werkmap,
} from './proef-fixture';

// check:new-resource als één proefkopie (docs/specs/een-proefkopie.md, ADR 0073). De echte generator duurt minuten; hier
// is `genereer` een stap uit de fixture die vastlegt wat hij ziet en, per modus, een rood bestand schrijft of faalt.
// Contract van scripts/kit/check-app-init.mjs voor deze tests:
//   draaiProef(bron, scripts, { bewaar?, genereer, naam?, onderwerp? }): Promise<number>
const PREFIX = 'new-resource-';
const NAAM = 'check:new-resource';
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const PROBES: Record<string, string> = {
  'ok.mjs': 'process.exit(0);\n',
  'teller.mjs': "import { appendFileSync } from 'node:fs';\nappendFileSync(process.env.TELLER, 'x');\n",
  'onderhoud.mjs': [
    "import { readFileSync } from 'node:fs';",
    "const gates = JSON.parse(readFileSync('.claude/gates.json', 'utf8'));",
    "if (gates.onderhoud === undefined) { console.error('onderhoud ontbreekt'); process.exit(1); }",
    '',
  ].join('\n'),
  // Rood zodra de generator zijn bestand heeft geschreven.
  'gegenereerd.mjs': "import { existsSync } from 'node:fs';\nif (existsSync('gegenereerd.txt')) process.exit(1);\n",
};
const SCRIPTS: Record<string, string> = {
  ok: 'node probe/ok.mjs',
  teller: 'node probe/teller.mjs',
  'eist-onderhoud': 'node probe/onderhoud.mjs',
  'zonder-generator': 'node probe/gegenereerd.mjs',
};

/** De driver roept draaiProef aan met een generatorstap; MODUS kiest: ok, schrijf (rood bestand) of faal. */
function schrijfDriver(werkmap: Werkmap): string {
  const driver = path.join(werkmap.base, 'driver.mjs');
  writeFileSync(
    driver,
    [
      "import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';",
      "import path from 'node:path';",
      `import { draaiProef } from ${JSON.stringify(CHECK)};`,
      'const [bron, scripts, ...vlaggen] = process.argv.slice(2);',
      'async function genereer(root) {',
      "  const gates = JSON.parse(readFileSync(path.join(root, '.claude/gates.json'), 'utf8'));",
      "  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));",
      "  appendFileSync(process.env.ZICHT, JSON.stringify({ onderhoud: 'onderhoud' in gates, naam: pkg.name }) + '\\n');",
      "  if (process.env.MODUS === 'schrijf') writeFileSync(path.join(root, 'gegenereerd.txt'), 'x');",
      "  if (process.env.MODUS === 'faal') throw new Error('node scripts/kit/new-resource.mjs time-entries faalde');",
      '}',
      'process.exitCode = await draaiProef(bron, JSON.parse(scripts), {',
      '  bewaar: vlaggen.includes("--bewaar"),',
      '  genereer,',
      `  naam: ${JSON.stringify(NAAM)},`,
      "  onderwerp: 'time-entries',",
      '});',
      '',
    ].join('\n'),
  );
  return driver;
}

interface Opzet {
  werkmap: Werkmap;
  driver: string;
  zicht: string;
  teller: string;
}

function opzet(options: Parameters<typeof maakBron>[1] = {}): Opzet {
  const werkmap = nieuweWerkmap(dirs);
  maakBron(werkmap, { scripts: SCRIPTS, probes: PROBES, ...options });
  return {
    werkmap,
    driver: schrijfDriver(werkmap),
    zicht: path.join(werkmap.base, 'zicht.jsonl'),
    teller: path.join(werkmap.base, 'teller'),
  };
}

function draai(setup: Opzet, scripts: readonly string[], extra: { modus?: string; vlaggen?: string[] } = {}) {
  return draaiNode(
    [setup.driver, setup.werkmap.bron, JSON.stringify(scripts), ...(extra.vlaggen ?? [])],
    setup.werkmap.bron,
    { TMPDIR: setup.werkmap.tmp, ZICHT: setup.zicht, TELLER: setup.teller, MODUS: extra.modus ?? 'ok' },
  );
}

function laatsteRegel(uitvoer: string): string | undefined {
  return uitvoer.split('\n').findLast((regel) => regel.trim() !== '');
}

function gezien(setup: Opzet): unknown[] {
  if (!existsSync(setup.zicht)) return [];
  return readFileSync(setup.zicht, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((regel): unknown => JSON.parse(regel));
}

const APP_GATES = '{\n  "altijdVragen": []\n}\n';

describe('de volgorde in de ene kopie', () => {
  test('AC-1 (tekst) en AC-6: init vóór de generator, de suite één keer, precies één kopie, en de slotregel', () => {
    const setup = opzet();
    const result = draai(setup, ['teller'], { vlaggen: ['--bewaar'] });
    expect(result.code, result.alles).toBe(0);
    expect(gezien(setup)).toEqual([{ onderhoud: false, naam: 'proef-app' }]);
    expect(readFileSync(setup.teller, 'utf8')).toBe('x');
    expect(overgebleven(setup.werkmap, PREFIX)).toEqual([path.basename(bewaardPad(result.stdout))]);
    expect(overgebleven(setup.werkmap, 'app-init-proef-')).toEqual([]);
    const regels = result.stdout.split('\n').filter((regel) => regel.includes('haalt gate:fast'));
    expect(regels).toEqual([`${NAAM}: time-entries haalt gate:fast na app:init`]);
  });

  test('AC-5: in een app geen app:init, wel de generator en de suite, en de slotregel zonder "na app:init"', () => {
    const setup = opzet({ gates: APP_GATES });
    const result = draai(setup, ['teller']);
    expect(result.code, result.alles).toBe(0);
    expect(gezien(setup)).toEqual([{ onderhoud: false, naam: 'app-template' }]);
    expect(readFileSync(setup.teller, 'utf8')).toBe('x');
    expect(laatsteRegel(result.stdout)).toBe(`${NAAM}: time-entries haalt gate:fast`);
    expect(overgebleven(setup.werkmap, PREFIX)).toEqual([]);
  });
});

describe('rood, met de stappen in de melding', () => {
  test('AC-2: een test die alleen in de template slaagt, faalt na app:init en new:resource', () => {
    const setup = opzet();
    const result = draai(setup, ['eist-onderhoud']);
    expect(result.code).not.toBe(0);
    expect(result.alles).toContain('onderhoud ontbreekt');
    expect(result.alles).toContain(`✗ ${NAAM}: eist-onderhoud faalt na app:init en new:resource (zie leerpunt #334)`);
    expect(result.alles.indexOf('eist-onderhoud: "node probe/onderhoud.mjs" faalde')).toBeLessThan(
      result.alles.indexOf(`✗ ${NAAM}: eist-onderhoud faalt`),
    );
    expect(overgebleven(setup.werkmap, PREFIX)).toEqual([]);
  });

  test('AC-2: dezelfde fixture zonder die afhankelijkheid slaagt', () => {
    const setup = opzet();
    expect(draai(setup, ['ok']).code).toBe(0);
  });

  test('AC-3: gegenereerde code die een gate rood maakt, faalt ook als app:init slaagt', () => {
    const setup = opzet();
    expect(draai(setup, ['zonder-generator']).code, 'zonder generatorbestand is de gate groen').toBe(0);
    const result = draai(setup, ['zonder-generator'], { modus: 'schrijf' });
    expect(result.code).not.toBe(0);
    expect(result.alles).toContain(`✗ ${NAAM}: zonder-generator faalt na app:init en new:resource (zie leerpunt #334)`);
  });

  test('AC-3 (app): in een app noemt de melding alleen new:resource', () => {
    const setup = opzet({ gates: APP_GATES });
    const result = draai(setup, ['zonder-generator'], { modus: 'schrijf' });
    expect(result.code).not.toBe(0);
    expect(result.alles).toContain(`✗ ${NAAM}: zonder-generator faalt na new:resource`);
    expect(result.alles).not.toContain('leerpunt #334');
  });

  test('AC-4: app:init faalt: de melding, en geen generator en geen gate', () => {
    const setup = opzet({ readme: '# Iets anders\n\nGeen template.\n' });
    const result = draai(setup, ['teller']);
    expect(result.code).not.toBe(0);
    expect(result.alles).toContain(`✗ ${NAAM}: app:init faalde in de kopie`);
    expect(gezien(setup)).toEqual([]);
    expect(existsSync(setup.teller)).toBe(false);
    expect(overgebleven(setup.werkmap, PREFIX)).toEqual([]);
  });

  test('AC-7: de generator faalt: de melding, geen gate; met --bewaar blijft de kopie staan', () => {
    const setup = opzet();
    const result = draai(setup, ['teller'], { modus: 'faal', vlaggen: ['--bewaar'] });
    expect(result.code).not.toBe(0);
    expect(result.alles).toContain(`✗ ${NAAM}: node scripts/kit/new-resource.mjs time-entries faalde`);
    expect(existsSync(setup.teller)).toBe(false);
    const pad = bewaardPad(result.stdout);
    expect(result.stdout).toContain(`${NAAM}: kopie bewaard in ${pad}`);
    expect(existsSync(pad)).toBe(true);
  });
});

describe('AC-8: de waarborgen van app-init-proef, met de nieuwe naam en het ene prefix', () => {
  test('na een geslaagde en een gefaalde run is de kopie weg; de bron is ongewijzigd', () => {
    const setup = opzet();
    const status = git(setup.werkmap.bron, ['status', '--porcelain']);
    const head = git(setup.werkmap.bron, ['rev-parse', 'HEAD']);
    expect(draai(setup, ['ok']).code).toBe(0);
    expect(draai(setup, ['eist-onderhoud']).code).not.toBe(0);
    expect(overgebleven(setup.werkmap, PREFIX)).toEqual([]);
    expect(git(setup.werkmap.bron, ['status', '--porcelain'])).toBe(status);
    expect(git(setup.werkmap.bron, ['rev-parse', 'HEAD'])).toBe(head);
  });

  test('zonder node_modules: de melding en geen tijdelijke map', () => {
    const setup = opzet({ nodeModules: false });
    const result = draai(setup, ['ok']);
    expect(result.code).not.toBe(0);
    expect(result.alles).toContain(`✗ ${NAAM}: node_modules ontbreekt; draai eerst pnpm install`);
    expect(overgebleven(setup.werkmap, PREFIX)).toEqual([]);
  });

  test('zonder .claude/gates.json: exit 1, de melding en geen tijdelijke map', () => {
    const setup = opzet({ gates: null });
    const result = draai(setup, ['ok']);
    expect(result.code).toBe(1);
    expect(result.alles).toContain(`✗ ${NAAM}: .claude/gates.json ontbreekt`);
    expect(overgebleven(setup.werkmap, PREFIX)).toEqual([]);
  });
});

describe('AC-9: check:app-init is geen verplichte check meer, maar draait nog (bouw-PR 1)', () => {
  test('requiredChecks, de ruleset en nieuwe-app.md noemen check:new-resource en niet check:app-init', () => {
    const decisions: unknown = JSON.parse(readFileSync(path.join(ROOT, '.claude/decisions.json'), 'utf8'));
    const required =
      typeof decisions === 'object' && decisions !== null && 'requiredChecks' in decisions
        ? decisions.requiredChecks
        : [];
    expect(required).toContain('check:new-resource');
    expect(required).not.toContain('check:app-init');
    const ruleset = readFileSync(path.join(ROOT, 'scripts/github-ruleset.sh'), 'utf8');
    const lijst = (/^checks=\(([^)]*)\)/m.exec(ruleset)?.[1] ?? '').split(/\s+/);
    expect(lijst).toContain('check:new-resource');
    expect(lijst).not.toContain('check:app-init');
    const nieuweApp = readFileSync(path.join(ROOT, 'docs/nieuwe-app.md'), 'utf8');
    expect(nieuweApp).toContain('check:new-resource');
    expect(nieuweApp).not.toContain('check:app-init');
  });

  test('de job check:app-init en het script bestaan nog', () => {
    expect(readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8')).toContain('name: check:app-init');
    const pkg: unknown = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const scripts = typeof pkg === 'object' && pkg !== null && 'scripts' in pkg ? pkg.scripts : undefined;
    expect(scripts).toMatchObject({ 'check:app-init': 'node scripts/kit/check-app-init.mjs' });
  });
});
