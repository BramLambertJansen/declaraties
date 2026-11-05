// Leerpunt #424: testgevallen en skips tellen via een lexer zonder dependency, niet via regexen over de bron (R-CODE-01).
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { testChangeRisk } from '../../rails/hooks/lib/functional-ui.mjs';
import { telTests } from '../../rails/hooks/lib/testteller.mjs';

const FILE = 'src/core/web/ui/knop.test.ts';
const lines = (...regels: string[]) => `${regels.join('\n')}\n`;

const LOS_A = "test('a', () => { expect(1).toBe(1); });";
const LOS_B = "test('b', () => { expect(2).toBe(2); });";

describe('testteller: test.each-tabellen', () => {
  test('testteller: tabelrij met commentaar met ) erbij is geen verwijdering (#423)', () => {
    const before = lines(
      'test.each([',
      "  ['onderhoud', true],",
      "])('rol %s', (rol, verwacht) => { expect(rol.length > 0).toBe(verwacht); });",
    );
    const after = lines(
      'test.each([',
      "  ['onderhoud', true],",
      '  // vrijgegeven voor (ADR 0064 punt 2).',
      "  ['werkstraat', true],",
      "])('rol %s', (rol, verwacht) => { expect(rol.length > 0).toBe(verwacht); });",
    );
    expect(testChangeRisk(before, after, FILE)).toBeNull();
  });

  test('testteller: tabelrij met ) in een string erbij is geen verwijdering', () => {
    const before = lines("test.each([['a', 1]])('waarde %s', (s, n) => { expect(s).toBeTruthy(); });");
    const after = lines("test.each([['a', 1], ['b)', 2]])('waarde %s', (s, n) => { expect(s).toBeTruthy(); });");
    expect(testChangeRisk(before, after, FILE)).toBeNull();
  });

  test('testteller: ) in een tabelstring verbergt geen verwijderd los geval', () => {
    const tabel = "test.each([['a)', 1]])('waarde %s', (s, n) => { expect(s).toBeTruthy(); });";
    expect(testChangeRisk(lines(tabel, LOS_A, LOS_B), lines(tabel, LOS_A), FILE)).toBe('removed');
  });

  test('testteller: ) uit de tabel halen compenseert geen verwijderd los geval (fout negatief)', () => {
    const before = lines("test.each([['a)', 1]])('waarde %s', (s, n) => { expect(s).toBeTruthy(); });", LOS_A);
    const after = lines("test.each([['a', 1]])('waarde %s', (s, n) => { expect(s).toBeTruthy(); });");
    expect(testChangeRisk(before, after, FILE)).toBe('removed');
  });

  test('testteller: tagged template test.each telt als geval', () => {
    const tabel = lines(
      'test.each`',
      '  a    | b',
      '  ${1} | ${2}',
      "`('som $a + $b', ({ a, b }) => { expect(a + b).toBe(3); });",
    );
    expect(testChangeRisk(tabel + LOS_B, lines(LOS_B), FILE)).toBe('removed');
  });

  test('testteller: test.for en test.each met tabel tellen elk als één geval', () => {
    const forGeval = "test.for([[1, 2]])('som %i', ([a, b]) => { expect(a + b).toBe(3); });";
    expect(testChangeRisk(lines(forGeval, LOS_B), lines(LOS_B), FILE)).toBe('removed');
    const extraRij = lines("test.for([[1, 2], [2, 1]])('som %i', ([a, b]) => { expect(a + b).toBe(3); });", LOS_B);
    expect(testChangeRisk(lines(forGeval, LOS_B), extraRij, FILE)).toBeNull();
  });
});

