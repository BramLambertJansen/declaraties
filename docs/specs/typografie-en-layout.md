---
status: goedgekeurd
namespace: typografie-en-layout
sjabloon: mini
scope: functionele-ui
---

# Typografie- en layoutcomponenten

Lichte fixes zonder mini-spec; een mini-spec verkort het document, niet de rollen — route en rollen: framework §8 (ADR 0058).

## Doel

Voeg `Text`, `Heading`, `Stack` en `Inline` toe aan de kit, zodat `features/` typografie en kleur uit componenten haalt
in plaats van uit utility-klassen, en zet de drie bestaande afwijkingen daarop over.

De eigenaar (Bram) koos op 2026-10-28 in de projectthread voor dit werk, als stap 1 van het plan om de UI-agent te
versterken met een token-based library. Vervolgstappen (nieuwe tokens, een lintrail die typografie- en kleurklassen in
`features/` verbiedt) zijn afzonderlijke PR's en vallen buiten deze spec.

Aanleiding: framework §7 en `.claude/rules/web.md` schrijven voor dat `features/` alleen layout-klassen gebruikt en dat
kleur en typografie uit componenten komen, en verwijzen naar `Stack`/`Inline`, maar die componenten bestaan niet.
Daardoor staan nu typografieklassen in features:

- `src/web/features/account/sessions-section.tsx` (`SessionRow`): `font-medium` op de apparaatnaam en
  `ml-2 text-muted-foreground` op het label "Dit apparaat";
- `src/web/features/accounts/accounts-page.tsx`: `text-sm text-muted-foreground` op de `aria-live`-regel
  "… accounts getoond.".

De lintrail kan pas komen als deze componenten er zijn. `Container` uit `.claude/rules/web.md` wordt in deze PR niet
gebouwd; `.claude/rules/web.md` en `docs/framework.md` blijven ongewijzigd (agentinstructies en bewaking vallen buiten
de functionele-UI-lane, ADR 0056). Een latere PR met mandaat brengt die teksten in lijn.

## Rollen en wie wat ziet

Geen wijziging. De componenten zijn presentatie en bepalen geen autorisatie. De bestaande guard van `/design-system`
blijft gelden; de voorbeelden gebruiken alleen vaste, fictieve tekst en doen geen API-aanroep.

## Routes en foutcodes

N.v.t. — geen route, permissie, API-contract, foutcode, migratie of dependency. Alleen kitcomponenten, één bestaand
web-component (`Section`), twee bestaande featureschermen, de catalogus en gebruiksdocumentatie.

## Ontwerp

Alle vier nieuw in `src/core/web/ui/` (`text.tsx`, `heading.tsx`, `stack.tsx`, `inline.tsx`), elk met een CVA-recept op
bestaande Tailwind-/themaklassen, geëxporteerd via `src/web/ui/index.ts`. Geen nieuwe tokens, geen nieuwe CSS-variabelen.
`className` gaat via `cn()` achter het recept, zoals bij `StatusBadge`.

| Component | Props (standaard) | Klassen per variant |
|---|---|---|
| `Text` | `as`: `'p'` \| `'span'` \| `'div'` (`'p'`); `size`: `'sm'` \| `'base'` (`'base'`); `tone`: `'default'` \| `'muted'` (`'default'`); `weight`: `'normal'` \| `'medium'` (`'normal'`); overige native props van het gekozen element gaan door (o.a. `aria-live`, `id`) | size: sm → `text-sm`, base → `text-base`; tone: default → `text-foreground`, muted → `text-muted-foreground`; weight: normal → `font-normal`, medium → `font-medium` |
| `Heading` | `level`: `2` \| `3` \| `4` (verplicht; geen standaard); optioneel `id`; `children` | rendert `h2`/`h3`/`h4`; 2 → `text-xl`, 3 → `text-lg`, 4 → `text-base`; alle niveaus `font-semibold`. `h1` blijft voorbehouden aan `PageTitle` (het type staat `1` niet toe) |
| `Stack` | `gap`: `'xs'` \| `'sm'` \| `'md'` \| `'lg'` \| `'xl'` (`'md'`); `as`: `'div'` \| `'section'` \| `'ul'` \| `'ol'` (`'div'`); native props gaan door | basis `flex flex-col`; gap: xs → `gap-1`, sm → `gap-2`, md → `gap-4`, lg → `gap-6`, xl → `gap-8` |
| `Inline` | `gap`: zelfde schaal (`'sm'`); `align`: `'start'` \| `'center'` \| `'baseline'` (`'center'`); `justify`: `'start'` \| `'between'` \| `'end'` (`'start'`); native `div`-props gaan door | basis `flex flex-row flex-wrap`; gap als `Stack`; align: start → `items-start`, center → `items-center`, baseline → `items-baseline`; justify: start → `justify-start`, between → `justify-between`, end → `justify-end` |

