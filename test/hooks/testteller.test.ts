// Leerpunt #424: testgevallen en skips tellen via een lexer zonder dependency, niet via regexen over de bron (R-CODE-01).
import { describe, expect, test } from 'vitest';
import { testChangeRisk } from '../../rails/hooks/lib/functional-ui.mjs';

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
