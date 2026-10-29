---
status: goedgekeurd
namespace: klassenrail
sjabloon: mini
---

# Klassenrail voor features en routes

Lichte fixes zonder mini-spec; een mini-spec verkort het document, niet de rollen — route en rollen: framework §8 (ADR 0058).

Dit is een rail (bewaking), geen functionele UI: volledige werkstraat met eigenaarmerge (ADR 0046/0058), dus geen
`scope: functionele-ui`. De eigenaar (Bram) gaf op 2026-10-28 in de projectthread opdracht voor stap 2 van het plan om de
UI-agent te versterken ("Begin stap 2"); stap 1 (`Text`/`Heading`/`Stack`/`Inline`, `docs/specs/typografie-en-layout.md`,
PR #347) is gemerged. Een strengere rail zwakt niets af (geen A3), dus geen ADR. `eslint.config.js` is een
voorReview-gatepad; in onderhoudsmodus mag de wijziging, en de PR noemt dat.

## Doel

Een lintrail `rails/klassen` dwingt af wat framework §7 al als afgedwongen noemt: in `src/web/features` en `src/web/routes`
staan alleen layout-klassen als gewone stringliteral, zonder kleur, typografie, arbitrary values, `!`, `dark:` of inline stijl.

Aanleiding (framework §1, principe 5, doorgeglipte fout): framework §7 en `.claude/rules/web.md` beschrijven deze regel
als afgedwongen, maar er bestond geen check. PR #347 moest daardoor drie schendingen in features opruimen
(`src/web/features/account/sessions-section.tsx`: `font-medium` en `ml-2 text-muted-foreground`;
`src/web/features/accounts/accounts-page.tsx`: `text-sm text-muted-foreground`).

## Rollen en wie wat ziet

N.v.t. — lintregel voor ontwikkelaars en agents; geen gebruikersrol, geen gedrag in de app.

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

N.v.t. — geen route, permissie, contract, foutcode, migratie of dependency.

## Ontwerp

Nieuwe rail in `eslint.config.js`, met het bestaande `restrict()`-patroon; `'klassen'` komt in `ruleNames`.

- **Bestanden**: `src/web/features/**/*.{ts,tsx}` en `src/web/routes/**/*.{ts,tsx}`.
- **Uitgezonderd** (`ignores`): `**/*.test.{ts,tsx}`. `src/web/ui/**` en `src/core/web/ui/**` vallen buiten het
  bestandsbereik; daar horen recepten.
- **Selectors** (allemaal met dezelfde melding):
  1. **Geen omweg** — `JSXAttribute[name.name='className'][value.type!='Literal']`: elke `className` waarvan de waarde
     geen gewone stringliteral is (expressie `{…}`, ook `{'flex'}`, template literal, `cn()`/`clsx()`-aanroep, variabele,
     voorwaardelijke expressie, of een kaal `className` zonder waarde).
     Plus de omzeiling via spread: `JSXSpreadAttribute > ObjectExpression > Property[key.name='className']`
     (`<div {...{ className: 'text-sm' }} />`).
  2. **Alleen layout-tokens** — `JSXAttribute[name.name='className'] > Literal[value!=/^\s*T(\s+T)*\s*$/]`, waarin `T`
     één token is: optioneel precies één responsieve prefix `(sm|md|lg|xl|2xl):`, gevolgd door één van:
     - weergave: `flex`, `inline-flex`, `grid`, `inline-grid`, `block`, `inline-block`, `inline`, `hidden`, `contents`;
     - flex: `flex-row`, `flex-col`, `flex-wrap` (elk ook met `-reverse`), `flex-nowrap`, `flex-1`, `flex-auto`,
       `flex-none`, `grow`, `grow-0`, `shrink`, `shrink-0`;
     - uitlijning: `items-(start|end|center|baseline|stretch)`, `justify-(start|end|center|between|around|evenly|stretch)`,
       `self-(auto|start|end|center|stretch|baseline)`;
     - afstand, met `N` = `\d+(\.5)?` of `px`: `gap-N`, `gap-x-N`, `gap-y-N`, `space-x-N`, `space-y-N`;
       padding `p[trblxyse]?-N`; marge `-?m[trblxyse]?-N` en `m[trblxyse]?-auto`;
     - maat: `(min-|max-)?(w|h)-[a-z0-9./]+` (dus `w-1/2`, `max-w-sm`, `min-w-0`, `h-full`, maar geen `w-[3px]`);
     - grid: `grid-cols-\d+`, `col-span-(\d+|full)`;
     - overig: `sr-only`, `break-all`, `break-words`, `truncate`.

     Een lege string `className=""` matcht niet en faalt dus ook. In de esquery-regex staat `/` als `\/`
     (getoetst met esquery 1.7.0).
  3. **Geen inline stijl** — `JSXAttribute[name.name='style']`.
- **Melding** (letterlijk): "In features/ en routes/ alleen layout-klassen als gewone string (flex, grid, gap, padding,
  breedte); kleur, typografie, rand, schaduw, arbitrary values, `!`, `dark:` en `style` komen uit componenten. Gebruik
  `Text`, `Heading`, `Stack` of `Inline` uit '#web/ui/…' (lijst: `node scripts/kit/feiten.mjs componenten`). Past er
  geen, stel dan een variant voor (framework §7)."

