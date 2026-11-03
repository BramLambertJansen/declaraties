import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { docsKrimp, docsMeldingen } from '../../scripts/kit/check-docs.mjs';
import { definities, leesLijst, normMeldingen, normViolations } from '../../scripts/kit/normen.mjs';

// Spec krimp-op-normen (ADR 0067): elke R-id die uit het regelboek verdwijnt, staat op docs/normen-vervallen.md.
const root = process.cwd();
const KOP = '# Vervallen normen\n\nUitleg.\n';
const BOEK =
  '# Framework\n\n## 9. Docs\n\n- **R-DOC-01** Een norm.\n- **R-DOC-02** Nog een norm.\n- **R-DOC-03a** Met letter.\n';
const zonder = (id: string) =>
  BOEK.split('\n')
    .filter((r) => !r.includes(`**${id}**`))
    .join('\n');
const lijst = (regels: string, pad = 'docs/framework.md') => `${KOP}\n## ${pad}\n\n${regels}`;

function toets(nu: { boek?: string | null; lijst?: string | null; oudeLijst?: string | null }) {
  return normViolations({
    boek: { oud: BOEK, nieuw: nu.boek === undefined ? BOEK : nu.boek },
    lijst: { oud: nu.oudeLijst === undefined ? KOP : nu.oudeLijst, nieuw: nu.lijst === undefined ? KOP : nu.lijst },
    bytes: { oud: {}, nieuw: {} },
  }).map(({ message }) => message);
}

describe('krimp-op-normen/AC-1: elke verdwenen R-id staat op de lijst', () => {
  test('krimp-op-normen/AC-1 een geschrapte R-id zonder regel is rood, ook als het boek groeit', () => {
    const uit = toets({ boek: `${zonder('R-DOC-02')}\n${'x'.repeat(5000)}\n` });
    expect(uit.join('\n')).toContain('R-DOC-02 verdween');
  });

  test.each([
    ['verplaatst', '- R-DOC-02 → R-DOC-01\n'],
    ['geschrapt met reden', '- R-DOC-02 → geschrapt: dubbel met de lint\n'],
  ])('krimp-op-normen/AC-1 %s: groen', (_naam, regel) => {
    expect(toets({ boek: zonder('R-DOC-02'), lijst: lijst(regel) })).toStrictEqual([]);
  });

  test('krimp-op-normen/AC-1 een letter-R-id telt als definitie', () => {
    expect(toets({ boek: zonder('R-DOC-03a') }).join('\n')).toContain('R-DOC-03a verdween');
  });

  test.each([
    ['in een codeblok', '```\n- **R-DOC-09** X\n```\n'],
    ['in een tilde-codeblok', '~~~\n- **R-DOC-09** X\n~~~\n'],
    ['in HTML-commentaar', '<!--\n- **R-DOC-09** X\n-->\n'],
  ])('krimp-op-normen/AC-1 een definitie %s telt niet', (_naam, blok) => {
    expect([...definities(`${BOEK}${blok}`).ids.keys()]).not.toContain('R-DOC-09');
    expect(toets({ boek: `${zonder('R-DOC-02')}${blok.replace('R-DOC-09', 'R-DOC-02')}` }).join('\n')).toContain(
      'R-DOC-02 verdween',
    );
  });

  test.each([
    ['ster als opsommingsteken', '* **R-DOC-07** X\n'],
    ['spatie in de vetdruk', '- ** R-DOC-07** X\n'],
    ['ingesprongen', '  - **R-DOC-07** X\n'],
    ['spatie voor de sluitende vetdruk', '- **R-DOC-07 ** X\n'],
    ['zonder opsommingsteken', '**R-DOC-07** X\n'],
    ['genummerd', '1. **R-DOC-07** X\n'],
  ])('krimp-op-normen/AC-1 een regel die op een definitie lijkt (%s): rood', (_naam, regel) => {
    expect(toets({ boek: `${BOEK}${regel}` }).join('\n')).toContain('lijkt op een definitie');
  });

  test('krimp-op-normen/AC-1 een dubbele definitie en een vervolgregel: rood', () => {
    expect(toets({ boek: `${BOEK}- **R-DOC-01** Weer.\n` }).join('\n')).toContain('meer dan één keer');
    expect(toets({ boek: `${BOEK}- **R-DOC-04** X\n  vervolg\n` }).join('\n')).toContain('vervolgregel');
  });

  test('krimp-op-normen/AC-1 commentaar binnen de regel laat de definitie staan', () => {
    expect([...definities('- **R-DOC-09** Norm <!-- notitie -->\n').ids.keys()]).toStrictEqual(['R-DOC-09']);
  });

  test('krimp-op-normen/AC-1 commentaar wordt van links naar rechts gelezen, niet weggevervangen', () => {
    // `<!<!---->--` toont `<!--` als tekst; dat opent geen commentaar, dus de volgende regel blijft zichtbaar.
    expect([...definities('<!<!---->--\n- **R-DOC-09** Norm\n').ids.keys()]).toStrictEqual(['R-DOC-09']);
    expect([...definities('<!-- a --> x <!-- b\n- **R-DOC-09** Norm\n-->\n').ids.keys()]).toStrictEqual([]);
  });

  test('krimp-op-normen/AC-1 een langer codeblokhek sluit niet op een korter hek', () => {
    const blok = '````\n```\n- **R-DOC-09** X\n````\n';
    expect([...definities(blok).ids.keys()]).not.toContain('R-DOC-09');
  });

  test('krimp-op-normen/AC-1 een hek met tekst erachter sluit een codeblok niet', () => {
    const blok = '```markdown\n```voorbeeld\n- **R-DOC-09** X\n```\n';
    expect([...definities(blok).ids.keys()]).not.toContain('R-DOC-09');
  });

  test('krimp-op-normen/AC-1 een ingesprongen codeblok direct onder een definitie is een vervolgregel', () => {
    expect(definities('- **R-DOC-04** X\n    ```\n    y\n    ```\n').fouten.join('\n')).toContain('vervolgregel');
  });

  test('krimp-op-normen/AC-1 regelboek verwijderd: elke R-id verdween', () => {
    expect(toets({ boek: null }).filter((m) => m.includes('verdween'))).toHaveLength(3);
  });

  test('krimp-op-normen/AC-1 een R-id die elders in het boek terugkomt, is niet verdwenen', () => {
    const verplaatst = `${zonder('R-DOC-01')}\n## 10. Elders\n\n- **R-DOC-01** Een norm.\n`;
    expect(toets({ boek: verplaatst })).toStrictEqual([]);
  });
});

