import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { adrOverzicht, faseOverzicht, faseVan, specsOverzicht } from '../../scripts/kit/feiten-tekst.mjs';
import { herijkingMeldingen, openPerFase } from '../../scripts/kit/roadmap-herijking.mjs';
import { echteStap, trend } from '../../scripts/kit/meting-trend.mjs';

// Spec meting-stuurt (ADR 0070): de trend meldt een echte stap (AC-2), de meldingen staan op de PR (AC-3), feiten.mjs heeft
// plafonds (AC-5), check:roadmap eist een herijking bij het sluiten van een fase (AC-7) en de documentatie volgt (AC-9).
const root = process.cwd();
const lees = (pad: string) => readFileSync(path.join(root, pad), 'utf8');
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('meting-stuurt/AC-2: de trend meldt alleen een echte stap', () => {
  test.each([
    [1.0, 1.2, false],
    [0.0, 0.1, false],
    [1.0, 1.5, true],
    [0.0, 0.5, true],
    [0.7, 1.2, true],
    [2.0, 2.49, false],
    [2.0, 2.5, true],
    [4.0, 4.9, false],
    [1.0, 1.0, false],
    [1.5, 1.0, false],
  ])('meting-stuurt/AC-2 vorige %d → laatste %d: %s', (vorige, laatste, verwacht) => {
    expect(echteStap(laatste, vorige)).toBe(verwacht);
  });

  test("meting-stuurt/AC-2 trend(): één bevinding meer over tien PR's (0,1) geeft geen melding", () => {
    const prs = Array.from({ length: 20 }, (_x, i) => ({
      nummer: 100 - i,
      ciRood: 0,
      codex: i === 0 ? 1 : 0,
      reviewrondes: 1,
    }));
    expect(trend(prs).meldingen).toStrictEqual([]);
    expect(trend(prs).maten).toMatchObject({ codex: { laatste: 0.1, vorige: 0, steeg: false } });
  });
});

describe('meting-stuurt/AC-3: workflow, skill en rolhek', () => {
  test('meting-stuurt/AC-3 gate:fast draait pnpm leespad in een eigen stap met if: always(), zonder extra rechten', () => {
    const ci = lees('.github/workflows/ci.yml');
    // GEWIJZIGD (ADR 0076): de stap staat in het deel `checks` van de matrixjob `gate-fast-part`, nog steeds met always().
    const job = ci.slice(ci.indexOf('  gate-fast-part:'), ci.indexOf('\n  gate-fast:'));
    expect(job).toMatch(/- if: always\(\) && matrix\.deel == 'checks'\n\s+run: pnpm leespad\n/);
    expect(job).not.toContain('permissions:');
    expect(ci).toMatch(/^permissions: read-all$/m);
  });

  test('meting-stuurt/AC-3 opleveren zet de "let op"-regels van pnpm leespad in de PR-beschrijving', () => {
    const skill = lees('.claude/skills/opleveren/SKILL.md');
    const tools = /^allowed-tools: (.+)$/m.exec(skill)?.[1] ?? '';
    expect(tools.split(', ')).toEqual(expect.arrayContaining(['Bash(pnpm leespad)', 'Bash(pnpm leespad *)']));
    const lus = skill.slice(skill.indexOf('## CI-lus tot groen'), skill.indexOf('## Mergen'));
    expect(lus).toMatch(/`pnpm meting --trend` en `pnpm leespad`/);
    expect(lus).toMatch(/"let op"-regel[^]*PR-beschrijving/);
  });

  const ctx = {
    root: '/repo',
    cwd: '/repo',
    config: loadConfig(lees('.claude/gates.json')),
    read: () => null,
    committed: () => false,
    isDir: () => false,
    branch: 'feat/x',
  };
  const weigert = (command: string) =>
    decide({ tool_name: 'Bash', tool_input: { command }, agent_type: 'reviewer' }, ctx).deny.length > 0;

  // Dezelfde waardecontrole als --ref: een vastgeplakte waarde (`--ref=…`) weigert het rolhek ook (rolhek-lezen/AC-3).
  test.each([
    ['pnpm leespad --basis origin/main', false],
    ['pnpm leespad --basis 39fd473b428b9b4081d454ae5ca904035ba07a1c', false],
    ['pnpm leespad --json --ref HEAD --basis origin/main', false],
    ['pnpm leespad --basis=39fd473b428b9b4081d454ae5ca904035ba07a1c', true],
    ["pnpm leespad --basis '$(touch x)'", true],
    ["pnpm leespad --basis 'a;touch x'", true],
    ["pnpm leespad --basis 'a b'", true],
  ])('meting-stuurt/AC-3 reviewer: %s → geweigerd %s', (command, verwacht) => {
    expect(weigert(command)).toBe(verwacht);
  });
});