Bekende grens (bewust niet gedekt): klassen die via een eigen prop met een andere naam (bv. `cls="text-sm"`) naar een
component gaan. Zo'n component staat in `src/web/ui` en valt onder de review van dat recept.

## Kopieer de vorm van

- `eslint.config.js` — rail `elementen`: `restrict(rule, files, ignores, message, selectors)`, naam in `ruleNames`,
  melding met verwijzing naar `node scripts/kit/feiten.mjs componenten`.
- `test/rails/eslint.test.ts` — fixtures als `{ name, file, code, rule }`; per fixture precies één melding of geen.

## Acceptatiecriteria

Fixtures in `test/rails/eslint.test.ts` (alleen toevoegen; bestaande fixtures blijven ongewijzigd). Elke fixture geeft
precies `['rails/klassen']` of `[]`, via de bestaande `test.each`. Bestand `src/web/features/x.tsx`, tenzij anders genoemd.

- **klassenrail/AC-1** — Gegeven `className` met een typografie- of kleurtoken, dan meldt de rail `rails/klassen`:
  `<div className="text-sm" />`, `<div className="text-muted-foreground" />`, `<div className="bg-primary" />`,
  `<div className="font-medium" />`, `<div className="rounded-md" />`, en gemengd `<div className="flex text-sm" />`.
- **klassenrail/AC-2** — Gegeven een omzeiling binnen de string, dan meldt de rail `rails/klassen`: arbitrary value
  `<div className="w-[3px]" />`, important `<div className="!flex" />`, `<div className="dark:flex" />`, responsieve
  typografie `<div className="md:text-lg" />`, en een gestapelde prefix `<div className="md:lg:flex" />`.
- **klassenrail/AC-3** — Gegeven een `className` die geen stringliteral is, dan meldt de rail `rails/klassen`, ook als de
  inhoud layout is: template literal ``<div className={`flex`} />``, `<div className={cn('flex', 'text-sm')} />`
  (met `declare const cn: (...c: string[]) => string;`), een variabele (`const c = 'flex'; <div className={c} />`),
  en `<div className={'flex'} />`.
- **klassenrail/AC-4** — Gegeven `className` via een spread-object, `<div {...{ className: 'flex' }} />`, dan meldt de
  rail `rails/klassen`.
- **klassenrail/AC-5** — Gegeven `<div style={{}} />` in `src/web/features/x.tsx` en `<div style={{ color: 'red' }} />` in
  `src/web/routes/x.tsx`, dan meldt de rail `rails/klassen`.
