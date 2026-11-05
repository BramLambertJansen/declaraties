import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

// Spec leesbudget, instructie-AC's leesbudget/AC-8 en AC-9 (ADR 0064 punt 2, 4, 6 en 7; ADR 0065). Teksttests toetsen
// structuur (koppen, R-id's, herkomst, paden, commando's tussen backticks), nooit hele zinnen (ADR 0064 punt 6). Het
// nummer van een nieuwe R-DOC-regel ligt niet vast: de tokens worden over alle R-DOC-regels in §9 gezocht.
const root = process.cwd();
const lees = (pad: string): string => readFileSync(path.join(root, pad), 'utf8');

/** Hoofdstuk `n` van het regelboek: van de kop `## <n>.` tot de volgende `## `-kop, zonder preambule. */
function hoofdstuk(n: string): string {
  const regels = lees('docs/framework.md').split('\n');
  const start = regels.findIndex((r) => r.startsWith(`## ${n}. `));
  if (start === -1) return '';
  const eind = regels.findIndex((r, i) => i > start && r.startsWith('## '));
  return regels.slice(start, eind === -1 ? undefined : eind).join('\n');
}

/** De definitieregel van een R-id in het hele regelboek (`- **R-…** …`), of '' als hij ontbreekt. */
function rRegel(id: string): string {
  return (
    lees('docs/framework.md')
      .split('\n')
      .find((r) => r.startsWith(`- **${id}** `)) ?? ''
  );
}

/** Alle R-DOC-definitieregels in §9. */
const docRegels = (): string[] =>
  hoofdstuk('9')
    .split('\n')
    .filter((r) => /^- \*\*R-DOC-\d+\*\* /.test(r));

/** De herkomst tussen haakjes aan het eind van een regel, of undefined. */
const herkomst = (regel: string): string | undefined => /\(([^()]+)\)\s*$/.exec(regel)?.[1];

/** Staat `token` binnen een backtick-span van `tekst`? */
const inBackticks = (tekst: string, token: string): boolean =>
  [...tekst.matchAll(/`([^`\n]+)`/g)].some(([, span = '']) => span.includes(token));

describe('leesbudget/AC-8: framework §9 en de instructies volgen ADR 0064 en 0065', () => {
  test('leesbudget/AC-8 §9 heeft de kop "Documentatie en tokenbudget" en R-DOC-regels', () => {
    expect(hoofdstuk('9').split('\n')[0]).toBe('## 9. Documentatie en tokenbudget');
    expect(docRegels().length).toBeGreaterThan(0);
  });

  test('leesbudget/AC-8 R-DOC-01 noemt AGENTS.md, CLAUDE.md en streefwaarde(n)', () => {
    const r = docRegels().find((x) => x.startsWith('- **R-DOC-01** ')) ?? '';
    expect(r, 'R-DOC-01 staat in §9').not.toBe('');
    expect(inBackticks(r, 'AGENTS.md')).toBe(true);
    expect(inBackticks(r, 'CLAUDE.md')).toBe(true);
    expect(r).toMatch(/streefwaarde/i);
  });

  test.each([
    ['feiten.mjs hoofdstuk', 'commando'],
    ['pnpm leespad', 'commando'],
    ['pnpm meting --trend', 'commando'],
  ])('leesbudget/AC-8 §9: een R-DOC-regel noemt `%s` (%s tussen backticks)', (token) => {
    expect(docRegels().some((r) => inBackticks(r, token))).toBe(true);
  });

  test('leesbudget/AC-8 §9: een R-DOC-regel noemt de kop Normeninventaris', () => {
    expect(docRegels().some((r) => r.includes('Normeninventaris'))).toBe(true);
  });

  test.each(['0064', '0065'])('leesbudget/AC-8 §9: een R-DOC-regel heeft herkomst %s', (adr) => {
    expect(docRegels().some((r) => (herkomst(r) ?? '').includes(adr))).toBe(true);
  });

  test('leesbudget/AC-8 elke R-DOC-regel in §9 eindigt met een herkomst tussen haakjes', () => {
    const zonder = docRegels().filter((r) => herkomst(r) === undefined);
    expect(zonder).toStrictEqual([]);
  });

  test('leesbudget/AC-8 R-WERK-07 staat in §8 en noemt geen grens van 10 KB meer', () => {
    const r = rRegel('R-WERK-07');
    expect(hoofdstuk('8')).toContain('- **R-WERK-07** ');
    expect(r).not.toMatch(/≤\s*10\s*KB/);
  });

  test('leesbudget/AC-8 R-TEST-02 noemt teksttests en structuur, met herkomst 0064', () => {
    const r = rRegel('R-TEST-02');
    expect(r, 'R-TEST-02 staat in het regelboek').not.toBe('');
    expect(r).toMatch(/teksttests?/i);
    expect(r).toMatch(/structuur/i);
    expect(herkomst(r) ?? '').toContain('0064');
  });

  // R-DOC-03: `.claude/rules/*` bevat regels letterlijk. check-docs regel 10 toetst alleen dat het R-id bestaat.
  test('leesbudget/AC-8 elke R-regel in .claude/rules/* staat letterlijk als regel in het regelboek', () => {
    const boek = new Set(lees('docs/framework.md').split('\n'));
    const afwijkend = readdirSync(path.join(root, '.claude/rules'))
      .filter((f) => f.endsWith('.md'))
      .flatMap((f) =>
        lees(`.claude/rules/${f}`)
          .split('\n')
          .filter((r) => /^- \*\*R-[A-Z]+-\d+\*\* /.test(r) && !boek.has(r))
          .map((r) => `${f}: ${r.slice(0, 40)}`),
      );
    expect(afwijkend).toStrictEqual([]);
  });

  // Alleen de tekst ná de frontmatter: `allowed-tools` noemt het commando al, de oplevering zelf nog niet.
  test('leesbudget/AC-8 de skill opleveren noemt pnpm meting --trend en "let op" na de frontmatter', () => {
    const tekst = lees('.claude/skills/opleveren/SKILL.md').replace(/^---\n[\s\S]*?\n---\n/, '');
    expect(tekst).toContain('pnpm meting --trend');
    expect(tekst).toContain('let op');
  });
});

const AGENTS = readdirSync(path.join(root, '.claude/agents'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => `.claude/agents/${f}`);

describe('leesbudget/AC-9: instructies verwijzen naar feiten.mjs hoofdstuk', () => {
  test.each(['AGENTS.md', 'CLAUDE.md', ...AGENTS, '.claude/skills/spec/SKILL.md'])(
    'leesbudget/AC-9 %s noemt feiten.mjs hoofdstuk',
    (pad) => {
      expect(lees(pad)).toContain('feiten.mjs hoofdstuk');
    },
  );
});