describe('meting-stuurt/AC-5: plafonds in feiten.mjs', () => {
  const specs = [
    { spec: 'a.md', status: 'gebouwd' },
    { spec: 'b.md', status: 'goedgekeurd' },
    { spec: 'c.md', status: 'vervallen' },
    { spec: 'd.md', status: 'voorstel' },
    { spec: 'e.md', status: 'gebouwd' },
  ];

  test('meting-stuurt/AC-5 specs: alleen voorstel en goedgekeurd, een telregel per andere status; --alle alles', () => {
    expect(specsOverzicht(specs, false)).toStrictEqual({
      lijst: [specs[1], specs[3]],
      overig: '2 gebouwd, 1 vervallen (feiten specs --alle of docs/specs/)',
    });
    expect(specsOverzicht(specs, true)).toStrictEqual(specs);
  });

  test('meting-stuurt/AC-5 adr: voorgesteld en de tien geaccepteerde met het hoogste nummer, plus een telregel', () => {
    const lijst = [
      ...Array.from({ length: 14 }, (_x, i) => ({
        nummer: String(i + 1).padStart(4, '0'),
        titel: `A${String(i + 1)}`,
        status: 'geaccepteerd',
      })),
      { nummer: '0015', titel: 'Open', status: 'voorgesteld' },
      { nummer: '0016', titel: 'Weg', status: 'vervallen' },
    ];
    const overzicht = adrOverzicht(lijst, false);
    expect(overzicht.lijst.map((adr) => adr.titel)).toStrictEqual([
      'A5',
      'A6',
      'A7',
      'A8',
      'A9',
      'A10',
      'A11',
      'A12',
      'A13',
      'A14',
      'Open',
    ]);
    expect(overzicht).toHaveProperty(
      'overig',
      expect.stringMatching(/^4 oudere geaccepteerd, 1 vervangen\/vervallen \(feiten adr --alle/),
    );
    expect(adrOverzicht(lijst, true).lijst).toHaveLength(16);
  });

  const ROADMAP = [
    '## Nu',
    '',
    ...Array.from({ length: 3 }, (_x, i) => `- [ ] **Nu ${String(i)}** (fase 1).`),
    '',
    '## Volgende',
    '',
    ...Array.from({ length: 8 }, (_x, i) => `- [ ] **Later ${String(i)}** (fase 2).`),
    '',
    '## Geparkeerd',
  ].join('\n');

  test('meting-stuurt/AC-5 fase: alles onder Nu, de eerste vijf onder Volgende en een telregel; --alle alles', () => {
    const kort = faseOverzicht({ roadmap: ROADMAP, dod: null, specs: [] });
    const open = 'open' in kort ? kort.open : [];
    expect(open.map((item) => item.split(' · ')[1])).toStrictEqual([
      'Nu 0',
      'Nu 1',
      'Nu 2',
      'Later 0',
      'Later 1',
      'Later 2',
      'Later 3',
      'Later 4',
    ]);
    expect(kort).toHaveProperty('overig', '3 meer open onder Volgende (feiten fase --alle)');
    const alles = faseOverzicht({ roadmap: ROADMAP, dod: null, specs: [], alle: true });
    expect('open' in alles ? alles.open : []).toHaveLength(11);
    expect(alles).not.toHaveProperty('overig');
  });

  test.each([
    ['(fase 1, stuk 6)', { nummer: 1, label: 'fase 1 (stuk 6)' }],
    ['(stuk 3e)', { nummer: 1, label: 'fase 1 (stuk 3e)' }],
    ['(fase 3, per app)', { nummer: 3, label: 'fase 3' }],
    ['in de Playwright-image (uit fase 2).', null],
    ['(fase 2; doorlopend, P5)', null],
    ['(uit fase 2, nu fase 3)', { nummer: 3, label: 'fase 3' }],
    ['(uit fase 2, stuk 3)', null],
    ['(ADR 0051)', null],
  ])('meting-stuurt/AC-7 faseVan(%s)', (tekst, verwacht) => {
    expect(faseVan(tekst)).toStrictEqual(verwacht);
  });

  test('meting-stuurt/AC-5 de agentbestanden wijzen naar --alle buiten stap 1', () => {
    const architect = lees('.claude/agents/architect.md');
    expect(architect).toMatch(/`adr --alle` voor historie of een geldig ADR buiten de tien/);
    expect(architect).toMatch(
      /passende spec zoek je op aanvraag met `feiten\.mjs specs --alle` of in `docs\/specs\/`, niet in deze stap/,
    );
    expect(lees('.claude/skills/spec/SKILL.md')).toMatch(
      /op aanvraag met `node scripts\/kit\/feiten\.mjs specs --alle` of in `docs\/specs\/`/,
    );
    expect(lees('CLAUDE.md')).toContain('`adr --alle` voor historie of een geldig ADR buiten de tien');
    expect(lees('docs/framework.md')).toMatch(
      /\*\*R-WERK-01\*\*[^\n]*`--alle` voor historie of een geldig ADR buiten de tien/,
    );
  });
});

function git(cwd: string, ...args: string[]) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
}

