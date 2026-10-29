import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { looksLikePath, pathExists } from '../../scripts/kit/check-docs.mjs';

// Spec ontwerp-overnemen, deel 5a: teksttoetsen op de skill `ontwerp-overnemen` en het mappingsjabloon (AC-1 t/m AC-5).
// Vorm van security-review-skill.test.ts (frontmatter) en opleveren-skill.test.ts (`test.each` over termen).
const SKILL = '.claude/skills/ontwerp-overnemen/SKILL.md';
const SJABLOON = 'docs/ontwerp/_template.md';
const lees = (pad: string) => (existsSync(pad) ? readFileSync(pad, 'utf8') : '');
const skill = lees(SKILL);
const sjabloon = lees(SJABLOON);

// Bewust lokaal: testbestanden importeren niets van elkaar, dus dezelfde korte parser als in security-review-skill.test.ts.
function frontmatter(text: string): Record<string, string> {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
  return Object.fromEntries(
    block
      .split('\n')
      .map((line) => /^([\w-]+):\s*(.*)$/.exec(line))
      .filter((match) => match !== null)
      .map((match) => [match[1] ?? '', match[2] ?? '']),
  );
}

// Aantal regels zoals een editor ze telt: een afsluitende newline opent geen extra regel.
function regels(text: string): number {
  return text === '' ? 0 : text.replace(/\n$/, '').split('\n').length;
}

/** De controlefunctie van AC-1: een lege lijst betekent dat de skill voldoet. */
function skillMeldingen(text: string): string[] {
  const meta = frontmatter(text);
  const description = meta['description'] ?? '';
  const meldingen: string[] = [];
  if (meta['name'] !== 'ontwerp-overnemen') meldingen.push('name is niet ontwerp-overnemen');
  if (description.length < 40) meldingen.push('description korter dan 40 tekens');
  for (const term of ['HTML', 'URL', 'afbeelding'])
    if (!description.includes(term)) meldingen.push(`description noemt ${term} niet`);
  if (regels(text) > 200) meldingen.push('meer dan 200 regels');
  return meldingen;
}

// Lijstitems (`-`, `*` of `1.`) met hun vervolgregels; een lege regel of een kop sluit een item af.
function lijstitems(text: string): string[] {
  const items: string[] = [];
  let huidig: string[] | undefined;
  for (const regel of text.split('\n')) {
    if (/^\s*(?:[-*]|\d+\.)\s/.test(regel)) {
      huidig = [regel];
      items.push('');
    } else if (regel.trim() === '' || regel.startsWith('#')) huidig = undefined;
    else huidig?.push(regel);
    if (huidig !== undefined) items[items.length - 1] = huidig.join('\n');
  }
  return items;
}

const stap = (term: RegExp) => lijstitems(skill).find((item) => term.test(item)) ?? '';

const GELDIGE_FIXTURE = [
  '---',
  'name: ontwerp-overnemen',
  'description: Een ontwerpreferentie (HTML, URL, afbeelding of niets) vertalen naar thematokens en een mapping.',
  '---',
  '',
  '# Ontwerp overnemen',
].join('\n');

describe('ontwerp-overnemen/AC-1: frontmatter en lengte van de skill', () => {
  test('ontwerp-overnemen/AC-1: de skill bestaat en voldoet aan de controlefunctie', () => {
    expect(existsSync(SKILL)).toBe(true);
    expect(skillMeldingen(skill)).toStrictEqual([]);
  });

  test('ontwerp-overnemen/AC-1: de controlefunctie aanvaardt een geldige fixture', () => {
    expect(skillMeldingen(GELDIGE_FIXTURE)).toStrictEqual([]);
  });

  test('ontwerp-overnemen/AC-1: een fixture zonder name faalt', () => {
    const zonderName = GELDIGE_FIXTURE.replace('name: ontwerp-overnemen\n', '');
    expect(skillMeldingen(zonderName)).toContain('name is niet ontwerp-overnemen');
  });

  test('ontwerp-overnemen/AC-1: een fixture met 201 regels faalt, met 200 niet', () => {
    const aanvulling = (aantal: number) => Array.from({ length: aantal }, (_, i) => `regel ${String(i)}`);
    const basis = GELDIGE_FIXTURE.split('\n');
    const twee = [...basis, ...aanvulling(200 - basis.length)].join('\n');
    const tweeEen = [...basis, ...aanvulling(201 - basis.length)].join('\n');

    expect(regels(twee)).toBe(200);
    expect(skillMeldingen(twee)).toStrictEqual([]);
    expect(regels(tweeEen)).toBe(201);
    expect(skillMeldingen(tweeEen)).toContain('meer dan 200 regels');
  });

  test('ontwerp-overnemen/AC-1: een te korte description of een zonder afbeelding faalt', () => {
    const kort = GELDIGE_FIXTURE.replace(/^description: .*$/m, 'description: HTML, URL, afbeelding');
    const zonderAfbeelding = GELDIGE_FIXTURE.replace('afbeelding', 'plaatje');

    expect(skillMeldingen(kort)).toContain('description korter dan 40 tekens');
    expect(skillMeldingen(zonderAfbeelding)).toContain('description noemt afbeelding niet');
  });
});

