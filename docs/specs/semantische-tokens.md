---
status: gebouwd # #353; gevalideerd: aa816f2fb91b7fdbe322dda7143f2723288db97e
namespace: semantische-tokens
---

# Semantische tokens: typografie, dichtheid, status, lagen en beweging

## Doel

Breid de drie tokenlagen in `src/core/web/styles` uit met typografie, dichtheid, statuskleuren, z-index-lagen en
beweging, zodat elke app haar eigen uitstraling alleen via `src/web/styles/theme.css` en componentvarianten krijgt, en
maak de tokens vindbaar via `node scripts/kit/feiten.mjs tokens` en `/design-system`.

Aanleiding: stap 3 van het goedgekeurde plan om UI-werk rond een tokengebaseerde componentenbibliotheek te versterken
(stap 1: `docs/specs/typografie-en-layout.md`, stap 2: `docs/specs/klassenrail.md`). De eigenaar (Bram) besloot op
2026-10-28 in de projectthread:

- de tokens zijn breed: kleur, typografie, dichtheid, status, z-index en beweging;
- lettertypen staan in de app zelf (woff2 met `@font-face` in het app-thema). CSP blijft `'self'` en er komt geen
  Google Fonts-CDN. Een licentiecheck hoort erbij;
- elke app krijgt haar eigen uitstraling, maar alleen via thematokens in `src/web/styles/theme.css` en componentvarianten.
  Features stylen nooit los; dat dwingt `rails/klassen` al af.

Huidige stand, bij het schrijven van deze spec in de code nagelopen:

- `@theme` in `src/core/web/styles/index.css` reset alleen kleur, radius en schaduw. Lettertype, tekstgrootte en gewicht
  zijn Tailwind-standaarden (`text-sm` … `text-2xl`, `font-medium`, `font-semibold`); `font-bold`, `text-xs` en `text-3xl`
  en groter bestaan wel, maar niemand gebruikt ze.
- `--control-h` (44 px) staat in de componentlaag (`components.css`) en een app kan hem niet via de semantische laag
  aanpassen. De afstandsbasis is de Tailwind-standaard `--spacing`.
- Er zijn geen statuskleuren voor succes of waarschuwing. `StatusBadge` heeft de tonen `neutral`, `accent` en
  `destructive`, en `Notice` heeft `info` en `error`.
- Er staan vaste z-index-waarden in `combobox.tsx` (`z-50`), `dropdown-menu.tsx` (`z-50`), `toast.tsx` (`z-50`) en
  `app-shell.tsx` (`focus:z-50`, de skiplink), en in `src/web/dev/role-switcher.tsx` (`z-40`, `z-50`).
- Er staan vaste duren in `dialog.tsx` (`duration-200 ease-out`, `backdrop:duration-200`) en in `role-switcher.tsx`
  (`duration-200`). `button-recipe.ts` gebruikt `transition-colors` met de Tailwind-standaardduur.
- `prefers-reduced-motion` wordt al globaal afgedwongen in `index.css`: elke animatie en overgang duurt dan 0,01 ms
  (`!important`).
- De CSP (`src/core/api/http/security-headers.ts`) heeft geen `font-src`, dus geldt `default-src 'self'`. Een lettertype
  uit de eigen build laadt, een externe of `data:`-bron niet.
- `test/ui/contrast.test.ts` leest `primitives.css`, `semantic.css` en `theme.css`. De test eist precies drie
  StatusBadge-tonen en dekt de tonen van `Notice` niet.

## Werkstraat, lane en mandaat

**Route: volledig** (framework §8). Het werk voegt tokens, componentvarianten (een component-API), een feiten-sectie en een
catalogusonderdeel toe. Dat valt buiten de lichte grens.

**Geen mini-spec met `scope: functionele-ui`.** Die uitzondering dekt alleen `src/core/web/ui` en `src/core/web/copy`
(`isCoreUiSource` in `rails/hooks/lib/functional-ui.mjs`) plus app-UI in `src/web/{ui,copy,features,routes}`. De
volgende paden vallen erbuiten:

| Pad | Soort | Gevolg |
|---|---|---|
| `src/core/web/styles/*.css` | overige core (gate `src/core/**`) | broncodemandaat (`--path`) nodig |
| `src/core/web/ui/*.tsx` | core-UI (gate) | mag onder hetzelfde mandaat |
| `src/web/styles/theme.css`, `src/web/dev/role-switcher.tsx` | app-code, geen gate, geen UI-bron in de zin van ADR 0056 | vrij in een bouw-PR, niet in de functionele-UI-lane |
| `scripts/kit/feiten.mjs`, `docs/framework.md`, `.claude/rules/web.md` | bewaking en agentinstructie (`voorReview`) | **niet** onder een mandaat: `verifyScopedFile` in `scripts/kit/check-document-status.mjs` weigert elk gate-pad dat geen `protectedSource` is ("bewaking blijft beschermd") |
| `test/ui/contrast.test.ts` (bestaand) | testpad (gate) | wijzigen mag, omdat deze spec het geteste gedrag verandert. De tester doet het en de PR noemt het; de diff-guard vraagt eigenaarreview |

