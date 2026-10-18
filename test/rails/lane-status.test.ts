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

// ADR 0029 punt 3 en 7: een statusovergang in de PR zelf is geldig in de feature-lane en in de framework-lane, mits de
// commit die de statusregel zette alleen statusregels wijzigt (a), er geen inhoud na de status komt (b) en de committer
// GitHub web-flow is (c). Echte tijdelijke repositories; de checker draait zoals guard.yml hem draait, met main als basis.
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

/** De agent legt een voorstel + code voor; daarna zet de web-flow-committer de statusregel. */
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

  test('9a de statuscommit wijzigt ook inhoud: faalt', () => {
    const { fixture, head } = feature({
      extra: (root) => {
        write(root, WEB, 'export const x = 2;\n');
      },
    });
    expect(draaiChecker(fixture, head).status).toBe(1);
  });

  test('9b inhoud na de status: faalt', () => {
    const { fixture } = feature();
    write(fixture.root, MINI, `${read(fixture.root, MINI)}\nExtra regel.\n`);
    const head = commitAls(fixture.root, 'feat: nog iets', 'web-flow');
    expect(draaiChecker(fixture, head).status).toBe(1);
  });

  test('9c een andere committer dan web-flow: faalt', () => {
    const { fixture, head } = feature({ statusCommit: 'agent' });
    const uitvoer = draaiChecker(fixture, head);
    expect(uitvoer.status).toBe(1);
    expect(uitvoer.stderr).toContain('web-flow');
  });

  test('de status in dezelfde commit als het nieuwe bestand: faalt', () => {
    const fixture = nieuw();
    write(fixture.root, MINI, spec('demo', 'goedgekeurd', true));
    write(fixture.root, WEB, 'export const x = 1;\n');
    const head = commitAls(fixture.root, 'feat: alles in één', 'web-flow');
    expect(draaiChecker(fixture, head).status).toBe(1);
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

  test('5 twee specs naar een eigenaarstatus: faalt', () => {
    const fixture = nieuw();
    write(fixture.root, MINI, spec('demo', 'voorstel', true));
    write(fixture.root, 'docs/specs/tweede.md', spec('tweede', 'voorstel', true));
    commitAls(fixture.root, 'feat: twee specs', 'agent');
    zetStatus(fixture.root, MINI, 'goedgekeurd');
    zetStatus(fixture.root, 'docs/specs/tweede.md', 'goedgekeurd');
    expect(draaiChecker(fixture, commitAls(fixture.root, 'docs: status', 'web-flow')).status).toBe(1);
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
  'create table public.notes (id uuid primary key);',
  'alter table public.notes enable row level security;',
  'alter table public.notes force row level security;',
  'grant select on public.notes to app_authenticated;',
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
  test('de agent zet de status en web-flow commit daarna iets anders: faalt', () => {
    const fixture = nieuw();
    write(fixture.root, MINI, spec('demo', 'voorstel', true));
    commitAls(fixture.root, 'feat: demo', 'agent');
    zetStatus(fixture.root, MINI, 'goedgekeurd');
    commitAls(fixture.root, 'docs: status door de agent', 'agent');
    write(fixture.root, WEB, 'export const x = 1;\n');
    expect(draaiChecker(fixture, commitAls(fixture.root, 'feat: web', 'web-flow')).status).toBe(1);
  });

  test('web-flow zet de status, de agent zet hem terug en weer door: faalt', () => {
    const { fixture } = feature();
    zetStatus(fixture.root, MINI, 'voorstel');
    commitAls(fixture.root, 'docs: terug', 'web-flow');
    zetStatus(fixture.root, MINI, 'goedgekeurd');
    expect(draaiChecker(fixture, commitAls(fixture.root, 'docs: weer door de agent', 'agent')).status).toBe(1);
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

  test('een rename in de statuscommit: faalt', () => {
    const { fixture } = feature();
    git(fixture.root, ['mv', MINI, 'docs/specs/hernoemd.md']);
    expect(draaiChecker(fixture, commitAls(fixture.root, 'docs: hernoem', 'web-flow')).status).toBe(1);
  });
});

describe('twee besluiten en renames', () => {
  test('een tweede spec met een record op main telt ook als eigenaarstatus: faalt', () => {
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
    expect(uitvoer.status).toBe(1);
    expect(uitvoer.stderr).toContain('meer dan één document');
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

  test('een stapsamenvatting wordt geschreven bij een fout en bij succes (ADR 0031 besluit 1)', () => {
    const bestand = path.join(tempDir('samenvatting-'), 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = bestand;
    try {
      const fout = feature({ statusCommit: 'agent' });
      draaiChecker(fout.fixture, fout.head);
      expect(readFileSync(bestand, 'utf8')).toContain('document-status: afgekeurd');
      const goed = feature();
      draaiChecker(goed.fixture, goed.head);
      expect(readFileSync(bestand, 'utf8')).toContain('document-status: goedgekeurd');
    } finally {
      delete process.env['GITHUB_STEP_SUMMARY'];
    }
  });

  test('een fout komt als ::error title=document-status:: op stdout (ADR 0031 besluit 1)', () => {
    const { fixture, head } = feature({ statusCommit: 'agent' });
    const uitvoer = draaiChecker(fixture, head);
    expect(uitvoer.status).toBe(1);
    expect(uitvoer.stdout).toContain('::error title=document-status::');
    expect(uitvoer.stdout).toContain('web-flow');
  });
});
