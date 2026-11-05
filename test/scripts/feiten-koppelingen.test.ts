import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { koppelingenOverzicht, toText } from '../../scripts/kit/feiten-tekst.mjs';
import { VOLGORDE } from '../../scripts/kit/feiten-secties.mjs';
import {
  integrationTraitCatalog,
  registerIntegrations,
  type IntegrationDef,
  type IntegrationTraitInfo,
} from '../../src/core/api/integrations/index.ts';

// Spec koppeling-agentlaag, sectie `koppelingen` van scripts/kit/feiten.mjs: AC-1 (CLI op het lege templateregister),
// AC-2 (koppelingenOverzicht met een fixture-register), AC-5 (geen env, database of compiler) en AC-6 (volgorde en keuzelijst).
// De verwachte kenmerkregels komen uit de echte catalogus in core, niet uit een kopie.

const REPO = path.join(import.meta.dirname, '../..');
const KOP =
  '## koppelingen (register src/api/integrations/index.ts; ontbreekt = geen bouwsteen: stop, skill nieuwe-koppeling)';
const KENMERKEN = ['auth', 'direction', 'cadence', 'sensitivity', 'cost', 'source'];

function feiten(args: readonly string[], options: { env?: NodeJS.ProcessEnv; hook?: string } = {}) {
  const prefix = options.hook === undefined ? [] : ['--import', options.hook];
  return spawnSync(process.execPath, [...prefix, 'scripts/kit/feiten.mjs', ...args], {
    cwd: REPO,
    encoding: 'utf8',
    ...(options.env === undefined ? {} : { env: options.env }),
  });
}

const gebouwd = (info: IntegrationTraitInfo): string[] =>
  info.values.filter(({ built }) => built).map(({ value }) => value);
const ontbreekt = (info: IntegrationTraitInfo): string[] =>
  info.values.filter(({ built }) => !built).map(({ value }) => value);
const opsomming = (values: readonly string[]): string => (values.length === 0 ? '(geen)' : values.join(', '));

// De kenmerkregel uit "Tekst" van de spec, afgeleid uit de catalogus.
function kenmerkRegel(info: IntegrationTraitInfo): string {
  const naam = `${info.trait}${info.list ? ' (lijst)' : ''}`;
  return `- ${naam} · gebouwd: ${opsomming(gebouwd(info))} · ontbreekt: ${opsomming(ontbreekt(info))}`;
}

function kenmerkJson(info: IntegrationTraitInfo) {
  return { kenmerk: info.trait, lijst: info.list, gebouwd: gebouwd(info), ontbreekt: ontbreekt(info) };
}

// De regel van een geregistreerde koppeling uit "Tekst" van de spec: lijstwaarden met `|`.
function koppelingRegel(def: IntegrationDef): string {
  const { traits } = def;
  const kenmerken = [
    `auth=${traits.auth}`,
    `direction=${traits.direction.join('|')}`,
    `cadence=${traits.cadence.join('|')}`,
    `sensitivity=${traits.sensitivity}`,
    `cost=${traits.cost}`,
    `source=${traits.source}`,
  ].join(' ');
  return `- ${def.name} · hosts: ${def.hosts.join(', ')} · ${kenmerken}`;
}

// De regels onder de kop: een sectie zoals feiten.mjs haar toont, zonder de kopregel.
function regelsOnderKop(inhoud: unknown): string[] {
  return toText([{ naam: 'koppelingen', inhoud }])
    .split('\n')
    .slice(1);
}

const catalogus = integrationTraitCatalog();

