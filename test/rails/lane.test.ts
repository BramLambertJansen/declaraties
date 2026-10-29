import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { laneVan, migratieOvertreding, recordAlleenBesluit } from '../../scripts/kit/lane.mjs';
import { plan } from '../../scripts/kit/new-resource.mjs';

// ADR 0046 punt 15: lane-herkenning. `laneVan({ changes, besluiten, mini, config })` is puur.
//   changes   — de name-status-wijzigingen van de PR ({ status: 'A' | 'M' | 'D' | 'R' | 'C', pad, van? })
//   besluiten — de documenten die in de PR een eigenaarstatus krijgen zonder record op main
//   mini      — of dat ene besluitdocument `sjabloon: mini` heeft
//   config    — de gates uit .claude/gates.json op main
// Resultaat: { lane: 'feature' | 'framework' | null, reden: string }.
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
// De bestanden die fase 2 van new:resource leest (zoals new-resource.test.ts), in een tijdelijke map.
const NODIG = [
  '.prettierrc.json',
  'db/ids.json',
  'db/migrations',
  'src/shared/permissions.ts',
  'src/shared/permissions.test.ts',
  'src/shared/contracts/index.ts',
  'src/shared/limits.ts',
  'src/api/app.ts',
  'src/web/copy/ui.ts',
  'src/web/lib/nav.ts',
  'src/web/routes.test.tsx',
];
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
    [
      'twee nieuwe migraties in één feature',
      [A(SPEC), A('db/migrations/20261018120000_demo.sql'), A('db/migrations/20261018120001_more.sql')],
    ],
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

  // GEWIJZIGD (ADR 0046 punt 5): twee specs zonder code zijn nu een besluit-PR (framework-lane); met code blijft het geen lane.
  test('5 twee specs naar een eigenaarstatus, zonder code: besluit-PR (framework)', () => {
    const resultaat = lane([A(SPEC), A('docs/specs/andere.md')], { besluiten: [SPEC, 'docs/specs/andere.md'] });
    expect(resultaat.lane).toBe('framework');
  });

  test('5b twee mini-specs naar een eigenaarstatus mét code: geen lane (feature-lane is één mini-spec)', () => {
    const resultaat = lane([A(SPEC), A('docs/specs/andere.md'), A('src/web/features/demo/page.tsx')], {
      besluiten: [SPEC, 'docs/specs/andere.md'],
    });
    expect(resultaat.lane).toBeNull();
    expect(resultaat.reden).not.toBe('');
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

  // GEWIJZIGD (ADR 0046 punt 2 en 5): meerdere ADR's en specs per besluit-PR mogen, zolang er geen code bij zit.
  test('twee besluitdocumenten in één besluit-PR geven de framework-lane', () => {
    expect(
      lane([A(ADR), A('docs/adr/0098-demo.md')], { besluiten: [ADR, 'docs/adr/0098-demo.md'], mini: false }).lane,
    ).toBe('framework');
  });

  test('een ADR, een oud ADR (M) en een spec als besluiten, zonder code: framework', () => {
    expect(
      lane([A(ADR), M('docs/adr/0050-oud.md'), A(SPEC)], {
        besluiten: [ADR, 'docs/adr/0050-oud.md', SPEC],
        mini: false,
      }).lane,
    ).toBe('framework');
  });

  test('meerdere besluitdocumenten met hun record, zonder code: framework', () => {
    expect(lane([A(ADR), A(SPEC), M('.claude/decisions.json')], { besluiten: [ADR, SPEC], mini: false }).lane).toBe(
      'framework',
    );
  });

  test.each([
    ['een bronbestand', 'src/api/routes/demo.ts'],
    ['een bestaand script', 'scripts/kit/check-docs.mjs'],
  ])('meerdere besluitdocumenten mét %s: geen lane (besluit-PR bevat geen code)', (_naam, pad) => {
    const resultaat = lane([A(ADR), A('docs/adr/0098-demo.md'), A(pad)], {
      besluiten: [ADR, 'docs/adr/0098-demo.md'],
      mini: false,
    });
    expect(resultaat.lane).toBeNull();
    expect(resultaat.reden).not.toBe('');
  });

  test.each([['docs/roadmap.md'], ['CHANGELOG.md']])(
    "twee ADR's en %s: geen lane (alleen docs/adr, docs/specs en het record)",
    (pad) => {
      const resultaat = lane([A(ADR), A('docs/adr/0098-demo.md'), M(pad)], {
        besluiten: [ADR, 'docs/adr/0098-demo.md'],
        mini: false,
      });
      expect(resultaat.lane).toBeNull();
    },
  );

  test('een volledige spec met code buiten de feature-lane (10): geen lane', () => {
    expect(lane([A(SPEC), A('src/api/routes/demo.ts')], { mini: false }).lane).toBeNull();
  });

  test('zonder besluit in de PR is er geen lane', () => {
    expect(lane([M('scripts/kit/check-docs.mjs')], { besluiten: [] }).lane).toBeNull();
  });
});

