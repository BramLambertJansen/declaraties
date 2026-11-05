import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { readAuthority } from '../../rails/hooks/lib/authority-context.mjs';
import { documentInfo } from '../../rails/hooks/lib/document-state.mjs';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import * as taskAuthority from '../../rails/hooks/lib/task-authority.mjs';
import { kritiekPad, laneVan } from '../../scripts/kit/lane.mjs';
import {
  BRANCH,
  REPOSITORY,
  S1,
  commit,
  draaiChecker,
  draaiDocsStatus,
  git,
  opruimen,
  read,
  specBody,
  tempDir,
  write,
  type Fixture,
} from './follow-up-kit';

// compacte-kennisbasis-rails/AC-14, AC-15 en AC-18 (PR 6b, docs/specs/compacte-kennisbasis-rails.md): het taakmandaat bestaat
// niet meer. Een eigenaarrecord in `.claude/decisions.json` geeft niets meer: geen schrijfrecht voor de developer, geen
// statusrecht, geen route voor `docs:status`. `readRegistry` leest een oud register nog wel (oude main-commits).
afterEach(opruimen);

const ROOT = path.join(import.meta.dirname, '../..');
const GATES = readFileSync(path.join(ROOT, '.claude/gates.json'), 'utf8');
const RECORD = '.claude/decisions.json';
const NIET_NEUTRAAL = /manda+te?|taakscope/i;

/** Alle paden waarvoor een record vóór de PR een `Taakmandaat:`-allow gaf (of had kunnen geven). */
const PADEN = [
  'src/core/web/ui/example.tsx',
  'src/core/api/http/example.ts',
  'src/core/shared/example.ts',
  'src/shared/permissions.ts',
  'src/api/app.ts',
  'src/api/kit.ts',
  'src/api/server.ts',
  'src/api/env.ts',
  'scripts/kit/example.mjs',
  '.github/workflows/example.yml',
];

/**
 * main (= origin/main) met een spec en, als `metRecord`, een eigenaarrecord dat alle `PADEN` noemt; daarna de branch
 * `feat/example`. De spec staat op `status` (digest van de inhoud, dus ook voor `voorstel` geldig).
 */
function maakRepo(opties: { status: string; metRecord: boolean; recordStatus?: string }): Fixture {
  const root = tempDir('taakmandaat-weg-');
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['remote', 'add', 'origin', `https://github.com/${REPOSITORY}.git`]);
  write(root, S1, specBody('s1', opties.status));
  write(root, 'README.md', 'Voorbeeld.\n');
  write(root, '.claude/gates.json', GATES);
  const decisions = opties.metRecord
    ? [
        {
          file: S1,
          digest: documentInfo(S1, specBody('s1'))?.digest,
          repository: REPOSITORY,
          branch: BRANCH,
          status: opties.recordStatus ?? 'goedgekeurd',
          paths: PADEN.filter((pad) => pad.startsWith('src/')),
        },
      ]
    : [];
  write(root, RECORD, JSON.stringify({ version: 1, requiredChecks: ['gate:fast'], decisions }));
  const base = commit(root, 'baseline');
  git(root, ['update-ref', 'refs/remotes/origin/main', base]);
  git(root, ['switch', '-q', '-c', BRANCH]);
  return { root, base };
}

