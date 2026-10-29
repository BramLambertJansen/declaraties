import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { documentInfo } from '../../rails/hooks/lib/document-state.mjs';
import {
  BRANCH,
  REPOSITORY,
  draaiChecker,
  git,
  maakRepo,
  opruimen,
  read,
  roep,
  tempDir,
  write,
  type Fixture,
} from '../hooks/follow-up-kit';

// ADR 0046 punt 7 (de merge is de acceptatie; vervangt de statuscommit-eisen): een statusovergang in de PR
// zelf is geldig in de feature-lane en in de besluit-PR (framework-lane); de eisen (a) alleen statusregels, (b) geen inhoud
// erna en (c) web-flow vervallen (P2-uitzondering, punt 9). Echte tijdelijke repositories; de checker draait zoals guard.yml
// hem draait, met main als basis.
afterEach(opruimen);

const MINI = 'docs/specs/demo.md';
const ADR = 'docs/adr/0099-demo.md';
const WEB = 'src/web/features/demo/page.tsx';
const ROUTE = 'src/api/routes/demo.ts';
const TEST = 'src/api/routes/demo.test.ts';

function spec(naam: string, status: string, mini: boolean): string {
  const sjabloon = mini ? 'sjabloon: mini\n' : '';
  return `---\nstatus: ${status}\nnamespace: ${naam}\n${sjabloon}---\n\n# Spec ${naam}\n\n## Hergebruik en UX\n\nBestaande kit.\n`;
}

const adr = (status: string): string => `# 0099 — Demo\n\nStatus: ${status}\n\n## Besluit\n\nIets.\n`;

function commitAls(root: string, message: string, committer: 'agent' | 'web-flow'): string {
  git(root, ['add', '-A']);
  const naam = committer === 'web-flow' ? 'GitHub' : 'Test';
  const mail = committer === 'web-flow' ? 'noreply@github.com' : 'test@example.test';
  execFileSync('git', ['commit', '-q', '-m', message], {
    cwd: root,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_COMMITTER_NAME: naam,
      GIT_COMMITTER_EMAIL: mail,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.test',
    },
  });
  return git(root, ['rev-parse', 'HEAD']);
}

function nieuw(): Fixture {
  const fixture = maakRepo({ specs: [], mandaat: [], roadmap: [] });
  write(fixture.root, 'src/api/routes/oud.test.ts', "test('oud', () => {});\n");
  git(fixture.root, ['add', '-A']);
  git(fixture.root, ['commit', '-q', '-m', 'test: bestaande test']);
  const base = git(fixture.root, ['rev-parse', 'HEAD']);
  git(fixture.root, ['update-ref', 'refs/remotes/origin/main', base]);
  return { root: fixture.root, base };
}

function zetStatus(root: string, file: string, naar: string): void {
  write(
    root,
    file,
    read(root, file).replace(/^(status|Status): \S+/m, (_regel, label: string) => `${label}: ${naar}`),
  );
}

/** De agent legt een voorstel + code voor; daarna zet een committer (standaard web-flow, maar dat doet er niet meer toe) de statusregel. */
function feature(
  opties: { mini?: boolean; code?: string[]; statusCommit?: 'agent' | 'web-flow'; extra?: (root: string) => void } = {},
) {
  const fixture = nieuw();
  const { root } = fixture;
  write(root, MINI, spec('demo', 'voorstel', opties.mini ?? true));
  for (const pad of opties.code ?? [WEB, ROUTE, TEST]) write(root, pad, 'export const x = 1;\n');
  commitAls(root, 'feat: demo', 'agent');
  zetStatus(root, MINI, 'goedgekeurd');
  opties.extra?.(root);
  const head = commitAls(root, 'docs: status', opties.statusCommit ?? 'web-flow');
  return { fixture, head };
}