`Section` (`src/web/ui/section.tsx`) rendert zijn titel voortaan met `<Heading level={2} id={id}>`. Het element (`h2`),
de klassen (`text-xl font-semibold`), de `useId`-koppeling met `aria-labelledby` en het `landmark`-gedrag blijven gelijk.

Featureplekken:

- `SessionRow`: de cel wordt `<Inline gap="sm">` met `<Text as="span" weight="medium">{apparaat}</Text>` en, alleen bij
  de huidige sessie, `<Text as="span" tone="muted">{texts.current}</Text>`; `ml-2` vervalt (afstand via `Inline`).
- `accounts-page.tsx`: `<Text size="sm" tone="muted" aria-live="polite">` met dezelfde inhoud als nu.

## Kopieer de vorm van

- `src/core/web/ui/status-badge.tsx` — CVA-recept met `defaultVariants`, `VariantProps`, `cn()` en doorgegeven native props.
- `src/core/web/ui/notice.tsx` — eindige `tone`-variant op bestaande tokens, gedocumenteerd in de catalogus.
- `src/core/web/ui/page-title.tsx` — kopsemantiek; `Heading` neemt de stijl over, niet het `h1`-niveau.
- `src/web/ui/section.tsx` — de titelkoppeling (`useId`, `aria-labelledby`) die met `Heading` gelijk moet blijven.
- `src/web/ui/section.test.tsx` — vorm van de toegankelijkheidstest voor de sectie.
- `src/core/web/ui/empty-state.test.tsx` — vorm van een unittest voor een kitcomponent.
- `src/web/features/design-system/ui-basics-examples.tsx` — voorbeelden per component en variant op `/design-system`.
- `src/web/features/design-system/example-targets.ts` — vindplaats en uitleg per kitonderdeel in de catalogus.
- `src/web/features/accounts/accounts-page.tsx` — gouden pad (`docs/gouden-pad.md`, scherm); wordt hier zelf aangepast.

## Acceptatiecriteria

Unit- en componenttests naast de code (`*.test.tsx`), met het AC-id in de testnaam.

- **typografie-en-layout/AC-1** — Gegeven `Text` zonder props, dan rendert het een `p` met `text-base`, `text-foreground`
  en `font-normal`. Met `as="span"` en `as="div"` rendert het precies dat element (geen `p`).
- **typografie-en-layout/AC-2** — Gegeven `Text`, dan levert elke variant precies haar klasse: `size="sm"` → `text-sm`
  (en geen `text-base`), `tone="muted"` → `text-muted-foreground` (en geen `text-foreground`), `weight="medium"` →
  `font-medium` (en geen `font-normal`).
- **typografie-en-layout/AC-3** — Gegeven `Text` met `aria-live="polite"`, `id` en `className`, dan staan `aria-live` en
  `id` op het gerenderde element en is `className` toegevoegd naast de receptklassen.
- **typografie-en-layout/AC-4** — Gegeven `Heading` met `level` 2, 3 en 4, dan rendert het respectievelijk `h2`, `h3`, `h4`
  (rol `heading` met `level` 2/3/4), met `text-xl`/`text-lg`/`text-base` en steeds `font-semibold`; een opgegeven `id`
  staat op het kopelement. `level={1}` en een ontbrekend `level` zijn een typefout (`pnpm typecheck`; een
  `// @ts-expect-error`-regel in de test bewijst dat).
- **typografie-en-layout/AC-5** — Gegeven `Stack` zonder props, dan rendert het een `div` met `flex flex-col gap-4`; elke
  `gap` (xs, sm, md, lg, xl) geeft `gap-1`/`gap-2`/`gap-4`/`gap-6`/`gap-8`; `as="section"`, `"ul"` en `"ol"` renderen dat
  element; native props (bv. `aria-label`) gaan door.
- **typografie-en-layout/AC-6** — Gegeven `Inline` zonder props, dan rendert het een `div` met `flex flex-row flex-wrap
  gap-2 items-center justify-start`; elke `gap`, `align` (start, center, baseline) en `justify` (start, between, end)
  geeft de klasse uit de ontwerptabel en niet die van de standaard.
- **typografie-en-layout/AC-7** — Gegeven `Section title="Dialog"`, dan is er een `h2` met tekst "Dialog" en klassen
  `text-xl font-semibold`, is de region op naam "Dialog" vindbaar en verwijst `aria-labelledby` naar het `id` van die
  `h2`; met `landmark={false}` ontbreekt `aria-labelledby` (zoals nu). De bestaande `section.test.tsx` blijft ongewijzigd groen.