describe('koppeling-agentlaag/AC-1: feiten.mjs koppelingen op het lege templateregister', () => {
  test('koppeling-agentlaag/AC-1: exit 0, de kop uit "Tekst", (geen) onder geregistreerd: en zes kenmerkregels uit de catalogus', () => {
    const r = feiten(['koppelingen']);

    expect(r.status).toBe(0);
    expect(r.stdout.trimEnd().split('\n')).toStrictEqual([
      KOP,
      'geregistreerd:',
      '(geen)',
      'kenmerken:',
      ...catalogus.map(kenmerkRegel),
    ]);
  });

  test('koppeling-agentlaag/AC-1: de zes kenmerkregels in de volgorde auth, direction, cadence, sensitivity, cost, source', () => {
    const r = feiten(['koppelingen']);
    const regels = r.stdout.split('\n').filter((regel) => / · gebouwd: /.test(regel));

    expect(regels.map((regel) => /^- (\w+)/.exec(regel)?.[1])).toStrictEqual(KENMERKEN);
    // Een kenmerk zonder ontbrekende waarde toont `ontbreekt: (geen)`.
    for (const info of catalogus.filter((item) => ontbreekt(item).length === 0)) {
      expect(regels).toContain(kenmerkRegel(info));
      expect(kenmerkRegel(info)).toMatch(/ontbreekt: \(geen\)$/);
    }
  });

  test('koppeling-agentlaag/AC-1: --json geeft dezelfde data', () => {
    const r = feiten(['koppelingen', '--json']);

    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toStrictEqual({
      koppelingen: {
        register: 'src/api/integrations/index.ts',
        geregistreerd: [],
        kenmerken: catalogus.map(kenmerkJson),
      },
    });
  });
});

describe('koppeling-agentlaag/AC-2: koppelingenOverzicht met het fixture-register', () => {
  // Twee fictieve koppelingen op 127.0.0.1, bewust niet alfabetisch geregistreerd.
  const fixture = registerIntegrations([
    {
      name: 'zuid-bron',
      hosts: ['127.0.0.1'],
      traits: {
        auth: 'none',
        direction: ['read'],
        cadence: ['on-demand'],
        sensitivity: 'normal',
        cost: 'free',
        source: 'partner',
      },
    },
    {
      name: 'noord-bron',
      hosts: ['127.0.0.1', 'localhost'],
      traits: {
        auth: 'app-key',
        direction: ['read'],
        cadence: ['on-demand'],
        sensitivity: 'money',
        cost: 'paid',
        source: 'shared',
      },
    },
  ]);

  test('koppeling-agentlaag/AC-2: per koppeling in registervolgorde de regel met hosts en alle zes kenmerken', () => {
    const overzicht = koppelingenOverzicht(fixture.defs, catalogus);

    expect(regelsOnderKop(overzicht.inhoud)).toStrictEqual([
      'geregistreerd:',
      '- zuid-bron · hosts: 127.0.0.1 · auth=none direction=read cadence=on-demand sensitivity=normal cost=free source=partner',
      '- noord-bron · hosts: 127.0.0.1, localhost · auth=app-key direction=read cadence=on-demand sensitivity=money cost=paid source=shared',
      'kenmerken:',
      ...catalogus.map(kenmerkRegel),
    ]);
  });

  test('koppeling-agentlaag/AC-2: dezelfde waarden in JSON', () => {
    const overzicht = koppelingenOverzicht(fixture.defs, catalogus);

    expect(overzicht.json).toStrictEqual({
      register: 'src/api/integrations/index.ts',
      geregistreerd: [
        {
          naam: 'zuid-bron',
          hosts: ['127.0.0.1'],
          kenmerken: {
            auth: 'none',
            direction: ['read'],
            cadence: ['on-demand'],
            sensitivity: 'normal',
            cost: 'free',
            source: 'partner',
          },
        },
        {
          naam: 'noord-bron',
          hosts: ['127.0.0.1', 'localhost'],
          kenmerken: {
            auth: 'app-key',
            direction: ['read'],
            cadence: ['on-demand'],
            sensitivity: 'money',
            cost: 'paid',
            source: 'shared',
          },
        },
      ],
      kenmerken: catalogus.map(kenmerkJson),
    });
  });

  // De pure functie krijgt ook definities buiten het register: zo is een lijst met meer dan één waarde te tonen, ook al
  // heeft nu alleen `read` en `on-demand` een bouwsteen.
  test('koppeling-agentlaag/AC-2: lijstwaarden met `|`', () => {
    const def: IntegrationDef = {
      name: 'lijst-bron',
      hosts: ['127.0.0.1'],
      traits: {
        auth: 'none',
        direction: ['read', 'write'],
        cadence: ['on-demand', 'periodic'],
        sensitivity: 'normal',
        cost: 'free',
        source: 'app',
      },
    };
    const regels = regelsOnderKop(koppelingenOverzicht([def], catalogus).inhoud);

    expect(regels).toContain(koppelingRegel(def));
    expect(koppelingRegel(def)).toContain('direction=read|write cadence=on-demand|periodic');
  });

  test('koppeling-agentlaag/AC-2: een leeg register geeft (geen) onder geregistreerd:', () => {
    const regels = regelsOnderKop(koppelingenOverzicht([], catalogus).inhoud);

    expect(regels.slice(0, 3)).toStrictEqual(['geregistreerd:', '(geen)', 'kenmerken:']);
  });
});

