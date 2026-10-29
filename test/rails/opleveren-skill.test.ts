import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// ADR 0046 punt 16, 25 en 26: de skill `opleveren`, framework §8 stap 6 en CLAUDE.md.
const SKILL = '.claude/skills/opleveren/SKILL.md';
const skill = existsSync(SKILL) ? readFileSync(SKILL, 'utf8') : '';
const framework = readFileSync('docs/framework.md', 'utf8');
const claude = readFileSync('CLAUDE.md', 'utf8');

function step6(): string {
  const start = framework.indexOf('6. **Opleveren**');
  const end = framework.indexOf('7. **Eigenaar**');
  return start === -1 || end === -1 ? '' : framework.slice(start, end);
}

describe('skill opleveren', () => {
  test('bestaat met frontmatter name en description', () => {
    expect(existsSync(SKILL)).toBe(true);
    const front = /^---\n([\s\S]*?)\n---/.exec(skill)?.[1] ?? '';
    expect(front).toMatch(/^name: opleveren$/m);
    expect(front).toMatch(/^description: \S.{10,}/m);
  });

  test.each([
    'pnpm pr:verify',
    '--watch',
    'gh run view',
    '--log-failed',
    'Opruimen',
    'state',
    'mergedAt',
    'git merge --ff-only origin/main',
    'git branch -D',
    'git push origin --delete',
  ])('noemt %s', (term) => {
    expect(skill).toContain(term);
  });

  test('geen --json merged (het veld bestaat niet in gh)', () => {
    expect(skill.length).toBeGreaterThan(0);
    expect(skill).not.toMatch(/--json[^\n]*\bmerged\b(?!At)/);
  });

  test.each([
    { name: 'afzwakken', pattern: /afzwak/i },
    { name: 'drie keer dezelfde fout', pattern: /drie keer/i },
    { name: 'oorzaak buiten de code', pattern: /buiten de code/i },
    { name: 'gate-pad', pattern: /gate-pad/i },
  ])('stopgrond: $name', ({ pattern }) => {
    expect(skill).toMatch(pattern);
  });

  test('bij modus eigenaar blijft mergen bij de eigenaar', () => {
    expect(skill).toMatch(/eigenaar/);
    expect(skill).toMatch(/merget?[^\n]*eigenaar|eigenaar[^\n]*merget?/i);
  });
});