describe('testteller: commentaar en strings tellen niet', () => {
  test('testteller: geval vervangen door commentaar is een verwijdering', () => {
    expect(testChangeRisk(lines(LOS_A, LOS_B), lines("// test('a', …) verplaatst", LOS_B), FILE)).toBe('removed');
  });

  test('testteller: geval vervangen door blokcommentaar is een verwijdering', () => {
    expect(testChangeRisk(lines(LOS_A, LOS_B), lines(`/* ${LOS_A} */`, LOS_B), FILE)).toBe('removed');
  });

  test('testteller: geval vervangen door een string is een verwijdering', () => {
    const after = lines(`const notitie = "test('a', () => {})";`, 'void notitie;', LOS_B);
    expect(testChangeRisk(lines(LOS_A, LOS_B), after, FILE)).toBe('removed');
  });

  test('testteller: geval vervangen door een template-literal is een verwijdering', () => {
    const after = lines("const notitie = `it('a', () => {}) ${1}`;", 'void notitie;', LOS_B);
    expect(testChangeRisk(lines(LOS_A, LOS_B), after, FILE)).toBe('removed');
  });

  test('testteller: .skip( in commentaar erbij is geen skip', () => {
    expect(testChangeRisk(lines(LOS_A), lines('// gebruik hier nooit test.skip( of xit(', LOS_A), FILE)).toBeNull();
  });

  test('testteller: .skip( en skip( in een string erbij is geen skip', () => {
    const after = lines("const uitleg = 'zet nooit .skip( of skip( neer';", 'void uitleg;', LOS_A);
    expect(testChangeRisk(lines(LOS_A), after, FILE)).toBeNull();
  });

  test.each(['x.test.tsx', 'x.test.mts', 'x.test.cts', 'x.test.js', 'x.test.jsx', 'x.test.mjs', 'x.test.cjs'])(
    'testteller: commentaar telt niet als geval in %s',
    (bestand) => {
      expect(testChangeRisk(lines(LOS_A, LOS_B), lines(`// ${LOS_A}`, LOS_B), `test/${bestand}`)).toBe('removed');
    },
  );
});

describe('testteller: skips', () => {
  test('testteller: test( naar test.skip( is een skip', () => {
    expect(testChangeRisk(lines(LOS_A), lines(LOS_A.replace('test(', 'test.skip(')), FILE)).toBe('skip');
  });

  test('testteller: test.skip.each erbij is een skip', () => {
    const after = lines(LOS_A, "test.skip.each([[1]])('later %i', (n) => { expect(n).toBe(1); });");
    expect(testChangeRisk(lines(LOS_A), after, FILE)).toBe('skip');
  });

  test('testteller: describe.skip erbij is een skip', () => {
    const after = lines("describe.skip('groep', () => {", `  ${LOS_A}`, '});');
    expect(testChangeRisk(lines("describe('groep', () => {", `  ${LOS_A}`, '});'), after, FILE)).toBe('skip');
  });

  test('testteller: ctx.skip() erbij is een skip', () => {
    const after = lines("test('a', (ctx) => { ctx.skip(); expect(1).toBe(1); });");
    expect(testChangeRisk(lines("test('a', (ctx) => { expect(1).toBe(1); });"), after, FILE)).toBe('skip');
  });

  test('testteller: xit erbij is een skip', () => {
    expect(testChangeRisk(lines(LOS_A), lines(LOS_A, "xit('c', () => {});"), FILE)).toBe('skip');
  });

  test('testteller: skip gaat voor verwijdering', () => {
    expect(testChangeRisk(lines(LOS_A, LOS_B), lines(LOS_A.replace('test(', 'test.skip(')), FILE)).toBe('skip');
  });
});

describe('testteller: modifiers', () => {
  test.each(['test.concurrent', 'test.sequential', 'it.concurrent'])('testteller: %s telt als geval', (aanroep) => {
    const geval = `${aanroep}('a', () => { expect(1).toBe(1); });`;
    expect(testChangeRisk(lines(geval, LOS_B), lines(LOS_B), FILE)).toBe('removed');
  });

  test('testteller: test.concurrent.each(tabel)(…) telt als geval', () => {
    const geval = "test.concurrent.each([[1]])('waarde %i', (n) => { expect(n).toBe(1); });";
    expect(testChangeRisk(lines(geval, LOS_B), lines(LOS_B), FILE)).toBe('removed');
  });

  test.each(['test.skipIf(true)', 'test.runIf(false)', 'test.fails', 'test.only', 'it.only'])(
    'testteller: test( naar %s( is een skip',
    (aanroep) => {
      const after = lines(`${aanroep}('a', () => { expect(1).toBe(1); });`, LOS_B);
      expect(testChangeRisk(lines(LOS_A, LOS_B), after, FILE)).toBe('skip');
    },
  );

  test.each(['describe.skipIf(true)', 'describe.runIf(false)', 'describe.only'])(
    'testteller: describe( naar %s( is een skip',
    (aanroep) => {
      const before = lines("describe('groep', () => {", `  ${LOS_A}`, '});');
      const after = lines(`${aanroep}('groep', () => {`, `  ${LOS_A}`, '});');
      expect(testChangeRisk(before, after, FILE)).toBe('skip');
    },
  );

  test('testteller: test.todo telt niet als geval', () => {
    expect(testChangeRisk(lines(LOS_A, "test.todo('later');"), lines(LOS_A, LOS_B), FILE)).toBeNull();
    expect(testChangeRisk(lines(LOS_A, LOS_B), lines(LOS_A, "test.todo('later');"), FILE)).toBe('skip');
  });
});

