import { spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  bewaardPad,
  CHECK,
  draaiNode,
  git,
  maakBron,
  MODULE,
  nieuweWerkmap,
  overgebleven,
  ROOT,
  schrijfDriver,
  type Werkmap,
} from './proef-fixture';

// check:app-init (docs/specs/app-init-proef.md): app:init op een tijdelijke kopie, daarna de snelle suite in die kopie.
// Contract van scripts/kit/check-app-init.mjs voor deze tests:
//   export async function draaiProef(bron: string, scripts: readonly string[], opties?: { bewaar?: boolean }): Promise<number>
//   - geeft de exitcode terug (0 = geslaagd), schrijft de teksten uit de spec naar stdout (✗-regels mogen naar stderr);
//   - bij SIGINT/SIGTERM ruimt hij op en doet process.exit(130/143);
//   - bij import gebeurt niets; de CLI (`node scripts/kit/check-app-init.mjs [--bewaar]`) draait alleen als hoofdmodule,
//     met process.cwd() als bron en snelleGates() als scripts.
const PREFIX = 'app-init-proef-';
const SUCCES = 'check:app-init: proef-app haalt gate:fast na app:init';
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const PROBES: Record<string, string> = {
  'ok.mjs': 'process.exit(0);\n',
  'faal.mjs': 'process.exit(1);\n',
  // Slaagt in de template, faalt in een app: leest `onderhoud` uit .claude/gates.json (leerpunt #334).
  'onderhoud.mjs': [
    "import { readFileSync } from 'node:fs';",
    "const gates = JSON.parse(readFileSync('.claude/gates.json', 'utf8'));",
    "if (gates.onderhoud === undefined) { console.error('onderhoud ontbreekt'); process.exit(1); }",
    '',
  ].join('\n'),
  // Roept planAppInit zonder guard aan: faalt zodra package.json niet meer app-template heet.
  'plan.mjs': [
    "import { planAppInit } from '../scripts/kit/app-init.mjs';",
    "planAppInit(process.cwd(), { slug: 'x', name: 'X', sha: 'abc1234' });",
    '',
  ].join('\n'),
};
const SCRIPTS: Record<string, string> = {
  ok: 'node probe/ok.mjs',
  faal: 'node probe/faal.mjs',
  'eist-onderhoud': 'node probe/onderhoud.mjs',
  'eist-plan': 'node probe/plan.mjs',
  samen: 'pnpm ok && node probe/ok.mjs',
};

function opzet(scripts: readonly string[], options: Parameters<typeof maakBron>[1] = {}) {
  const werkmap = nieuweWerkmap(dirs);
  maakBron(werkmap, { scripts: SCRIPTS, probes: PROBES, ...options });
  return { werkmap, driver: schrijfDriver(werkmap), scripts };
}

function draai(
  setup: { werkmap: Werkmap; driver: string; scripts: readonly string[] },
  extra: { vlaggen?: string[]; env?: Record<string, string> } = {},
) {
  return draaiNode(
    [setup.driver, setup.werkmap.bron, JSON.stringify(setup.scripts), ...(extra.vlaggen ?? [])],
    setup.werkmap.bron,
    { TMPDIR: setup.werkmap.tmp, ...extra.env },
  );
}

function laatsteRegel(uitvoer: string): string | undefined {
  return uitvoer.split('\n').findLast((regel) => regel.trim() !== '');
}

function toestand(bron: string) {
  return {
    status: git(bron, ['status', '--porcelain']),
    head: git(bron, ['rev-parse', 'HEAD']),
    bin: readdirSync(path.join(bron, 'node_modules/.bin')).map((naam) => [
      naam,
      readFileSync(path.join(bron, 'node_modules/.bin', naam), 'utf8'),
    ]),
  };
}

describe('de succesregel', () => {
  test('AC-1 (tekst): een geslaagde run eindigt met exit 0 en de letterlijke slotregel', () => {
    const setup = opzet(['ok']);
    const result = draai(setup);
    expect(result.code, result.alles).toBe(0);
    expect(laatsteRegel(result.stdout)).toBe(SUCCES);
  });

  test('AC-1 (suite): elk opgegeven script draait, ook een script dat via "pnpm <naam>" een ander aanroept', () => {
    const setup = opzet(['samen', 'ok']);
    const result = draai(setup);
    expect(result.code, result.alles).toBe(0);
    expect(laatsteRegel(result.stdout)).toBe(SUCCES);
  });
});

