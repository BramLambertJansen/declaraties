import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, test } from 'vitest';
import { loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import {
  BRANCH,
  PR,
  S1,
  basisRoadmap,
  bouw,
  commit,
  doneItem,
  draaiChecker,
  git,
  maakRepo,
  opruimen,
  read,
  roadmapSleutels,
  roep,
  roadmapTekst,
  write,
  type Fixture,
} from '../hooks/follow-up-kit';

// docs/specs/spec-en-bouw-in-een-pr.md (ADR 0062): spec, tests, code, docs en `gebouwd` in één PR; alleen kritiek werk vraagt
// eerst een aparte besluit-PR. Echte tijdelijke Git-repositories; de checker draait zoals guard.yml hem draait, met main als
// vertrouwde basis en een `gh`-stub (geen netwerk). `laneVan` wordt dynamisch aangeroepen: de parameter `mini` vervalt.
afterEach(opruimen);

const LANE = ['../../scripts/kit', 'lane.mjs'].join('/');
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const gates: unknown = JSON.parse(readFileSync('.claude/gates.json', 'utf8'));

const SPEC = 'docs/specs/demo.md';
const TWEEDE = 'docs/specs/tweede.md';
const ADR = 'docs/adr/0099-demo.md';
const WEB = 'src/web/features/demo/page.tsx';
const ROUTE = 'src/api/routes/demo.ts';
const NIEUWE_TEST = 'src/api/routes/demo.test.ts';
const OUDE_TEST = 'src/api/routes/oud.test.ts';
const OUDE_MIGRATIE = 'db/migrations/20260101000000_oud.sql';
const MIGRATIE = 'db/migrations/20261029120000_notes.sql';
const CODE = 'export const x = 1;\n';
const PR_ENV = { PR_NUMBER: String(PR) };

/** Een volledige spec (geen `sjabloon: mini`), met de kop die een migratie vraagt. */
function spec(naam: string, status: string): string {
  return [
    '---',
    `status: ${status}`,
    `namespace: ${naam}`,
    '---',
    '',
    `# Spec ${naam}`,
    '',
    '## Datawijzigingen (met grants)',
    '',
    'notes.',
    '',
    '## Hergebruik en UX',
    '',
    'Bestaande kit.',
    '',
    '## Acceptatiecriteria',
    '',
    `- **${naam}/AC-1** — Gegeven iets, wanneer iets, dan iets.`,
    '',
  ].join('\n');
}

const adr = (status: string): string => `# 0099 — Demo\n\nStatus: ${status}\n\n## Besluit\n\nIets.\n`;

/** main met een bestaande test, een bestaande migratie en `extra`; de branch start daarop (origin/main = HEAD). */
function nieuw(extra: Record<string, string> = {}): Fixture {
  const fixture = maakRepo({ specs: [], mandaat: [], roadmap: [] });
  write(fixture.root, OUDE_TEST, "test('oud', () => expect(1).toBe(1));\n");
  write(fixture.root, OUDE_MIGRATIE, '-- migrate:up\nselect 1;\n-- migrate:down\n');
  for (const [pad, tekst] of Object.entries(extra)) write(fixture.root, pad, tekst);
  const base = commit(fixture.root, 'chore: basis');
  git(fixture.root, ['update-ref', 'refs/remotes/origin/main', base]);
  git(fixture.root, ['branch', '-f', 'main', base]);
  return { root: fixture.root, base };
}

function schrijf(root: string, bestanden: Record<string, string>): void {
  for (const [pad, tekst] of Object.entries(bestanden)) write(root, pad, tekst);
}

/** Commit 1: de spec(s) op `goedgekeurd`; commit 2: code, tests en docs (de volgorde die AC-7 eist). */
function featurePr(code: Record<string, string>, opties: { specs?: string[]; fixture?: Fixture } = {}) {
  const fixture = opties.fixture ?? nieuw();
  for (const pad of opties.specs ?? [SPEC]) write(fixture.root, pad, spec(naamVan(pad), 'goedgekeurd'));
  commit(fixture.root, 'docs: spec');
  schrijf(fixture.root, code);
  return { fixture, head: commit(fixture.root, 'feat: implementatie') };
}

const naamVan = (pad: string): string => pad.replace(/^.*\//, '').replace(/\.md$/, '');

function zetStatusRegel(root: string, file: string, regel: string): void {
  write(root, file, read(root, file).replace(/^status:.*$/m, regel));
}

function slaagt(fixture: Fixture, head: string, extra: Record<string, string> = {}): string {
  const uitvoer = draaiChecker(fixture, head, extra);
  expect(uitvoer.stderr).toBe('');
  expect(uitvoer.status).toBe(0);
  return uitvoer.stdout;
}

function faalt(fixture: Fixture, head: string, extra: Record<string, string> = {}): string {
  const uitvoer = draaiChecker(fixture, head, extra);
  expect(uitvoer.status).toBe(1);
  expect(uitvoer.stderr).not.toBe('');
  return uitvoer.stderr;
}

interface Wijziging {
  status: string;
  pad: string;
  van?: string;
}

const A = (pad: string): Wijziging => ({ status: 'A', pad });
const M = (pad: string): Wijziging => ({ status: 'M', pad });
const D = (pad: string): Wijziging => ({ status: 'D', pad });

/** `laneVan({ changes, besluiten, config })` zonder `mini` (die parameter vervalt). */
async function lane(changes: Wijziging[], besluiten: string[] = [SPEC]): Promise<{ lane: unknown; reden: string }> {
  const uitslag = await roep(LANE, 'laneVan', { changes, besluiten, config });
  if (typeof uitslag !== 'object' || uitslag === null || !('lane' in uitslag) || !('reden' in uitslag))
    throw new Error('laneVan levert geen { lane, reden }');
  return { lane: uitslag.lane, reden: String(uitslag.reden) };
}

/** Een voorbeeldpad per glob uit `altijdVragen` (`**` en `*` ingevuld). */
function altijdVragen(): string[] {
  if (typeof gates !== 'object' || gates === null || !('altijdVragen' in gates) || !Array.isArray(gates.altijdVragen))
    throw new Error('gates.json zonder altijdVragen');
  const lijst: unknown[] = gates.altijdVragen;
  return lijst.map((glob) => String(glob).replaceAll('**', 'voorbeeld/x.mjs').replaceAll('*', 'x'));
}

const KRITIEK = [
  'src/core/api/auth/session.ts',
  'src/core/api/db/index.ts',
  'db/init/01-roles.sql',
  'scripts/kit/check-document-status.mjs',
  'scripts/kit/lane.mjs',
  'rails/hooks/lib/document-state.mjs',
  'rails/hooks/lib/built-evidence.mjs',
  'rails/hooks/lib/task-authority.mjs',
  // Erratum (#376): alle hookcode en de besluit-, status- en mergescripts.
  'rails/hooks/rolhek.mjs',
  'rails/hooks/lib/rolhek.mjs',
  'rails/hooks/lib/functional-ui.mjs',
  'scripts/kit/functional-ui-status.mjs',
  'scripts/kit/status-git.mjs',
  'scripts/kit/github-evidence.mjs',
  'scripts/kit/diff-guard.mjs',
  'scripts/kit/pr-verify.mjs',
  'scripts/kit/check-roadmap.mjs',
  'scripts/kit/roadmap-item.mjs',
  'scripts/kit/document-status.mjs',
  'scripts/kit/document-decision.mjs',
  'scripts/kit/gates.mjs',
  ...altijdVragen(),
];

describe('spec-en-bouw/AC-1: een volledige spec met code buiten kritieke paden is de feature-lane', () => {
  test('spec-en-bouw/AC-1 nieuwe volledige spec op goedgekeurd met src/, overige scripts/, docs/ en nieuwe tests: groen', () => {
    const { fixture, head } = featurePr({
      [WEB]: CODE,
      [ROUTE]: CODE,
      'src/core/web/ui/extra.tsx': CODE,
      'scripts/kit/extra.mjs': CODE,
      'docs/gouden-pad.md': 'Bijgewerkt.\n',
      [NIEUWE_TEST]: "test('demo', () => {});\n",
      'test/rails/demo.test.ts': "test('demo', () => {});\n",
    });
    expect(slaagt(fixture, head)).toContain('feature-lane');
  });

  test.each([
    ['een nieuwe route en web-code', [A(SPEC), A(WEB), A(ROUTE), A(NIEUWE_TEST)]],
    ['een pad in src/core buiten auth en db', [A(SPEC), M('src/core/web/ui/toast.tsx')]],
    ['een voorReview-pad in scripts/', [A(SPEC), M('scripts/kit/check-docs.mjs')]],
    ['docs/framework.md', [A(SPEC), M('docs/framework.md')]],
    ['AGENTS.md', [A(SPEC), M('AGENTS.md')]],
    ['CLAUDE.md', [A(SPEC), M('CLAUDE.md')]],
    ['een agent in .claude/agents', [A(SPEC), M('.claude/agents/tester.md')]],
    ['een skill in .claude/skills', [A(SPEC), M('.claude/skills/opleveren/SKILL.md')]],
  ])('spec-en-bouw/AC-1 laneVan zonder mini, met %s: feature', async (_naam, changes) => {
    expect((await lane(changes)).lane).toBe('feature');
  });
});

describe('spec-en-bouw/AC-2: meerdere specs, of een gewijzigde goedgekeurde spec, met code', () => {
  test('spec-en-bouw/AC-2 twee nieuwe specs met een eigenaarstatus en code: groen', () => {
    const { fixture, head } = featurePr(
      { [WEB]: CODE, [NIEUWE_TEST]: "test('demo', () => {});\n" },
      { specs: [SPEC, TWEEDE] },
    );
    const stdout = slaagt(fixture, head);
    expect(stdout).toContain(SPEC);
    expect(stdout).toContain(TWEEDE);
  });

  test('spec-en-bouw/AC-2 inhoudelijke wijziging van een goedgekeurde spec op main, met code: groen', () => {
    const fixture = nieuw({ [SPEC]: spec('demo', 'goedgekeurd') });
    write(fixture.root, SPEC, `${read(fixture.root, SPEC)}\n## Extra\n\nNieuw gedrag.\n`);
    commit(fixture.root, 'docs: spec bijgewerkt');
    schrijf(fixture.root, { [WEB]: CODE });
    slaagt(fixture, commit(fixture.root, 'feat: nieuw gedrag'));
  });

  test('spec-en-bouw/AC-2 laneVan met twee specs als besluit en code: feature', async () => {
    const uitslag = await lane([A(SPEC), A(TWEEDE), A(WEB)], [SPEC, TWEEDE]);
    expect(uitslag.lane).toBe('feature');
  });
});

describe('spec-en-bouw/AC-3: een kritiek pad naast een spec met eigenaarstatus faalt', () => {
  test.each(KRITIEK.map((pad) => [pad]))(
    'spec-en-bouw/AC-3 laneVan met kritiek pad %s: geen lane en het pad in de reden',
    async (pad) => {
      const uitslag = await lane([A(SPEC), A(WEB), M(pad)]);
      expect(uitslag.lane).toBeNull();
      expect(uitslag.reden).toContain(pad);
    },
  );

  test('spec-en-bouw/AC-3 document-status met scripts/kit/lane.mjs naast andere code: faalt met "geen herkende lane" en het pad', () => {
    const { fixture, head } = featurePr({
      [WEB]: CODE,
      'scripts/kit/extra.mjs': CODE,
      'scripts/kit/lane.mjs': CODE,
    });
    const stderr = faalt(fixture, head);
    expect(stderr).toContain('geen herkende lane');
    expect(stderr).toContain('scripts/kit/lane.mjs');
    expect(stderr).not.toContain('scripts/kit/extra.mjs');
  });

  test('spec-en-bouw/AC-3 document-status met src/core/api/auth naast src/core/web: faalt met het auth-pad', () => {
    const { fixture, head } = featurePr({
      'src/core/api/auth/extra.ts': CODE,
      'src/core/api/a.ts': CODE,
      [WEB]: CODE,
    });
    const stderr = faalt(fixture, head);
    expect(stderr).toContain('geen herkende lane');
    expect(stderr).toContain('src/core/api/auth/extra.ts');
  });
});

describe('spec-en-bouw/AC-4: een ADR met eigenaarstatus en code faalt; alleen ADRs en specs is een besluit-PR', () => {
  test('spec-en-bouw/AC-4 nieuw ADR op geaccepteerd met code: faalt', () => {
    const fixture = nieuw();
    write(fixture.root, ADR, adr('geaccepteerd'));
    commit(fixture.root, 'docs: adr');
    schrijf(fixture.root, { [WEB]: CODE });
    expect(faalt(fixture, commit(fixture.root, 'feat: code'))).toContain('geen herkende lane');
  });

  test('spec-en-bouw/AC-4 ADR en spec met eigenaarstatus plus code: faalt', () => {
    const fixture = nieuw();
    write(fixture.root, ADR, adr('geaccepteerd'));
    const { head } = featurePr({ [WEB]: CODE }, { fixture });
    expect(faalt(fixture, head)).toContain('geen herkende lane');
  });

  test('spec-en-bouw/AC-4 alleen een ADR en een spec met eigenaarstatus: besluit-PR, groen', () => {
    const fixture = nieuw();
    write(fixture.root, ADR, adr('geaccepteerd'));
    write(fixture.root, SPEC, spec('demo', 'goedgekeurd'));
    expect(slaagt(fixture, commit(fixture.root, 'docs: besluit'))).toContain('besluit-PR');
  });

  test.each([
    { naam: 'ADR als enig besluit met code', changes: [A(ADR), A(WEB)], besluiten: [ADR], verwacht: null },
    {
      naam: 'ADR en spec als besluit met code',
      changes: [A(ADR), A(SPEC), A(WEB)],
      besluiten: [ADR, SPEC],
      verwacht: null,
    },
    {
      naam: 'ADR en spec als besluit zonder code',
      changes: [A(ADR), A(SPEC)],
      besluiten: [ADR, SPEC],
      verwacht: 'framework',
    },
  ])('spec-en-bouw/AC-4 laneVan: $naam', async ({ changes, besluiten, verwacht }) => {
    expect((await lane(changes, besluiten)).lane).toBe(verwacht);
  });
});

const TABEL = [
  '-- migrate:up',
  'create table public.notes (id uuid primary key default gen_random_uuid(),',
  'owner_id text not null default app.current_user_id() references better_auth."user" (id) on delete cascade,',
  'created_at timestamptz not null default now());',
  'alter table public.notes enable row level security;',
  'alter table public.notes force row level security;',
  'grant select, delete on public.notes to app_authenticated;',
  'create policy notes_select on public.notes for select to app_authenticated using (owner_id = (select app.current_user_id()));',
  'create policy notes_insert on public.notes for insert to app_authenticated with check (owner_id = (select app.current_user_id()));',
  'create policy notes_update on public.notes for update to app_authenticated using (owner_id = (select app.current_user_id())) with check (owner_id = (select app.current_user_id()));',
  'create policy notes_delete on public.notes for delete to app_authenticated using (owner_id = (select app.current_user_id()));',
  '-- migrate:down',
  'drop table public.notes;',
  '',
].join('\n');

describe('spec-en-bouw/AC-5: migraties in de feature-lane blijven begrensd zoals nu', () => {
  test('spec-en-bouw/AC-5 een nieuwe owner-tabel bij een volledige spec: groen (controle)', () => {
    const { fixture, head } = featurePr({ [MIGRATIE]: TABEL, [WEB]: CODE });
    slaagt(fixture, head);
  });

  test('spec-en-bouw/AC-5 een migratie buiten het owner-tabelpatroon: faalt', () => {
    const sql = TABEL.replace(
      '-- migrate:down',
      'create function app.f() returns int language sql return 1;\n-- migrate:down',
    );
    const { fixture, head } = featurePr({ [MIGRATIE]: sql, [WEB]: CODE });
    expect(faalt(fixture, head)).toContain('owner-tabelpatroon');
  });

  test('spec-en-bouw/AC-5 een gewijzigde bestaande migratie: faalt', () => {
    const { fixture, head } = featurePr({
      [OUDE_MIGRATIE]: '-- migrate:up\nselect 2;\n-- migrate:down\n',
      [WEB]: CODE,
    });
    expect(faalt(fixture, head)).toContain('een migratie wijzigen of verwijderen');
  });

  test('spec-en-bouw/AC-5 een verwijderde bestaande migratie: faalt', () => {
    const fixture = nieuw();
    write(fixture.root, SPEC, spec('demo', 'goedgekeurd'));
    commit(fixture.root, 'docs: spec');
    git(fixture.root, ['rm', '-q', OUDE_MIGRATIE]);
    schrijf(fixture.root, { [WEB]: CODE });
    expect(faalt(fixture, commit(fixture.root, 'feat: zonder migratie'))).toContain(
      'een migratie wijzigen of verwijderen',
    );
  });

  test('spec-en-bouw/AC-5 twee nieuwe migraties: faalt', () => {
    const { fixture, head } = featurePr({
      [MIGRATIE]: TABEL,
      'db/migrations/20261029120001_more.sql': TABEL.replaceAll('notes', 'more'),
      [WEB]: CODE,
    });
    expect(faalt(fixture, head)).toContain('hoogstens één nieuwe migratie');
  });
});

describe('spec-en-bouw/AC-6: een bestaande test wijzigen mag, verwijderen niet', () => {
  test('spec-en-bouw/AC-6 een gewijzigde bestaande test: groen', () => {
    const { fixture, head } = featurePr({
      [OUDE_TEST]: "test('oud', () => expect(2).toBe(2));\n",
      [ROUTE]: CODE,
    });
    slaagt(fixture, head);
  });

  test.each([
    ['een skip', "test.skip('oud', () => expect(1).toBe(1));\n", 'tests skippen'],
    ['minder testgevallen', 'export {};\n', 'testgevallen weghalen'],
  ])('spec-en-bouw/AC-6 een gewijzigde bestaande test met %s: faalt (review I1)', (_naam, tekst, melding) => {
    const { fixture, head } = featurePr({ [OUDE_TEST]: tekst, [ROUTE]: CODE });
    expect(faalt(fixture, head)).toContain(melding);
  });

  test('spec-en-bouw/AC-6 een verwijderde bestaande test: faalt', () => {
    const fixture = nieuw();
    write(fixture.root, SPEC, spec('demo', 'goedgekeurd'));
    commit(fixture.root, 'docs: spec');
    git(fixture.root, ['rm', '-q', OUDE_TEST]);
    schrijf(fixture.root, { [ROUTE]: CODE });
    const stderr = faalt(fixture, commit(fixture.root, 'feat: test weg'));
    expect(stderr).toContain('geen herkende lane');
    expect(stderr).toContain(OUDE_TEST);
  });

  test('spec-en-bouw/AC-6 laneVan: een gewijzigde pgTAP-test blijft buiten de lane (review Codex)', async () => {
    const uitslag = await lane([A(SPEC), A(WEB), M('db/tests/notes.sql')]);
    expect(uitslag.lane).toBeNull();
    expect(uitslag.reden).toContain('db/tests/notes.sql');
  });

  test('spec-en-bouw/AC-6 laneVan: gewijzigde test is feature, verwijderde test is geen lane', async () => {
    expect((await lane([A(SPEC), A(WEB), M(OUDE_TEST)])).lane).toBe('feature');
    const weg = await lane([A(SPEC), A(WEB), D(OUDE_TEST)]);
    expect(weg.lane).toBeNull();
    expect(weg.reden).toContain(OUDE_TEST);
  });
});

describe('spec-en-bouw/AC-7: de spec-commit staat vóór de eerste commit met code of tests', () => {
  test('spec-en-bouw/AC-7 code vóór de spec: faalt met een melding over de volgorde', () => {
    const fixture = nieuw();
    schrijf(fixture.root, { [WEB]: CODE });
    commit(fixture.root, 'feat: code eerst');
    write(fixture.root, SPEC, spec('demo', 'goedgekeurd'));
    expect(faalt(fixture, commit(fixture.root, 'docs: spec achteraf'))).toContain('volgorde');
  });

  test('spec-en-bouw/AC-7 een nieuwe test vóór de spec: faalt met een melding over de volgorde', () => {
    const fixture = nieuw();
    schrijf(fixture.root, { [NIEUWE_TEST]: "test('demo', () => {});\n" });
    commit(fixture.root, 'test: eerst');
    write(fixture.root, SPEC, spec('demo', 'goedgekeurd'));
    commit(fixture.root, 'docs: spec');
    schrijf(fixture.root, { [ROUTE]: CODE });
    expect(faalt(fixture, commit(fixture.root, 'feat: route'))).toContain('volgorde');
  });

  test('spec-en-bouw/AC-7 spec en code in dezelfde commit: faalt met een melding over de volgorde', () => {
    const fixture = nieuw();
    write(fixture.root, SPEC, spec('demo', 'goedgekeurd'));
    schrijf(fixture.root, { [WEB]: CODE });
    expect(faalt(fixture, commit(fixture.root, 'feat: alles tegelijk'))).toContain('volgorde');
  });

  test('spec-en-bouw/AC-7 een voorstel-spec eerst, dan code, dan de eigenaarstatus: groen (de spec staat vooraan)', () => {
    const fixture = nieuw();
    write(fixture.root, SPEC, spec('demo', 'voorstel'));
    commit(fixture.root, 'docs: voorstel');
    schrijf(fixture.root, { [WEB]: CODE });
    commit(fixture.root, 'feat: code');
    zetStatusRegel(fixture.root, SPEC, 'status: goedgekeurd');
    slaagt(fixture, commit(fixture.root, 'docs: status'));
  });

  test('spec-en-bouw/AC-7 een docs-commit vóór de spec telt niet als code: groen', () => {
    const fixture = nieuw();
    schrijf(fixture.root, { 'docs/gouden-pad.md': 'Bijgewerkt.\n' });
    commit(fixture.root, 'docs: voorbereiding');
    const { head } = featurePr({ [WEB]: CODE }, { fixture });
    slaagt(fixture, head);
  });
});

describe('spec-en-bouw/AC-8: gebouwd # #<n> zonder SHA in de eigen PR', () => {
  test('spec-en-bouw/AC-8 nieuwe spec, code en daarna gebouwd # #<eigen PR>: groen', () => {
    const { fixture } = featurePr({ [WEB]: CODE, [NIEUWE_TEST]: "test('demo', () => {});\n" });
    zetStatusRegel(fixture.root, SPEC, `status: gebouwd # #${String(PR)}`);
    slaagt(fixture, commit(fixture.root, 'docs: gebouwd'), PR_ENV);
  });

  test('spec-en-bouw/AC-8 goedgekeurde spec op main, code en gebouwd # #<eigen PR> in één commit: groen', () => {
    const fixture = nieuw({ [SPEC]: spec('demo', 'goedgekeurd') });
    schrijf(fixture.root, { [WEB]: CODE });
    zetStatusRegel(fixture.root, SPEC, `status: gebouwd # #${String(PR)}`);
    slaagt(fixture, commit(fixture.root, 'feat: bouw en status'), PR_ENV);
  });

  test('spec-en-bouw/AC-8 check-roadmap accepteert gebouwd # #<n> met het roadmapvinkje in dezelfde PR', async () => {
    const fixture = maakRepo({ specs: [S1], mandaat: [], roadmap: basisRoadmap() });
    write(fixture.root, 'src/web/features/s1.tsx', CODE);
    zetStatusRegel(fixture.root, S1, `status: gebouwd # #${String(PR)}`);
    const [, ...rest] = basisRoadmap();
    write(fixture.root, 'docs/roadmap.md', roadmapTekst([doneItem(S1), ...rest]));
    commit(fixture.root, 'feat: s1 gebouwd');
    expect(await roadmapSleutels(fixture.root)).not.toContain(`spec:bewijs:${S1}`);
  });
});

describe('spec-en-bouw/AC-9: gebouwd # #<n> zonder SHA faalt buiten de eigen PR of zonder implementatie', () => {
  test('spec-en-bouw/AC-9 een ander PR-nummer: faalt', () => {
    const fixture = nieuw({ [SPEC]: spec('demo', 'goedgekeurd') });
    schrijf(fixture.root, { [WEB]: CODE });
    zetStatusRegel(fixture.root, SPEC, `status: gebouwd # #${String(PR)}`);
    faalt(fixture, commit(fixture.root, 'feat: bouw en status'), { PR_NUMBER: String(PR + 1) });
  });

  test('spec-en-bouw/AC-9 een PR zonder bestand buiten docs/: faalt', () => {
    const fixture = nieuw({ [SPEC]: spec('demo', 'goedgekeurd') });
    schrijf(fixture.root, { 'docs/gouden-pad.md': 'Alleen docs.\n' });
    zetStatusRegel(fixture.root, SPEC, `status: gebouwd # #${String(PR)}`);
    faalt(fixture, commit(fixture.root, 'docs: alleen status'), PR_ENV);
  });

  test('spec-en-bouw/AC-9 een vervallen spec op main naar gebouwd # #<eigen PR>: faalt (review B2)', () => {
    const fixture = nieuw({ [SPEC]: spec('demo', 'vervallen') });
    schrijf(fixture.root, { [WEB]: CODE });
    zetStatusRegel(fixture.root, SPEC, `status: gebouwd # #${String(PR)}`);
    expect(faalt(fixture, commit(fixture.root, 'feat: bouw en status'), PR_ENV)).toContain('vervallen naar gebouwd');
  });

  test('spec-en-bouw/AC-9 alleen CHANGELOG.md naast de spec telt niet als implementatie: faalt (review I2)', () => {
    const fixture = nieuw({ [SPEC]: spec('demo', 'goedgekeurd') });
    schrijf(fixture.root, { 'CHANGELOG.md': '# Changelog\n\n- demo\n' });
    zetStatusRegel(fixture.root, SPEC, `status: gebouwd # #${String(PR)}`);
    faalt(fixture, commit(fixture.root, 'docs: changelog en status'), PR_ENV);
  });

  test('spec-en-bouw/AC-9 zonder PR_NUMBER (vóór gh pr create): faalt', () => {
    const fixture = nieuw({ [SPEC]: spec('demo', 'goedgekeurd') });
    schrijf(fixture.root, { [WEB]: CODE });
    zetStatusRegel(fixture.root, SPEC, `status: gebouwd # #${String(PR)}`);
    faalt(fixture, commit(fixture.root, 'feat: bouw en status'));
  });
});

/** Main krijgt een eigen codecommit; daarna `git merge origin/main` op de branch. Geeft de nieuwe basis terug. */
function mergeMain(fixture: Fixture): Fixture {
  git(fixture.root, ['switch', '-q', 'main']);
  write(fixture.root, 'src/web/features/ander/page.tsx', CODE);
  const main = commit(fixture.root, 'feat: ander werk op main');
  git(fixture.root, ['update-ref', 'refs/remotes/origin/main', main]);
  git(fixture.root, ['switch', '-q', BRANCH]);
  git(fixture.root, ['merge', '-q', '--no-edit', 'origin/main']);
  return { root: fixture.root, base: main };
}

describe('spec-en-bouw/AC-10: een merge van main na gebouwd # #<n> laat document-status groen', () => {
  test('spec-en-bouw/AC-10 git merge origin/main op de branch na gebouwd # #<n>: groen', () => {
    const { fixture } = featurePr({ [WEB]: CODE });
    zetStatusRegel(fixture.root, SPEC, `status: gebouwd # #${String(PR)}`);
    commit(fixture.root, 'docs: gebouwd');
    const nieuweBasis = mergeMain(fixture);
    slaagt(nieuweBasis, git(fixture.root, ['rev-parse', 'HEAD']), PR_ENV);
  });

  test('spec-en-bouw/AC-10 een merge van main telt niet mee in de volgordecheck: groen', () => {
    const { fixture } = featurePr({ [WEB]: CODE });
    const nieuweBasis = mergeMain(fixture);
    expect(slaagt(nieuweBasis, git(fixture.root, ['rev-parse', 'HEAD']))).toContain('feature-lane');
  });
});

describe('spec-en-bouw/AC-11: de vorm met gevalideerd-SHA via pnpm docs:status werkt als nu', () => {
  test('spec-en-bouw/AC-11 gebouwd # #<n>; gevalideerd: <sha> met groene checks: groen, ook met een ander PR_NUMBER', () => {
    const fixture = maakRepo({ specs: [S1], mandaat: [S1], roadmap: basisRoadmap() });
    const [, ...rest] = basisRoadmap();
    const { validated, head } = bouw(fixture, { gebouwd: [S1], adminRoadmap: [doneItem(S1), ...rest] });
    expect(read(fixture.root, S1)).toContain(`gevalideerd: ${validated}`);
    slaagt(fixture, head);
    slaagt(fixture, head, { PR_NUMBER: String(PR + 7) });
  });

  test('spec-en-bouw/AC-11 dezelfde vorm zonder groene checks: faalt als nu', () => {
    const fixture = maakRepo({ specs: [S1], mandaat: [S1], roadmap: basisRoadmap() });
    const [, ...rest] = basisRoadmap();
    const { head } = bouw(fixture, { gebouwd: [S1], adminRoadmap: [doneItem(S1), ...rest] });
    faalt(fixture, head, { STUB_CHECKS: 'geen' });
  });
});

/** Van de kop `## <titel>` tot de volgende kop van niveau 2, of het einde. */
function sectie(tekst: string, kop: string): string {
  const regels = tekst.split('\n');
  const start = regels.indexOf(kop);
  if (start === -1) return '';
  const rest = regels.slice(start + 1);
  const einde = rest.findIndex((regel) => regel.startsWith('## '));
  return rest.slice(0, einde === -1 ? rest.length : einde).join('\n');
}

describe('spec-en-bouw/AC-13: reviewer en PR-sjabloon', () => {
  const reviewer = readFileSync('.claude/agents/reviewer.md', 'utf8');

  test('spec-en-bouw/AC-13 de modus spec-review geldt bij elke spec in de PR', () => {
    const modus = sectie(reviewer, '## Modus spec-review');
    expect(modus).toMatch(/elke spec/i);
    expect(modus).not.toMatch(/^Bij een spec met een migratie, route of permissie/m);
  });

  test('spec-en-bouw/AC-13 de modus spec-review vraagt een oordeel over "kritiek"', () => {
    expect(sectie(reviewer, '## Modus spec-review')).toMatch(/kritiek/i);
  });

  test('spec-en-bouw/AC-13 .github/pull_request_template.md opent met de sectie "## Spec"', () => {
    const sjabloon = readFileSync('.github/pull_request_template.md', 'utf8');
    const eerste = sjabloon.split('\n').find((regel) => regel.trim() !== '');
    expect(eerste).toBe('## Spec');
  });
});