describe('compacte-kennisbasis-rails/AC-14: de mandaatonderdelen bestaan niet meer', () => {
  test('scripts/kit/document-decision.mjs bestaat niet meer', () => {
    expect(existsSync(path.join(ROOT, 'scripts/kit/document-decision.mjs'))).toBe(false);
  });

  test('package.json heeft geen script docs:decision', () => {
    const pkg: unknown = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const scripts: unknown = typeof pkg === 'object' && pkg !== null ? Reflect.get(pkg, 'scripts') : null;
    expect(typeof scripts === 'object' && scripts !== null ? Object.keys(scripts) : []).not.toContain('docs:decision');
  });

  test('document-decision staat niet meer in KRITIEK van lane.mjs', () => {
    expect(kritiekPad('scripts/kit/document-decision.mjs', loadConfig(GATES))).toBe(false);
    // Controle: de andere besluit- en statusscripts blijven kritiek.
    expect(kritiekPad('scripts/kit/document-status.mjs', loadConfig(GATES))).toBe(true);
  });

  test('task-authority exporteert canWriteProtected niet meer, readRegistry en canRecordStatus wel', () => {
    expect(Object.keys(taskAuthority)).not.toContain('canWriteProtected');
    expect(Object.keys(taskAuthority)).toEqual(expect.arrayContaining(['readRegistry', 'canRecordStatus']));
  });

  test('rolhek.mjs en task-authority.mjs kennen geen Taakmandaat-melding of canWriteProtected meer', () => {
    const rolhek = readFileSync(path.join(ROOT, 'rails/hooks/lib/rolhek.mjs'), 'utf8');
    const authority = readFileSync(path.join(ROOT, 'rails/hooks/lib/task-authority.mjs'), 'utf8');
    expect(rolhek).not.toContain('Taakmandaat');
    expect(rolhek).not.toContain('canWriteProtected');
    expect(authority).not.toContain('canWriteProtected');
  });

  test.each(['scripts/kit/check-document-status.mjs', '.github/workflows/guard.yml'])(
    '%s noemt geen mandaat of taakscope',
    (bestand) => {
      expect(readFileSync(path.join(ROOT, bestand), 'utf8')).not.toMatch(NIET_NEUTRAAL);
    },
  );

  test('readAuthority leest een oud register met een record nog (tolerant), zonder er rechten aan te hangen', () => {
    const { root } = maakRepo({ status: 'goedgekeurd', metRecord: true });
    const authority = readAuthority({ root });
    expect(authority).not.toBeNull();
    expect(authority?.registry.decisions).toHaveLength(1);
    expect(authority?.registry.requiredChecks).toStrictEqual(['gate:fast']);
  });
});

describe('compacte-kennisbasis-rails/AC-15: een record geeft de developer geen schrijfrecht meer', () => {
  function ctxVan(root: string, onderhoud: boolean) {
    return {
      root,
      cwd: root,
      config: loadConfig(GATES),
      authority: readAuthority({ root }),
      branch: BRANCH,
      onderhoud,
      read: (file: string) => {
        try {
          return read(root, file);
        } catch {
          return null;
        }
      },
      committed: () => false,
      isDir: () => false,
    };
  }

  const ROLLEN = ['', 'developer', 'architect', 'tester', 'reviewer', 'Explore'];
  const gevallen = ROLLEN.flatMap((rol) =>
    PADEN.flatMap((pad) => [true, false].map((onderhoud) => ({ rol, pad, onderhoud }))),
  );

  test.each(gevallen)(
    'rol "$rol", $pad, onderhoud=$onderhoud: met record dezelfde uitslag als zonder, nooit een allow of Taakmandaat',
    ({ rol, pad, onderhoud }) => {
      const metRecord = maakRepo({ status: 'goedgekeurd', metRecord: true });
      const zonder = maakRepo({ status: 'goedgekeurd', metRecord: false });
      const call = (root: string) => ({
        tool_name: 'Write',
        ...(rol === '' ? {} : { agent_type: rol }),
        tool_input: { file_path: path.join(root, pad), content: 'export const version = 2;\n' },
      });
      const met = decide(call(metRecord.root), ctxVan(metRecord.root, onderhoud));
      const uitslag = decide(call(zonder.root), ctxVan(zonder.root, onderhoud));
      // De paden in de uitslag bevatten de fixturemap; vergelijk daarom op de tekst met het pad genormaliseerd.
      const normaal = (value: unknown, root: string): string => JSON.stringify(value).replaceAll(root, '<root>');
      expect(normaal(met, metRecord.root)).toStrictEqual(normaal(uitslag, zonder.root));
      expect(met.allow).toBeUndefined();
      expect(JSON.stringify(met)).not.toContain('Taakmandaat');
    },
  );

  test('een developer die een corebron schrijft krijgt de gewone melding, geen allow (template-repo)', () => {
    const { root } = maakRepo({ status: 'goedgekeurd', metRecord: true });
    const uitslag = decide(
      {
        tool_name: 'Write',
        agent_type: 'developer',
        tool_input: { file_path: path.join(root, 'src/core/api/http/example.ts'), content: 'export {};\n' },
      },
      ctxVan(root, true),
    );
    expect(uitslag.allow).toBeUndefined();
    expect(uitslag.deny).toStrictEqual([]);
    expect(uitslag.context).toHaveLength(1);
  });

  test('een developer buiten onderhoud die een voorReview-pad schrijft: deny, ook met record', () => {
    const { root } = maakRepo({ status: 'goedgekeurd', metRecord: true });
    const uitslag = decide(
      {
        tool_name: 'Write',
        agent_type: 'developer',
        tool_input: { file_path: path.join(root, 'scripts/kit/example.mjs'), content: 'export {};\n' },
      },
      ctxVan(root, false),
    );
    expect(uitslag.deny).not.toHaveLength(0);
    expect(uitslag.allow).toBeUndefined();
  });

  test('een niet-gate pad (permissions.ts, app.ts) blijft zonder uitslag voor de developer, ook met record', () => {
    const { root } = maakRepo({ status: 'goedgekeurd', metRecord: true });
    for (const pad of ['src/shared/permissions.ts', 'src/api/app.ts']) {
      const uitslag = decide(
        {
          tool_name: 'Write',
          agent_type: 'developer',
          tool_input: { file_path: path.join(root, pad), content: 'export {};\n' },
        },
        ctxVan(root, false),
      );
      expect(uitslag).toStrictEqual({ deny: [], ask: [], context: [] });
    }
  });

  test('canRecordStatus: een passend record geeft geen statusrecht meer', () => {
    const { root } = maakRepo({ status: 'voorstel', metRecord: true });
    const authority = readAuthority({ root });
    if (authority === null) throw new Error('Fixture heeft geen authority');
    const goedgekeurd = specBody('s1', 'goedgekeurd');
    const werkmap = { ...authority, working: () => goedgekeurd };
    expect(taskAuthority.canRecordStatus({ file: S1, text: goedgekeurd }, werkmap)).toBe(false);
  });

  test('canRecordStatus: dezelfde status met dezelfde digest als main blijft geldig', () => {
    const { root } = maakRepo({ status: 'goedgekeurd', metRecord: false });
    const authority = readAuthority({ root });
    if (authority === null) throw new Error('Fixture heeft geen authority');
    expect(taskAuthority.canRecordStatus({ file: S1, text: specBody('s1', 'goedgekeurd') }, authority)).toBe(true);
    expect(taskAuthority.canRecordStatus({ file: S1, text: specBody('s1', 'vervallen') }, authority)).toBe(false);
  });
});

