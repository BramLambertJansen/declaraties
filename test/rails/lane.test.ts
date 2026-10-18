import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { laneVan, migratieOvertreding, recordAlleenBesluit } from '../../scripts/kit/lane.mjs';

// ADR 0029 punt 7: lane-herkenning. `laneVan({ changes, besluiten, mini, config })` is puur.
//   changes   — de name-status-wijzigingen van de PR ({ status: 'A' | 'M' | 'D' | 'R' | 'C', pad, van? })
//   besluiten — de documenten die in de PR een eigenaarstatus krijgen zonder record op main
//   mini      — of dat ene besluitdocument `sjabloon: mini` heeft
//   config    — de gates uit .claude/gates.json op main
// Resultaat: { lane: 'feature' | 'framework' | null, reden: string }.
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const SPEC = 'docs/specs/demo.md';
const ADR = 'docs/adr/0099-demo.md';

interface Wijziging {
  status: string;
  pad: string;
  van?: string;
}

const A = (pad: string): Wijziging => ({ status: 'A', pad });
const M = (pad: string): Wijziging => ({ status: 'M', pad });

function lane(changes: Wijziging[], opties: { besluiten?: string[]; mini?: boolean } = {}) {
  return laneVan({ changes, besluiten: opties.besluiten ?? [SPEC], mini: opties.mini ?? true, config });
}

describe('feature-lane: positief', () => {
  test('mini-spec, web, route en nieuwe test', () => {
    const resultaat = lane([
      A(SPEC),
      A('src/web/features/demo/page.tsx'),
      A('src/api/routes/demo.ts'),
      A('src/api/routes/demo.test.ts'),
    ]);
    expect(resultaat.lane).toBe('feature');
  });

  test('een bestaand bronbestand wijzigen mag, ook src/api/app.ts en permissions.ts (punt 6)', () => {
    expect(lane([M(SPEC), M('src/api/app.ts'), M('src/shared/permissions.ts')]).lane).toBe('feature');
  });

  test.each([
    ['CHANGELOG', 'CHANGELOG.md'],
    ['de roadmap', 'docs/roadmap.md'],
    ['andere docs', 'docs/gouden-pad.md'],
    ['het schema-snapshot', 'db/schema.snapshot.sql'],
    ['deploy (gate, geen voorReview)', 'deploy/vercel/vercel.json'],
    ['renovate.json', 'renovate.json'],
    ['src/api/server.ts', 'src/api/server.ts'],
  ])('%s mag meewijzigen', (_naam, pad) => {
    expect(lane([A(SPEC), A('src/web/features/demo/page.tsx'), M(pad)]).lane).toBe('feature');
  });

  test('een nieuwe migratie en een nieuwe pgTAP-test', () => {
    expect(lane([A(SPEC), A('db/migrations/20261018120000_demo.sql'), A('db/tests/demo.sql')]).lane).toBe('feature');
  });
});

