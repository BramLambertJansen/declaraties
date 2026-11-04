---
status: goedgekeurd
namespace: voorwaardelijke-tests
---

# Voorwaardelijk geregistreerde tests tellen als skip

## Doel

`testChangeRisk` (`rails/hooks/lib/functional-ui.mjs`, teller in `rails/hooks/lib/testteller.mjs`) ziet nu `describe.skip`,
`skipIf`, `runIf`, `only` en `fails`, maar niet dat een bestaande test voorwaardelijk wordt geregistreerd: een `if` eromheen,
een vroege `return` in de suite, `cond && test(…)` of `test` als waarde (`const t = ok ? test : test.skip`). De test blijft
dan in de tekst staan en telt mee, terwijl hij in CI kan wegvallen. Aanleiding: leerpunt #410; het eerste deel (de
modifiers) loste #424 op, `docs/operations/review-checklists.md:21` noemt dit restgat nu als reviewpunt.

Dit is kritiek werk (ADR 0062 punt 2: `rails/hooks/**`): deze besluit-PR bevat alleen de spec; de bouw volgt in een eigen
PR zodra deze op main staat.

## Rollen en wie wat ziet

n.v.t. — bewaking van testbestanden voor elke sessierol (rolhek) en voor CI (`check-document-status.mjs`,
`functional-ui-status.mjs`); geen app-gebruikers.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes.

## Kopieer de vorm van

- `rails/hooks/lib/testteller.mjs` — de bestaande lexer en ketenpass; de nieuwe telling is een extra pass over dezelfde tokens
- `test/hooks/testteller.test.ts` — tabeltests met `testChangeRisk(before, after, FILE)` per vorm

## Hergebruik en UX

n.v.t. — geen UI. Bestaande meldingen blijven: het rolhek geeft `een test skippen alleen met akkoord van de eigenaar`,
`check-document-status` geeft `tests skippen vraagt afzonderlijk eigenaarakkoord`.

## Acceptatiecriteria

- **voorwaardelijke-tests/AC-1** — `telTests(bron, pad)` geeft naast `cases` en `skips` ook `voorwaardelijk`: het aantal
  testgevallen (zoals `cases` ze telt) dat voorwaardelijk geregistreerd wordt. Een geval is voorwaardelijk als zijn aanroep:
  (a) binnen een blok staat dat volgt op `if (…)`, `else`, `switch (…)` of `catch (…)`/`catch`, ook genest; zonder accolades
  (`if (c) test(…)`) telt alleen de ene keten die direct volgt. Lussen (`for`, `while`, `do`, `forEach`) en `try`/`finally`
  tellen niet als voorwaardelijk (OV-2); (b) als argument of operand volgt op `&&`, `||`, `??`, of op `?` of `:` van een
  ternary: dan telt elk geval binnen die keten, ook binnen `ok && describe('s', () => { … })`; of (c) lexicaal ná een `return`
  of `throw` staat in dezelfde of een omsluitende functie, zolang die `return`/`throw` niet in een geneste functie zit die al
  gesloten is. Een functiegrens is elke `{` die niet volgt op een van de controlevormen uit (a), op `try`, `finally` of een
  lus; zo is ook `function f(): number { return 1 }` een eigen functie. De pass gebruikt `haakjesParen` en terugkijken op de
  tokens, niet alleen `naControle` (dat kent `switch` en `catch` niet).
- **voorwaardelijke-tests/AC-2** — `test`, `it`, `describe` of `suite` als waarde telt als één `voorwaardelijk` per plek:
  niet gevolgd door `.`, `(`, `<…>(` of een getagde template, en niet na `.` (eigenschap). Uitgesloten, elk met een eigen test:
  een naam direct na `const`, `let`, `var`, `function`, `typeof`, `export`, `import`, `as`, `of`, `in` of in een
  importlijst; een naam gevolgd door `=>` of `=` (niet `==`/`===`); een naam gevolgd door `:` als het token ervóór `(`, `,` of `{`
  is (parameterannotatie of objectsleutel; na `?` telt hij wel); en een naam binnen de parameterlijst van een arrow-functie
  (`(it) => it.id`). Zo valt `const t = ok ? test : test.skip` en `[test, it].forEach(…)` eronder, maar
  `for (const test of rows)` en `export const test = base.extend(…)` niet.
- **voorwaardelijke-tests/AC-3** — `testChangeRisk(before, after, file)` geeft `'skip'` als `voorwaardelijk` in `after`
  groter is dan in `before`, met dezelfde voorrang als nu: eerst skips, dan voorwaardelijk, dan `removed`. Alleen een stijging
  telt, en alleen als `before` al minstens één geval had (`cases > 0`): bestaande voorwaardelijke tests blijven ongemoeid
  zolang hun aantal niet stijgt, en een nieuw testbestand (`before` leeg, zoals `functional-ui-status.mjs` een toegevoegde
  UI-test toetst) valt er nooit onder.
- **voorwaardelijke-tests/AC-4** — Een `if` die alleen binnen een testlichaam staat (`test('a', () => { if (x) expect(…) })`)
  registreert geen test en verandert niets. Een `describe` of `test` binnen een voorwaardelijk blok telt elk geval erbinnen
  als voorwaardelijk, ook als de binnenste aanroepen zelf onvoorwaardelijk zijn.
- **voorwaardelijke-tests/AC-5** — Niet-scriptbestanden (pgTAP) behouden de bestaande heuristiek (`SQL_SKIP`/`SQL_CASES`);
  `voorwaardelijk` is daar 0.