Er is geen ADR nodig. De drie lagen en de zone-indeling (ADR 0040) blijven, en er wordt niets afgezwakt (framework §1).

**Volgorde:**

1. **Besluit-PR**: deze spec met status `goedgekeurd` en twee records in
   `.claude/decisions.json`. De hoofdsessie maakt die records:

   ```sh
   pnpm docs:decision docs/specs/semantische-tokens.md goedgekeurd --branch claude/tokens-typography-density \
     --path src/core/web/styles/semantic.css --path src/core/web/styles/components.css --path src/core/web/styles/index.css
   pnpm docs:decision docs/specs/semantische-tokens.md goedgekeurd --branch claude/tokens-status-layers-motion \
     --path src/core/web/styles/primitives.css --path src/core/web/styles/semantic.css \
     --path src/core/web/styles/components.css --path src/core/web/styles/index.css \
     --path src/core/web/ui/status-badge.tsx --path src/core/web/ui/notice.tsx --path src/core/web/ui/combobox.tsx \
     --path src/core/web/ui/dropdown-menu.tsx --path src/core/web/ui/toast.tsx --path src/core/web/ui/app-shell.tsx \
     --path src/core/web/ui/dialog.tsx
   ```

   Wijzigt de inhoud van deze spec na de merge, dan vervalt het mandaat en zijn nieuwe records nodig (ADR 0046 punt 7).
2. **3a — typografie en dichtheid** (`claude/tokens-typography-density`, mandaat hierboven): AC-1 t/m AC-8.
3. **3b — status, lagen en beweging** (`claude/tokens-status-layers-motion`, mandaat hierboven): AC-9 t/m AC-17.
4. **3c — vindbaarheid** (`claude/tokens-discoverability`, **zonder** mandaat): AC-18 t/m AC-22. Deze PR bevat
   `scripts/kit/feiten.mjs` (en zo nodig `scripts/kit/feiten-tekst.mjs`), `docs/framework.md` §7 en
   `.claude/rules/web.md`. Het is railwerk in onderhoudsmodus: het rolhek meldt "noem het in de PR", en de diff-guard
   vraagt het label `gate-wijziging` met eigenaarreview. Er staat geen `src/core/**` in deze PR. In deze PR, terwijl hij
   nog open is, zet de hoofdsessie de spec op `gebouwd` (`pnpm docs:status`, met bouwbewijs).

Een split is nodig. Eén PR kan niet zowel core onder mandaat als `scripts/**` bevatten. 3a en 3b zijn elk afzonderlijk
reviewbaar, en 3b bouwt voort op de `@theme`-structuur uit 3a.

## Rollen en wie wat ziet

Er verandert niets aan autorisatie. Tokens en componenten zijn presentatie. De bestaande guard van `/design-system`
(alleen admins, ADR 0048) blijft gelden, en de nieuwe voorbeelden doen geen API-aanroep.

## Datawijzigingen (met grants)

N.v.t. — er komt geen tabel, migratie, rol of policy.

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

N.v.t. — geen route, contract, permissie of foutcode. Ook de CSP verandert niet.

## Ontwerp

### Laag 2 — semantisch (`semantic.css`; een app overschrijft in `theme.css`)

De semantische namen vermijden de Tailwind-namespaces (`--font-*`, `--text-*`, `--font-weight-*`). Anders verwijst
`@theme inline` naar zichzelf.