describe('meting-stuurt/AC-7: herijken bij het sluiten van een fase', { timeout: 60_000 }, () => {
  const roadmap = (nu: string[], volgende: string[] = [], geparkeerd: string[] = []) =>
    [
      '# Roadmap',
      '',
      '## Nu',
      '',
      ...nu,
      '',
      '## Volgende',
      '',
      ...volgende,
      '',
      '## Geparkeerd',
      '',
      ...geparkeerd,
      '',
    ].join('\n');
  const ARCHIEF = '# Archief\n\n## Gebouwd\n\n### Fase 2 — Features\n\n- [x] iets (#1)\n\n### Fase 3 — Release\n';
  const HERIJKING = 'Herijking fase 2: 2026-11-03, leespad 74 KB (nieuwe-feature), trend zonder let op.';
  const met = (archief: string, regel: string) => archief.replace('- [x] iets (#1)\n', `- [x] iets (#1)\n${regel}\n`);
  const OPEN2 = '- [ ] **Klus** (fase 2).';
  const OPEN1 = '- [ ] **Ander** (fase 1).';

  const meld = (basisRoadmap: string, nu: string, archieven: { archief?: string; basisArchief?: string } = {}) =>
    herijkingMeldingen({
      basisRoadmap,
      roadmap: nu,
      basisArchief: archieven.basisArchief ?? ARCHIEF,
      archief: archieven.archief ?? ARCHIEF,
    }).map(({ key }) => key);

  test.each([
    ['afvinken', roadmap([OPEN2, OPEN1]), roadmap(['- [x] **Klus** (fase 2). #9', OPEN1])],
    ['parkeren', roadmap([OPEN1], [OPEN2]), roadmap([OPEN1], [], [OPEN2])],
    ['verhuizen (weg uit Nu en Volgende)', roadmap([OPEN2, OPEN1]), roadmap([OPEN1])],
  ])('meting-stuurt/AC-7 %s van de laatste open taak van een fase vraagt een herijkingsregel', (_naam, voor, na) => {
    expect(meld(voor, na)).toStrictEqual(['roadmap:herijking:2']);
    expect(meld(voor, na, { archief: met(ARCHIEF, HERIJKING) })).toStrictEqual([]);
  });

  test('meting-stuurt/AC-7 de melding noemt de fase en R-DOC-08', () => {
    const [melding] = herijkingMeldingen({
      basisRoadmap: roadmap([OPEN2]),
      roadmap: roadmap([]),
      basisArchief: ARCHIEF,
      archief: ARCHIEF,
    });
    expect(melding?.message).toMatch(/fase 2[^]*R-DOC-08/);
  });

  test.each([
    ['zonder datum', 'Herijking fase 2: leespad 74 KB, trend zonder let op.'],
    ['zonder leespad in KB', 'Herijking fase 2: 2026-11-03, leespad hoog, trend zonder let op.'],
    ['zonder trend', 'Herijking fase 2: 2026-11-03, leespad 74 KB.'],
    ['onder een andere fase', null],
  ])('meting-stuurt/AC-7 een regel %s telt niet', (_naam, regel) => {
    const archief =
      regel === null
        ? ARCHIEF.replace('### Fase 3 — Release\n', `### Fase 3 — Release\n${HERIJKING}\n`)
        : met(ARCHIEF, regel);
    expect(meld(roadmap([OPEN2]), roadmap([]), { archief })).toStrictEqual(['roadmap:herijking:2']);
  });

  test('meting-stuurt/AC-7 een regel die al op de basis stond telt niet; de kop mag de PR toevoegen', () => {
    const oud = met(ARCHIEF, HERIJKING);
    expect(meld(roadmap([OPEN2]), roadmap([]), { archief: oud, basisArchief: oud })).toStrictEqual([
      'roadmap:herijking:2',
    ]);
    const zonderKop = '# Archief\n\n## Gebouwd\n';
    expect(
      meld(roadmap([OPEN2]), roadmap([]), {
        archief: `${zonderKop}\n### Fase 2\n${HERIJKING}\n`,
        basisArchief: zonderKop,
      }),
    ).toStrictEqual([]);
    expect(
      meld(roadmap([OPEN2]), roadmap([]), {
        archief: `${zonderKop}\n### Fase 20 — x\n${HERIJKING}\n`,
        basisArchief: zonderKop,
      }),
    ).toStrictEqual(['roadmap:herijking:2']);
  });

  test('meting-stuurt/AC-7 twee fases tegelijk: een regel per fase', () => {
    expect(meld(roadmap([OPEN2, OPEN1]), roadmap([]))).toStrictEqual(['roadmap:herijking:1', 'roadmap:herijking:2']);
  });

  test('meting-stuurt/AC-7 geen trigger: fase blijft open, items zonder fase, "uit fase", doorlopend, heropend item', () => {
    expect(meld(roadmap([OPEN2, '- [ ] **Nog een** (fase 2).']), roadmap([OPEN2]))).toStrictEqual([]);
    expect(meld(roadmap(['- [ ] **Los** (ADR 0051).']), roadmap([]))).toStrictEqual([]);
    expect(meld(roadmap(['- [ ] **Beeld** (uit fase 2).']), roadmap([]))).toStrictEqual([]);
    expect(meld(roadmap(['- [ ] **Steeds** (fase 2; doorlopend).']), roadmap([]))).toStrictEqual([]);
    expect(meld(roadmap([]), roadmap([OPEN2]))).toStrictEqual([]);
    expect([...openPerFase(roadmap([OPEN2, OPEN1], [OPEN2]))]).toStrictEqual([
      [2, 2],
      [1, 1],
    ]);
  });

  test('meting-stuurt/AC-7 check:roadmap in een tijdelijke repo: faalt met de fase, slaagt met de regel; zonder basis faalt hij', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'meting-stuurt-roadmap-'));
    dirs.push(dir);
    const schrijf = (pad: string, inhoud: string) => {
      mkdirSync(path.dirname(path.join(dir, pad)), { recursive: true });
      writeFileSync(path.join(dir, pad), inhoud);
    };
    const check = () =>
      spawnSync(process.execPath, [path.join(root, 'scripts/kit/check-roadmap.mjs')], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_ACTIONS: '' },
      });
    git(dir, 'init', '-q');
    schrijf('package.json', '{}\n');
    schrijf('docs/roadmap-archief.md', ARCHIEF);
    schrijf('docs/roadmap.md', roadmap([OPEN2], [], []).replace('## Geparkeerd\n', '## Geparkeerd\n\n## Besluiten\n'));
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'basis');
    expect(check().status).toBe(1); // zonder origin/main: onleesbare basis faalt zoals nu
    git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    schrijf(
      'docs/roadmap.md',
      roadmap([], [], [OPEN2.replace('.', '. Terug als: later.')]).replace(
        '## Geparkeerd\n',
        '## Geparkeerd\n\n## Besluiten\n',
      ),
    );
    const rood = check();
    expect(rood.status).toBe(1);
    expect(rood.stderr).toMatch(/sluit fase 2[^\n]*R-DOC-08/);
    schrijf('docs/roadmap-archief.md', met(ARCHIEF, HERIJKING));
    const groen = check();
    expect(groen.stderr).toBe('');
    expect(groen.status).toBe(0);
  });
});