describe('testteller: geen dubbeltelling van fabrieksaanroepen', () => {
  test('testteller: test.each(tabel) zonder tweede aanroep registreert niets', () => {
    expect(testChangeRisk(lines(LOS_A, LOS_B), lines('test.each([[1]]);', 'test.each([[2]]);'), FILE)).toBe('removed');
  });

  test('testteller: test.each(tabel)(naam, fn) naar test(naam, fn) is geen verwijdering', () => {
    const before = lines("test.each([[1]])('a', (n) => { expect(n).toBe(1); });");
    const after = lines("test('a', () => { expect(1).toBe(1); });");
    expect(testChangeRisk(before, after, FILE)).toBeNull();
  });

  test('testteller: twee gevallen samengevoegd in één test.each is één aanroepplek', () => {
    const after = lines("test.each([[1], [2]])('x %i', (n) => { expect(n).toBeGreaterThan(0); });");
    expect(testChangeRisk(lines(LOS_A, LOS_B), after, FILE)).toBe('removed');
  });
});

describe('testteller: lexer-randgevallen', () => {
  const LOS_C = "test('c', () => { expect(3).toBe(3); });";

  test('testteller: regex-literal met ) en apostrof erbij is geen risico en laat de teller niet ontsporen', () => {
    const regex = "expect('x').toMatch(/a)'b/);";
    expect(testChangeRisk(lines(LOS_A, LOS_C), lines(LOS_A, regex, LOS_C), FILE)).toBeNull();
    expect(testChangeRisk(lines(LOS_A, regex, LOS_C), lines(LOS_A, regex), FILE)).toBe('removed');
  });

  test('testteller: deling naast een regex verbergt geen geval', () => {
    const regel = (midden: string) => `const q = a / b; ${midden} const r = /[)']/.test(s) ? c / d : 0;`;
    expect(testChangeRisk(lines(LOS_A, regel(LOS_C)), lines(LOS_A, regel('')), FILE)).toBe('removed');
  });

  test('testteller: geneste template-literal verbergt geen volgend geval', () => {
    const sjabloon = "const t = `a ${ fn(`x ${'y)'}`) } b`;";
    expect(testChangeRisk(lines(LOS_B), lines(sjabloon, LOS_B), FILE)).toBeNull();
    expect(testChangeRisk(lines(sjabloon, LOS_A, LOS_B), lines(sjabloon, LOS_B), FILE)).toBe('removed');
  });

  test('testteller: escapes in strings laten de teller niet ontsporen', () => {
    const escapes = 'const s = \'it\\\'s (x\'; const d = "zeg \\"test(\\" niet";';
    expect(testChangeRisk(lines(LOS_A), lines(escapes, LOS_A), FILE)).toBeNull();
    expect(testChangeRisk(lines(escapes, LOS_A, LOS_B), lines(escapes, LOS_B), FILE)).toBe('removed');
  });

  test('testteller: JSX-tekst met apostrof en haakje in .tsx telt niet en ontspoort niet', () => {
    const file = 'src/core/web/ui/kaart.test.tsx';
    const jsx = "const v = <div><p>auto's (2)</p><p>test(a)</p></div>;";
    expect(testChangeRisk(lines(LOS_A), lines(jsx, LOS_A), file)).toBeNull();
    expect(testChangeRisk(lines(jsx, LOS_A, LOS_B), lines(jsx, LOS_B), file)).toBe('removed');
    expect(testChangeRisk(lines(LOS_A, LOS_B), lines("const w = <p>test('a', () => {})</p>;", LOS_B), file)).toBe(
      'removed',
    );
  });

  test('testteller: generieke typen in .ts storen niet', () => {
    const generiek = 'const m = new Map<string, Array<number>>(); foo<T>(x); const n = m.size >> 1;';
    expect(testChangeRisk(lines(LOS_B), lines(generiek, LOS_B), FILE)).toBeNull();
    expect(testChangeRisk(lines(generiek, LOS_A, LOS_B), lines(generiek, LOS_B), FILE)).toBe('removed');
  });

  test('testteller: vergelijking x < y in .tsx stoort niet', () => {
    const file = 'src/core/web/ui/teller.test.tsx';
    const vergelijking = 'const k = x < y ? 1 : 2;';
    expect(testChangeRisk(lines(LOS_B), lines(vergelijking, LOS_B), file)).toBeNull();
    expect(testChangeRisk(lines(vergelijking, LOS_A, LOS_B), lines(vergelijking, LOS_B), file)).toBe('removed');
  });
});