describe('feature-lane', () => {
  test('CHANGELOG, roadmap en schema-snapshot in dezelfde PR: slaagt', () => {
    const { fixture, head } = feature({ code: [WEB, 'CHANGELOG.md', 'db/schema.snapshot.sql', 'docs/roadmap.md'] });
    const uitvoer = draaiChecker(fixture, head);
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
  });

  test('mini-spec met code, status gezet door web-flow: slaagt', () => {
    const { fixture, head } = feature();
    const uitvoer = draaiChecker(fixture, head);
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
    expect(uitvoer.stdout).toContain('statusovergang in de PR');
  });

  // GEWIJZIGD (ADR 0046 punt 7): 9a, 9b en 9c waren de statuscommit-eisen (a), (b) en (c); die vervallen.
  test('9a de statuscommit wijzigt ook inhoud: slaagt (eis a vervalt, ADR 0046 punt 7)', () => {
    const { fixture, head } = feature({
      extra: (root) => {
        write(root, WEB, 'export const x = 2;\n');
      },
    });
    const uitvoer = draaiChecker(fixture, head);
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
  });

  test('9b inhoud na de status: slaagt (eis b vervalt, ADR 0046 punt 7)', () => {
    const { fixture } = feature();
    write(fixture.root, MINI, `${read(fixture.root, MINI)}\nExtra regel.\n`);
    const head = commitAls(fixture.root, 'feat: nog iets', 'web-flow');
    const uitvoer = draaiChecker(fixture, head);
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
  });

  test('9c een andere committer dan web-flow: slaagt (eis c vervalt, ADR 0046 punt 7)', () => {
    const { fixture, head } = feature({ statusCommit: 'agent' });
    const uitvoer = draaiChecker(fixture, head);
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
  });

  test('de status in dezelfde commit als het nieuwe bestand: slaagt (nieuw document met eigenaarstatus, punt 1)', () => {
    const fixture = nieuw();
    write(fixture.root, MINI, spec('demo', 'goedgekeurd', true));
    write(fixture.root, WEB, 'export const x = 1;\n');
    const head = commitAls(fixture.root, 'feat: alles in één', 'agent');
    const uitvoer = draaiChecker(fixture, head);
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
  });

  test.each([
    ['1 een pad in src/core', { code: ['src/core/web/ui/extra.tsx'] }],
    ['2 een pad uit voorReview', { code: ['scripts/kit/extra.mjs'] }],
    ['8 een volledige spec met code', { mini: false, code: [WEB] }],
  ])('%s: faalt', (_naam, opties) => {
    const { fixture, head } = feature(opties);
    expect(draaiChecker(fixture, head).status).toBe(1);
  });

  test('3 een gewijzigde bestaande test: faalt', () => {
    const { fixture, head } = feature({
      extra: (root) => {
        write(root, 'src/api/routes/oud.test.ts', "test('anders', () => {});\n");
      },
    });
    expect(draaiChecker(fixture, head).status).toBe(1);
  });

  test('4 een ADR in dezelfde PR: faalt', () => {
    const { fixture, head } = feature({
      extra: (root) => {
        write(root, ADR, adr('voorgesteld'));
      },
    });
    expect(draaiChecker(fixture, head).status).toBe(1);
  });

  // GEWIJZIGD (ADR 0046 punt 5 en 7): twee specs zonder code mogen nu; met code blijft het feature-lane van één mini-spec.
  test('5 twee specs naar een eigenaarstatus, zonder code: slaagt (de beperking tot één document vervalt)', () => {
    const fixture = nieuw();
    write(fixture.root, MINI, spec('demo', 'voorstel', true));
    write(fixture.root, 'docs/specs/tweede.md', spec('tweede', 'voorstel', true));
    commitAls(fixture.root, 'feat: twee specs', 'agent');
    zetStatus(fixture.root, MINI, 'goedgekeurd');
    zetStatus(fixture.root, 'docs/specs/tweede.md', 'goedgekeurd');
    const uitvoer = draaiChecker(fixture, commitAls(fixture.root, 'docs: status', 'web-flow'));
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
  });

  test('5b twee mini-specs naar een eigenaarstatus mét code: faalt (feature-lane is één mini-spec)', () => {
    const fixture = nieuw();
    write(fixture.root, MINI, spec('demo', 'goedgekeurd', true));
    write(fixture.root, 'docs/specs/tweede.md', spec('tweede', 'goedgekeurd', true));
    write(fixture.root, WEB, 'export const x = 1;\n');
    expect(draaiChecker(fixture, commitAls(fixture.root, 'feat: twee specs en code', 'agent')).status).toBe(1);
  });

  test('7 een rename van src/core naar src/web: faalt', () => {
    const fixture = nieuw();
    write(fixture.root, 'src/core/web/x.ts', 'export const x = 1;\n');
    git(fixture.root, ['add', '-A']);
    git(fixture.root, ['commit', '-q', '-m', 'chore: core-bestand']);
    const base = git(fixture.root, ['rev-parse', 'HEAD']);
    git(fixture.root, ['update-ref', 'refs/remotes/origin/main', base]);
    const kaal = { root: fixture.root, base };
    write(kaal.root, MINI, spec('demo', 'voorstel', true));
    mkdirSync(path.join(kaal.root, 'src/web'), { recursive: true });
    git(kaal.root, ['mv', 'src/core/web/x.ts', 'src/web/x.ts']);
    commitAls(kaal.root, 'feat: verplaatsen', 'agent');
    zetStatus(kaal.root, MINI, 'goedgekeurd');
    expect(draaiChecker(kaal, commitAls(kaal.root, 'docs: status', 'web-flow')).status).toBe(1);
  });

  test('6 een gewijzigde migratie: faalt', () => {
    const fixture = nieuw();
    write(fixture.root, 'db/migrations/20260101000000_oud.sql', '-- oud\n');
    git(fixture.root, ['add', '-A']);
    git(fixture.root, ['commit', '-q', '-m', 'chore: migratie']);
    const kaal = { root: fixture.root, base: git(fixture.root, ['rev-parse', 'HEAD']) };
    git(kaal.root, ['update-ref', 'refs/remotes/origin/main', kaal.base]);
    write(kaal.root, MINI, spec('demo', 'voorstel', true));
    write(kaal.root, 'db/migrations/20260101000000_oud.sql', '-- anders\n');
    commitAls(kaal.root, 'feat: migratie', 'agent');
    zetStatus(kaal.root, MINI, 'goedgekeurd');
    expect(draaiChecker(kaal, commitAls(kaal.root, 'docs: status', 'web-flow')).status).toBe(1);
  });
});