describe('krimp-op-normen/AC-2: doelen op de lijst', () => {
  test.each([
    ['een reden van één woord', '- R-DOC-02 → geschrapt: weg\n', 'drie woorden'],
    ['alles → geschrapt: .', '- alles → geschrapt: .\n', 'drie woorden'],
    ['een reden van alleen leestekens', '- R-DOC-02 → geschrapt: . . .\n', 'drie woorden'],
    ['een onbekend doel', '- R-DOC-02 → R-DOC-99\n', 'R-DOC-99'],
    ['geen R-id en geen geschrapt', '- R-DOC-02 → elders\n', 'geen R-id'],
  ])('krimp-op-normen/AC-2 %s: rood', (_naam, regel, genoemd) => {
    expect(toets({ boek: zonder('R-DOC-02'), lijst: lijst(regel) }).join('\n')).toContain(genoemd);
  });

  test('krimp-op-normen/AC-2 een R-id die nog bestaat, of twee keer links staat: rood', () => {
    expect(toets({ lijst: lijst('- R-DOC-01 → geschrapt: echt niet meer nodig\n') }).join('\n')).toContain(
      'nog gedefinieerd',
    );
    const dubbel = lijst('- R-DOC-02 → R-DOC-01\n- R-DOC-02 → geschrapt: toch maar weg ermee\n');
    expect(toets({ boek: zonder('R-DOC-02'), lijst: dubbel }).join('\n')).toContain('twee keer');
  });

  test('krimp-op-normen/AC-2 een keten van hernummeringen blijft geldig; een kring niet', () => {
    const boek = zonder('R-DOC-02').replace('R-DOC-01', 'R-DOC-12');
    const keten = lijst('- R-DOC-02 → R-DOC-01\n- R-DOC-01 → R-DOC-12\n');
    expect(toets({ boek, lijst: keten })).toStrictEqual([]);
    const naarGeschrapt = lijst('- R-DOC-02 → R-DOC-05\n- R-DOC-05 → geschrapt: later toch overbodig gebleken\n');
    expect(toets({ boek: zonder('R-DOC-02'), lijst: naarGeschrapt })).toStrictEqual([]);
    const kring = lijst('- R-DOC-02 → R-DOC-05\n- R-DOC-05 → R-DOC-02\n');
    expect(toets({ boek: zonder('R-DOC-02'), lijst: kring }).join('\n')).toContain('kringverwijzing');
  });
});