| Groep | Token (standaard; licht / donker waar dat verschilt) |
|---|---|
| Lettertype | `--font-family-sans`: `ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'`; `--font-family-mono`: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace` |
| Tekstschaal | `--type-sm` `0.875rem` / `--type-sm-leading` `1.25rem`; `--type-base` `1rem` / `1.5rem`; `--type-lg` `1.125rem` / `1.75rem`; `--type-xl` `1.25rem` / `1.75rem`; `--type-2xl` `1.5rem` / `2rem` (gelijk aan de huidige Tailwind-waarden: geen visuele wijziging) |
| Gewicht | `--weight-normal` `400`, `--weight-medium` `500`, `--weight-semibold` `600` |
| Dichtheid | `--density-control` `2.75rem` (hoogte van bedieningselementen), `--density-space` `0.25rem` (afstandsbasis) |
| Status | `--success` `var(--p-green-700)` / `var(--p-green-300)`; `--success-foreground` `var(--p-white)` / `var(--p-zinc-950)`; `--warning` `var(--p-amber-700)` / `var(--p-amber-300)`; `--warning-foreground` `var(--p-white)` / `var(--p-zinc-950)` (OV-2) |
| Beweging | `--motion-fast` `150ms`, `--motion-normal` `200ms`, `--motion-ease-standard` `cubic-bezier(0.4, 0, 0.2, 1)`, `--motion-ease-out` `cubic-bezier(0, 0, 0.2, 1)` |

### Laag 1 — primitief (`primitives.css`)

Nieuw zijn `--p-green-300` `oklch(0.871 0.15 154.449)`, `--p-green-700` `oklch(0.527 0.154 150.069)`, `--p-amber-300`
`oklch(0.879 0.169 91.605)` en `--p-amber-700` `oklch(0.555 0.163 48.998)` (Tailwind v4-palet, OV-2).

### Laag 3 — component (`components.css`)

- `--control-h: max(var(--density-control), 2.75rem)`. Een app kan de bediening groter maken, maar nooit kleiner dan het
  aanraakdoel van 44 px (framework §7; OV-4).
- Lagen: `--layer-sticky` `10`, `--layer-dropdown` `20`, `--layer-overlay` `30`, `--layer-modal` `40`, `--layer-toast`
  `50` (OV-5). `<dialog>` gebruikt de top layer van de browser en heeft geen z-index nodig.

### `@theme inline` (`index.css`)

- Extra resets: `--font-*: initial`, `--font-weight-*: initial`, `--text-*: initial`, `--ease-*: initial`.
- Toewijzingen:
  - `--font-sans`/`--font-mono` → `--font-family-*`; `--default-font-family` en `--default-mono-font-family` ook;
  - `--text-{sm,base,lg,xl,2xl}` en `--text-*--line-height` → `--type-*`;
  - `--font-weight-{normal,medium,semibold}` → `--weight-*`;
  - `--spacing` → `--density-space`;
  - `--color-success`, `--color-success-foreground`, `--color-warning`, `--color-warning-foreground`;
  - `--z-index-{sticky,dropdown,overlay,modal,toast}` → `--layer-*`;
  - `--transition-duration-{fast,normal}` → `--motion-*`;
  - `--ease-{standard,out}` → `--motion-ease-*`;
  - `--default-transition-duration` → `--motion-fast` en `--default-transition-timing-function` →
    `--motion-ease-standard`.
- De bestaande globale regel voor `prefers-reduced-motion` blijft de enige garantie. Met `!important` wint hij ook van een
  app die in `theme.css` langere duren zet. De tokens voegen geen tweede mechanisme toe.
- Tailwind vangt kale getallen (`z-50`, `duration-200`) niet op met een reset, want die waarden komen niet uit het thema.
  Daarom bewaakt een brontest (AC-15) dat ze niet meer in de kit staan.

### Componenten (3b)

- `StatusBadge`: de tonen `success` (`bg-success text-success-foreground`) en `warning`
  (`bg-warning text-warning-foreground`) komen ná `destructive`.
- `Notice`: de tonen `success` (`border-success bg-background font-medium text-success`) en `warning`
  (`border-warning bg-background font-medium text-warning`) komen erbij, beide met `role="status"`. `error` blijft
  `role="alert"` en `info` blijft ongewijzigd (OV-7).
- Overstap op tokens: `combobox.tsx` en `dropdown-menu.tsx` gaan van `z-50` naar `z-dropdown`, `toast.tsx` van `z-50`
  naar `z-toast`, en `app-shell.tsx` van `focus:z-50` naar `focus:z-toast`. In `dialog.tsx` worden `duration-200` en
  `backdrop:duration-200` respectievelijk `duration-normal` en `backdrop:duration-normal`. In `role-switcher.tsx` worden
  `z-40` → `z-overlay`, `z-50` → `z-modal` en `duration-200` → `duration-normal`.
- `cn()` (`tailwind-merge`) blijft ongewijzigd. Blijkt een samenvoegconflict met de nieuwe namen een
  `extendTailwindMerge`-configuratie te vragen, dan is dat een scopewijziging: dan stopt de bouwer en vraagt hij het.

### Lettertypen in de app (3a)

- Standaard levert de template geen lettertypebestand: de systeemstack hierboven geldt (OV-1).
- Een app zet woff2-bestanden in `src/web/styles/fonts/`, met `@font-face` in `theme.css` (relatieve `url()`,
  `font-display: swap`). Ze overschrijft `--font-family-sans` en/of `--font-family-mono` met de eigen familie vóór de
  systeemstack. Vite neemt het bestand op onder `/assets/` (met een hash en `immutable` cache, `src/core/api/http/web.ts`).
- Licentie: alleen een lettertype waarvan de licentie zelf hosten en inbedden op het web toestaat (bijvoorbeeld SIL OFL
  1.1 of Apache 2.0). Het licentiebestand (`LICENSE*` of `OFL*`) staat in dezelfde map als het woff2-bestand, en de PR
  noemt lettertype, versie en licentie. AC-7 toetst dat.

### Vindbaarheid (3c)

- `node scripts/kit/feiten.mjs tokens`, naast `componenten`. De sectie toont per groep (kleur, typografie, dichtheid,
  lagen, beweging) elk token met:
  - de Tailwind-klasse(n);
  - de standaard (licht/donker);
  - de override uit `theme.css`, als die er is;
  - de bron als `bestand:regel`.

  Een token in `theme.css` dat niet in `semantic.css` staat, komt onder `onbekend`. `--json` geeft dezelfde gegevens. De
  sectie leest alleen de CSS-bestanden: geen Tailwind- of TypeScript-import (zoals `test/scripts/feiten-lazy.test.ts`).
- Op `/design-system` komt een sectie "Tokens" (`id="example-tokens"`). Twee nieuwe presentatiecomponenten in
  `src/web/ui`, geëxporteerd via `src/web/ui/index.ts`:
  - `TokenSwatch` (`color`: unie van alle `--color-*`-namen uit `@theme` behalve `transparent` en `current`) rendert een
    vlak met `aria-hidden="true"` en de tokennaam als zichtbare tekst. Elke `color` heeft een letterlijk voorbeeld, wat
    `check:catalogus` eist;
  - `TypeSample` (`size`: `sm` \| `base` \| `lg` \| `xl` \| `2xl`; `weight`: `normal` \| `medium` \| `semibold`;
    `family`: `sans` \| `mono`) toont een tekstvoorbeeld.

  Dichtheid, lagen en beweging staan in een `DescriptionList` (term = klasse, waarde = token en standaard).
- Docs: `docs/framework.md` §7 noemt de nieuwe resets, de tokens per laag en `feiten.mjs tokens`, en
  `.claude/rules/web.md` krijgt één regel: "tokens: `node scripts/kit/feiten.mjs tokens`".

## Kopieer de vorm van

- `src/core/web/styles/index.css` — de bestaande `@theme inline`-reset (`--color-*: initial`) en de toewijzing
  `--color-x: var(--x)`, nu ook voor tekst, gewicht, lagen en beweging.
- `src/core/web/styles/semantic.css` — `:root` plus `[data-theme='dark']` per kleurtoken; standaard via `var(--p-…)`.
- `test/ui/contrast.test.ts` — paren lezen uit de CSS en uit de recepttekst. Zo faalt een nieuwe toon zonder voldoende
  contrast, en een bewijs dat een bekende foute kleur faalt.
- `test/ui/typografie-en-layout.test.ts` — brontest voor eisen die de DOM niet kan bewijzen (klassen in bronbestanden).
- `test/ui/bundle.test.ts` — productiebuild in het geheugen (voor CSS-uitvoer en assets).
- `src/core/web/ui/status-badge.tsx` — CVA-recept met `tone` en `defaultVariants`.
- `src/core/web/ui/notice.tsx` — eindige `tone` met een rol per soort.
- `src/web/features/design-system/ui-basics-examples.tsx` — voorbeeld per toon in de sectie `example-badges`.
- `src/web/features/design-system/example-targets.ts` — vindplaats en uitleg per kitonderdeel.
- `src/web/features/design-system/typography-examples.tsx` — voorbeelden met `Section`, `Heading`, `Stack` en `Text`.
- `scripts/kit/feiten.mjs` — sectie `componenten` (lazy import, eigen tekstvorm, `--json`).
- `test/scripts/feiten.test.ts` — vorm van een test op een feiten-sectie.
- `src/web/features/accounts/accounts-page.tsx` — gouden pad (`docs/gouden-pad.md`, scherm). Hier alleen als referentie
  dat features geen token-klassen gebruiken: ongewijzigd.

## Hergebruik en UX

- Bestaande componenten: `StatusBadge` en `Notice` krijgen varianten. Er komt geen nieuw statuscomponent ernaast. Verder
  `Section`, `Heading`, `Stack`, `Inline`, `Text`, `Card` en `DescriptionList` voor de tokenoverzichten. Alleen
  `TokenSwatch` en `TypeSample` zijn nieuw, omdat kleurvlakken en tekstgroottes in features niet mogen (`rails/klassen`).
- Staten per scherm: n.v.t. Dit is presentatie zonder laden, leeg, fout of bezig. Het gedrag van de bestaande schermen
  verandert niet. De visuele standaard blijft gelijk, omdat de standaardwaarden gelijk zijn aan de huidige
  Tailwind-waarden.
- Zichtbare tekst, letterlijk:
  - StatusBadge-voorbeelden: "Voltooid" (`success`) en "Verloopt binnenkort" (`warning`), naast de bestaande "Uitgenodigd",
    "Actief" en "Geblokkeerd". De uitleg in `example-targets.ts` wordt "Alle vijf toonvarianten naast elkaar.";
  - Notice-voorbeelden in "PageHeader en Notice": "Wijzigingen opgeslagen." (`success`) en "Je sessie verloopt over 5
    minuten." (`warning`);
  - Tokens-sectie: de titel is "Tokens", met de uitleg "Kleur, typografie, dichtheid, lagen en beweging uit de tokens; een
    app past ze aan in src/web/styles/theme.css.". De subkoppen (`Heading level={3}`) zijn "Kleur", "Typografie",
    "Dichtheid", "Lagen" en "Beweging". Labels van `TokenSwatch` zijn de tokennaam (bijvoorbeeld "primary"). De tekst
    van `TypeSample` is "Tekst {size} · {weight}" of "Code {size}" bij `family="mono"`;
  - in de app verandert geen copy; er komt niets nieuws in `src/web/copy`.
- Focusvolgorde en toetsenbord: n.v.t. De nieuwe onderdelen zijn niet interactief en voegen geen tabstop toe. De skiplink
  blijft bij focus boven alles staan (`focus:z-toast`).

## Acceptatiecriteria

Met "Tailwind-compilatie" bedoelen we: `src/web/styles/app.css` compileren met `compile()` uit `tailwindcss` (een
bestaande dependency) en de genoemde kandidaten, of een productiebuild in het geheugen zoals in `test/ui/bundle.test.ts`.
Elk AC-id staat in de testnaam.

**3a — typografie en dichtheid**

- **semantische-tokens/AC-1** — De Tailwind-compilatie met `font-sans font-mono text-sm text-base text-lg text-xl
  text-2xl font-normal font-medium font-semibold` geeft voor elke klasse een regel. Die regel verwijst naar respectievelijk
  `--font-family-sans`, `--font-family-mono`, `--type-*` (met de line-height `--type-*-leading`) en `--weight-*`.
- **semantische-tokens/AC-2** — Dezelfde compilatie met `text-xs text-3xl text-9xl font-bold font-light font-thin
  font-serif` geeft voor geen van die klassen een regel. `index.css` bevat `--font-*: initial`,
  `--font-weight-*: initial` en `--text-*: initial` binnen `@theme`.
- **semantische-tokens/AC-3** — `semantic.css` definieert in `:root` elk token uit de tabel "Laag 2" voor lettertype,
  tekstschaal, gewicht en dichtheid, met precies de standaardwaarde uit die tabel.
- **semantische-tokens/AC-4** — `src/web/styles/app.css` importeert `./theme.css` ná de core-index. Een compilatie met een
  fixture-thema `:root { --font-family-sans: 'Voorbeeld', sans-serif; --type-base: 1.0625rem; }` zet die declaraties in de
  uitvoer ná die uit `semantic.css`, dus de app-waarde wint.
- **semantische-tokens/AC-5** — De compilatie met `p-4 gap-2 min-h-control` geeft voor `p-4` en `gap-2` een waarde op
  basis van `--density-space` (bijvoorbeeld `calc(var(--density-space) * 4)`), en voor `min-h-control` `var(--control-h)`.
  `components.css` definieert `--control-h: max(var(--density-control), 2.75rem)`.
- **semantische-tokens/AC-6** — Op `/design-system`, met `theme.css` zonder override, is de berekende `min-height` van een
  `Button` 44 px en is de berekende `font-size` van `body` 16 px. Dat geldt in licht en donker (Playwright).
- **semantische-tokens/AC-7** — De lettertypeguard (in de test als pure functie, toegepast op `src/**/*.css` en
  `src/web/styles/fonts/`):
  - geen CSS-bestand bevat `@import url(` of een `url(` met `http:`, `https:` of `//`;
  - elke `src`-`url()` in een `@font-face` is relatief en eindigt op `.woff2`;
  - elk `.woff2`-bestand onder `src/web/styles/fonts/` heeft in dezelfde map een bestand dat met `LICENSE` of `OFL` begint.

  Dezelfde functie faalt op drie fixtures: een `@font-face` met `https://fonts.gstatic.com/…`, een `@import url(…)` en
  een `.woff2` zonder licentiebestand. `contentSecurityPolicy()` blijft ongewijzigd; de bestaande tests blijven
  ongewijzigd groen.
- **semantische-tokens/AC-8** — `pnpm ui:check` (axe en screenshots, licht en donker) is groen zonder nieuwe of gewijzigde
  screenshot-baselines in 3a.

**3b — status, lagen en beweging**

- **semantische-tokens/AC-9** — `semantic.css` definieert `--success`, `--success-foreground`, `--warning` en
  `--warning-foreground` in `:root` en in `[data-theme='dark']`, elk als `var(--p-…)`. De Tailwind-compilatie met
  `bg-success text-success text-success-foreground border-success bg-warning text-warning text-warning-foreground
  border-warning` geeft voor elke klasse een regel.
- **semantische-tokens/AC-10** — `test/ui/contrast.test.ts` toetst in licht en donker:
  - `--success` en `--warning` op `--background` en op `--card` ≥ 4,5:1;
  - `--success-foreground` op `--success` en `--warning-foreground` op `--warning` ≥ 4,5:1.

  Een extra controle bewijst dat de test kan falen: `--p-amber-300` op `--p-white` haalt 4,5:1 niet.
- **semantische-tokens/AC-11** — `StatusBadge` met `tone="success"` heeft `bg-success text-success-foreground`, met
  `tone="warning"` `bg-warning text-warning-foreground`. De badgetest in `contrast.test.ts` vindt de tonen `['neutral',
  'accent', 'destructive', 'success', 'warning']` in die volgorde, en elk paar haalt ≥ 4,5:1 in licht en donker. (De
  bestaande assertie op drie tonen wordt gewijzigd; de PR noemt de reden.)
- **semantische-tokens/AC-12** — `Notice` met `tone="success"` rendert `role="status"` met `border-success` en
  `text-success`, met `tone="warning"` `role="status"` met `border-warning` en `text-warning`. `tone="error"` blijft
  `role="alert"`, en zonder `tone` blijven de klassen van `info` ongewijzigd. `contrast.test.ts` leest de tekst-/vlakparen
  van elke Notice-toon uit `notice.tsx` (zoals bij StatusBadge) en eist ≥ 4,5:1 in licht en donker. Een nieuwe toon
  zonder paar laat de test falen.
- **semantische-tokens/AC-13** — `components.css` definieert de vijf `--layer-*`-tokens met de waarden uit het ontwerp,
  strikt oplopend: sticky < dropdown < overlay < modal < toast. De compilatie met `z-sticky z-dropdown z-overlay z-modal
  z-toast` geeft voor elke klasse een `z-index` uit het bijbehorende token.
- **semantische-tokens/AC-14** — De compilatie met `duration-fast duration-normal ease-standard ease-out transition-colors`
  geeft duren en easing uit `--motion-*`. `transition-colors` gebruikt `--motion-fast` en `--motion-ease-standard`, en de
  compilatie met `ease-in ease-in-out` geeft geen regel (`--ease-*: initial`).
- **semantische-tokens/AC-15** — Een brontest op de niet-testbestanden in `src/core/web/ui`, `src/web/ui` en
  `src/web/dev` vindt geen klasse die past op `z-\d+`, `z-\[`, `duration-\d+`, `duration-\[`, `ease-\[` of `delay-\d+`,
  ook niet met een prefix als `focus:` of `backdrop:`. Hij vindt wel:
  - `z-dropdown` in `combobox.tsx` en `dropdown-menu.tsx`;
  - `z-toast` in `toast.tsx` en `focus:z-toast` in `app-shell.tsx`;
  - `duration-normal` en `backdrop:duration-normal` in `dialog.tsx`;
  - `z-overlay`, `z-modal` en `duration-normal` in `role-switcher.tsx`.
- **semantische-tokens/AC-16** — Op `/design-system` duurt de overgang van de open sheet-dialoog (berekende
  `transition-duration`) 0,2 s. Met `reducedMotion: 'reduce'` (Playwright `emulateMedia`) is die duur ≤ 0,01 ms.
- **semantische-tokens/AC-17** — Op `/design-system` staan StatusBadge "Voltooid" (`success`) en "Verloopt binnenkort"
  (`warning`), en Notice "Wijzigingen opgeslagen." (`success`) en "Je sessie verloopt over 5 minuten." (`warning`).
  `pnpm check:catalogus` en `pnpm ui:check` (axe, licht en donker) zijn groen. Alleen de screenshots van de secties
  `example-badges` en "PageHeader en Notice" veranderen.

**3c — vindbaarheid**

- **semantische-tokens/AC-18** — `node scripts/kit/feiten.mjs tokens` geeft de groepen `kleur`, `typografie`,
  `dichtheid`, `lagen` en `beweging`. Elk token uit "Laag 2" en de `--layer-*`-tokens staan erin, met de klasse, de
  standaard (licht/donker) en de bron als `bestand:regel`, bijvoorbeeld `--success` met `bg-success`/`text-success` en
  `--layer-dropdown` met `z-dropdown`. `--json` bevat dezelfde tokens. Een onbekende sectie noemt `tokens` in "Kies uit".
- **semantische-tokens/AC-19** — Met een fixture-root waarin `theme.css` `--primary` en `--density-control` overschrijft en
  ook `--primairy` bevat, toont `tokens` de app-waarde bij `--primary` en `--density-control`, en staat `--primairy` onder
  `onbekend`. De sectie importeert geen `tailwindcss`, `typescript` of `catalogus.mjs` (zoals in
  `test/scripts/feiten-lazy.test.ts`).
- **semantische-tokens/AC-20** — De sectie "Tokens" op `/design-system` heeft:
  - een `TokenSwatch` voor elke `--color-*`-naam uit `@theme` (behalve `transparent` en `current`): een test vergelijkt
    die verzameling met de `color`-unie en met de voorbeelden;
  - een `TypeSample` voor elke `size`, elke `weight` en `family="mono"`;
  - een `DescriptionList` met de klassen `min-h-control`, `z-sticky` … `z-toast`, `duration-fast`, `duration-normal`,
    `ease-standard` en `ease-out`.

  `pnpm check:catalogus` is groen.
- **semantische-tokens/AC-21** — `TokenSwatch` en `TypeSample` staan in `src/web/ui/index.ts`. Het vlak van `TokenSwatch`
  heeft `aria-hidden="true"` en de tokennaam is zichtbare tekst. `TypeSample` met `family="mono"` heeft `font-mono`, en
  met `size`/`weight` precies de klassen `text-{size}` en `font-{weight}`. `pnpm ui:check` (axe, licht en donker) is
  groen.
- **semantische-tokens/AC-22** — `pnpm lint` (incl. `rails/klassen`), `pnpm typecheck`, `pnpm test:unit` en
  `pnpm ratchet` zijn groen. Features en routes gebruiken geen `TokenSwatch`/`TypeSample` buiten
  `src/web/features/design-system`; een brontest bewijst dat.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| App zet `--density-control: 2rem` in `theme.css` | `--control-h` blijft 2,75 rem (`max()`); het aanraakdoel blijft 44 px | n.v.t. |
| App zet `--density-space: 0.2rem` | alle afstanden en spacingmaten schalen mee; contrast en aanraakdoel veranderen niet | n.v.t. |
| App zet `--motion-normal: 600ms` | normaal langzamer. Bij `prefers-reduced-motion` blijft de duur 0,01 ms (globale `!important`-regel) | n.v.t. |
| App kiest een eigen `--success`/`--warning` met te weinig contrast | `test/ui/contrast.test.ts` faalt (hij leest `theme.css`) | n.v.t. |
| woff2 kleiner dan 4 KB | Vite zou het als `data:` inlinen en de CSP blokkeert dat. In de praktijk is een woff2 groter; de docs noemen de grens. `vite.config.ts` verandert niet | n.v.t. |
| Lettertype laadt niet (netwerk) | `font-display: swap` en de systeemstack als terugval | n.v.t. |
| Externe lettertype-URL of CDN-`@import` | AC-7 faalt | n.v.t. |
| Iemand gebruikt `z-50` of `duration-300` in de kit | AC-15 faalt (een reset kan kale getallen niet weren) | n.v.t. |
| Gebruik van `text-xs`/`font-bold` | geen CSS-regel: de klasse doet niets. Er is nu geen gebruik (gecontroleerd) | n.v.t. |
| `tracking-tight`, `leading-none` | blijven Tailwind-standaard (buiten scope, OV-8) | n.v.t. |

## Raakt ook

- `test/ui/contrast.test.ts` (bestaande test gewijzigd in 3b, met reden in de PR). Verder `pnpm check:catalogus`,
  `pnpm ui:check` (axe en screenshots), `pnpm typecheck`, `pnpm lint` (`rails/klassen`), `pnpm test:unit`, `pnpm ratchet`
  en `pnpm check:docs-drift`. De docs gaan in dezelfde PR mee.
- Docs: in 3a en 3b `docs/ui-kit-basics.md`, met een sectie "Thema en tokens": welke tokens een app overschrijft, hoe je
  lettertypen zelf host en de licentie-eis, verwijzingen als `bestand:regel`. In 3c `docs/framework.md` §7 en
  `.claude/rules/web.md`. Elke PR krijgt een regel onder Unreleased in `CHANGELOG.md`.
- Bewaking: `scripts/kit/feiten.mjs` (3c, zonder mandaat, diff-guard en eigenaarreview).
- Niet geraakt: `check:migrations`, `check:secdef`, `test:db`/policies, `test/security/resources.ts`, permissietests en
  de CSP-tests. Er is geen tabel, route, permissie of headerwijziging.

## Buiten scope

- Een lintrail die kale `z-*`/`duration-*` in de kit verbiedt (in deze spec doet de brontest AC-15 dat; een rail is
  een aparte PR).
- Tokens voor `leading-*`/`tracking-*`, breekpunten, containerbreedtes, schaduwen (al gereset) en animaties
  (`animate-*`).
- Nieuwe `Text`-varianten (`success`/`warning`-toon, grotere maten, mono). `TypeSample` is alleen voor de catalogus.
- Een meegeleverd lettertypebestand in de template (OV-1) en wijzigingen aan `vite.config.ts` of de CSP.
- Wijzigingen aan `AGENTS.md` en `CLAUDE.md`.

## Testplan

- **Tester (vóór elke bouw-PR, alleen testpaden):**
  - 3a: `test/ui/semantische-tokens.test.ts` voor AC-1 t/m AC-5 en AC-7 (Tailwind-compilatie en bronlezing, met de
    fixtures), en een e2e-test in `e2e/semantische-tokens.spec.ts` voor AC-6;
  - 3b: aanvullingen in `test/ui/contrast.test.ts` (AC-10, AC-11, AC-12; de gewijzigde badge-assertie staat met reden in
    de PR) en in `test/ui/semantische-tokens.test.ts` (AC-9, AC-13 t/m AC-15). Componenttests naast `status-badge.tsx` en
    `notice.tsx` (AC-11, AC-12) en e2e voor AC-16 en AC-17;
  - 3c: `test/scripts/feiten-tokens.test.ts` (AC-18, AC-19), een componenttest naast `src/web/ui/token-swatch.tsx` en
    `src/web/ui/type-sample.tsx` (AC-21), en een test in `src/web/features/design-system/` (AC-20, AC-22).
- Tests compileren en falen vóór de bouw op hun asserties. AC-8, AC-17 en AC-21 bewijzen `pnpm ui:check` en
  `pnpm check:catalogus` in de bouw-PR.
- Reviewer per PR op `git diff origin/main...HEAD`. De eigenaar merget.

## Besluiten

De eigenaar heeft op 2026-10-28 alle aanbevelingen hieronder overgenomen (OV-1 t/m OV-9). De gekozen optie is steeds
de aanbeveling.

- **OV-1** — Welk lettertype geldt standaard in de template? Opties: (a) de systeemstack zonder fontbestand, (b) een
  meegeleverd OFL-lettertype (bijvoorbeeld Inter en JetBrains Mono als woff2 in `src/web/styles/fonts/`).
  Aanbeveling: (a). Dat geeft geen binaire bestanden, geen licentiebeheer in de template en geen groei van het
  CSS-budget; elke app kiest haar eigen lettertype, zoals besloten.
- **OV-2** — Concrete statuskleuren. Aanbeveling: `--success` green-700 (licht) / green-300 (donker) en `--warning`
  amber-700 / amber-300, met als voorgrond wit (licht) / zinc-950 (donker). Uit sRGB berekend: ca. 5,0:1 als tekst op wit
  en als wit op het vlak; in donker ruim boven 10:1. Zo werkt hetzelfde token als tekst (Notice) en als vlak (StatusBadge).
- **OV-3** — Tekstschaal en gewichten. Aanbeveling: alleen wat nu gebruikt wordt (`sm`, `base`, `lg`, `xl`, `2xl`;
  `normal`, `medium`, `semibold`), met de huidige Tailwind-waarden. `text-xs`, `text-3xl` en groter, en `font-bold`
  verdwijnen. Een app die meer nodig heeft, stelt een variant voor.
- **OV-4** — Mag dichtheid de bediening kleiner maken dan 44 px? Aanbeveling: nee. Framework §7 eist een aanraakdoel van
  44 px, en `max()` borgt dat in CSS. "Compact" kan via `--density-space`.
- **OV-5** — Waarden en namen van de lagen, en de skiplink. Aanbeveling: sticky 10, dropdown 20, overlay 30, modal 40,
  toast 50, en de skiplink op `z-toast` (de hoogste laag). Een aparte laag `skip-link` kan ook, maar heeft nu geen tweede
  gebruiker. `sticky` heeft nog geen gebruiker in de kit; hij blijft voor apps (vaste tabelkoppen).
- **OV-6** — Duren en easing. Aanbeveling: `fast` 150 ms (de huidige standaard van `transition-colors`) en `normal`
  200 ms (dialoog, rolwisselaar). `standard` = `cubic-bezier(0.4, 0, 0.2, 1)` en `out` = `cubic-bezier(0, 0, 0.2, 1)`
  (de huidige `ease-out`). Geen `slow` zonder gebruiker.
- **OV-7** — Welke rol krijgt `Notice` bij `warning`? Aanbeveling: `role="status"`. Alleen `error` onderbreekt de
  schermlezer (`alert`); een waarschuwing vraagt geen directe onderbreking.
- **OV-8** — Moeten ook `leading-*` en `tracking-*` gereset worden? Aanbeveling: nu niet. `leading-none` en
  `tracking-tight` blijven Tailwind-standaard; een volgende stap kan ze als tokens toevoegen als een app dat nodig heeft.
- **OV-9** — Split en branchnamen. Aanbeveling: besluit-PR, daarna 3a, 3b en 3c zoals in "Werkstraat, lane en mandaat",
  met de branchnamen zoals de records ze binden. Een andere branchnaam vraagt een nieuw record.