- **klassenrail/AC-6** — Gegeven `<div className="text-sm" />` in `src/web/routes/x.tsx`, dan meldt de rail `rails/klassen`
  (routes vallen ook onder de rail).
- **klassenrail/AC-7** — Gegeven alleen layout-tokens, dan meldt de rail niets: `<div className="flex flex-col gap-4" />`,
  `<div className="max-w-sm" />`, `<div className="md:flex-row w-1/2" />`, `<span className="sr-only" />`,
  `<div className="flex min-w-0 flex-col gap-4 pb-4 -mt-2 mx-auto" />` en `<Card className="grid grid-cols-2 gap-x-6" />`.
- **klassenrail/AC-8** — Gegeven dezelfde verboden klasse `<div className="text-sm" style={{}} />` in `src/web/ui/x.tsx`,
  in `src/core/web/ui/x.tsx` en in `src/web/features/x.test.tsx`, dan meldt de rail niets.
- **klassenrail/AC-9** — Gegeven de huidige code, dan is `pnpm lint` groen zonder nieuwe regels in
  `eslint-suppressions.json`. Bij het schrijven van deze spec gebruikten `src/web/features` en `src/web/routes` alleen
  stringliterals met layout-tokens (o.a. `flex flex-col gap-*`, `max-w-sm`, `min-w-0`, `pb-4`, `sr-only`, `break-all`,
  `justify-center`, `items-center`, `flex-wrap`) en geen `style` of `cn()`; een schending die de bouwer toch vindt,
  lost hij op met een kitcomponent (`Text`, `Heading`, `Stack`, `Inline`) en noemt hij in de PR.
- **klassenrail/AC-10** — De melding bevat letterlijk `node scripts/kit/feiten.mjs componenten` en `framework §7`;
  `pnpm test:unit` (incl. `test/rails/eslint.test.ts`) is groen.

## Hergebruik en UX

N.v.t. — rail zonder UI. De melding wijst de bestaande kitcomponenten aan: `Text`, `Heading`, `Stack` en `Inline`
(`src/core/web/ui/`, geëxporteerd via `src/web/ui/index.ts`), en de actuele lijst via `node scripts/kit/feiten.mjs componenten`.
Geen staten, geen zichtbare tekst in de app, geen focusvolgorde.

## Docs in dezelfde PR

- `docs/framework.md` §7, bullet **Afgedwongen**: één verwijzing naar de rail toevoegen ("… en alleen layout-klassen
  (`rails/klassen`)"); verder ongewijzigd.
- `.claude/rules/web.md`: in de regel over styling in `features/` vervalt `Container` (bestaat niet); wordt
  "`Stack`/`Inline`" en noemt dat `rails/klassen` dit afdwingt, ook in `routes/`.
- `CHANGELOG.md` onder Unreleased: regel over de nieuwe rail `rails/klassen` met verwijzing naar deze spec.

## Raakt ook

- `pnpm lint`, `pnpm test:unit` (rail-fixtures), `pnpm ratchet` (docs), `pnpm check:docs-drift`.
- Beschermde paden: `eslint.config.js` (voorReview-gatepad, onderhoudsmodus, in de PR genoemd), `.claude/rules/web.md`
  (agentinstructie) en `docs/framework.md`: eigenaarakkoord via de merge.
- Niet geraakt: `check:migrations`, `check:secdef`, `test:db`/policies, `test/security/resources.ts`, permissietests,
  `check:catalogus` — geen tabel, route, permissie of component.

## Open vragen

- **OV-1 ✅ besloten** — Spread-object met `className` (AC-4) hoort bij selector 1 als bekende omzeiling (framework §1.5
  vraagt fixtures voor omzeilingen); een eigen prop met een andere naam blijft buiten de rail (zie "Bekende grens").
- **OV-2 ✅ besloten** — Eén responsieve prefix per token; `hover:`, `focus:` en andere toestandsprefixen zijn geen
  layout en vallen buiten de allowlist (komen uit componenten).