describe('framework-lane', () => {
  test('een ADR met een mini-marker in de tekst telt niet als mini-spec: met code faalt', () => {
    const fixture = nieuw();
    write(fixture.root, ADR, `${adr('voorgesteld')}\n---\nsjabloon: mini\n---\n`);
    write(fixture.root, WEB, 'export const x = 1;\n');
    commitAls(fixture.root, 'docs: adr', 'agent');
    zetStatus(fixture.root, ADR, 'geaccepteerd');
    expect(draaiChecker(fixture, commitAls(fixture.root, 'docs: status', 'web-flow')).status).toBe(1);
  });

  function frameworkPr(opties: { code?: boolean } = {}) {
    const fixture = nieuw();
    write(fixture.root, ADR, adr('voorgesteld'));
    if (opties.code === true) write(fixture.root, 'scripts/kit/extra.mjs', 'export const x = 1;\n');
    commitAls(fixture.root, 'docs: adr', 'agent');
    zetStatus(fixture.root, ADR, 'geaccepteerd');
    return { fixture, head: commitAls(fixture.root, 'docs: status', 'web-flow') };
  }

  test('alleen een ADR met in-PR-status door web-flow: slaagt', () => {
    const { fixture, head } = frameworkPr();
    const uitvoer = draaiChecker(fixture, head);
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
  });

  test('10 een in-PR-status én code: faalt', () => {
    const { fixture, head } = frameworkPr({ code: true });
    expect(draaiChecker(fixture, head).status).toBe(1);
  });
});