// Het lichte migratiepad is voortaan uitsluitend het bestaande owner-patroon. Historische positieve fixtures met
// using (true), onbeschermde tabellen of meerdere tabellen zijn daarom aangepast of hieronder negatief gemaakt.
function ownerTabel(naam = 'public.notes', veld = 'body text not null'): string {
  return `create table ${naam} (
    id uuid primary key default gen_random_uuid(),
    owner_id text not null default app.current_user_id() references better_auth."user" (id) on delete cascade,
    created_at timestamptz not null default now(), ${veld}
  );
  alter table ${naam} enable row level security;
  alter table ${naam} force row level security;
  grant select, delete on ${naam} to app_authenticated;
  create policy notes_select on ${naam} for select to app_authenticated using (owner_id = (select app.current_user_id()));
  create policy notes_insert on ${naam} for insert to app_authenticated with check (owner_id = (select app.current_user_id()));
  create policy notes_update on ${naam} for update to app_authenticated using (owner_id = (select app.current_user_id())) with check (owner_id = (select app.current_user_id()));
  create policy notes_delete on ${naam} for delete to app_authenticated using (owner_id = (select app.current_user_id()));`;
}

describe('migratieOvertreding: alleen een nieuwe tabel', () => {
  const tabel = [
    '-- migrate:up',
    ownerTabel(),
    'create index notes_body_idx on public.notes (body);',
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

describe('migratieOvertreding: bewaarcatalogus (AC-10)', () => {
  const MAAK = ownerTabel();
  const NO_FORCE = 'alter table app.retention no force row level security;';
  const FORCE = 'alter table app.retention force row level security;';
  const RIJ = "insert into app.retention values ('public.notes', null, null, 'app', 'verdwijnt met het account');";
  const migratie = (...delen: string[]) => `-- migrate:up\n${delen.join('\n')}\n-- migrate:down\n`;

  test.each([
    ['de drie statements om de eigen tabel', [MAAK, NO_FORCE, RIJ, FORCE]],
    [
      'hoofdletters, witruimte en regelafbreking',
      [
        MAAK,
        'ALTER TABLE app.retention\n  NO FORCE ROW LEVEL SECURITY;',
        "INSERT INTO app.retention VALUES (\n  'public.notes', null, null, 'app', 'reden'\n);",
        'ALTER TABLE APP.RETENTION FORCE ROW LEVEL SECURITY;',
      ],
    ],
    [
      'een reden met puntkomma en -- erin',
      [MAAK, NO_FORCE, "insert into app.retention values ('public.notes', null, null, 'app', 'a; b -- c');", FORCE],
    ],
  ])('%s: geen overtreding', (_naam, delen) => {
    expect(migratieOvertreding(migratie(...delen))).toBeNull();
  });

  test.each([
    [
      'een eigen tabel in een ander schema (buiten het generatorpatroon)',
      [
        ownerTabel('app.things'),
        NO_FORCE,
        "insert into app.retention values ('app.things', null, null, 'app', 'reden');",
        FORCE,
      ],
    ],
    [
      'twee eigen tabellen, elk met eigen rij',
      [
        MAAK,
        ownerTabel('public.more'),
        NO_FORCE,
        RIJ,
        "insert into app.retention values ('public.more', null, null, 'app', 'reden');",
        FORCE,
      ],
    ],
    [
      'rij voor een andere tabel dan de eigen nieuwe',
      [MAAK, NO_FORCE, "insert into app.retention values ('public.other', null, null, 'app', 'reden');", FORCE],
    ],
    [
      'rij voor dezelfde naam in een ander schema',
      [MAAK, NO_FORCE, "insert into app.retention values ('app.notes', null, null, 'app', 'reden');", FORCE],
    ],
    [
      'rij voor een bestaande app-tabel',
      [MAAK, NO_FORCE, "insert into app.retention values ('app.audit_log', null, null, 'app', 'reden');", FORCE],
    ],
    [
      'twee rijen waarvan een vreemde',
      [
        MAAK,
        NO_FORCE,
        "insert into app.retention values ('public.notes', null, null, 'app', 'a'), ('public.other', null, null, 'app', 'b');",
        FORCE,
      ],
    ],
    [
      'rij uit een select',
      [MAAK, NO_FORCE, "insert into app.retention select 'public.notes', null, null, 'app', 'reden';", FORCE],
    ],
    [
      'rij met een andere purger dan app',
      [MAAK, NO_FORCE, "insert into app.retention values ('public.notes', null, null, 'job', 'reden');", FORCE],
    ],
    [
      'rij met een bewaartermijn in plaats van null',
      [
        MAAK,
        NO_FORCE,
        "insert into app.retention values ('public.notes', 'created_at', interval '1 day', 'app', 'reden');",
        FORCE,
      ],
    ],
    ['insert in app.audit_log', [MAAK, 'insert into app.audit_log values (1);']],
    ['insert in app.rate_limits', [MAAK, 'insert into app.rate_limits values (1);']],
    ['insert in de eigen nieuwe tabel', [MAAK, 'insert into public.notes values (gen_random_uuid());']],
    ['insert in een bestaande tabel', [MAAK, 'insert into public.accounts values (1);']],
    ['app.retention: disable row level security', [MAAK, 'alter table app.retention disable row level security;']],
    ['app.retention: enable row level security', [MAAK, 'alter table app.retention enable row level security;']],
    ['app.retention: drop', [MAAK, 'drop table app.retention;']],
    ['app.retention: add column', [MAAK, 'alter table app.retention add column x int;']],
    ['app.retention: rename', [MAAK, 'alter table app.retention rename to r;']],
    ['app.retention: update', [MAAK, 'update app.retention set keep = null where true;']],
    ['app.retention: delete', [MAAK, 'delete from app.retention;']],
    ['app.retention: truncate', [MAAK, 'truncate app.retention;']],
    ['truncate van de eigen tabel', [MAAK, 'truncate public.notes;']],
    ['no force op app.audit_log', [MAAK, 'alter table app.audit_log no force row level security;']],
    ['no force op een bestaande tabel', [MAAK, 'alter table public.accounts no force row level security;']],
    ['no force op de eigen nieuwe tabel', [MAAK, 'alter table public.notes no force row level security;']],
    ['force op een bestaande tabel', [MAAK, 'alter table public.accounts force row level security;']],
  ])('%s: overtreding', (_naam, delen) => {
    expect(typeof migratieOvertreding(migratie(...delen))).toBe('string');
  });

  // Een cijfer in de tabelnaam (controleerNaam staat dat toe, bijv. invoices2) mag de rij niet doen afwijzen.
  test.each([
    ['public.invoices2', 'eindigt op een cijfer'],
    ['public.things2', 'eindigt op een cijfer in een tweede tabelnaam'],
    ['public.line_items_v2', 'heeft een cijfer middenin'],
  ])('tabel %s (%s): geen overtreding', (tabel) => {
    const delen = [
      ownerTabel(tabel),
      NO_FORCE,
      `insert into app.retention values ('${tabel}', null, null, 'app', 'reden');`,
      FORCE,
    ];
    expect(migratieOvertreding(migratie(...delen))).toBeNull();
  });

  test.each([
    [
      'rij voor invoices3 terwijl invoices2 wordt aangemaakt',
      [
        'create table public.invoices2 (id uuid primary key);',
        NO_FORCE,
        "insert into app.retention values ('public.invoices3', null, null, 'app', 'reden');",
        FORCE,
      ],
    ],
    [
      'rij met cijfer in een ander schema dan aangemaakt',
      [
        'create table public.invoices2 (id uuid primary key);',
        NO_FORCE,
        "insert into app.retention values ('app.invoices2', null, null, 'app', 'reden');",
        FORCE,
      ],
    ],
  ])('%s: overtreding', (_naam, delen) => {
    expect(typeof migratieOvertreding(migratie(...delen))).toBe('string');
  });

  test('de migratie die new:resource voor invoices2 genereert: geen overtreding', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lane-test-'));
    for (const pad of NODIG) cpSync(pad, path.join(root, pad), { recursive: true });
    mkdirSync(path.join(root, 'docs/specs'), { recursive: true });
    writeFileSync(
      path.join(root, 'docs/specs/invoices2.md'),
      '---\nstatus: goedgekeurd\nnamespace: invoices2\n---\n\n# invoices2\n',
    );
    const p = await plan(root, 'invoices2', { rollen: ['user'], nu: new Date('2000-01-01T00:00:00Z') });
    const sql = p.bestanden.find(({ pad }) => /^db\/migrations\/\d{14}_invoices2\.sql$/.test(pad))?.inhoud ?? '';

    expect(sql).toContain("insert into app.retention values (\n  'public.invoices2'");
    expect(migratieOvertreding(sql)).toBeNull();
  });

  // De laatste toggle van app.retention moet `force` zijn: anders blijft FORCE RLS uit na de migratie.
  test.each([
    ['no force zonder daaropvolgende force', [MAAK, NO_FORCE, RIJ]],
    ['force voor no force, zonder afsluitende force', [MAAK, FORCE, NO_FORCE, RIJ]],
    ['twee no force zonder force ertussen, eindigend op no force', [MAAK, NO_FORCE, RIJ, NO_FORCE]],
    ['alleen no force', [MAAK, NO_FORCE]],
  ])('%s: overtreding (de laatste toggle is niet force)', (_naam, delen) => {
    expect(typeof migratieOvertreding(migratie(...delen))).toBe('string');
  });

  test.each([
    ['no force, insert, force', [MAAK, NO_FORCE, RIJ, FORCE]],
    ['geen toggle en geen insert, tabel met cijfers', [ownerTabel('public.invoices2')]],
  ])('%s: geen overtreding (de laatste toggle is force)', (_naam, delen) => {
    expect(migratieOvertreding(migratie(...delen))).toBeNull();
  });

  test.each([
    [
      'no force, twee inserts voor eigen tabellen, force',
      [
        MAAK,
        ownerTabel('public.more'),
        NO_FORCE,
        RIJ,
        "insert into app.retention values ('public.more', null, null, 'app', 'reden');",
        FORCE,
      ],
    ],
    ['no force, force, no force, force', [MAAK, NO_FORCE, FORCE, NO_FORCE, RIJ, FORCE]],
  ])('%s: vraagt nu de zwaardere route', (_naam, delen) => {
    expect(migratieOvertreding(migratie(...delen))).toBeTypeOf('string');
  });

  // De reden: een kale waarde met cijfer en een tekst met spaties of leestekens (wordt `?`) zijn beide toegestaan.
  test.each([
    ['een kale reden met cijfer', "'v2'"],
    ['een reden met spaties en leestekens', "'verdwijnt met het account (owner_id), v2!'"],
  ])('%s in de insert van een eigen tabel: geen overtreding', (_naam, reden) => {
    const rij = `insert into app.retention values ('public.notes', null, null, 'app', ${reden});`;
    expect(migratieOvertreding(migratie(MAAK, NO_FORCE, rij, FORCE))).toBeNull();
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
    expect(migratieOvertreding(ownerTabel('public.n', "body text default 'x; -- y'"))).toBeNull();
  });
});

describe('recordAlleenBesluit', () => {
  const record = (file: string, digest = 'a') => ({
    file,
    digest: digest.repeat(64),
    repository: 'r/r',
    branch: 'b/c',
    status: 'goedgekeurd',
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
