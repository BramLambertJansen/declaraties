# UI-basiselementen gebruiken

De uitbreiding volgt [de goedgekeurde spec](specs/ui-kit-basics.md). Importeer componenten via
`src/web/ui/index.ts`; de voorbeelden staan op de bestaande, beveiligde `/design-system`-route.

## Invoervelden

- `Textarea` gebruikt dezelfde inputtokens als Input. Geef domeinlimieten vanuit het schema/de app door.
- `Checkbox` heeft een klikbaar `label` en native booleansemantiek. Arrayselectie en indeterminate vallen buiten deze kit.
- `RadioGroup` krijgt `label`, `value`, `options` en `onValueChange`. Native radios verzorgen selectie en toetsenbediening.
  `description` en `error` worden aan elke optie gekoppeld. De ref wijst naar de eerste niet-uitgeschakelde optie.
- Gebruik binnen `Form` de bestaande `useZodForm`. `FormField` bindt stringvelden, inclusief Textarea;
  `FormCheckboxField` bindt uitsluitend booleanvelden en `FormRadioGroupField` uitsluitend stringvelden.
  Geef passende defaultwaarden door. Een ontbrekende of ongeschikte default veroorzaakt een assertion, geen stille lege waarde.
- Reset en schema-/serverfouten blijven via RHF lopen. `Form.fieldForCode` koppelt de serverfout en focust het veld of groepsanker.

Bronnen: `src/core/web/ui/form.tsx:94`, `src/core/web/ui/form-checkbox-field.tsx:15`,
`src/core/web/ui/form-radio-group-field.tsx:15`, `src/web/features/design-system/ui-basics-examples.tsx`.
Additieve acceptatietests: `src/core/web/ui/form-controls.test.tsx`. Bestaande tests blijven ongewijzigd.

## Status en leegte

`StatusBadge` presenteert aangeleverde tekst met `tone="neutral"`, `accent` of `destructive`.
De tekst-/vlakparen zijn dezelfde als de bestaande contrasttest voor muted, accent en destructive Button,
in licht en donker (`test/ui/contrast.test.ts`). Core kent geen accountstatussen.

`EmptyState` heeft `title`, optionele `description` en `action`. De app beslist over toegang tot de actie.
Gebruik `AsyncView.emptyContent` voor deze samengestelde weergave, naast `isEmpty`; zonder custom inhoud
blijft `emptyText` gelden. Loading/error/retry blijven in AsyncView.

## Busy acties

`Button.busy` en `busyLabel` tonen de actie in uitvoering. `aria-disabled` bewaart focus;
capturehandlers weigeren click en Enter/Space voordat de actie of native submit/navigatie kan plaatsvinden.
Ook `asChild` behoudt zijn element tijdens de labelwissel. Geef een geschikt aangeleverd busy-label door,
ook wanneer de gewone knop uitsluitend een pictogram heeft. Native `disabled` blijft beschikbaar.

Ook `Button asChild disabled` weigert activering en meldt `aria-disabled`, zonder het linkelement of label te vervangen.
Click, Enter/Space en de middelste muisknop worden bij `disabled` en `busy` vóór parent- en kindhandlers geblokkeerd.
Na herstel werken de gewone handlers weer; `disabled` alleen toont geen busy-label. Regressies:
`src/core/web/ui/button-disabled-link.test.tsx`.

Menu-items ondersteunen `busy`, `busyLabel` en `disabled`. Busy blijft focusbaar; disabled wordt door
Radix overgeslagen. Beide weigeren selectie en sluiten het menu niet. De caller beëindigt busy,
bijvoorbeeld bij succes of fout; de kit doet geen automatische retry, timer of toast.

Voorbeelden: `src/web/features/design-system/ui-basics-examples.tsx`. De voorbeeldquery in `queries.ts`
levert uitsluitend lokale fictieve data; er zijn geen nieuwe API-aanroepen of rechten.