describe('feature-lane: negatief (moet de strenge route geven)', () => {
  test.each([
    ['1 een pad in src/core', [A(SPEC), M('src/core/web/ui/toast.tsx')]],
    ['2a een pad uit voorReview: scripts', [A(SPEC), M('scripts/kit/check-docs.mjs')]],
    ['2b een pad uit voorReview: .claude', [A(SPEC), M('.claude/gates.json')]],
    ['2c een pad uit voorReview: workflow', [A(SPEC), M('.github/workflows/guard.yml')]],
    ['CLAUDE.local.md in src', [A(SPEC), A('src/web/CLAUDE.local.md')]],
    ['een geneste .claude-map', [A(SPEC), A('src/web/.claude/skills/x/SKILL.md')]],
    ['een bestaande spec verwijderen', [A(SPEC), { status: 'D', pad: 'docs/specs/oud.md' }]],
    ['een geneste CLAUDE.md', [A(SPEC), A('src/web/CLAUDE.md')]],
    ['een geneste AGENTS.md', [A(SPEC), A('src/api/AGENTS.md')]],
    ['onbekend: .vscode/tasks.json', [A(SPEC), A('.vscode/tasks.json')]],
    ['onbekend: .envrc', [A(SPEC), A('.envrc')]],
    ['onbekend: .mcp.json', [A(SPEC), A('.mcp.json')]],
    ['onbekend: postcss.config.js', [A(SPEC), A('postcss.config.js')]],
    ['een kopie van src/core naar src/web', [A(SPEC), { status: 'C', van: 'src/core/x.ts', pad: 'src/web/x.ts' }]],
    ['2d een pad uit voorReview: package.json', [A(SPEC), M('package.json')]],
    ['3a een gewijzigde bestaande test', [A(SPEC), M('src/web/features/demo/page.test.tsx')]],
    ['3b een verwijderde bestaande test', [A(SPEC), { status: 'D', pad: 'test/rails/lane.test.ts' }]],
    ['4 een ADR in dezelfde PR', [A(SPEC), A(ADR)]],
    ['6 een gewijzigde migratie', [A(SPEC), M('db/migrations/20260101000000_oud.sql')]],
    ['6b een verwijderde migratie', [A(SPEC), { status: 'D', pad: 'db/migrations/20260101000000_oud.sql' }]],
    ['7 een rename van src/core naar src/web', [A(SPEC), { status: 'R', van: 'src/core/x.ts', pad: 'src/web/x.ts' }]],
    ['7b een rename van een bestaande test', [A(SPEC), { status: 'R', van: 'test/a.test.ts', pad: 'test/b.test.ts' }]],
  ])('%s', (_naam, changes) => {
    const resultaat = lane(changes);
    expect(resultaat.lane).toBeNull();
    expect(resultaat.reden).not.toBe('');
  });

  test('5 twee specs naar een eigenaarstatus', () => {
    const resultaat = lane([A(SPEC), A('docs/specs/andere.md')], { besluiten: [SPEC, 'docs/specs/andere.md'] });
    expect(resultaat.lane).toBeNull();
  });

  test('8 een volledige spec (geen sjabloon: mini) met code', () => {
    expect(lane([A(SPEC), A('src/api/routes/demo.ts')], { mini: false }).lane).toBeNull();
  });

  test('een ontbrekende voorReview telt elke gate als voorReview (faalt dicht)', () => {
    const zonder = loadConfig(
      JSON.stringify({ ...JSON.parse(readFileSync('.claude/gates.json', 'utf8')), voorReview: undefined }),
    );
    expect(
      laneVan({ changes: [A(SPEC), M('docs/dod.md')], besluiten: [SPEC], mini: true, config: zonder }).lane,
    ).toBeNull();
  });
});

describe('framework-lane', () => {
  test('alleen een ADR slaagt', () => {
    expect(lane([A(ADR)], { besluiten: [ADR], mini: false }).lane).toBe('framework');
  });

  test('een ADR met zijn record slaagt', () => {
    expect(lane([A(ADR), M('.claude/decisions.json')], { besluiten: [ADR], mini: false }).lane).toBe('framework');
  });

  test('10 een in-PR-status én code geeft geen lane', () => {
    expect(lane([A(ADR), M('scripts/kit/check-docs.mjs')], { besluiten: [ADR], mini: false }).lane).toBeNull();
  });

  test('twee besluitdocumenten in één framework-PR geven geen lane', () => {
    expect(
      lane([A(ADR), A('docs/adr/0098-demo.md')], { besluiten: [ADR, 'docs/adr/0098-demo.md'], mini: false }).lane,
    ).toBeNull();
  });

  test('zonder besluit in de PR is er geen lane', () => {
    expect(lane([M('scripts/kit/check-docs.mjs')], { besluiten: [] }).lane).toBeNull();
  });
});