describe('framework §8 stap 6 en CLAUDE.md', () => {
  test('stap 6 beschrijft de CI-lus tot groen met pr:verify en het opruimen', () => {
    const text = step6();
    expect(text).toContain('pnpm pr:verify');
    expect(text).toMatch(/tot groen/);
    expect(text).toMatch(/opruimen/i);
    expect(text).toContain('opleveren');
  });

  test('CLAUDE.md: CI-lus is uitgezonderd van "na twee mislukte correctiepogingen"', () => {
    const line = claude.split('\n').find((l) => l.includes('twee mislukte correctiepogingen')) ?? '';
    const around = claude.slice(claude.indexOf(line), claude.indexOf(line) + 600);
    expect(around).toMatch(/CI-lus/);
    expect(around).toMatch(/uitzondering|behalve/i);
  });

  test('docs/framework.md bevat nergens meer --json merged', () => {
    expect(framework).not.toMatch(/--json\s+[^\s`]*\bmerged\b(?!At)/);
  });
});

// Spec leerlus (docs/specs/leerlus.md), ADR 0059: de slotstap na de slotregel, de signaalmomenten en de documentatie.
// De tekst wordt vergeleken na het weghalen van backticks en het samenvoegen van witruimte (regelafbreking in markdown).
const flat = (text: string): string => text.replace(/`/g, '').replace(/\s+/g, ' ');
const SLOTREGEL =
  'Wat moet er in het spec-sjabloon, het gouden pad of een check veranderen zodat de volgende feature dit niet opnieuw betaalt?';
const SLOTSTAP =
  'Loop de signaalmomenten van deze sessie af: slotvraag, derde CI-ronde, eigenaarcorrectie (pnpm meting), blokkerende reviewbevinding (Leerpunt: ja), tweede mislukte correctiepoging. Per les: Leerpunt? Generiek: dien het in volgens het sjabloon leerpunt (gh issue create naar onderhoud.repository met --label leerpunt) en toon de tekst. Alleen voor deze app: een padregel, spec of ADR (vanaf 0100) in de app, geen issue. Niets: zeg "geen leerpunt".';
const ADR_0059 = 'adr/0059-leerlus-van-app-naar-template.md';
const PROTOCOL = 'docs/operations/st-09-praktijkproef.md';
const protocol = existsSync(PROTOCOL) ? readFileSync(PROTOCOL, 'utf8') : '';

/** Tekst tussen twee koppen (de eindkop telt niet mee); leeg als de beginkop ontbreekt. */
function section(text: string, start: RegExp, end: RegExp): string {
  const from = text.search(start);
  if (from === -1) return '';
  const rest = text.slice(from);
  const kop = rest.indexOf('\n') + 1;
  const to = rest.slice(kop).search(end);
  return to === -1 ? rest : rest.slice(0, kop + to);
}

/** Alinea's, en per tabelregel een eigen eenheid; witruimte samengevoegd. */
function units(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .flatMap((block) => (block.trimStart().startsWith('|') ? block.split('\n') : [block]))
    .map(flat);
}

describe('leerlus: slotstap in opleveren', () => {
  test('leerlus/AC-3: de slotregel blijft en de slotstap volgt er direct op, letterlijk', () => {
    const text = flat(skill);
    const regel = text.indexOf(SLOTREGEL);
    const stap = text.indexOf(SLOTSTAP);
    expect(regel, 'slotregel ontbreekt').toBeGreaterThanOrEqual(0);
    expect(stap, 'slotstap ontbreekt of wijkt af van de spec').toBeGreaterThan(regel);
    // Tussen beide alleen opmaak (aanhalingsteken, nummering, een korte vetgedrukte kop), geen andere stap.
    expect(text.slice(regel + SLOTREGEL.length, stap).length).toBeLessThanOrEqual(40);
  });

  test('leerlus/AC-3: de slotstap noemt gh issue create, --label leerpunt, onderhoud.repository en de app-uitzondering', () => {
    const stap = flat(skill).slice(flat(skill).indexOf('Loop de signaalmomenten'));
    expect(stap).toContain('gh issue create');
    expect(stap).toContain('--label leerpunt');
    expect(stap).toContain('onderhoud.repository');
    expect(stap).toMatch(/Alleen voor deze app: een padregel, spec of ADR \(vanaf 0100\) in de app, geen issue\./);
  });

  test('leerlus/AC-3: stopgrond (b) verwijst naar de slotstap', () => {
    const text = flat(skill);
    const verwijzingen = [...text.matchAll(/\(b\)/g)].map((match) => {
      const na = text.slice(match.index, match.index + 300);
      const einde = na.indexOf('(c)');
      return einde === -1 ? na : na.slice(0, einde);
    });
    expect(verwijzingen.some((na) => /slotstap|leerpunt/i.test(na))).toBe(true);
  });

  test('leerlus/AC-11: de slotstap noemt alle vijf signaalmomenten met hun bron', () => {
    const text = flat(skill);
    const start = text.indexOf('Loop de signaalmomenten');
    expect(start, 'slotstap ontbreekt').toBeGreaterThanOrEqual(0);
    const stap = text.slice(start, start + SLOTSTAP.length + 200);
    expect({
      slotvraag: stap.includes('slotvraag'),
      'derde CI-ronde': stap.includes('derde CI-ronde'),
      'eigenaarcorrectie (pnpm meting)': stap.includes('eigenaarcorrectie (pnpm meting)'),
      'blokkerende reviewbevinding (Leerpunt: ja)': stap.includes('blokkerende reviewbevinding (Leerpunt: ja)'),
      'tweede mislukte correctiepoging': stap.includes('tweede mislukte correctiepoging'),
    }).toStrictEqual({
      slotvraag: true,
      'derde CI-ronde': true,
      'eigenaarcorrectie (pnpm meting)': true,
      'blokkerende reviewbevinding (Leerpunt: ja)': true,
      'tweede mislukte correctiepoging': true,
    });
  });
});

describe('leerlus: framework en ST-09-protocol', () => {
  test('leerlus/AC-9: framework §10 "Template-updates naar een app" noemt het label leerpunt met link naar ADR 0059', () => {
    const tekst = flat(section(framework, /^### Template-updates naar een app/m, /^#{2,3} /m));
    expect(tekst.length).toBeGreaterThan(0);
    expect(tekst).toContain('leerpunt');
    expect(tekst).toContain(ADR_0059);
  });

  test('leerlus/AC-9: framework §8 (rolhektabel) noemt de nieuwe gh issue-regels', () => {
    const rijen = section(framework, /^## 8\. /m, /^## 9\. /m)
      .split('\n')
      .filter((line) => line.startsWith('|') && /rolhek/i.test(line))
      .map(flat)
      .join('\n');
    expect(rijen).toContain('gh issue create');
    expect(rijen).toContain('leerpunt');
    expect(rijen).toContain('onderhoud.repository');
    expect(rijen).toMatch(/schrijvende gh issue|gh issue (?:edit|close|comment)/);
  });

  test.each(['ST09-08', 'ST09-09', 'ST09-11'])('leerlus/AC-9: het protocol noemt bij %s het label leerpunt', (id) => {
    expect(units(protocol).some((unit) => unit.includes(id) && unit.includes('leerpunt'))).toBe(true);
  });

  test('leerlus/AC-9: het protocol linkt naar ADR 0059 en noemt leerpunt in het eindrapport', () => {
    expect(protocol).toContain(`../${ADR_0059}`);
    expect(flat(section(protocol, /^### 5\. Eindrapport/m, /^#{2,3} /m))).toContain('leerpunt');
  });

  test('leerlus/AC-9: bij ST09-09 is het bewijs de keten leerpunt-issue → roadmap-item → template-PR met merge-commit', () => {
    const keten = /leerpunt-issue.*roadmap-item.*aanleiding.*template-PR.*merge-commit/;
    expect(units(protocol).some((unit) => unit.includes('ST09-09') && keten.test(unit))).toBe(true);
  });

  test('leerlus/AC-10: het eindrapport vraagt totaal, opgepakt en herhalingen met het commando en nulmeting 0', () => {
    const rapport = flat(section(protocol, /^### 5\. Eindrapport/m, /^#{2,3} /m));
    expect(rapport).toContain('gh issue list --label leerpunt --state all');
    expect(rapport).toMatch(/totaal/i);
    expect(rapport).toMatch(/opgepakt/i);
    expect(rapport).toMatch(/herhaling/i);
    expect(rapport).toMatch(/nulmeting\D{0,30}\b(?:0|nul)\b/i);
  });
});