describe('testteller: parser en overige bestanden', () => {
  test('testteller: .tsx met JSX parseert en telt goed', () => {
    const file = 'src/core/web/ui/knop.test.tsx';
    const render = 'const vorm = <Knop label="test(a) en .skip(" onClick={() => undefined}>Opslaan</Knop>;';
    const before = lines(render, "test('a', () => { expect(vorm).toBeTruthy(); });", LOS_B);
    expect(testChangeRisk(before, lines(render, LOS_B), file)).toBe('removed');
    expect(testChangeRisk(lines(LOS_B), lines(render, LOS_B), file)).toBeNull();
  });

  test('testteller: pgTAP-bestand houdt het huidige gedrag (skip erbij is een skip)', () => {
    const before = lines('select plan(1);', "select ok(true, 'leesrecht');", 'select * from finish();');
    const after = lines(
      'select plan(2);',
      "select ok(true, 'leesrecht');",
      'select skip(1);',
      'select * from finish();',
    );
    expect(testChangeRisk(before, after, 'db/tests/x.sql')).toBe('skip');
  });

  test('testteller: gelijk aantal gevallen met gewijzigde inhoud is geen risico', () => {
    const after = lines(
      "test('a hernoemd', () => { expect(3).toBe(3); });",
      "it('b', () => { expect([2]).toEqual([2]); });",
    );
    expect(testChangeRisk(lines(LOS_A, LOS_B), after, FILE)).toBeNull();
  });
});

