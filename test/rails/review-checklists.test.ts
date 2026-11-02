import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Roadmap-item "Vervolg compacte kennisbasis", V3 "slankere review": de reviewchecklists als apart doc.
const DOC = 'docs/operations/review-checklists.md';
const REVIEWER = '.claude/agents/reviewer.md';
const doc = existsSync(DOC) ? readFileSync(DOC, 'utf8') : '';

const KOPPEN = [
  'Werkwijze',
  'Rolhek en hooks',
  'Tests',
  'Tekstchecks',
  'Schaal en scripts',
  'API en data',
  'Docs en instructies',
];

/** Secties per ##-kop: kop en tekst tot de volgende ##-kop. */
function secties(text: string): { kop: string; body: string }[] {
  const delen = text.split(/^## /m).slice(1);
  return delen.map((deel) => {
    const nl = deel.indexOf('\n');
    return nl === -1 ? { kop: deel.trim(), body: '' } : { kop: deel.slice(0, nl).trim(), body: deel.slice(nl + 1) };
  });
}

describe('review-checklists', () => {
  test('review-checklists AC-1: het doc bestaat en is hooguit 3500 bytes', () => {
    expect(existsSync(DOC), `${DOC} ontbreekt`).toBe(true);
    expect(Buffer.byteLength(doc, 'utf8')).toBeLessThanOrEqual(3500);
  });

  test('review-checklists AC-1: precies de zeven ##-koppen in volgorde', () => {
    expect(existsSync(DOC), `${DOC} ontbreekt`).toBe(true);
    expect(secties(doc).map((s) => s.kop)).toStrictEqual(KOPPEN);
  });

  test.each(KOPPEN)('review-checklists AC-1: onder "%s" staat minstens één opsommingsregel', (kop) => {
    expect(existsSync(DOC), `${DOC} ontbreekt`).toBe(true);
    const sectie = secties(doc).find((s) => s.kop === kop);
    expect(sectie, `kop ${kop} ontbreekt`).toBeDefined();
    expect(sectie?.body ?? '').toMatch(/^- \S/m);
  });

  test.each(['#395', '#396', '#399', '#401', '#402', '#409', '#410', '#411', '#412'])(
    'review-checklists AC-2: leerpunt %s komt voor',
    (nummer) => {
      expect(existsSync(DOC), `${DOC} ontbreekt`).toBe(true);
      expect(doc).toContain(nummer);
    },
  );

  test('review-checklists AC-3: reviewer.md verwijst naar het doc, noemt risicoklasse en blijft ≤ 3900 bytes', () => {
    const reviewer = readFileSync(REVIEWER, 'utf8');
    expect(reviewer).toContain('docs/operations/review-checklists.md');
    expect(reviewer).toContain('risicoklasse');
    expect(Buffer.byteLength(reviewer, 'utf8')).toBeLessThanOrEqual(3900);
  });

  test('review-checklists AC-4: Werkwijze eist één volledige review, git diff <vorige-sha>..HEAD en herbeoordeling bij nieuw bestand, beschermd pad of rail', () => {
    expect(existsSync(DOC), `${DOC} ontbreekt`).toBe(true);
    const werkwijze = secties(doc).find((s) => s.kop === 'Werkwijze')?.body ?? '';
    expect(werkwijze).toContain('één volledige review');
    expect(werkwijze).toContain('git diff <vorige-sha>..HEAD');
    expect(werkwijze).toMatch(/nieuw bestand/i);
    expect(werkwijze).toMatch(/beschermd pad/i);
    expect(werkwijze).toMatch(/rail/i);
    expect(werkwijze).toMatch(/opnieuw een volledige review/i);
  });

  test('review-checklists AC-5: het doc is bereikbaar vanuit doorloop, framework of opleveren-skill', () => {
    const bronnen = ['docs/operations/agent-doorloop.md', 'docs/framework.md', '.claude/skills/opleveren/SKILL.md'];
    const noemt = bronnen.filter((p) => existsSync(p) && readFileSync(p, 'utf8').includes('review-checklists.md'));
    expect(noemt, 'geen van de drie noemt review-checklists.md').not.toHaveLength(0);
  });
});