describe('compacte-kennisbasis-rails/AC-15: docs:status schrijft alleen nog gebouwd', () => {
  test.each(['goedgekeurd', 'vervallen'])(
    'status %s met een passend record: geweigerd met verwijzing naar een besluit-PR, niets geschreven',
    (doel) => {
      const { root } = maakRepo({ status: 'voorstel', metRecord: true, recordStatus: doel });
      const voor = read(root, S1);
      const uitvoer = draaiDocsStatus(root, [S1, doel]);
      expect(uitvoer.status).toBe(1);
      expect(uitvoer.stderr).toMatch(/besluit-PR/i);
      expect(uitvoer.stderr).not.toMatch(NIET_NEUTRAAL);
      expect(read(root, S1)).toBe(voor);
      expect(git(root, ['status', '--porcelain'])).toBe('');
    },
  );

  test('status goedgekeurd zonder record: ook geweigerd met verwijzing naar een besluit-PR', () => {
    const { root } = maakRepo({ status: 'voorstel', metRecord: false });
    const uitvoer = draaiDocsStatus(root, [S1, 'goedgekeurd']);
    expect(uitvoer.status).toBe(1);
    expect(uitvoer.stderr).toMatch(/besluit-PR/i);
  });
});

describe('compacte-kennisbasis-rails/AC-15: check-document-status (randgeval "status zonder lane, na 6b")', () => {
  function zetGoedgekeurd(root: string): void {
    write(root, S1, read(root, S1).replace('status: voorstel', 'status: goedgekeurd'));
  }

  test('een statuswijziging buiten een lane met alleen een record op main: geweigerd', () => {
    const fixture = maakRepo({ status: 'voorstel', metRecord: true });
    zetGoedgekeurd(fixture.root);
    write(fixture.root, 'README.md', 'Gewijzigd.\n');
    const uitvoer = draaiChecker(fixture, commit(fixture.root, 'docs: status en readme'));
    expect(uitvoer.status).toBe(1);
    expect(uitvoer.stderr).toContain(S1);
    expect(uitvoer.stderr).not.toMatch(NIET_NEUTRAAL);
  });

  test('controle: dezelfde statuswijziging als besluit-PR (alleen de spec) slaagt, met of zonder record', () => {
    for (const metRecord of [true, false]) {
      const fixture = maakRepo({ status: 'voorstel', metRecord });
      zetGoedgekeurd(fixture.root);
      const uitvoer = draaiChecker(fixture, commit(fixture.root, 'docs: status'));
      expect(uitvoer.stderr).toBe('');
      expect(uitvoer.status).toBe(0);
    }
  });

  test('de uitvoer van een geslaagde check noemt geen mandaat of taakscope', () => {
    const fixture = maakRepo({ status: 'goedgekeurd', metRecord: true });
    write(fixture.root, 'README.md', 'Gewijzigd.\n');
    const uitvoer = draaiChecker(fixture, commit(fixture.root, 'docs: readme'));
    expect(uitvoer.status).toBe(0);
    expect(uitvoer.stdout).toContain('document-status:');
    expect(uitvoer.stdout).not.toMatch(NIET_NEUTRAAL);
  });

  test('een code- of roadmapwijziging bij een record op main kent geen mandaatscope meer', () => {
    const fixture = maakRepo({ status: 'goedgekeurd', metRecord: true });
    write(fixture.root, 'src/core/web/ui/example.tsx', 'export const version = 2;\n');
    write(fixture.root, 'docs/roadmap.md', '# Roadmap\n\n- [x] Iets (#1)\n');
    const uitvoer = draaiChecker(fixture, commit(fixture.root, 'feat: bron en roadmap'));
    expect(uitvoer.stderr).not.toMatch(NIET_NEUTRAAL);
    expect(uitvoer.status).toBe(0);
  });
});