## Acceptatiebewijs

| Criteria | Testpad |
|---|---|
| AC-1 t/m AC-5: bestaande binding, textarea, boolean, radio, schema-/serverfout, default en reset | `src/core/web/ui/form-controls.test.tsx`, bestaande `form.test.tsx` |
| AC-6/7: aangeleverde badgetekst, EmptyState met/zonder actie en AsyncView-fallback | `src/core/web/ui/empty-state.test.tsx`, bestaande `async-view.test.tsx` |
| AC-8: focus, dubbele activering, asChild-capture/naam, submit, menu en herstel | `src/core/web/ui/button-busy.test.tsx`, `src/core/web/ui/dropdown-menu-busy.test.tsx` |
| AC-6/9/10: alle tonen en voorbeelden, native Space/pijltjestoetsen, mobiel/desktop, licht/donker, CSP en axe | `e2e/ui-kit-basics.spec.ts`, `check:catalogus`, bestaande `test/ui/contrast.test.ts` |

De tabel beschrijft de testdekking; de werkelijke uitslagen en gevalideerde commit staan in de bouw-PR.

## Typografie en layout

Spec: [typografie-en-layout](specs/typografie-en-layout.md). In `features/` komen typografie en kleur uit deze
componenten, niet uit utility-klassen; layout-klassen mogen blijven.

- `Text` voor lopende tekst: `as` (`p`, `span`, `div`), `size` (`sm`, `base`), `tone` (`default`, `muted`) en `weight`
  (`normal`, `medium`). Native props zoals `aria-live` gaan door (`src/core/web/ui/text.tsx`).
- `Heading` voor koppen binnen een scherm, `level` 2 t/m 4. De enige `h1` blijft `PageTitle`/`PageHeader`;
  `Section` gebruikt `Heading level={2}` (`src/core/web/ui/heading.tsx`, `src/web/ui/section.tsx`).
- `Stack` (verticaal) en `Inline` (horizontaal, loopt door op smalle schermen) delen één afstandsschaal `xs`–`xl`
  (`src/core/web/ui/stack.tsx`, `src/core/web/ui/inline.tsx`). `Container` bestaat nog niet.

Let op: `Text` zet standaard `text-base` en `text-foreground`. Binnen een gekleurde container (zoals een `Notice` met
`tone="error"`) kies je dus een expliciete `tone`, of laat je `Text` weg. Tailwind preflight haalt de opsommingstekens
van `Stack as="ul"`/`"ol"` weg; Safari/VoiceOver kan dan de lijstsemantiek laten vallen.

Voorbeelden: `src/web/features/design-system/typography-examples.tsx`. Bewijs per criterium: de tests met
`typografie-en-layout/AC-*` in de naam.

## Thema en tokens

Spec: [semantische-tokens](specs/semantische-tokens.md). Een app overschrijft alleen semantische tokens, in
`src/web/styles/theme.css` (geïmporteerd ná de core-index, `src/web/styles/app.css:2-3`); de standaard staat in
`src/core/web/styles/semantic.css`. Elk token met klasse, standaard, app-waarde en `bestand:regel`:
`node scripts/kit/feiten.mjs tokens` (een naam in `theme.css` die niet in `semantic.css` staat: `onbekend`, vaak een
tikfout; een override van een token zonder groep, zoals `--radius`: `overig`). Zichtbaar in de sectie "Tokens" op `/design-system` (`src/web/features/design-system/tokens-examples.tsx`), met
`TokenSwatch` en `TypeSample` uit `src/web/ui`; die zijn alleen voor de catalogus.

- Lettertype: `--font-family-sans` en `--font-family-mono` (standaard de systeemstack). Tekstschaal: `--type-{sm,base,lg,xl,2xl}`
  met `--type-*-leading`. Gewicht: `--weight-{normal,medium,semibold}`. Andere maten en gewichten (`text-xs`, `text-3xl`,
  `font-bold`, `font-serif`) bestaan niet: `src/core/web/styles/index.css` reset ze in `@theme`. Meer nodig? Stel een
  variant voor.