describe('testteller: herreview-gaten', () => {
  const MET_CTX = "test('a', (ctx) => { expect(1).toBe(1); });";

  test.each(['ctx?.skip();', 'ctx.skip?.();'])('testteller: optional chaining %s erbij is een skip', (aanroep) => {
    const after = lines(`test('a', (ctx) => { ${aanroep} expect(1).toBe(1); });`);
    expect(testChangeRisk(lines(MET_CTX), after, FILE)).toBe('skip');
  });

  test('testteller: skip binnen een template-expressie is een skip', () => {
    const after = lines("test('a', (ctx) => { const s = `${ctx.skip()}`; void s; });");
    expect(testChangeRisk(lines("test('a', (ctx) => { const s = `${1}`; void s; });"), after, FILE)).toBe('skip');
  });

  test('testteller: skip binnen een JSX-expressie in .tsx is een skip', () => {
    const file = 'src/core/web/ui/kaart.test.tsx';
    const before = lines("test('a', (ctx) => { render(<div>{1}</div>); });");
    const after = lines("test('a', (ctx) => { render(<div>{ctx.skip()}</div>); });");
    expect(testChangeRisk(before, after, file)).toBe('skip');
  });

  test('testteller: geval binnen een JSX-expressie in .tsx telt', () => {
    const file = 'src/core/web/ui/kaart.test.tsx';
    const before = lines("const x = <div>{test('a', () => {})}</div>;", LOS_B);
    expect(testChangeRisk(before, lines(LOS_B), file)).toBe('removed');
  });

  test('testteller: regex na de ) van een if laat een volgende skip niet verdwijnen', () => {
    const after = lines(LOS_A, 'if (ok) /`/.test(s);', "test.skip('x', () => {});");
    expect(testChangeRisk(lines(LOS_A), after, FILE)).toBe('skip');
  });

  test('testteller: regex na een blok laat een volgende skip niet verdwijnen', () => {
    const after = lines(LOS_A, 'if (ok) {', '  void 0;', '}', '/`/.test(s);', "test.skip('x', () => {});");
    expect(testChangeRisk(lines(LOS_A), after, FILE)).toBe('skip');
  });

  test('testteller: deling na een ) blijft een deling', () => {
    const deling = 'const r = (a + b) / 2; const t = c / 2;';
    expect(testChangeRisk(lines(deling, LOS_A, LOS_B), lines(deling, LOS_B), FILE)).toBe('removed');
    const opEenRegel = (midden: string) => `const r = (a + b) / 2; ${midden} const t = c / 2;`;
    expect(testChangeRisk(lines(opEenRegel(LOS_A), LOS_B), lines(opEenRegel(''), LOS_B), FILE)).toBe('removed');
  });

  test('testteller: typeargument met functietype in test.each telt als geval', () => {
    const geval = "test.each<() => void>([[() => undefined]])('x', (f) => { f(); });";
    expect(testChangeRisk(lines(geval, LOS_B), lines(LOS_B), FILE)).toBe('removed');
  });
});

describe('testteller: codex-bevindingen', () => {
  test('testteller: generieke arrow-functies met lange typeparameter in .tsx storen niet', () => {
    const file = 'src/core/web/ui/generiek.test.tsx';
    const generiek = [
      'const identity = <Value,>(value: Value) => value;',
      'const id2 = <Value extends unknown>(v: Value) => v;',
    ];
    expect(testChangeRisk(lines(...generiek, LOS_A, LOS_B), lines(...generiek, LOS_A), file)).toBe('removed');
    const metSkip = lines(...generiek, LOS_A, LOS_B, "test.skip('c', () => {});");
    expect(testChangeRisk(lines(...generiek, LOS_A, LOS_B), metSkip, file)).toBe('skip');
  });

  test('testteller: skip op een geawaite expressie-ontvanger is een skip', () => {
    const before = lines("test('a', async (ctx) => { await Promise.resolve(ctx); });");
    const after = lines("test('a', async (ctx) => { (await Promise.resolve(ctx)).skip(); });");
    expect(testChangeRisk(before, after, FILE)).toBe('skip');
  });

  test.each(['getCtx().skip();', 'arr[0].skip();'])('testteller: %s erbij is een skip', (aanroep) => {
    const before = lines("test('a', () => { expect(1).toBe(1); });");
    const after = lines(`test('a', () => { ${aanroep} expect(1).toBe(1); });`);
    expect(testChangeRisk(before, after, FILE)).toBe('skip');
  });

  test('testteller: ctx.skip() voor en na telt niet dubbel', () => {
    const before = lines("test('a', (ctx) => { ctx.skip(); expect(1).toBe(1); });");
    const after = lines("test('a', (ctx) => { ctx.skip(); expect(2).toBe(2); });");
    expect(testChangeRisk(before, after, FILE)).toBeNull();
  });

  test('testteller: suite-modifier met .skip in één keten telt één skip', () => {
    const before = lines("test.fails.skip('a', () => {});", "test('b', (ctx) => { expect(1).toBe(1); });");
    const after = lines("test.skip('a', () => {});", "test('b', (ctx) => { ctx.skip(); expect(1).toBe(1); });");
    expect(testChangeRisk(before, after, FILE)).toBe('skip');
  });

  test('testteller: test.skipIf(true).skip erbij is een skip, ongewijzigd niet', () => {
    const keten = "test.skipIf(true).skip('a', () => { expect(1).toBe(1); });";
    expect(testChangeRisk(lines(LOS_B), lines(keten, LOS_B), FILE)).toBe('skip');
    expect(testChangeRisk(lines(keten, LOS_B), lines(keten, LOS_B), FILE)).toBeNull();
  });

  test('testteller: test.skip.todo telt als één skip binnen de keten', () => {
    const before = lines("test.skip('a', () => {});", LOS_B);
    expect(testChangeRisk(before, lines("test.skip.todo('a');", LOS_B, "xit('c', () => {});"), FILE)).toBe('skip');
    expect(testChangeRisk(before, lines("test.skip.todo('a');", LOS_B), FILE)).toBeNull();
  });

  test.each(['<>, test(a)</>', '<>extends test(x)</>'])(
    'testteller: fragmenttekst %s in .tsx telt niet als geval',
    (fragment) => {
      const file = 'src/core/web/ui/fragment.test.tsx';
      const losC = "test('c', () => { expect(3).toBe(3); });";
      const view = `const view = ${fragment};`;
      const before = lines(LOS_A, LOS_B, losC);
      expect(testChangeRisk(before, lines(view, losC), file)).toBe('removed');
      expect(testChangeRisk(before, lines(view, LOS_B, losC), file)).toBe('removed');
    },
  );
});