describe('compacte-kennisbasis-rails/AC-14: .claude/decisions.json in een besluit-PR', () => {
  const ADR = 'docs/adr/0098-demo.md';
  const config = loadConfig(GATES);
  const lane = (changes: { status: string; pad: string }[], besluiten: string[]) =>
    laneVan({ changes, besluiten, config, repository: REPOSITORY });

  test.each([
    ['een ADR met het register', ADR],
    ['een spec met het register', 'docs/specs/demo.md'],
  ])('%s: geen lane; het register telt niet meer als eigen record', (_naam, besluit) => {
    const uitslag = lane(
      [
        { status: 'A', pad: besluit },
        { status: 'M', pad: RECORD },
      ],
      [besluit],
    );
    expect(uitslag.lane).toBeNull();
    expect(uitslag.reden).toContain(RECORD);
  });

  test('controle: alleen het besluitdocument is nog steeds de framework-lane', () => {
    expect(lane([{ status: 'A', pad: ADR }], [ADR]).lane).toBe('framework');
  });
});

describe('compacte-kennisbasis-rails/AC-18: een gewijzigde of verwijderde mandaattest vraagt de eigenaar', () => {
  // Proces, geen test van de spec; deze regressietest legt vast dat het rolhek elke subagent blijft weigeren.
  const TESTS = ['test/hooks/authority.test.ts', 'test/hooks/authority-git.test.ts'];
  const SUBAGENTS = ['developer', 'tester', 'reviewer', 'architect', 'docs', 'Explore'];
  const ctx = () => ({
    root: ROOT,
    cwd: ROOT,
    config: loadConfig(GATES),
    authority: null,
    branch: BRANCH,
    onderhoud: true,
    read: (file: string) => {
      try {
        return readFileSync(path.join(ROOT, file), 'utf8');
      } catch {
        return null;
      }
    },
    committed: () => false,
    isDir: () => false,
  });

  test.each(TESTS.flatMap((bestand) => SUBAGENTS.map((rol) => ({ bestand, rol }))))(
    '$rol: een gewijzigde $bestand zonder testgevallen is geweigerd',
    ({ bestand, rol }) => {
      const uitslag = decide(
        {
          tool_name: 'Write',
          agent_type: rol,
          tool_input: { file_path: path.join(ROOT, bestand), content: "import { test } from 'vitest';\n" },
        },
        ctx(),
      );
      expect(uitslag.deny).not.toHaveLength(0);
    },
  );

  test.each(TESTS)('de hoofdsessie moet de eigenaar vragen bij een gewijzigde %s zonder testgevallen', (bestand) => {
    const uitslag = decide(
      {
        tool_name: 'Write',
        tool_input: { file_path: path.join(ROOT, bestand), content: "import { test } from 'vitest';\n" },
      },
      ctx(),
    );
    expect(uitslag.ask).not.toHaveLength(0);
  });

  test('de rolhek-hook zelf (echt proces) weigert een developer die een mandaattest leegmaakt', () => {
    const payload = {
      cwd: ROOT,
      tool_name: 'Write',
      agent_type: 'developer',
      tool_input: { file_path: path.join(ROOT, TESTS[0] ?? ''), content: "import { test } from 'vitest';\n" },
    };
    const uitvoer = spawnSync(process.execPath, [path.join(ROOT, 'rails/hooks/rolhek.mjs')], {
      cwd: ROOT,
      input: JSON.stringify(payload),
      encoding: 'utf8',
    });
    expect(uitvoer.status).not.toBe(0);
  });
});