- Dichtheid: `--density-space` is de basis van alle afstanden en maten (`p-4`, `gap-2`, `w-*`, `size-*`: 4 × de basis bij
  `p-4`); `--density-control` is de hoogte van bediening en moet een lengte zijn (`rem` of `px`), anders vervalt de
  ondergrens. `--control-h` (`src/core/web/styles/components.css:4`) houdt die op minstens 44 px.
- Eigen lettertype: zet het woff2-bestand met zijn licentiebestand (`LICENSE*` of `OFL*`) in `src/web/styles/fonts/`,
  declareer `@font-face` in `theme.css` met een relatieve `url()` en `font-display: swap`, en zet de familie vóór de
  systeemstack in `--font-family-sans`. Alleen lettertypen waarvan de licentie zelf hosten toestaat (bijvoorbeeld OFL 1.1
  of Apache 2.0); de PR noemt lettertype, versie en licentie. Geen externe URL of CDN-`@import` (de CSP staat dat niet toe).
  Een woff2 onder 4 KB zou Vite als `data:` inlinen, wat de CSP blokkeert.
- Status: `--success`, `--warning` en hun `-foreground` (`src/core/web/styles/semantic.css:20-23`, donker `:81-84`), als
  `bg-*`, `text-*` en `border-*`. Ze werken als tekst op `--background`/`--card` én als vlak met de voorgrond; een eigen
  waarde moet in licht en donker 4,5:1 halen (`test/ui/contrast-status.test.ts`). `StatusBadge` en `Notice` hebben de
  tonen `success` en `warning`; `Notice` geeft daarbij `role="status"`, alleen `error` is `role="alert"`.
- Lagen: `z-sticky` < `z-dropdown` < `z-overlay` < `z-modal` < `z-toast` (`--layer-*`, `src/core/web/styles/components.css:8-12`).
  Een `<dialog>` staat in de top layer en heeft geen z-index nodig; de skiplink gebruikt `focus:z-toast`.
- Beweging: `duration-fast` (150 ms, ook de standaard van `transition-*`), `duration-normal` (200 ms), `ease-standard` en
  `ease-out` (`--motion-*`, `src/core/web/styles/semantic.css:58-61`); `ease-in` en `ease-in-out` bestaan niet. Bij
  `prefers-reduced-motion` kort de globale regel in `src/core/web/styles/index.css` elke overgang in tot 0,01 ms, ook
  als een app langere duren zet. Kale getallen (`z-50`, `duration-200`) horen niet in de kit
  (`test/ui/semantische-tokens-3b.test.ts`, AC-15).

Een ontwerp overnemen (HTML-bestand, URL, afbeelding of niets): de skill `ontwerp-overnemen`
(`.claude/skills/ontwerp-overnemen/SKILL.md`, spec [ontwerp-overnemen](specs/ontwerp-overnemen.md)). Zonder referentie
blijft de bestaande stijl de basis; met een referentie meet `node scripts/kit/ontwerp-meten.mjs <bron> --naam <naam>`
screenshots op 375 en 1280 px en de berekende stijlen (`oklch`, `rem`) naar `.runner-output/ontwerp/<naam>/` (door git
genegeerd; exitcode 3 zonder Chromium). De vertaling naar tokens en componenten staat in `docs/ontwerp/<bron>.md`, volgens
[het sjabloon](ontwerp/_template.md).

Bewijs: `test/ui/semantische-tokens.test.ts`, `test/ui/semantische-tokens-3b.test.ts`, `test/ui/contrast-status.test.ts`,
`e2e/semantische-tokens.spec.ts` en `e2e/semantische-tokens-beweging.spec.ts` (`semantische-tokens/AC-*`).