// Spec voorwaardelijke-tests (leerpunt #410): een bestaande test voorwaardelijk registreren telt als skip.
describe('testteller: voorwaardelijk geregistreerde tests', () => {
  const suite = (...regels: string[]) => lines("describe('s', () => {", ...regels.map((r) => `  ${r}`), '});');
  const BASIS = suite(LOS_A, LOS_B);

  test.each([
    { naam: '#410: if om de suite', na: lines('if (process.env.X) {', BASIS, '}') },
    { naam: 'if zonder accolades', na: suite(`if (x) ${LOS_A}`, LOS_B) },
    { naam: 'else zonder accolades', na: suite('if (a) doe();', `else ${LOS_A}`, LOS_B) },
    { naam: 'else-blok', na: suite('if (a) { doe(); } else {', LOS_A, '}', LOS_B) },
    { naam: 'switch', na: suite('switch (modus) {', `case 'a': ${LOS_A}`, '}', LOS_B) },
    { naam: 'catch-blok', na: suite('try { doe(); } catch (e) {', LOS_A, '}', LOS_B) },
    { naam: 'vroege return', na: suite('if (!ok) return;', LOS_A, LOS_B) },
    { naam: 'return in een if-blok', na: suite('if (!ok) { return; }', LOS_A, LOS_B) },
    { naam: 'throw in de suite', na: suite('if (!ok) throw new Error("x");', LOS_A, LOS_B) },
    {
      naam: 'return in de omsluitende functie',
      na: suite('if (!ok) return;', "describe('t', () => {", LOS_A, LOS_B, '});'),
    },
    { naam: '&&', na: suite(`ok && ${LOS_A}`, LOS_B) },
    { naam: '||', na: suite(`uit || ${LOS_A}`, LOS_B) },
    { naam: '??', na: suite(`x ?? ${LOS_A}`, LOS_B) },
    { naam: 'ternary', na: suite(`ok ? ${LOS_A.slice(0, -1)} : null;`, LOS_B) },
    { naam: 'kortsluiting om een describe', na: lines(`ok && ${BASIS.trimEnd().slice(0, -1)};`) },
    {
      naam: 'test als waarde in een ternary',
      na: lines(
        'const t = ok ? test : test.skip;',
        "describe('s', () => {",
        "  t('x', () => {});",
        `  ${LOS_A}`,
        `  ${LOS_B}`,
        '});',
      ),
    },
    { naam: 'test als waarde in een lijst', na: lines('[test, it].forEach((f) => f);', BASIS) },
    { naam: 'kortsluiting met haakjes', na: suite(`ok && (${LOS_A.slice(0, -1)});`, LOS_B) },
    { naam: 'if zonder accolades met haakjes', na: suite(`if (ok) (${LOS_A.slice(0, -1)});`, LOS_B) },
    {
      naam: 'if om een getypte describe.each',
      na: lines("if (ok) describe.each<Thema>(rijen)('s', () => {", `  ${LOS_A}`, `  ${LOS_B}`, '});'),
    },
  ])('voorwaardelijke-tests/AC-1: $naam → skip', ({ na }) => {
    expect(testChangeRisk(BASIS, na, FILE)).toBe('skip');
  });

  test.each([
    { naam: 'lus (OV-2)', na: suite('for (const w of [1, 2]) test(`a${w}`, () => {});', LOS_A, LOS_B) },
    { naam: 'while-lus', na: suite('while (meer()) volgende();', LOS_A, LOS_B) },
    { naam: 'if alleen in een testlichaam', na: suite("test('a', () => { if (x) expect(1).toBe(1); });", LOS_B) },
    { naam: 'return in een helper', na: lines('const maak = () => { return 1; };', BASIS) },
    { naam: 'functie met returntype', na: lines('function f(): number { return 1; }', BASIS) },
    {
      naam: 'return en throw in een testlichaam',
      na: suite("test('a', () => { if (x) return; throw new Error('y'); });", LOS_B),
    },
    { naam: 'try/finally', na: suite('try { doe(); } finally { klaar(); }', LOS_A, LOS_B) },
    { naam: 'do-blok', na: suite('do { stap(); } while (meer());', LOS_A, LOS_B) },
    { naam: 'for-of met de naam test', na: lines('for (const test of rows) gebruik(test.id);', BASIS) },
    { naam: 'arrow-parameter it', na: lines('const ids = xs.map((it) => it.id);', BASIS) },
    { naam: 'arrow-parameter zonder haakjes', na: lines('const ids = xs.map(it => it.id);', BASIS) },
    { naam: 'export van een extend', na: lines('export const test = base.extend({});', BASIS) },
    { naam: 'importlijst', na: lines("import { describe, expect, test } from 'vitest';", BASIS) },
    { naam: 'objectsleutels', na: lines('const o = { test: 1, it: 2 };', BASIS) },
    { naam: 'test in een objectwaarde', na: lines(`const geregistreerd = { a: ${LOS_A.slice(0, -1)} };`, LOS_B) },
    { naam: 'arrow-parameter met returntype', na: lines('const ids = xs.map((it): string => it.id);', BASIS) },
    { naam: 'ternary binnen een object', na: lines('const o = { a: ok ? 1 : 2 };', BASIS) },
    { naam: 'parameterannotatie', na: lines('function f(a: number, test: string) { return a; }', BASIS) },
    { naam: 'typeof', na: lines('type T = typeof test;', BASIS) },
    { naam: 'standaardwaarde', na: lines('function f(test = 1) { return 1; }', BASIS) },
    { naam: 'let', na: lines('let test;', BASIS) },
    { naam: 'var', na: lines('var it;', BASIS) },
    { naam: 'function', na: lines('function suite() { return 1; }', BASIS) },
    { naam: 'export-lijst', na: lines('export { test };', BASIS) },
    { naam: 'standaardimport', na: lines("import test from 'x';", BASIS) },
    { naam: 'as', na: lines("import * as it from 'x';", BASIS) },
    { naam: 'of', na: lines('for (const x of test) gebruik(x);', BASIS) },
    { naam: 'in', na: lines('for (const k in describe) gebruik(k);', BASIS) },
    { naam: 'parameterannotatie na (', na: lines('function f(test: string) { return 1; }', BASIS) },
  ])('voorwaardelijke-tests/AC-1/AC-2: $naam → null', ({ na }) => {
    expect(testChangeRisk(BASIS, na, FILE)).toBeNull();
  });

  test('== telt wel als waarde (AC-2)', () => {
    expect(testChangeRisk(BASIS, lines('const gelijk = test == f;', BASIS), FILE)).toBe('skip');
  });

  test('if zonder accolades met await (AC-1a)', () => {
    expect(testChangeRisk(BASIS, suite(`if (x) await ${LOS_A}`, LOS_B), FILE)).toBe('skip');
  });

  test('alleen een stijging telt: een bestaand voorwaardelijk geval blijft staan (OV-1)', () => {
    const voor = suite(`if (isCi) ${LOS_A}`, LOS_B);
    expect(testChangeRisk(voor, suite(`if (isCi) ${LOS_A}`, LOS_B, "test('c', () => {});"), FILE)).toBeNull();
    expect(testChangeRisk(voor, suite(LOS_A, LOS_B), FILE)).toBeNull();
    expect(testChangeRisk(voor, suite(`if (isCi) ${LOS_A}`, `if (isCi) ${LOS_B}`), FILE)).toBe('skip');
  });

  test('een nieuw testbestand valt er niet onder (AC-3)', () => {
    expect(testChangeRisk('', lines('if (process.env.X) {', BASIS, '}'), FILE)).toBeNull();
  });

  test('skips gaan voor: een skip en een voorwaardelijk geval geven skip', () => {
    expect(testChangeRisk(BASIS, suite(`if (x) ${LOS_A}`, LOS_B.replace('test(', 'test.skip(')), FILE)).toBe('skip');
  });

  test('voorwaardelijke-tests/AC-4: voorwaardelijk telt elk geval in het bereik', () => {
    expect(telTests(lines('if (x) {', BASIS, '}'), FILE)).toStrictEqual({ cases: 2, skips: 0, voorwaardelijk: 2 });
    expect(telTests(suite(`ok && ${LOS_A}`, LOS_B), FILE)).toStrictEqual({ cases: 2, skips: 0, voorwaardelijk: 1 });
    expect(telTests(BASIS, FILE)).toStrictEqual({ cases: 2, skips: 0, voorwaardelijk: 0 });
  });

  test('in .tsx met JSX en in een template-literal', () => {
    const file = 'src/core/web/ui/knop.test.tsx';
    const tsx = suite('const view = <div>{ok && <span />}</div>;', `if (x) ${LOS_A}`, LOS_B);
    expect(testChangeRisk(BASIS, tsx, file)).toBe('skip');
    expect(testChangeRisk(BASIS, suite('const t = `if (x) { ${naam} }`;', LOS_A, LOS_B), FILE)).toBeNull();
  });

  test('pgTAP-bestanden houden de oude heuristiek: voorwaardelijk is 0 (AC-5)', () => {
    const sql = "select plan(1);\nselect ok(true, 'a');\n";
    expect(
      testChangeRisk(sql, `do $$ begin if true then perform 1; end if; end $$;\n${sql}`, 'db/test/a.test.sql'),
    ).toBeNull();
  });
});

