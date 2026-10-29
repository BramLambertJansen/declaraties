import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Spec ontwerp-overnemen (5b): de UX-modus van de reviewer, de helper `uxScreenshot` in de skill `nieuw-scherm` en
// framework §8. Elke toets kijkt alleen in de eigen sectie of stap, zodat een term elders in het bestand niet meetelt.
const reviewer = readFileSync('.claude/agents/reviewer.md', 'utf8');
const nieuwScherm = readFileSync('.claude/skills/nieuw-scherm/SKILL.md', 'utf8');
const framework = readFileSync('docs/framework.md', 'utf8');

// Van de kop `## <titel>` (aan het begin van een regel) tot de volgende kop van niveau 2, of het einde.
function section(text: string, heading: string): string {
  const lines = text.split('\n');
  const start = lines.indexOf(heading);
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return rest.slice(0, end === -1 ? rest.length : end).join('\n');
}

// Een genummerde stap `<n>. …` tot de volgende genummerde stap of een lege regel.
function step(text: string, n: number): string {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`${String(n)}. `));
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^\d+\. /.test(line) || line.trim() === '');
  return [lines[start], ...rest.slice(0, end === -1 ? rest.length : end)].join('\n');
}

// Blokken van §8: een nieuw blok begint bij een lege regel, een genummerde stap of een vette alinea.
function blocks(text: string): string[] {
  return text.split(/\n(?=\d+\. |\*\*|\n)/).filter((block) => block.trim() !== '');
}

const modusUx = section(reviewer, '## Modus UX');
const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(reviewer)?.[1] ?? '';

describe('reviewer: sectie Modus UX', () => {
  test('ontwerp-overnemen/AC-11: kop "## Modus UX" staat na "## Modus spec-review"', () => {
    const lines = reviewer.split('\n');
    const specReview = lines.indexOf('## Modus spec-review');
    const ux = lines.indexOf('## Modus UX');

    expect(specReview, '## Modus spec-review bestaat').toBeGreaterThan(-1);
    expect(ux, '## Modus UX bestaat').toBeGreaterThan(-1);
    expect(ux).toBeGreaterThan(specReview);
  });

  test.each(['hiërarchie', 'ritme', 'consistentie', 'leeg', 'laden', 'fout', '44 px', 'focus', 'tekst', 'referentie'])(
    'ontwerp-overnemen/AC-11: Modus UX noemt checklistterm "%s"',
    (term) => {
      expect(modusUx.toLowerCase()).toContain(term);
    },
  );

  test.each(['docs/ontwerp/', '375', '1280', 'UX zonder screenshots: alleen op code getoetst'])(
    'ontwerp-overnemen/AC-11: Modus UX noemt "%s"',
    (term) => {
      expect(modusUx).toContain(term);
    },
  );

  test('ontwerp-overnemen/AC-12: tools blijven Read, Grep, Glob, Bash en het rapport staat onder "## Bevindingen"', () => {
    expect(frontmatter).toMatch(/^tools: Read, Grep, Glob, Bash$/m);
    expect(reviewer).toContain('## Bevindingen');
    expect(modusUx.length, 'sectie Modus UX bestaat').toBeGreaterThan(0);
  });

  test.each([
    { name: 'Write', pattern: /\bWrite\b/ },
    { name: 'Edit', pattern: /\bEdit\b/ },
    { name: 'git commit', pattern: /\bgit\s+commit\b/ },
    { name: '--write', pattern: /--write\b/ },
    { name: 'scripts/kit/ontwerp-meten.mjs', pattern: /scripts\/kit\/ontwerp-meten\.mjs/ },
  ])('ontwerp-overnemen/AC-12: Modus UX geeft geen schrijfopdracht of script: geen $name', ({ pattern }) => {
    expect(modusUx.length, 'sectie Modus UX bestaat').toBeGreaterThan(0);
    expect(modusUx).not.toMatch(pattern);
  });
});

describe('nieuw-scherm stap 5 en framework §8', () => {
  test.each(['uxScreenshot', 'e2e/support/ux.ts'])(
    'ontwerp-overnemen/AC-14: stap 5 van nieuw-scherm noemt %s',
    (term) => {
      const stap5 = step(nieuwScherm, 5);

      expect(stap5, 'stap 5 bestaat').toMatch(/^5\. /);
      expect(stap5).toContain(term);
    },
  );

  test('ontwerp-overnemen/AC-14: framework §8 noemt "Modus UX" bij de reviewer', () => {
    const paragraaf8 = section(framework, '## 8. Werkstraat');

    expect(paragraaf8.length, '§8 bestaat').toBeGreaterThan(0);
    expect(
      blocks(paragraaf8).filter((block) => block.includes('Modus UX') && /reviewer/i.test(block)),
    ).not.toHaveLength(0);
  });
});