describe('een test die alleen in de template slaagt', () => {
  test('AC-2: leest onderhoud uit .claude/gates.json: exit ≠ 0 met de letterlijke melding', () => {
    const setup = opzet(['ok', 'eist-onderhoud']);
    const result = draai(setup);
    expect(result.code).not.toBe(0);
    expect(result.alles).toContain('✗ check:app-init: eist-onderhoud faalt na app:init');
    expect(result.alles).toContain('(de template slaagt; zie leerpunt #334)');
    expect(result.alles).not.toContain(SUCCES);
  });

  test('AC-2: dezelfde fixture zonder die afhankelijkheid slaagt', () => {
    const setup = opzet(['ok']);
    expect(draai(setup).code).toBe(0);
  });

  test('AC-2: het script slaagt wel in de bron zelf (de template)', () => {
    const setup = opzet(['eist-onderhoud']);
    const result = draaiNode(['probe/onderhoud.mjs'], setup.werkmap.bron, {});
    expect(result.code, result.alles).toBe(0);
  });

  test('AC-2: de eerste rode gate stopt de check: de latere draait niet', () => {
    const werkmap = nieuweWerkmap(dirs);
    const marker = path.join(werkmap.base, 'laatste-gate');
    maakBron(werkmap, {
      scripts: { ...SCRIPTS, laatste: 'node probe/marker.mjs' },
      probes: {
        ...PROBES,
        'marker.mjs': `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'x');\n`,
      },
    });
    const result = draaiNode(
      [schrijfDriver(werkmap), werkmap.bron, JSON.stringify(['faal', 'laatste'])],
      werkmap.bron,
      { TMPDIR: werkmap.tmp },
    );
    expect(result.code).not.toBe(0);
    expect(result.alles).toContain('✗ check:app-init: faal faalt na app:init');
    expect(existsSync(marker)).toBe(false);
  });

  test('AC-3: planAppInit zonder guard: exit ≠ 0 in de kopie, maar slaagt in de bron zonder init', () => {
    const setup = opzet(['eist-plan']);
    expect(draaiNode(['probe/plan.mjs'], setup.werkmap.bron, {}).code).toBe(0);
    const result = draai(setup);
    expect(result.code).not.toBe(0);
    expect(result.alles).toContain('✗ check:app-init: eist-plan faalt na app:init');
  });
});

describe('de kopie na init', () => {
  test('AC-4: naam, gates, CODEOWNERS en de twee refs; AC-6: --bewaar laat de map staan en meldt het pad', () => {
    const setup = opzet(['ok']);
    const result = draai(setup, { vlaggen: ['--bewaar'] });
    expect(result.code, result.alles).toBe(0);
    const kopie = bewaardPad(result.stdout);
    try {
      expect(path.dirname(kopie)).toBe(setup.werkmap.tmp);
      expect(path.basename(kopie).startsWith(PREFIX)).toBe(true);
      expect(existsSync(kopie)).toBe(true);
      expect(JSON.parse(readFileSync(path.join(kopie, 'package.json'), 'utf8'))).toMatchObject({ name: 'proef-app' });
      expect(readFileSync(path.join(kopie, '.claude/gates.json'), 'utf8')).not.toContain('onderhoud');
      expect(readFileSync(path.join(kopie, '.github/CODEOWNERS'), 'utf8')).toContain('@proef-eigenaar');
      expect(git(kopie, ['log', '-1', '--format=%s', 'origin/main'])).toBe('chore: rename to proef-app');
      expect(git(kopie, ['rev-parse', 'origin/main'])).toBe(git(kopie, ['rev-parse', 'HEAD']));
      expect(git(kopie, ['log', '-1', '--format=%s', 'template/main'])).toBe('basis');
      expect(git(kopie, ['status', '--porcelain'])).toBe('');
    } finally {
      rmSync(kopie, { recursive: true, force: true });
    }
  });

  test('AC-5: app:init faalt (README zonder de kop): exit ≠ 0, de melding, en geen enkele gate draait', () => {
    const werkmap = nieuweWerkmap(dirs);
    const marker = path.join(werkmap.base, 'gate-gedraaid');
    maakBron(werkmap, {
      readme: '# Iets anders\n\nGeen template.\n',
      scripts: { ...SCRIPTS, markeer: 'node probe/marker.mjs' },
      probes: {
        ...PROBES,
        'marker.mjs': `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'x');\n`,
      },
    });
    const result = draaiNode([schrijfDriver(werkmap), werkmap.bron, JSON.stringify(['markeer'])], werkmap.bron, {
      TMPDIR: werkmap.tmp,
    });
    expect(result.code).not.toBe(0);
    expect(result.alles).toContain('✗ check:app-init: app:init faalde in de kopie');
    expect(result.alles).toContain('✗ app:init: README.md: begint niet met');
    expect(existsSync(marker)).toBe(false);
    expect(overgebleven(werkmap, PREFIX)).toEqual([]);
  });
});