describe('meting-stuurt/AC-9: regelboek en operations-doc', () => {
  test('meting-stuurt/AC-9 R-DOC-08 noemt de trigger van check:roadmap en dat "let op" een verschil met de basis is', () => {
    const regel = /^- \*\*R-DOC-08\*\* (.+)$/m.exec(lees('docs/framework.md'))?.[1] ?? '';
    expect(regel).toMatch(/verschil met de basis/);
    expect(regel).toMatch(/Sluit een PR een roadmap-fase, dan eist `check:roadmap` een herijkingsregel/);
    expect(regel).toContain('0070');
  });

  test('meting-stuurt/AC-9 agent-doorloop beschrijft basis, afgeleide feiten-aanroepen en plafonds', () => {
    const doc = lees('docs/operations/agent-doorloop.md');
    for (const kop of [
      '**Tegenover de basis.**',
      '**Afgeleide feiten-aanroepen.**',
      '**Plafonds in `feiten.mjs`.**',
      '**Herijken.**',
    ])
      expect(doc).toContain(kop);
    expect(doc).toContain('git merge-base origin/main HEAD');
  });
});

describe('meting-stuurt/AC-8: leesbudget volgt de meting die stuurt', () => {
  const ac = (n: number) =>
    lees('docs/specs/leesbudget.md')
      .split('\n')
      .find((r) => r.startsWith(`- **leesbudget/AC-${String(n)}**`)) ?? '';

  test('meting-stuurt/AC-8 leesbudget AC-7: REST, twintig nieuwste op merged_at, "meet", drempel uit meting-stuurt/AC-2', () => {
    expect(ac(7)).toContain('via REST: één `gh api …/pulls?state=closed`, de twintig nieuwste op `merged_at`');
    expect(ac(7)).not.toContain('gh pr list');
    expect(ac(7)).toContain("meet nooit meer dan twintig PR's");
    expect(ac(7)).toContain('meting-stuurt/AC-2');
  });

  test('meting-stuurt/AC-8 leesbudget AC-3: de herijkte waarden en "let op" via meting-stuurt/AC-1', () => {
    expect(ac(3)).toContain('nieuwe-feature ≤ 50 KB');
    expect(ac(3)).toContain('88, 34 en 22 KB');
    expect(ac(3)).toContain('meting-stuurt/AC-1');
  });
});