describe('krimp-op-normen/AC-3: bytedrempel met de lijst als enige plek', () => {
  const krimp = (lijstTekst: string, oud = KOP) =>
    normViolations({
      boek: { oud: BOEK, nieuw: BOEK },
      lijst: { oud, nieuw: lijstTekst },
      bytes: { oud: { 'AGENTS.md': 8000 }, nieuw: { 'AGENTS.md': 5000 } },
    });

  test('krimp-op-normen/AC-3 zonder nieuwe regel rood, met nieuwe regel onder een bestaande kop groen', () => {
    expect(krimp(KOP)).toHaveLength(1);
    const eerder = lijst('- oude regel → geschrapt: stond er al eerder\n', 'AGENTS.md');
    expect(krimp(eerder, eerder)).toHaveLength(1);
    expect(krimp(`${eerder}- tweede regel → R-DOC-01\n`, eerder)).toStrictEqual([]);
  });

  test('krimp-op-normen/AC-3 een regel met een lege oude norm telt niet als inventaris', () => {
    expect(krimp(lijst('-   → R-DOC-01\n', 'AGENTS.md')).length).toBeGreaterThan(0);
  });
});

describe('krimp-op-normen/AC-4: de vorm van de lijst, en hij krimpt nooit', () => {
  test.each([
    ['een codeblok', `${KOP}\n## AGENTS.md\n\n\`\`\`\n- a → R-DOC-01\n\`\`\`\n`],
    ['HTML-commentaar', `${KOP}\n<!-- x -->\n`],
    ['een ingesprongen regel', `${KOP}\n## AGENTS.md\n\n  - a → R-DOC-01\n`],
    ['andere tekst na de uitleg', `${KOP}\n## AGENTS.md\n\nZomaar tekst.\n`],
    ['een lijstregel in de uitleg', `# Vervallen normen\n\n- a → R-DOC-01\n`],
    ['een lege oude norm', `${KOP}\n## AGENTS.md\n\n-   → R-DOC-01\n`],
  ])('krimp-op-normen/AC-4 %s: rood', (_naam, tekst) => {
    expect(leesLijst(tekst).fouten.length).toBeGreaterThan(0);
  });

  test('krimp-op-normen/AC-4 een verdwenen of veranderde regel of kop: rood', () => {
    const oud = lijst('- R-DOC-02 → geschrapt: dubbel met de lint\n');
    expect(toets({ boek: zonder('R-DOC-02'), oudeLijst: oud, lijst: KOP }).join('\n')).toContain('verdween');
    const anders = lijst('- R-DOC-02 → geschrapt: dubbel met de typecheck\n');
    expect(toets({ boek: zonder('R-DOC-02'), oudeLijst: oud, lijst: anders }).join('\n')).toContain('veranderde');
  });

  test('krimp-op-normen/AC-4 docs/normen-vervallen.md bestaat, is geldig en beschermd', () => {
    const tekst = readFileSync('docs/normen-vervallen.md', 'utf8');
    expect(leesLijst(tekst).fouten).toStrictEqual([]);
    const gates = readFileSync('.claude/gates.json', 'utf8');
    expect(gates.split('"voorReview"')[0]).toContain('"docs/normen-vervallen.md"');
    expect(gates.split('"voorReview"')[1]).toContain('"docs/normen-vervallen.md"');
    expect(readFileSync('.github/CODEOWNERS', 'utf8')).toMatch(/^\/docs\/normen-vervallen\.md\s/m);
  });
});

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
}

function repo(bestanden: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'krimp-op-normen-'));
  dirs.push(dir);
  for (const [pad, inhoud] of Object.entries(bestanden)) {
    mkdirSync(path.dirname(path.join(dir, pad)), { recursive: true });
    writeFileSync(path.join(dir, pad), inhoud);
  }
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'basis');
  return dir;
}