describe('ontwerp-overnemen/AC-2: paden en commando’s in de skill', () => {
  test.each([
    'src/web/styles/theme.css',
    'docs/ontwerp/_template.md',
    'node scripts/kit/feiten.mjs tokens',
    'node scripts/kit/feiten.mjs componenten',
    'nieuw-component',
    'scripts/kit/ontwerp-meten.mjs',
    '375',
    '1280',
  ])('ontwerp-overnemen/AC-2: de skill noemt %s', (term) => {
    expect(skill).toContain(term);
  });
});

describe('ontwerp-overnemen/AC-3: de drie modi', () => {
  test('ontwerp-overnemen/AC-3: een stap voor geen invoer noemt de bestaande stijl en theme.css', () => {
    const geenInvoer = stap(/geen invoer/i);

    expect(geenInvoer).not.toBe('');
    expect(geenInvoer).toMatch(/bestaande stijl/i);
    expect(geenInvoer).toContain('theme.css');
  });

  test('ontwerp-overnemen/AC-3: de stap voor een stylingrefactor eist een uitdrukkelijke vraag en houdt de rails', () => {
    const refactor = stap(/stylingrefactor/i);

    expect(refactor).not.toBe('');
    expect(refactor).toMatch(/uitdrukkelijk|letterlijk/i);
    for (const term of ['rails/klassen', 'contrast', 'axe', '44 px']) expect(refactor).toContain(term);
  });
});

describe('ontwerp-overnemen/AC-4: lettertypen', () => {
  test.each([
    'test/ui/semantische-tokens.test.ts',
    'docs/ui-kit-basics.md',
    'src/web/styles/fonts/',
    'LICENSE',
    'OFL',
    'woff2',
    'font-display: swap',
  ])('ontwerp-overnemen/AC-4: de skill noemt %s', (term) => {
    expect(skill).toContain(term);
  });

  test.each(['fonts.googleapis.com', 'fonts.gstatic.com', '<link'])(
    'ontwerp-overnemen/AC-4: de skill bevat geen %s',
    (term) => {
      expect(skill.length).toBeGreaterThan(0);
      expect(skill).not.toContain(term);
    },
  );
});

describe('ontwerp-overnemen/AC-5: mappingsjabloon en paden', () => {
  test('ontwerp-overnemen/AC-5: het sjabloon heeft de zes koppen in volgorde', () => {
    const koppen = [...sjabloon.matchAll(/^## .+$/gm)].map((match) => match[0].trim());

    expect(koppen).toStrictEqual([
      '## Bron',
      '## Tokens',
      '## Componenten',
      '## Voorgestelde varianten',
      '## Lettertypen',
      '## Bewust buiten',
    ]);
  });

  // Dezelfde regel als check-docs (`pnpm ratchet`), met ook nog niet gecommitte bestanden: elk pad in backticks bestaat.
  test('ontwerp-overnemen/AC-5: elk pad in backticks in de skill bestaat', () => {
    const bestanden = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter((regel) => regel !== '');
    const paden = [...skill.matchAll(/`([^`\n]+)`/g)].map((match) => match[1] ?? '').filter(looksLikePath);

    expect(skill.length).toBeGreaterThan(0);
    expect(paden.filter((pad) => !pathExists(pad, bestanden))).toStrictEqual([]);
  });
});