- **typografie-en-layout/AC-8** — Gegeven de sessietabel met een huidige sessie, dan toont de rij de apparaatnaam en
  "Dit apparaat" als afzonderlijke tekst, en bevat de JSX van `sessions-section.tsx` geen `font-*`, `text-*` of `ml-*`
  klasse meer; de bestaande tests op "Dit apparaat" (`account-deel2.test.tsx`, `e2e/eigen-account-deel2.spec.ts`)
  blijven ongewijzigd groen.
- **typografie-en-layout/AC-9** — Gegeven de accountlijst met resultaten, dan heeft de statusregel nog steeds
  `aria-live="polite"` en de tekst "Bezig met laden…" of "N accounts getoond." (met " Er zijn er meer." bij een volgende
  pagina), en staat er in `accounts-page.tsx` geen `text-sm` of `text-muted-foreground` meer.
- **typografie-en-layout/AC-10** — `Text`, `Heading`, `Stack` en `Inline` staan in `src/web/ui/index.ts`, hebben elk een
  bereikbaar voorbeeld op `/design-system` met elke eindige stringvariant, en `pnpm check:catalogus` is groen. `Heading`
  toont alle drie niveaus (numerieke variant; niet door de catalogus afgedwongen, wel door de componentindex-test of een
  voorbeeldtest).
- **typografie-en-layout/AC-11** — `pnpm ui:check` (axe op `/design-system`, licht en donker) is groen met de nieuwe
  voorbeelden. `test/ui/contrast.test.ts` dekt `--muted-foreground` op `--background` en op `--card` al; er komt geen
  nieuwe contrastrij, omdat `Text` geen nieuw kleurpaar introduceert.

## Hergebruik en UX

- Bestaande componenten: `Section`, `Card`/`CardContent` (achtergrond voor het muted-voorbeeld op kaart), `TableCell`,
  `StatusBadge` als vormvoorbeeld; `PageTitle` blijft de enige `h1`. Geen nieuw component naast deze vier.
- Staten: n.v.t. — puur presentatie, geen laden/leeg/fout/bezig. De bestaande staten van de accountlijst en de
  sessietabel blijven ongewijzigd (zelfde `AsyncView`, zelfde teksten).
- Zichtbare tekst in de featureschermen: ongewijzigd ("Dit apparaat", "Bezig met laden…", "N accounts getoond.",
  " Er zijn er meer."); geen nieuwe copy in `src/web/copy`.
- Voorbeeldteksten op `/design-system`, letterlijk:
  - sectietitel "Text, Heading, Stack en Inline", uitleg in `example-targets.ts`: "Typografie en afstand uit componenten:
    tekstgrootte, toon en gewicht, koppen per niveau en verticale of horizontale stapels.";
  - `Text`: "Standaardtekst in de basisgrootte.", "Kleine tekst.", "Gedempte toelichting.", "Nadruk met medium gewicht.",
    "Tekst in een span." (`as="span"`), "Tekst in een div." (`as="div"`), en "Gedempte toelichting op een kaart." in een `Card`;
  - `Heading`: "Kop van niveau 2", "Kop van niveau 3", "Kop van niveau 4" (binnen de sectie, zodat de kopvolgorde
    onder de `h2` van de sectie klopt; axe `heading-order`);
  - `Stack`: per gap een stapel met "Eerste", "Tweede", "Derde" en het label "Afstand xs" … "Afstand xl"; één `as="ul"`-
    en één `as="ol"`-voorbeeld met dezelfde drie items, en één `as="section"` met `aria-label="Voorbeeldsectie"`;
  - `Inline`: dezelfde drie items per gap, per align (met een `StatusBadge` "Concept" naast tekst voor `baseline`) en
    per justify, met labels "Uitlijning start/center/baseline" en "Verdeling start/between/end".
- Focusvolgorde en toetsenbord: n.v.t. — de componenten zijn niet interactief, voegen geen tabstop toe en wijzigen de
  bestaande focusvolgorde van beide schermen niet.
- Gebruiksdocumentatie: korte sectie "Typografie en layout" in `docs/ui-kit-basics.md` (wanneer `Text`/`Heading`/
  `Stack`/`Inline`, verwijzing naar de bron in plaats van gekopieerde code, `h1` alleen via `PageTitle`) en een regel
  onder Unreleased in `CHANGELOG.md`.

## Raakt ook

- `pnpm check:catalogus` (ADR 0048), `pnpm ui:check`, `pnpm typecheck`, `pnpm lint`, unit-/componenttests en
  `pnpm check:docs-drift` (docs in dezelfde PR).
- Niet geraakt: `check:migrations`, `check:secdef`, `test:db`/policies, `test/security/resources.ts`, permissietests —
  geen tabel, route of permissie.

## Open vragen

Geen — de ontwerpkeuzes zijn door de hoofdsessie vastgelegd op basis van de keuze van de eigenaar van 2026-10-28; de
merge door de eigenaar is het besluit (ADR 0046).