describe('krimp-op-normen/AC-5: zonder basis in CI rood, lokaal een melding', { timeout: 60_000 }, () => {
  test('krimp-op-normen/AC-5 zonder origin/main', async () => {
    const dir = repo({ 'docs/framework.md': BOEK });
    const ci = spawnSync(
      process.execPath,
      [
        '-e',
        `import('${path.join(root, 'scripts/kit/check-docs.mjs')}').then(async (m) => console.log(JSON.stringify(await m.docsKrimp('.'))))`,
      ],
      { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'true' } },
    );
    expect(ci.stdout).toContain('geen merge-base');
    const vorig = process.env['GITHUB_ACTIONS'];
    process.env['GITHUB_ACTIONS'] = '';
    try {
      expect(await docsKrimp(dir)).toStrictEqual([]);
      expect((await docsMeldingen(dir)).join('\n')).toContain('geen merge-base');
    } finally {
      process.env['GITHUB_ACTIONS'] = vorig;
    }
  });

  test('krimp-op-normen/AC-5 zonder basis toetst hij wel de vorm van definities en lijst', async () => {
    const dir = repo({
      'docs/framework.md': `${BOEK}- **R-DOC-01** Dubbel.\n`,
      'docs/normen-vervallen.md': `${KOP}<!-- x -->\n`,
    });
    const uit = (await docsKrimp(dir)).map(({ message }) => message).join('\n');
    expect(uit).toContain('meer dan één keer');
    expect(uit).toContain('HTML-commentaar');
  });

  test('krimp-op-normen/AC-5 een verdwenen R-id blijft rood na ratchet --update (nooit in de baseline)', () => {
    const dir = repo({
      'docs/framework.md': BOEK,
      'docs/normen-vervallen.md': KOP,
      'package.json': JSON.stringify({ scripts: {} }),
      'src/leeg.ts': 'export {};\n',
      '.kit/baseline.json': '{}\n',
    });
    git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    writeFileSync(path.join(dir, 'docs/framework.md'), zonder('R-DOC-02'));
    git(dir, 'commit', '-qam', 'schrap');
    const ratchet = (...args: string[]) =>
      spawnSync(process.execPath, [path.join(root, 'scripts/kit/ratchet.mjs'), ...args], {
        cwd: dir,
        encoding: 'utf8',
      });
    expect(ratchet('--update').status).toBe(0);
    const r = ratchet();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('R-DOC-02');
  });

  test('krimp-op-normen/AC-5 tegen de merge-base: een geschrapte R-id is rood', async () => {
    const dir = repo({ 'docs/framework.md': BOEK, 'docs/normen-vervallen.md': KOP });
    git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    writeFileSync(path.join(dir, 'docs/framework.md'), zonder('R-DOC-02'));
    git(dir, 'commit', '-qam', 'schrap');
    expect((await docsKrimp(dir)).map(({ message }) => message).join('\n')).toContain('R-DOC-02 verdween');
  });
});

describe('krimp-op-normen/AC-6: melding bij een gewijzigde norm en de reviewer toetst hem', () => {
  test('krimp-op-normen/AC-6 een veranderde definitieregel geeft een melding, geen overtreding', () => {
    const uitgehold = BOEK.replace('Een norm.', 'Iets.');
    expect(normMeldingen({ oud: BOEK, nieuw: uitgehold }).join('\n')).toContain('R-DOC-01');
    expect(toets({ boek: uitgehold })).toStrictEqual([]);
    expect(normMeldingen({ oud: BOEK, nieuw: BOEK })).toStrictEqual([]);
  });

  test('krimp-op-normen/AC-6 checklist, reviewer en PR-sjabloon noemen de lijst', () => {
    expect(readFileSync('docs/operations/review-checklists.md', 'utf8')).toMatch(/uitgehold[^\n]*normen-vervallen\.md/);
    expect(readFileSync('.claude/agents/reviewer.md', 'utf8')).toContain('bij `normen-vervallen.md` ook Docs');
    expect(readFileSync('.github/pull_request_template.md', 'utf8')).toContain('docs/normen-vervallen.md');
  });
});

describe('krimp-op-normen/AC-7: regelboek en leesbudget verwijzen naar de nieuwe controle', () => {
  // De verwijzing in docs/specs/leesbudget.md volgt in een docs-PR: een inhoudswijziging van een gebouwde spec gaat niet
  // samen met kritieke paden zoals .claude/gates.json (document-status, ADR 0062 punt 2).
  test('krimp-op-normen/AC-7 R-DOC-07 noemt de lijst en 0067', () => {
    const regel = readFileSync('docs/framework.md', 'utf8')
      .split('\n')
      .find((r) => r.startsWith('- **R-DOC-07**'));
    expect(regel).toContain('docs/normen-vervallen.md');
    expect(regel).toContain('0067');
  });
});