describe('koppeling-agentlaag/AC-5: zonder env, database, TypeScript-compiler of catalogus', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'feiten-koppelingen-'));
  const hook = path.join(dir, 'block-imports.mjs');
  writeFileSync(
    hook,
    `import { registerHooks } from 'node:module';
const BLOCKED = ['/src/core/api/env.ts', '/src/api/env.ts', '/src/core/api/db/index.ts', '/catalogus.mjs'];
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'pg' || specifier.startsWith('pg/')) throw new Error('BLOCKED_IMPORT pg');
  if (specifier === 'typescript' || specifier.startsWith('typescript/')) throw new Error('BLOCKED_IMPORT typescript');
  const result = nextResolve(specifier, context);
  const blocked = BLOCKED.find((end) => result.url.endsWith(end));
  if (blocked !== undefined) throw new Error('BLOCKED_IMPORT ' + blocked);
  return result;
} });
`,
  );
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const ZONDER = new Set(['DATABASE_URL', 'AUTH_SECRET', 'APP_ENV']);
  const env: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !ZONDER.has(key)));

  test('koppeling-agentlaag/AC-5: feiten.mjs koppelingen --json geeft exit 0 met de sectie', () => {
    const r = feiten(['koppelingen', '--json'], { env, hook });

    expect(r.stderr).not.toContain('BLOCKED_IMPORT');
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toHaveProperty('koppelingen.register', 'src/api/integrations/index.ts');
  });

  test.each([
    ['src/core/api/env.ts', "import('./src/core/api/env.ts')"],
    ['src/core/api/db/index.ts', "import('./src/core/api/db/index.ts')"],
    ['pg', "import('pg')"],
  ])('koppeling-agentlaag/AC-5: de importproef weigert %s wel', (_label, code) => {
    const r = spawnSync(process.execPath, ['--import', hook, '--input-type=module', '-e', `await ${code};`], {
      cwd: REPO,
      encoding: 'utf8',
      env,
    });

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('BLOCKED_IMPORT');
  });
});

describe('koppeling-agentlaag/AC-6: plaats in de volgorde en in de keuzelijst', () => {
  test('koppeling-agentlaag/AC-6: feiten.mjs zonder sectie toont ## koppelingen direct na ## foutcodes', () => {
    const r = feiten([]);
    const koppen = [...r.stdout.matchAll(/^## (\S+)/gm)].map((match) => match[1]);

    expect(r.status).toBe(0);
    expect(koppen).toContain('koppelingen');
    expect(koppen.indexOf('koppelingen')).toBe(koppen.indexOf('foutcodes') + 1);
  });

  test('koppeling-agentlaag/AC-6: VOLGORDE zet koppelingen direct na foutcodes', () => {
    expect(VOLGORDE.indexOf('koppelingen')).toBe(VOLGORDE.indexOf('foutcodes') + 1);
  });

  test('koppeling-agentlaag/AC-6: een onbekende sectie noemt koppelingen in de keuzelijst', () => {
    const r = feiten(['onbekend']);
    const keuzelijst = /Kies uit: (.+)$/m.exec(r.stderr)?.[1] ?? '';

    expect(r.status).toBe(2);
    expect(keuzelijst.split(', ')).toContain('koppelingen');
  });

  test('koppeling-agentlaag/AC-6: de gebruiksregel van feiten.mjs noemt koppelingen', () => {
    const bron = readFileSync(path.join(REPO, 'scripts/kit/feiten.mjs'), 'utf8');
    const gebruik = /^\/\/ Gebruik: node scripts\/kit\/feiten\.mjs \[([^\]]+)\]/m.exec(bron)?.[1] ?? '';

    expect(gebruik.split('|')).toContain('koppelingen');
  });
});