describe('opruimen', () => {
  test.each([
    ['geslaagd', ['ok']],
    ['gefaald (rode gate)', ['faal']],
  ])('AC-6: na een %s run bestaat de tijdelijke map niet meer', (_naam, scripts) => {
    const setup = opzet(scripts);
    const result = draai(setup);
    if (scripts[0] === 'ok') expect(result.code, result.alles).toBe(0);
    else expect(result.alles).toContain('✗ check:app-init: faal faalt na app:init');
    expect(overgebleven(setup.werkmap, PREFIX)).toEqual([]);
  });

  test('AC-6: de kopie is tijdens de run onder TMPDIR gemaakt (de test ziet dus echt een opruimactie)', () => {
    const setup = opzet(['ok']);
    const result = draai(setup, { vlaggen: ['--bewaar'] });
    const kopie = bewaardPad(result.stdout);
    expect(overgebleven(setup.werkmap, PREFIX)).toEqual([path.basename(kopie)]);
  });

  test.each([
    ['SIGTERM', 143],
    ['SIGINT', 130],
  ] as const)(
    'AC-7: %s tijdens een draaiende gate ruimt op en eindigt met exit %i',
    async (signal, verwacht) => {
      const werkmap = nieuweWerkmap(dirs);
      const marker = path.join(werkmap.base, 'gate-draait');
      maakBron(werkmap, {
        scripts: { hang: 'node probe/hang.mjs' },
        probes: {
          'hang.mjs': [
            "import { writeFileSync } from 'node:fs';",
            `writeFileSync(${JSON.stringify(marker)}, 'x');`,
            'setTimeout(() => {}, 15_000);',
            '',
          ].join('\n'),
        },
      });
      const child = spawn(process.execPath, [schrijfDriver(werkmap), werkmap.bron, JSON.stringify(['hang'])], {
        cwd: werkmap.bron,
        env: { ...process.env, TMPDIR: werkmap.tmp },
        stdio: 'ignore',
      });
      const klaar = new Promise<number | null>((resolve) =>
        child.on('close', (code) => {
          resolve(code);
        }),
      );
      for (let poging = 0; poging < 200 && !existsSync(marker); poging += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(existsSync(marker), 'de gate is nooit gestart').toBe(true);
      expect(overgebleven(werkmap, PREFIX)).toHaveLength(1);
      child.kill(signal);
      const code = await Promise.race([
        klaar,
        new Promise<'te-laat'>((resolve) =>
          setTimeout(() => {
            resolve('te-laat');
          }, 10_000),
        ),
      ]);
      if (code === 'te-laat') child.kill('SIGKILL');
      expect(code).toBe(verwacht);
      expect(overgebleven(werkmap, PREFIX)).toEqual([]);
    },
    30_000,
  );
});

describe('de opruimguard', () => {
  function ruim(werkmap: Werkmap, pad: string, prefix: string) {
    const driver = path.join(werkmap.base, 'ruim.mjs');
    writeFileSync(
      driver,
      [
        `import { ruimOp } from ${JSON.stringify(MODULE)};`,
        'const [pad, prefix] = process.argv.slice(2);',
        'console.log(`RESULTAAT:${await ruimOp(pad, prefix)}`);',
        '',
      ].join('\n'),
    );
    return draaiNode([driver, pad, prefix], werkmap.base, { TMPDIR: werkmap.tmp });
  }

  function slachtoffer(pad: string): string {
    mkdirSync(pad, { recursive: true });
    writeFileSync(path.join(pad, 'bestand'), 'x');
    return pad;
  }

  test.each([
    ['buiten os.tmpdir()', (w: Werkmap) => path.join(w.base, `${PREFIX}x`), undefined],
    ['zonder het prefix', (w: Werkmap) => path.join(w.tmp, 'ander-x'), undefined],
    ['dieper dan direct onder os.tmpdir()', (w: Werkmap) => path.join(w.tmp, 'sub', `${PREFIX}x`), undefined],
    ['het prefix van de andere check', (w: Werkmap) => path.join(w.tmp, 'new-resource-x'), undefined],
    [
      // Aangeboden pad bevat .. en wijst naar <base>/<prefix>esc: buiten os.tmpdir(), maar met prefix.
      'met .. dat uit os.tmpdir() ontsnapt',
      (w: Werkmap) => [w.tmp, 'sub', '..', '..', `${PREFIX}esc`].join('/'),
      (w: Werkmap) => path.join(w.base, `${PREFIX}esc`),
    ],
  ])('AC-8: weigert een pad %s: er wordt niets verwijderd en het is gemeld', (_naam, maak, bestaat) => {
    const werkmap = nieuweWerkmap(dirs);
    const pad = maak(werkmap);
    const doel = slachtoffer(bestaat?.(werkmap) ?? pad);
    const result = ruim(werkmap, pad, PREFIX);
    expect(result.code, result.alles).toBe(0);
    expect(result.stdout).toContain('RESULTAAT:false');
    expect(result.alles).toContain(`✗ check:app-init: weigert ${pad} te verwijderen: niet de eigen tijdelijke map`);
    expect(existsSync(path.join(doel, 'bestand'))).toBe(true);
  });

  test('AC-8: een eigen tijdelijke map (direct onder TMPDIR, met het prefix) wordt wel verwijderd', () => {
    const werkmap = nieuweWerkmap(dirs);
    const pad = slachtoffer(path.join(werkmap.tmp, `${PREFIX}ok`));
    const result = ruim(werkmap, pad, PREFIX);
    expect(result.stdout).toContain('RESULTAAT:true');
    expect(existsSync(pad)).toBe(false);
  });
});

describe('de bron blijft ongemoeid', () => {
  test.each([
    ['geslaagd', ['ok']],
    ['gefaald', ['faal']],
  ])('AC-9: na een %s run zijn status, HEAD en node_modules/.bin gelijk', (_naam, scripts) => {
    const setup = opzet(scripts);
    const voor = toestand(setup.werkmap.bron);
    const result = draai(setup);
    if (scripts[0] === 'ok') expect(result.code, result.alles).toBe(0);
    else expect(result.alles).toContain('✗ check:app-init: faal faalt na app:init');
    expect(toestand(setup.werkmap.bron)).toEqual(voor);
    expect(existsSync(path.join(setup.werkmap.bron, 'node_modules'))).toBe(true);
  });

  test('AC-10: GIT_DIR en GIT_INDEX_FILE naar de bron (git-hook): geen commit, index ongewijzigd, run slaagt', () => {
    const setup = opzet(['ok']);
    const gitDir = path.join(setup.werkmap.bron, '.git');
    const indexVoor = readFileSync(path.join(gitDir, 'index'));
    const voor = toestand(setup.werkmap.bron);
    const result = draai(setup, { env: { GIT_DIR: gitDir, GIT_INDEX_FILE: path.join(gitDir, 'index') } });
    expect(result.code, result.alles).toBe(0);
    expect(readFileSync(path.join(gitDir, 'index')).equals(indexVoor)).toBe(true);
    expect(toestand(setup.werkmap.bron)).toEqual(voor);
    expect(git(setup.werkmap.bron, ['rev-list', '--count', 'HEAD'])).toBe('1');
  });
});

describe('geen pnpm, npm of docker', () => {
  test('AC-11: nep-uitvoerbare bestanden vooraan in PATH worden nooit aangeroepen', () => {
    const setup = opzet(['samen']);
    const nep = mkdtempSync(path.join(tmpdir(), 'nep-bin-'));
    dirs.push(nep);
    const marker = path.join(nep, 'aangeroepen');
    for (const naam of ['pnpm', 'npm', 'docker']) {
      writeFileSync(path.join(nep, naam), `#!/bin/sh\necho ${naam} >> ${marker}\nexit 0\n`);
      chmodSync(path.join(nep, naam), 0o755);
    }
    const result = draai(setup, { env: { PATH: `${nep}${path.delimiter}${process.env['PATH'] ?? ''}` } });
    expect(result.code, result.alles).toBe(0);
    expect(existsSync(marker)).toBe(false);
  });
});

describe('verwijzingen in de repo', () => {
  const ciTekst = readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');

  /** De regels van een job (twee spaties ingesprongen sleutel) tot de volgende job. */
  function jobBlok(naam: string): string[] {
    const regels = ciTekst.split('\n');
    const naamIndex = regels.findIndex((regel) => regel === `    name: ${naam}`);
    if (naamIndex === -1) return [];
    let start = naamIndex;
    while (start > 0 && !/^ {2}[\w-]+:\s*$/.test(regels[start] ?? '')) start -= 1;
    let eind = naamIndex + 1;
    while (eind < regels.length && !/^ {2}[\w-]+:\s*$/.test(regels[eind] ?? '') && !/^\S/.test(regels[eind] ?? 'x'))
      eind += 1;
    return regels.slice(start, eind);
  }

  test('AC-12: eigen job `check:app-init` met de vorm van `check:new-resource` en het commando pnpm check:app-init', () => {
    const app = jobBlok('check:app-init');
    const resource = jobBlok('check:new-resource');
    expect(app.length, 'job met name: check:app-init ontbreekt in ci.yml').toBeGreaterThan(0);
    expect(resource.length).toBeGreaterThan(0);
    expect(resource.join('\n')).not.toContain('check:app-init');
    expect(app.join('\n')).not.toContain('check:new-resource');
    const vorm = (regels: string[]) =>
      regels
        .slice(1)
        .filter((regel) => !regel.trim().startsWith('#'))
        .join('\n')
        .replaceAll('check:app-init', 'CHECK')
        .replaceAll('check:new-resource', 'CHECK');
    expect(vorm(app)).toBe(vorm(resource));
    expect(app.join('\n')).toContain('- run: pnpm check:app-init');
    expect(app.join('\n')).not.toMatch(/^\s+if:/m);
  });

  test('AC-12: de workflow draait op pull_request en push naar main; package.json start het script', () => {
    expect(ciTekst).toMatch(/^on:\n {2}push:\n {4}branches: \[main\]\n {2}pull_request:/m);
    const pkg: unknown = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const scripts = typeof pkg === 'object' && pkg !== null && 'scripts' in pkg ? pkg.scripts : undefined;
    expect(scripts).toMatchObject({ 'check:app-init': 'node scripts/kit/check-app-init.mjs' });
  });

  test('AC-15: requiredChecks, de checks-lijst van de ruleset en beide opsommingen in nieuwe-app.md', () => {
    const decisions: unknown = JSON.parse(readFileSync(path.join(ROOT, '.claude/decisions.json'), 'utf8'));
    const required =
      typeof decisions === 'object' && decisions !== null && 'requiredChecks' in decisions
        ? decisions.requiredChecks
        : [];
    expect(required).toContain('check:app-init');
    const ruleset = readFileSync(path.join(ROOT, 'scripts/github-ruleset.sh'), 'utf8');
    const lijst = /^checks=\(([^)]*)\)/m.exec(ruleset)?.[1] ?? '';
    expect(lijst.split(/\s+/)).toContain('check:app-init');
    const regels = readFileSync(path.join(ROOT, 'docs/nieuwe-app.md'), 'utf8')
      .split('\n')
      .filter((regel) => regel.includes('check:new-resource'));
    expect(regels.length).toBeGreaterThanOrEqual(2);
    for (const regel of regels) expect(regel).toContain('check:app-init');
  });
});