describe('voorwaardelijke-tests/AC-6: docs', () => {
  test('voorwaardelijke-tests/AC-6: review-checklists noemt de telling en de grenzen', () => {
    const regel = readFileSync('docs/operations/review-checklists.md', 'utf8')
      .split('\n')
      .find((r) => r.includes('testChangeRisk'));
    for (const deel of ['#410', 'testvoorwaarde.mjs', '`test.extend`-alias', 'lus', 'netto gelijk', 'JSX', 'helper'])
      expect(regel).toContain(deel);
  });
});

describe('rolhek: een bestaande test voorwaardelijk maken vraagt akkoord (AC-3)', () => {
  const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
  const pad = 'test/rails/example.test.ts';
  const bestaand = lines("describe('s', () => {", `  ${LOS_A}`, `  ${LOS_B}`, '});');
  const beslis = (content: string, agent?: string) =>
    decide(
      {
        tool_name: 'Write',
        tool_input: { file_path: `/repo/${pad}`, content },
        ...(agent === undefined ? {} : { agent_type: agent }),
      },
      {
        root: '/repo',
        cwd: '/repo',
        config,
        read: (rel: string) => (rel === pad ? bestaand : null),
        committed: (rel: string) => rel === pad,
        isDir: () => false,
        branch: 'feat/x',
      },
    );

  test('if eromheen: hoofdsessie vraagt, tester wordt geweigerd', () => {
    const na = lines('if (process.env.X) {', bestaand, '}');
    const hoofd = beslis(na);
    expect([...hoofd.ask, ...hoofd.deny].join('\n')).toContain('een test skippen alleen met akkoord van de eigenaar');
    expect(beslis(na, 'tester').deny.join('\n')).toContain('een test skippen alleen met akkoord van de eigenaar');
  });

  test('een gewone test erbij: geen skip-gate', () => {
    const decision = beslis(lines(bestaand, "test('c', () => {});"));
    expect([...decision.ask, ...decision.deny].join('\n')).not.toContain('skippen');
  });
});