- **voorwaardelijke-tests/AC-6** — De regel in `docs/operations/review-checklists.md:21` noemt dat `if`, vroege `return`,
  kortsluiting en `test` als waarde meetellen, en noemt de grenzen uit "Buiten scope" (lussen, netto gelijk aantal,
  `${…}`/JSX); een `test.extend`-alias (`const t2 = test.extend(…)`; `t2('a')` telt niet als
  geval, dus omzetten valt al onder `removed`) blijft er als extra uitzondering in staan. `CHANGELOG.md` noemt de wijziging.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| `describe('s', () => { test('a'); test('b') })` → `if (process.env.X) { … }` eromheen | `'skip'` (AC-1a) | n.v.t. |
| `describe('s', () => { if (!ok) return; test('a') })` | `'skip'` (AC-1c) | n.v.t. |
| `const make = () => { return 1 }; test('a')` | geen voorwaardelijk geval: de `return` zit in een geneste functie (AC-1c) | n.v.t. |
| `ok && test('a', …)` | `'skip'` (AC-1b) | n.v.t. |
| `const t = ok ? test : test.skip; t('a')` | `'skip'` (AC-2) | n.v.t. |
| Bestand had al een `if (isCi) test(…)`, nu een gewone test erbij | `null`: aantal voorwaardelijk gelijk (AC-3) | n.v.t. |
| Een voorwaardelijke test onvoorwaardelijk maken | `null` (daling telt niet) | n.v.t. |
| `if` alleen in een testlichaam | `null` (AC-4) | n.v.t. |
| `for (const w of widths) test(…)` toegevoegd aan een bestaand bestand | `null`: lussen tellen niet (AC-1a, OV-2) | n.v.t. |
| `describe('s', () => { if (!ok) return; describe('t', () => { test('a') }) })` | `'skip'`: `return` in de omsluitende functie (AC-1c) | n.v.t. |
| `function f(): number { return 1 }` vóór de tests | geen voorwaardelijk geval: eigen functie (AC-1c) | n.v.t. |
| Nieuw e2e-bestand met een `if` rond een test | `null`: `before` heeft geen gevallen (AC-3) | n.v.t. |
| `for (const test of rows)`, `(it) => it.id`, `export const test = base.extend(…)` | geen voorwaardelijk geval (AC-2) | n.v.t. |
| `const t = ok ? test : test.skip` (de eerste `test` gevolgd door `:` van de ternary) | `'skip'`: na `?` telt de naam (AC-2) | n.v.t. |
| `{ name: 'x', run: test }` (object met `:`) | voorwaardelijk via AC-2 (`test` als waarde): liever een vals alarm dan een gemiste uitschakeling | n.v.t. |
| `test.extend`-alias | ongewijzigd: aanroepen via de alias tellen niet als geval (AC-6) | n.v.t. |

## Raakt ook

`rails/hooks/lib/testteller.mjs`, `rails/hooks/lib/functional-ui.mjs` (`testChangeRisk`), en daardoor het rolhek
(`existingTest` in `rails/hooks/lib/rolhek.mjs`), `scripts/kit/check-document-status.mjs` en
`scripts/kit/functional-ui-status.mjs` (ongewijzigd, ze krijgen de nieuwe uitslag). Tests in `test/hooks/testteller.test.ts`.
Docs: `docs/operations/review-checklists.md`, `CHANGELOG.md`. Kritiek pad (`rails/hooks/**`): eigenaarmerge, geen agent-merge.

## Buiten scope

Een echte JS-parser of AST (geen dependency in de guard, ADR 0045 punt 15–19). Semantiek van de voorwaarde (`if (true)`
telt ook). `test.extend`-aliassen volgen. Een test die via een helperfunctie uit een ander bestand wordt geregistreerd. Een netto gelijk aantal: test A voorwaardelijk
maken en tegelijk test B onvoorwaardelijk glipt erdoor (reviewpunt). Tests in `${…}`- of JSX-expressies krijgen geen context
van buiten (de lexer telt die lijsten los). Beide grenzen komen in de regel van `docs/operations/review-checklists.md:21`.

## Testplan

Tabeltests in `test/hooks/testteller.test.ts`: per vorm uit AC-1 (a, b, c), AC-2 en de randgevallen een paar
`before`/`after` met de verwachte uitslag van `testChangeRisk`, plus `telTests(…).voorwaardelijk` op losse bronnen, ook in
`.tsx` met JSX en in template-literals. Een positieve controle (bestaand voorwaardelijk geval blijft `null`) en een
Write-payload door `decide` in het rolhek met een bestaand testbestand (`if` eromheen → gate). Elke negatieve test faalt op
de huidige code (R-PRINC-04); de reproductie uit #410 en de `if`-variant uit `docs/operations/review-checklists.md:21` staan
erin.

## Open vragen

- **OV-1** — Hoe worden bestaande legitieme voorwaardelijke tests behandeld (zoals een test die alleen met een echte stack
  draait)? Aanbeveling: ze blijven staan; alleen een stijging van het aantal in een bestaand bestand vraagt eigenaarakkoord,
  net als een nieuwe skip (AC-3). Een uitzonderingslijst zou een tweede plek voor beleid worden. De eigenaarmerge van deze
  besluit-PR is het besluit.
- **OV-2** — Tellen lussen (`for`, `while`, `do`) mee als voorwaardelijk? Een lege bron schakelt de tests uit, maar
  `for (const width of …) test(…)` is het gangbare tabelpatroon (357 `for (`-regels in testbestanden) en `forEach` valt er
  lexicaal toch buiten. Aanbeveling: nee (AC-1a); een vals alarm op elk tabelpatroon zou de gate "een test skippen"
  betekenisloos maken. De eigenaarmerge van deze besluit-PR is het besluit.