describe('migratieOvertreding: alleen een nieuwe tabel', () => {
  const tabel = [
    '-- migrate:up',
    'create table public.notes (id uuid primary key, body text not null);',
    'alter table public.notes enable row level security;',
    'alter table public.notes force row level security;',
    'create index notes_body_idx on public.notes (body);',
    'grant select on public.notes to app_authenticated;',
    'create policy notes_select_own on public.notes for select to app_authenticated using (true);',
    '-- migrate:down',
    'drop table public.notes;',
  ].join('\n');

  test('tabel, RLS, index, grant en policy: geen overtreding (het down-deel telt niet)', () => {
    expect(migratieOvertreding(tabel)).toBeNull();
  });

  test.each([
    ['een bestaande tabel wijzigen', 'alter table public.accounts add column x int;'],
    ['een functie', 'create function app.f() returns int language sql return 1;'],
    ['security definer', 'create function app.f() returns int language sql security definer return 1;'],
    ['een trigger', 'create trigger t before update on public.notes for each statement execute function app.f();'],
    ['rijen wijzigen', 'update public.notes set body = 1;'],
    ['een rol', 'create role evil;'],
    ['een drop', 'drop table public.accounts;'],
    ['B1 -- in een tekst verbergt een drop', "create table public.n (a text default '--'); drop table app.accounts;"],
    [
      'B1 /* in een tekst',
      "create table public.n (a text default '/*'); drop table app.accounts; create table public.m (b text default '*/');",
    ],
    ['B1 dollar-quote', 'create table public.n (a text default $$--$$); drop table app.accounts;'],
    [
      'B1 dollar-quote verbergt een drop achter een enkele quote',
      "create table public.n (a text default $$ ' $$); drop table app.accounts; create table public.m (b text default ' $$)",
    ],
    ['B1 E-string met backslash', "create table public.n (a text default e'\\'); drop table app.accounts; --'); "],
    ['B2 rolgrant', 'create table public.n (a int); grant app_definer to app_authenticated;'],
    [
      'B2 grant op een bestaand object',
      'create table public.n (a int); grant select on better_auth.account to app_authenticated;',
    ],
    [
      'B2 grant op alle tabellen',
      'create table public.n (a int); grant all on all tables in schema app to app_authenticated;',
    ],
    [
      'B3 policy op een bestaande tabel',
      'create table public.n (a int); create policy leak on app.accounts for select to app_authenticated using (true);',
    ],
    ['B4 create table as select', 'create table public.x as select * from better_auth.account;'],
    ['B4 partition of', 'create table public.x partition of app.audit_log for values from (1) to (2);'],
    ['B4 inherits', 'create table public.x (a int) inherits (app.audit_log);'],
    ['B4 like', 'create table public.x (like app.audit_log);'],
    ['index op een bestaande tabel', 'create table public.n (a int); create index i on app.accounts (id);'],
    ['geen nieuwe tabel', 'create index i on public.notes (id);'],
  ])('%s: overtreding', (_naam, sql) => {
    expect(typeof migratieOvertreding(`-- migrate:up\n${sql}\n`)).toBe('string');
  });
});

describe('migratieOvertreding: dbmate-marker en template', () => {
  test('B5 -- migrate:downx is geen down-marker voor dbmate: het deel erna telt als up', () => {
    const tekst =
      '-- migrate:up\ncreate table public.n (a int);\n-- migrate:downx\ndrop table app.accounts;\n-- migrate:down\n';
    expect(typeof migratieOvertreding(tekst)).toBe('string');
  });

  test('het resultaat van pnpm new:resource (templatevorm met "user" en defaults) is geen overtreding', () => {
    const tekst = readFileSync('scripts/kit/templates/migratie.sql.tmpl', 'utf8')
      .replaceAll('__tabel__', 'notes')
      .replaceAll('__naam__', 'notes');
    expect(migratieOvertreding(tekst)).toBeNull();
  });

  test('een tekst met puntkomma en -- in een kolomdefault blijft één statement', () => {
    expect(migratieOvertreding("create table public.n (a text default 'x; -- y');")).toBeNull();
  });
});

describe('recordAlleenBesluit', () => {
  const record = (file: string, digest = 'a') => ({
    file,
    digest,
    repository: 'r/r',
    branch: 'b/c',
    status: 'x',
    paths: [],
  });
  const register = (decisions: unknown[], requiredChecks = ['gate:fast']) =>
    JSON.stringify({ version: 1, requiredChecks, decisions });

  test('alleen het eigen record wijzigt of komt erbij: ok', () => {
    const basis = register([record('docs/specs/a.md')]);
    expect(
      recordAlleenBesluit({
        basis,
        head: register([record('docs/specs/a.md'), record('docs/specs/b.md')]),
        file: 'docs/specs/b.md',
      }),
    ).toBe(true);
  });

  test('een record van een ander document wijzigt: niet ok', () => {
    const basis = register([record('docs/specs/a.md')]);
    expect(
      recordAlleenBesluit({ basis, head: register([record('docs/specs/a.md', 'b')]), file: 'docs/specs/b.md' }),
    ).toBe(false);
  });

  test('requiredChecks wijzigt: niet ok', () => {
    const basis = register([]);
    expect(recordAlleenBesluit({ basis, head: register([], ['gate:fast', 'x']), file: 'docs/specs/b.md' })).toBe(false);
  });

  test('onleesbaar register: niet ok', () => {
    expect(recordAlleenBesluit({ basis: null, head: '{', file: 'docs/specs/b.md' })).toBe(false);
  });
});