describe('ongewijzigd: de strenge route', () => {
  test('een status zonder record op main, zonder lane (README erbij): faalt zoals voorheen', () => {
    const { fixture, head } = feature({
      extra: (root) => {
        write(root, 'README.md', 'Anders.\n');
      },
    });
    expect(draaiChecker(fixture, head).status).toBe(1);
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
const MIGRATIE = 'db/migrations/20261018120000_notes.sql';

describe('feature-lane: migratie en kop', () => {
  test('een nieuwe tabel met de kop "Datawijzigingen (met grants)": slaagt', () => {
    const { fixture, head } = featureMetMigratie(TABEL, true);
    const uitvoer = draaiChecker(fixture, head);
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
  });

  test('een nieuwe tabel zonder die kop: faalt', () => {
    const { fixture, head } = featureMetMigratie(TABEL, false);
    expect(draaiChecker(fixture, head).stderr).toContain('Datawijzigingen');
  });

  test('een lege sectie "Datawijzigingen (met grants)": faalt', () => {
    const { fixture, head } = featureMetMigratie(TABEL, false, '## Datawijzigingen (met grants)\n\n');
    expect(draaiChecker(fixture, head).stderr).toContain('Datawijzigingen');
  });

  test('een migratie met een functie: faalt', () => {
    const { fixture, head } = featureMetMigratie(
      TABEL.replace('-- migrate:down', 'create function app.f() returns int language sql return 1;\n-- migrate:down'),
      true,
    );
    expect(draaiChecker(fixture, head).status).toBe(1);
  });
});

function featureMetMigratie(sql: string, kop: boolean, eigen?: string) {
  const fixture = nieuw();
  const tekst = spec('demo', 'voorstel', true);
  write(
    fixture.root,
    MINI,
    eigen !== undefined ? `${tekst}\n${eigen}` : kop ? `${tekst}\n## Datawijzigingen (met grants)\n\nnotes.\n` : tekst,
  );
  write(fixture.root, MIGRATIE, sql);
  commitAls(fixture.root, 'feat: tabel', 'agent');
  zetStatus(fixture.root, MINI, 'goedgekeurd');
  return { fixture, head: commitAls(fixture.root, 'docs: status', 'web-flow') };
}

describe('statuscommit: aanvullende gevallen', () => {
  // GEWIJZIGD (ADR 0046 punt 7): de eisen (a), (b) en (c) vervallen; de eindstand van de PR beslist, niet de commitvolgorde.
  test('de agent zet de status en web-flow commit daarna iets anders: slaagt (eis a, b en c vervallen)', () => {
    const fixture = nieuw();
    write(fixture.root, MINI, spec('demo', 'voorstel', true));
    commitAls(fixture.root, 'feat: demo', 'agent');
    zetStatus(fixture.root, MINI, 'goedgekeurd');
    commitAls(fixture.root, 'docs: status door de agent', 'agent');
    write(fixture.root, WEB, 'export const x = 1;\n');
    const uitvoer = draaiChecker(fixture, commitAls(fixture.root, 'feat: web', 'web-flow'));
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
  });

  test('web-flow zet de status, de agent zet hem terug en weer door: slaagt (eis c vervalt)', () => {
    const { fixture } = feature();
    zetStatus(fixture.root, MINI, 'voorstel');
    commitAls(fixture.root, 'docs: terug', 'web-flow');
    zetStatus(fixture.root, MINI, 'goedgekeurd');
    const uitvoer = draaiChecker(fixture, commitAls(fixture.root, 'docs: weer door de agent', 'agent'));
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
  });

  test('main erbij mergen na de statuscommit: slaagt', () => {
    const { fixture } = feature();
    git(fixture.root, ['switch', '-q', 'main']);
    write(fixture.root, 'README.md', 'Nieuw op main.\n');
    const main = commitAls(fixture.root, 'docs: readme', 'agent');
    git(fixture.root, ['switch', '-q', BRANCH]);
    git(fixture.root, ['merge', '-q', '--no-edit', 'main']);
    git(fixture.root, ['update-ref', 'refs/remotes/origin/main', main]);
    const uitvoer = draaiChecker({ root: fixture.root, base: main }, git(fixture.root, ['rev-parse', 'HEAD']));
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
  });

  // GEWIJZIGD (ADR 0046 punt 7): de statuscommit-eisen bestaan niet meer; de spec is op main nooit geweest, dus het
  // hernoemde bestand is netto een nieuw document met een eigenaarstatus.
  test('een nieuw voorstel in de PR hernoemen voor de merge: slaagt (netto een nieuwe goedgekeurde spec)', () => {
    const { fixture } = feature();
    git(fixture.root, ['mv', MINI, 'docs/specs/hernoemd.md']);
    const uitvoer = draaiChecker(fixture, commitAls(fixture.root, 'docs: hernoem', 'web-flow'));
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
  });
});

describe('twee besluiten en renames', () => {
  // GEWIJZIGD (ADR 0046 punt 5): twee specs zonder code zijn een geldige besluit-PR; "meer dan één document" bestaat niet meer.
  test('een tweede spec met een record op main, zonder code: slaagt (meerdere documenten mogen)', () => {
    const fixture = nieuw();
    const tweede = 'docs/specs/tweede.md';
    write(fixture.root, tweede, spec('tweede', 'voorstel', true));
    const digest = documentInfo(tweede, read(fixture.root, tweede))?.digest;
    write(
      fixture.root,
      '.claude/decisions.json',
      JSON.stringify({
        version: 1,
        requiredChecks: ['gate:fast'],
        decisions: [{ file: tweede, digest, repository: REPOSITORY, branch: BRANCH, status: 'goedgekeurd', paths: [] }],
      }),
    );
    git(fixture.root, ['add', '-A']);
    git(fixture.root, ['commit', '-q', '-m', 'chore: tweede spec met record']);
    const base = git(fixture.root, ['rev-parse', 'HEAD']);
    git(fixture.root, ['update-ref', 'refs/remotes/origin/main', base]);
    write(fixture.root, MINI, spec('demo', 'voorstel', true));
    commitAls(fixture.root, 'feat: demo', 'agent');
    zetStatus(fixture.root, MINI, 'goedgekeurd');
    zetStatus(fixture.root, tweede, 'goedgekeurd');
    const uitvoer = draaiChecker({ root: fixture.root, base }, commitAls(fixture.root, 'docs: status', 'web-flow'));
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
  });

  test('een vervallen spec hernoemen en weer goedkeuren: faalt', () => {
    const fixture = nieuw();
    write(fixture.root, 'docs/specs/oud.md', spec('demo', 'vervallen', true));
    git(fixture.root, ['add', '-A']);
    git(fixture.root, ['commit', '-q', '-m', 'chore: oude spec']);
    const base = git(fixture.root, ['rev-parse', 'HEAD']);
    git(fixture.root, ['update-ref', 'refs/remotes/origin/main', base]);
    git(fixture.root, ['mv', 'docs/specs/oud.md', MINI]);
    zetStatus(fixture.root, MINI, 'voorstel');
    commitAls(fixture.root, 'feat: hernoem', 'agent');
    zetStatus(fixture.root, MINI, 'goedgekeurd');
    expect(draaiChecker({ root: fixture.root, base }, commitAls(fixture.root, 'docs: status', 'web-flow')).status).toBe(
      1,
    );
  });
});

describe('framework-lane: het record', () => {
  function metRecord(eigen: boolean) {
    const fixture = nieuw();
    write(fixture.root, ADR, adr('voorgesteld'));
    const entry = {
      file: eigen ? ADR : 'docs/specs/vreemd.md',
      digest: 'a'.repeat(64),
      repository: REPOSITORY,
      branch: BRANCH,
      status: 'geaccepteerd',
      paths: [],
    };
    write(
      fixture.root,
      '.claude/decisions.json',
      JSON.stringify({ version: 1, requiredChecks: ['gate:fast'], decisions: [entry] }),
    );
    commitAls(fixture.root, 'docs: adr en record', 'agent');
    zetStatus(fixture.root, ADR, 'geaccepteerd');
    return { fixture, head: commitAls(fixture.root, 'docs: status', 'web-flow') };
  }

  test('het eigen record erbij: slaagt', () => {
    const { fixture, head } = metRecord(true);
    expect(draaiChecker(fixture, head).stderr).toBe('');
  });

  test('het record van een ander document erbij: faalt', () => {
    const { fixture, head } = metRecord(false);
    expect(draaiChecker(fixture, head).stderr).toContain('wijzigt meer dan het record');
  });
});

describe('annotatie voor de job document-status', () => {
  test('annotatie() escapet %, CR en LF, zodat een bestandsnaam geen commando kan invoegen', async () => {
    const tekst = await roep(
      ['../../scripts/kit', 'check-document-status.mjs'].join('/'),
      'annotatie',
      'a%b\r\n::warning::x',
    );
    expect(tekst).toBe('::error title=document-status::a%25b%0D%0A::warning::x');
  });

  test('een stapsamenvatting wordt geschreven bij een fout en bij succes (ADR 0045 punt 20)', () => {
    const bestand = path.join(tempDir('samenvatting-'), 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = bestand;
    try {
      const fout = feature({ mini: false }); // GEWIJZIGD: een agent-statuscommit is niet meer fout (ADR 0046 punt 7)
      draaiChecker(fout.fixture, fout.head);
      expect(readFileSync(bestand, 'utf8')).toContain('document-status: afgekeurd');
      const goed = feature();
      draaiChecker(goed.fixture, goed.head);
      expect(readFileSync(bestand, 'utf8')).toContain('document-status: goedgekeurd');
    } finally {
      delete process.env['GITHUB_STEP_SUMMARY'];
    }
  });

  // GEWIJZIGD: de foutcase was een agent-statuscommit en de melding noemde web-flow; beide bestaan niet meer (ADR 0046 punt 7).
  test('een fout komt als ::error title=document-status:: op stdout (ADR 0045 punt 20)', () => {
    const { fixture, head } = feature({ mini: false });
    const uitvoer = draaiChecker(fixture, head);
    expect(uitvoer.status).toBe(1);
    expect(uitvoer.stdout).toContain('::error title=document-status::');
    expect(uitvoer.stdout).toContain(MINI);
  });
});

// --- ADR 0046: de merge is de acceptatie. Gewone committer (geen web-flow), geen record op main. ------------------------

const ADR_OUD = 'docs/adr/0050-oud.md';
const ADR_NIEUW = 'docs/adr/0051-nieuw.md';
const BOUWSTATUS = `gebouwd # #5; gevalideerd: ${'a'.repeat(40)}`;

const adrTekst = (nr: string, status: string, besluit = 'Iets.'): string =>
  `# ${nr} — Demo\n\nStatus: ${status}\n\n## Besluit\n\n${besluit}\n`;

/** main krijgt deze bestanden; de branch start daarop (origin/main = HEAD). */
function metBasis(bestanden: Record<string, string>): Fixture {
  const fixture = nieuw();
  for (const [pad, tekst] of Object.entries(bestanden)) write(fixture.root, pad, tekst);
  commitAls(fixture.root, 'chore: basis', 'agent');
  const base = git(fixture.root, ['rev-parse', 'HEAD']);
  git(fixture.root, ['update-ref', 'refs/remotes/origin/main', base]);
  return { root: fixture.root, base };
}

/** Vervangt de hele statusregel (ook een `gebouwd # …`-regel). */
function zetStatusRegel(root: string, file: string, regel: string): void {
  write(root, file, read(root, file).replace(/^(?:status|Status):.*$/m, regel));
}

const agent = (fixture: Fixture, bericht = 'docs: besluit'): string => commitAls(fixture.root, bericht, 'agent');

function slaagt(fixture: Fixture, head: string): void {
  const uitvoer = draaiChecker(fixture, head);
  expect(uitvoer.stderr).toBe('');
  expect(uitvoer.status).toBe(0);
}

function faalt(fixture: Fixture, head: string): string {
  const uitvoer = draaiChecker(fixture, head);
  expect(uitvoer.status).toBe(1);
  expect(uitvoer.stderr).not.toBe('');
  return uitvoer.stderr;
}

describe('ADR 0046 punt 1: een nieuw document met een eigenaarstatus, zonder record en zonder web-flow', () => {
  test.each([['geaccepteerd'], ['vervallen'], ['vervangen door 0001']])(
    'nieuw ADR met Status: %s: slaagt',
    (status) => {
      const fixture = nieuw();
      write(fixture.root, ADR, adrTekst('0099', status));
      slaagt(fixture, agent(fixture));
    },
  );

  test.each([['goedgekeurd'], ['vervallen']])('nieuwe spec met status: %s: slaagt', (status) => {
    const fixture = nieuw();
    write(fixture.root, MINI, spec('demo', status, false));
    slaagt(fixture, agent(fixture));
  });

  test('nieuwe spec direct op gebouwd, zonder bouwbewijs: faalt', () => {
    const fixture = nieuw();
    write(fixture.root, MINI, spec('demo', BOUWSTATUS, false));
    faalt(fixture, agent(fixture));
  });

  test('nieuw ADR met vrije tekst op de statusregel blijft falen (ADR 0045 punt 22)', () => {
    const fixture = nieuw();
    write(fixture.root, ADR, adrTekst('0099', 'geaccepteerd — zomaar tekst'));
    faalt(fixture, agent(fixture));
  });
});

describe('ADR 0046 punt 5: voorstel naar eigenaarstatus; inhoud en commitvolgorde doen er niet toe', () => {
  test.each([
    { naam: 'ADR', pad: ADR, begin: adrTekst('0099', 'voorgesteld'), regel: 'Status: geaccepteerd' },
    { naam: 'spec', pad: MINI, begin: spec('demo', 'voorstel', false), regel: 'status: goedgekeurd' },
  ])('$naam: status en inhoud in dezelfde commit: slaagt', ({ pad, begin, regel }) => {
    const fixture = metBasis({ [pad]: begin });
    zetStatusRegel(fixture.root, pad, regel);
    write(fixture.root, pad, `${read(fixture.root, pad)}\nNog een alinea in dezelfde commit.\n`);
    slaagt(fixture, agent(fixture));
  });

  test.each([
    { naam: 'ADR', pad: ADR, begin: adrTekst('0099', 'voorgesteld'), regel: 'Status: geaccepteerd' },
    { naam: 'spec', pad: MINI, begin: spec('demo', 'voorstel', false), regel: 'status: goedgekeurd' },
  ])('$naam: er komt inhoud na de statuscommit, door een gewone committer: slaagt', ({ pad, begin, regel }) => {
    const fixture = metBasis({ [pad]: begin });
    zetStatusRegel(fixture.root, pad, regel);
    agent(fixture, 'docs: status');
    write(fixture.root, pad, `${read(fixture.root, pad)}\nInhoud na de status.\n`);
    slaagt(fixture, agent(fixture, 'docs: nog een alinea'));
  });
});

describe('ADR 0046 punt 5: meerdere documenten in één besluit-PR', () => {
  test("twee nieuwe ADR's en een nieuwe spec, zonder code: slaagt", () => {
    const fixture = nieuw();
    write(fixture.root, 'docs/adr/0060-een.md', adrTekst('0060', 'geaccepteerd'));
    write(fixture.root, 'docs/adr/0061-twee.md', adrTekst('0061', 'geaccepteerd'));
    write(fixture.root, MINI, spec('demo', 'goedgekeurd', false));
    slaagt(fixture, agent(fixture));
  });

  test('een ADR én een spec die van voorstel naar eigenaarstatus gaan, zonder code: slaagt', () => {
    const fixture = metBasis({
      [ADR]: adrTekst('0099', 'voorgesteld'),
      [MINI]: spec('demo', 'voorstel', false),
    });
    zetStatusRegel(fixture.root, ADR, 'Status: geaccepteerd');
    zetStatusRegel(fixture.root, MINI, 'status: goedgekeurd');
    slaagt(fixture, agent(fixture));
  });
});

describe('ADR 0046 punt 5: geaccepteerd naar vervangen door NNNN of vervallen, zonder record', () => {
  const basis = () =>
    metBasis({ [ADR_OUD]: adrTekst('0050', 'geaccepteerd'), [ADR_NIEUW]: adrTekst('0051', 'geaccepteerd') });

  test('vervangen door een ADR dat al op main staat: slaagt', () => {
    const fixture = basis();
    zetStatusRegel(fixture.root, ADR_OUD, 'Status: vervangen door 0051');
    slaagt(fixture, agent(fixture));
  });

  test('vervangen door een ADR dat in dezelfde PR wordt toegevoegd: slaagt', () => {
    const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', 'geaccepteerd') });
    write(fixture.root, 'docs/adr/0052-vervanger.md', adrTekst('0052', 'geaccepteerd'));
    zetStatusRegel(fixture.root, ADR_OUD, 'Status: vervangen door 0052');
    slaagt(fixture, agent(fixture));
  });

  test('vervangen door een ADR dat nergens bestaat: faalt', () => {
    const fixture = basis();
    zetStatusRegel(fixture.root, ADR_OUD, 'Status: vervangen door 0077');
    faalt(fixture, agent(fixture));
  });

  test('geaccepteerd naar vervallen: slaagt', () => {
    const fixture = basis();
    zetStatusRegel(fixture.root, ADR_OUD, 'Status: vervallen');
    slaagt(fixture, agent(fixture));
  });

  test('vervangen door, maar de tekst van het oude ADR wijzigt ook: faalt (A4 blijft)', () => {
    const fixture = basis();
    zetStatusRegel(fixture.root, ADR_OUD, 'Status: vervangen door 0051');
    write(fixture.root, ADR_OUD, `${read(fixture.root, ADR_OUD)}\nNormatieve correctie.\n`);
    faalt(fixture, agent(fixture));
  });
});

describe('ADR 0046 punt 5: een spec van goedgekeurd of gebouwd naar vervallen, zonder record', () => {
  test.each([
    ['goedgekeurd', 'goedgekeurd'],
    ['gebouwd', BOUWSTATUS],
  ])('%s naar vervallen: slaagt', (_naam, begin) => {
    const fixture = metBasis({ [MINI]: spec('demo', begin, false) });
    zetStatusRegel(fixture.root, MINI, 'status: vervallen');
    slaagt(fixture, agent(fixture));
  });

  test('vervallen terug naar goedgekeurd blijft falen (alleen een nieuw voorstel krijgt een eigenaarstatus)', () => {
    const fixture = metBasis({ [MINI]: spec('demo', 'vervallen', false) });
    zetStatusRegel(fixture.root, MINI, 'status: goedgekeurd');
    faalt(fixture, agent(fixture));
  });
});

describe('ADR 0046 punt 2 en 5: geaccepteerd terug naar voorgesteld is de omweg om A4', () => {
  test('geaccepteerd naar voorgesteld, zonder inhoudswijziging: faalt', () => {
    const fixture = metBasis({ [ADR]: adrTekst('0099', 'geaccepteerd') });
    zetStatusRegel(fixture.root, ADR, 'Status: voorgesteld');
    faalt(fixture, agent(fixture));
  });

  test('geaccepteerd naar voorgesteld mét nieuwe inhoud: faalt', () => {
    const fixture = metBasis({ [ADR]: adrTekst('0099', 'geaccepteerd') });
    zetStatusRegel(fixture.root, ADR, 'Status: voorgesteld');
    write(fixture.root, ADR, `${read(fixture.root, ADR)}\nAndere inhoud.\n`);
    faalt(fixture, agent(fixture));
  });
});

describe('ADR 0046 punt 2: elke eigenaarstatus van een ADR terug naar voorgesteld is geweigerd; een spec mag terug naar voorstel', () => {
  test.each([['vervallen'], ['vervangen door 0051']])('ADR %s naar voorgesteld: faalt', (status) => {
    const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', status), [ADR_NIEUW]: adrTekst('0051', 'geaccepteerd') });
    zetStatusRegel(fixture.root, ADR_OUD, 'Status: voorgesteld');
    faalt(fixture, agent(fixture));
  });

  test('spec goedgekeurd naar voorstel: slaagt', () => {
    const fixture = metBasis({ [MINI]: spec('demo', 'goedgekeurd', false) });
    zetStatusRegel(fixture.root, MINI, 'status: voorstel');
    slaagt(fixture, agent(fixture));
  });
});

describe('ADR 0046 punt 5 (antwoord 4): een besluit-PR bevat alleen docs/adr, docs/specs en het record', () => {
  test.each([['docs/roadmap.md'], ['CHANGELOG.md']])("twee ADR's en %s: faalt", (pad) => {
    const fixture = nieuw();
    write(fixture.root, 'docs/adr/0060-een.md', adrTekst('0060', 'geaccepteerd'));
    write(fixture.root, 'docs/adr/0061-twee.md', adrTekst('0061', 'geaccepteerd'));
    write(fixture.root, pad, 'Aangepast.\n');
    faalt(fixture, agent(fixture));
  });
});

describe('ADR 0046 punt 2: de tekst van een geaccepteerd ADR verandert niet (A4 blijft)', () => {
  test('inhoud wijzigen, status blijft geaccepteerd: faalt', () => {
    const fixture = metBasis({ [ADR]: adrTekst('0099', 'geaccepteerd') });
    write(fixture.root, ADR, adrTekst('0099', 'geaccepteerd', 'Iets anders.'));
    faalt(fixture, agent(fixture));
  });

  test('inhoud wijzigen terwijl de PR ook een ander document accepteert: faalt', () => {
    const fixture = metBasis({ [ADR]: adrTekst('0099', 'geaccepteerd') });
    write(fixture.root, ADR, adrTekst('0099', 'geaccepteerd', 'Iets anders.'));
    write(fixture.root, 'docs/adr/0098-ander.md', adrTekst('0098', 'geaccepteerd'));
    faalt(fixture, agent(fixture));
  });
});

describe('ADR 0046 punt 5: inhoud van een goedgekeurde spec wijzigen alleen in een besluit-PR zonder code', () => {
  test.each([
    ['mini-spec', true],
    ['volledige spec', false],
  ])('%s, PR zonder code: slaagt', (_naam, mini) => {
    const fixture = metBasis({ [MINI]: spec('demo', 'goedgekeurd', mini) });
    write(fixture.root, MINI, `${read(fixture.root, MINI)}\n## Extra\n\nNieuw gedrag.\n`);
    slaagt(fixture, agent(fixture));
  });

  test.each([
    ['een bronbestand in src/web', WEB],
    ['een route in src/api', ROUTE],
  ])('PR met %s: faalt', (_naam, code) => {
    const fixture = metBasis({ [MINI]: spec('demo', 'goedgekeurd', true) });
    write(fixture.root, MINI, `${read(fixture.root, MINI)}\n## Extra\n\nNieuw gedrag.\n`);
    write(fixture.root, code, 'export const x = 1;\n');
    faalt(fixture, agent(fixture));
  });
});

describe('ADR 0046 punt 5 en 31: besluit-PR en feature-lane', () => {
  test('feature-lane (een mini-spec met code) met een gewone committer: slaagt', () => {
    const { fixture, head } = feature({ statusCommit: 'agent' });
    slaagt(fixture, head);
  });

  test('een volledige spec met eigenaarstatus én src/api-code, gewone committer: faalt', () => {
    const fixture = nieuw();
    write(fixture.root, MINI, spec('demo', 'goedgekeurd', false));
    write(fixture.root, ROUTE, 'export const x = 1;\n');
    expect(faalt(fixture, agent(fixture, 'feat: spec en route'))).toContain(MINI);
  });

  test('een ADR met eigenaarstatus én een bronbestand, gewone committer: faalt', () => {
    const fixture = nieuw();
    write(fixture.root, ADR, adrTekst('0099', 'geaccepteerd'));
    write(fixture.root, WEB, 'export const x = 1;\n');
    faalt(fixture, agent(fixture));
  });

  test('een ADR én een mini-spec met eigenaarstatus plus code, gewone committer: faalt', () => {
    const fixture = nieuw();
    write(fixture.root, ADR, adrTekst('0099', 'geaccepteerd'));
    write(fixture.root, MINI, spec('demo', 'goedgekeurd', true));
    write(fixture.root, WEB, 'export const x = 1;\n');
    faalt(fixture, agent(fixture));
  });
});

describe('ADR 0046 punt 5: de samenvatting noemt elk document dat een eigenaarstatus krijgt', () => {
  function drieDocumenten() {
    const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', 'geaccepteerd') });
    write(fixture.root, 'docs/adr/0060-vervanger.md', adrTekst('0060', 'geaccepteerd'));
    write(fixture.root, MINI, spec('demo', 'goedgekeurd', false));
    zetStatusRegel(fixture.root, ADR_OUD, 'Status: vervangen door 0060');
    return { fixture, head: agent(fixture) };
  }
  const NAMEN = ['docs/adr/0060-vervanger.md', MINI, ADR_OUD];

  test('de uitvoer op stdout noemt alle drie de bestanden', () => {
    const { fixture, head } = drieDocumenten();
    const uitvoer = draaiChecker(fixture, head);
    expect(uitvoer.status).toBe(0);
    for (const naam of NAMEN) expect(uitvoer.stdout).toContain(naam);
  });

  test('de stapsamenvatting (GITHUB_STEP_SUMMARY) noemt alle drie de bestanden', () => {
    const bestand = path.join(tempDir('samenvatting-0038-'), 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = bestand;
    try {
      const { fixture, head } = drieDocumenten();
      expect(draaiChecker(fixture, head).status).toBe(0);
      const tekst = readFileSync(bestand, 'utf8');
      expect(tekst).toContain('document-status: goedgekeurd');
      for (const naam of NAMEN) expect(tekst).toContain(naam);
    } finally {
      delete process.env['GITHUB_STEP_SUMMARY'];
    }
  });
});

// --- Review van ADR 0046: verwijderen, terugzetten van een spec en het bouwbewijs. ---------------------------------------

/** Een lange, onderscheidende tekst, zodat een verwijderd en een nieuw bestand nooit als rename gelden. */
const uniek = (prefix: string): string =>
  Array.from(
    { length: 12 },
    (_regel, index) => `${prefix} regel ${String(index)} met eigen woorden ${prefix}${String(index * 7)}.`,
  ).join('\n');

// GEWIJZIGD (eigenaarbesluit 2026-10-22, A4 in een besluit-PR): verwijderen mag in een besluit-PR (alleen docs/adr, docs/specs en
// het record), maar niet naast een toegevoegd ADR met hetzelfde nummer (G3); de weigering met andere bestanden en de rename staan in lane-status-a4.test.ts (G2, G3).
describe('ADR 0046 punt 2: een ADR met een eigenaarstatus verwijderen alleen in een besluit-PR', () => {
  test.each([['geaccepteerd'], ['vervallen'], ['vervangen door 0051']])(
    'een ADR met Status: %s verwijderen, zonder ander bestand: slaagt (besluit-PR)',
    (status) => {
      const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', status), [ADR_NIEUW]: adrTekst('0051', 'geaccepteerd') });
      git(fixture.root, ['rm', '-q', ADR_OUD]);
      slaagt(fixture, agent(fixture));
    },
  );

  test('0017-a.md verwijderen en 0017-b.md met andere inhoud en geaccepteerd toevoegen (geen rename): faalt met de A4-melding', () => {
    const fixture = metBasis({ 'docs/adr/0017-a.md': adrTekst('0017', 'geaccepteerd', uniek('alfa')) });
    git(fixture.root, ['rm', '-q', 'docs/adr/0017-a.md']);
    write(fixture.root, 'docs/adr/0017-b.md', adrTekst('0017', 'geaccepteerd', uniek('beta')));
    expect(faalt(fixture, agent(fixture))).toMatch(/A4/);
  });

  test('een voorgesteld ADR verwijderen: slaagt', () => {
    const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', 'voorgesteld') });
    git(fixture.root, ['rm', '-q', ADR_OUD]);
    slaagt(fixture, agent(fixture));
  });
});

describe('ADR 0046 punt 2: een spec mag van gebouwd of vervallen terug naar voorstel (geen eigenaarstatus)', () => {
  test.each([
    ['gebouwd', BOUWSTATUS],
    ['vervallen', 'vervallen'],
  ])('%s naar voorstel: slaagt', (_naam, begin) => {
    const fixture = metBasis({ [MINI]: spec('demo', begin, false) });
    zetStatusRegel(fixture.root, MINI, 'status: voorstel');
    slaagt(fixture, agent(fixture));
  });
});