describe('overslaan en stoppen vóór het kopiëren', () => {
  test('AC-13: een app (geen onderhoud): exit 0, "overgeslagen" en geen tijdelijke map', () => {
    const werkmap = nieuweWerkmap(dirs);
    maakBron(werkmap, { gates: '{\n  "altijdVragen": []\n}\n', scripts: SCRIPTS, probes: PROBES });
    const result = draaiNode([CHECK], werkmap.bron, { TMPDIR: werkmap.tmp });
    expect(result.code, result.alles).toBe(0);
    expect(result.stdout.trim()).toBe('check:app-init: overgeslagen, dit is al een app');
    expect(readdirSync(werkmap.tmp)).toEqual([]);
  });

  test('AC-14: zonder node_modules: exit ≠ 0 met de melding en geen tijdelijke map', () => {
    const werkmap = nieuweWerkmap(dirs);
    maakBron(werkmap, { nodeModules: false, scripts: SCRIPTS, probes: PROBES });
    const result = draaiNode([CHECK], werkmap.bron, { TMPDIR: werkmap.tmp });
    expect(result.code).not.toBe(0);
    expect(result.alles).toContain('✗ check:app-init: node_modules ontbreekt; draai eerst pnpm install');
    expect(readdirSync(werkmap.tmp)).toEqual([]);
  });

  test('importeren van de module doet niets: geen uitvoer, geen map, exit 0', () => {
    const werkmap = nieuweWerkmap(dirs);
    const leeg = path.join(werkmap.base, 'leeg');
    mkdirSync(leeg);
    const result = draaiNode(['--input-type=module', '-e', `await import(${JSON.stringify(CHECK)});`], leeg, {
      TMPDIR: werkmap.tmp,
    });
    expect(result.code, result.alles).toBe(0);
    expect(result.stdout).toBe('');
    expect(readdirSync(werkmap.tmp)).toEqual([]);
  });
});
