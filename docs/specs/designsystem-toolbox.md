---
status: gebouwd # #507
namespace: designsystem-toolbox
sjabloon: mini
scope: functionele-ui
model: sonnet
---

# Design system als toolbox voor de beheerder

## Doel

Maak de bestaande adminpagina `/design-system` overzichtelijk: tabbladen per soort, een gebruikszin per voorbeeld en een ingeklapte componentenlijst.

## Rollen en wie wat ziet

Ongewijzigd uit spec `design-system`: alleen admin met MFA via `guard('design-system:read')`; anderen zoals daar beschreven. Alleen voorbeelddata.

## Routes en foutcodes

N.v.t. — geen API-route of foutcode. De schermroute `src/web/routes/_app/design-system.tsx` krijgt naast `q` de zoekparameter `vak`
(een van de tabblad-id's hieronder; onbekend of ontbrekend: eerste tabblad, zonder fout).

## Kopieer de vorm van

- `src/web/features/design-system/design-system-page.tsx` — bestaande pagina, PageHeader en voorbeeldsecties.
- `src/web/features/design-system/component-index.tsx` — zoekveld, status en "Toon"-knop.
- `src/web/features/design-system/example-targets.ts` — groepen met focusdoel; elke groep krijgt een `vak`.
- `src/web/ui/section.tsx` — Section met de optionele props `description` en `framed`; bestaande aanroepen veranderen niet.
- `src/core/web/ui/tabs.tsx` — bestuurde Tabs (`value`, `onValueChange`); alle panelen gerenderd, inactieve met `hidden`.

## Acceptatiecriteria

- **designsystem-toolbox/AC-1** — Gegeven een admin met MFA op `/design-system`, dan ziet hij in deze volgorde: kop "Design system", de inleiding, de sectie "Componentenindex" met dichte lijst, en tabbladen "Onderdelen per soort" in de volgorde Basis, Acties, Formulieren, Meldingen en status, Gegevens tonen, Navigatie en layout, Patronen.
- **designsystem-toolbox/AC-2** — Gegeven `?vak=formulieren`, dan is Formulieren actief en zijn de andere panelen `hidden`; gegeven `?vak=onbekend` of geen `vak`, dan is Basis actief. Een ander tabblad kiezen zet `vak` in de URL.
- **designsystem-toolbox/AC-3** — Gegeven elke rij van de index, wanneer de admin op "Toon {naam}" klikt, dan is het tabblad van dat voorbeeld actief, staat `vak` in de URL als nieuwe history-stap, blijft `q` gelijk en heeft de sectie van het voorbeeld de focus.
- **designsystem-toolbox/AC-4** — Gegeven een niet-lege `q` (bij openen of tijdens typen), dan is het Accordion-item "Lijst met alle componenten" open; met lege `q` bij openen is het dicht.
- **designsystem-toolbox/AC-5** — Elke sectie uit de tabel hieronder toont haar gebruikszin letterlijk onder de titel, met het voorbeeld in een omlijst vlak (`framed`).
- **designsystem-toolbox/AC-6** — Per tabblad op 375 en 1280 px, licht en donker: `scanAxe` zonder fouten, geen horizontaal scrollen, geen CSP-schending; design-system/AC-5 blijft.
- **designsystem-toolbox/AC-7** — `pnpm check:catalogus` en `test/ui/bundle-budget.test.ts` blijven ongewijzigd groen; `scripts/kit/` wijzigt niet.
- **designsystem-toolbox/AC-8** — Openen, tabblad wisselen en "Toon" doen geen extra `/api/`-aanroep (design-system/AC-10 blijft).
- **designsystem-toolbox/AC-9** — De lijst met alle componenten heeft de kolommen Component, Tabblad, Varianten en Voorbeeld; bronpad (`src/…/x.tsx`) en importnaam staan nergens op de pagina, en zoeken op een bronpad vindt niets (B3).

## Hergebruik en UX

- **Bestaande componenten:** PageHeader, Text, Section, Field, Input, Accordion/AccordionItem, Table*, Button, Tabs. Geen nieuw component in core.
- **Staten:** ongewijzigd uit spec `design-system` (lazy chunk, RouteError); lege zoekuitslag: status "0 van {m} componenten" en een lege tabel.
- **Opbouw en tekst letterlijk:**
  1. PageHeader "Design system" (bestaand).
  2. Inleiding (Text, muted): "De gereedschapskist van deze app: alle onderdelen en stijlen waarmee schermen worden gebouwd, met live voorbeelden in het echte thema. Alles hier is voorbeelddata; niets wijzigt echte gegevens."
  3. Section "Componentenindex": tekst "Zoek een onderdeel op naam of variant. Toon opent het juiste tabblad en springt naar het voorbeeld." (vervangt de huidige alinea); veld "Component zoeken" (`q`); status "{n} van {m} componenten". De tabel staat in Accordion-item "Lijst met alle componenten". Kolommen: Component, Tabblad (label van het tabblad), Varianten, Voorbeeld (knop "Toon {naam}"). Zoeken kijkt naar naam en varianten. Geen kolommen Bron en Hergebruik (B3).
  4. Tabs, label "Onderdelen per soort", zoekparameter `vak`. Sectietitels blijven zoals nu, behalve de splitsing van "PageHeader en Notice".
- **Tabbladen, secties en gebruikszin:**

| `vak` | Tabblad | Sectie — gebruikszin |
|---|---|---|
| `basis` | Basis | Tokens — "De basis van het uiterlijk: alle andere onderdelen gebruiken deze waarden." |
| `acties` | Acties | Button — "Voor een actie. Eén primary per scherm; destructive alleen voor iets wat niet terug kan." · Button: busy — "Een knop tijdens een actie die even duurt." · DropdownMenu — "Een paar acties achter één knop, zoals een profielmenu." · DropdownMenu: busy — "Een menu-item tijdens een actie die even duurt." · CopyButton — "Een waarde zoals een adres of code met één klik kopiëren." · Dialog — "Een korte taak die de pagina even onderbreekt." · ConfirmDialog — "Een onomkeerbare actie laten bevestigen; de focus staat op Annuleren." |
| `formulieren` | Formulieren | Form, Field en Input — "Elk formulier gaat via Form; Field geeft label, uitleg en foutmelding." · Textarea, Checkbox en RadioGroup — "Lange tekst, een ja-of-nee-keuze en één keuze uit een paar opties." · Invoervelden: disabled — "Een veld dat nu niet te wijzigen is." · Invoervelden: invalid — "Een veld met een foutmelding." · Input en Select: disabled en invalid — "Uitgeschakeld en ongeldig, met label en gekoppelde fouttekst." · Formulier: toestanden — "Alle toestanden van een formulier: fouten, serverfout, bezig en uitgeschakeld." · Combobox — "Eén keuze uit een lange lijst, met zoeken." · FormComboboxField — "Een Combobox binnen een Form, met validatie." · PasswordInput en DateInput — "Een wachtwoord dat je kunt tonen, en een datum." |
| `meldingen` | Meldingen en status | Notice (nieuw, afgesplitst) — "Een melding die op de pagina blijft staan, in vier tonen." · Toast — "Een korte bevestiging na een actie, die vanzelf verdwijnt." · StatusBadge — "De status van een item in een lijst of tabel." · EmptyState en AsyncView — "Wat je toont als er nog niets is." · AsyncView — "Laden, fout, leeg en resultaat op één manier tonen." · RouteError en NotFound — "Foutschermen: iets ging mis, geen toegang, niet gevonden." |
| `gegevens` | Gegevens tonen | Table — "Een eenvoudige tabel met vaste rijen." · DataTable — "Een tabel met zoeken, filteren, sorteren, selecteren en meer laden." · List — "Items onder elkaar, elk met een eigen actie." · DescriptionList — "Kenmerken van één item: term en waarde." · Card — "Een afgebakend blok met titel, inhoud en actie." · Tabs — "Verwante inhoud op één pagina verdelen." · Accordion — "Secundaire inhoud in- en uitklappen." · Gallery — "Afbeeldingen in een raster, met preview." · QrCode — "Een QR-code, bijvoorbeeld om een authenticator-app te koppelen." |
| `layout` | Navigatie en layout | Navigatie en layout — "De zijbalk, topbalk, profielmenu en themaschakelaar rondom deze pagina zijn de echte onderdelen; op smalle schermen opent Menu openen de navigatie." · PageHeader (nieuw, afgesplitst) — "De kop van elke pagina, met titel en hoofdactie." · Breadcrumbs — "Laat zien waar een pagina in de structuur zit." · CenteredCard — "Een scherm zonder app-layout, zoals inloggen." · Text, Heading, Stack en Inline — "Tekst, koppen en afstand; gebruik deze in plaats van eigen klassen." |
| `patronen` | Patronen | ListToolbar — "Zoeken, filteren en sorteren boven een lijst." · Selectie en bulkacties — "Meerdere rijen kiezen en in één keer verwerken." · Detail bekijken en bewerken — "Een detailpagina die per blok te bewerken is, met een waarschuwing bij weggaan." · Verversen met behoud van inhoud — "Gegevens verversen terwijl de oude inhoud zichtbaar blijft." |

- **Splitsing en focusdoelen:** de groep `example-header` in `example-targets.ts` splitst in PageTitle/PageHeader (`example-header`, `layout`) en Notice (nieuw doel `example-notice`, `meldingen`). Elke groep krijgt het `vak` van haar sectie (Section-groep: `layout`; Toast- en foutprovider-groepen: `meldingen`; FormErrorSummary-groep: `patronen`; TokenSwatch/TypeSample: `basis`).
- **Gebruikszin:** alleen op de pagina (prop `description`), niet in componentbroncode of `component-metadata.ts` (B2). Bronpad en importnaam staan niet op de voorbeelden (B3).
- **Focus en toetsenbord:** zoals elke pagina in de AppShell; Tabs volgens het bestaande component (pijltjes verplaatsen, Enter activeert). "Toon {naam}" zet eerst `vak` (nieuwe history-stap, `q` blijft), daarna focus en scroll naar de sectie via `showExample`. Terug in de browser herstelt het vorige tabblad.
- **Ongewijzigd:** guard, permissie `design-system:read`, alleen voorbeelddata, geen API, lazy chunk, bundelbudget, `check:catalogus` en `scripts/kit/`. Alle panelen blijven gerenderd (`hidden`), zodat alles bereikbaar blijft vanuit `DesignSystemPage`.

## Besluiten

Eigenaar (Bram), 2026-11-03: **B1** tabbladen per soort, het tabblad in de adresbalk (`vak`). **B2** een gebruikszin per voorbeeld, alleen op de pagina. **B3** bronpad en importnaam helemaal van de pagina, ook niet in de ingeklapte lijst; die staan alleen in `feiten.mjs componenten` ([ADR 0048](../adr/0048-ui-catalogus.md), herzien in #501). Daarmee is de vroegere OV-1 beantwoord.

## Raakt ook

- `src/web/routes/_app/design-system.tsx` (`validateSearch` met `vak`); `docs/design-system-catalogue.md` (gebruiksdocs: tabbladen, `vak`, gebruikszin).
- Spec `design-system` blijft geldig; deze spec vult hem aan. ADR 0048 is herzien in #501 (B3).
- Geen migratie, policy, permissie, resource of foutcode: `check:migrations`, `check:secdef`, `test:db`, `test/security/resources.ts` en de permissietest zijn n.v.t.

## Buiten scope

Gebruikszinnen in de broncode of in `feiten.mjs` (latere stap); nieuwe componenten in core; wijzigingen in `scripts/kit/`.

## Testplan

- **Unit:** `src/web/features/design-system/*.test.tsx` (AC-1 t/m AC-5: volgorde, `vak`-fallback, Toon zet tabblad en focus, accordion bij `q`, gebruikszin per sectie) en `src/web/ui/section.test.tsx` (`description`, `framed`, standaard ongewijzigd).
- **E2E:** `e2e/design-system*.spec.ts` (AC-1–AC-3, AC-6, AC-8). Gewijzigde bestaande tests: `e2e/design-system.spec.ts`, `e2e/design-system-coverage.spec.ts`, `e2e/typografie-en-layout.spec.ts`, `e2e/ui-collections.spec.ts`, `e2e/ui-data-display.spec.ts`, `e2e/ui-kit-basics.spec.ts`, `e2e/ui-ux-patterns.spec.ts`, `e2e/input-utilities.spec.ts`, `e2e/semantische-tokens.spec.ts`, `e2e/compound-input-controls.spec.ts` openen, waar ze een sectie buiten Basis bekijken, eerst het juiste tabblad via `?vak=`. Reden: tabbladen verbergen secties buiten het actieve tabblad (deze spec); de asserties blijven, behalve dat de URL-controle in `e2e/ui-ux-patterns.spec.ts` nu ook `vak=patronen` verwacht. Voor AC-9 (B3) controleren `component-index.test.tsx`, `typografie-examples.test.tsx` en `e2e/design-system.spec.ts` niet langer bronpad en importnaam op de pagina, maar dat die ontbreken en dat het tabblad klopt.
- **Rails:** `pnpm check:catalogus` en `test/ui/bundle-budget.test.ts` ongewijzigd (AC-7).

## Open vragen

- **OV-2** — Blijft de bestaande hinttekst per groep (`text` in `example-targets.ts`) onder de knop "Toon {naam}" staan? Aanbeveling: ja, ongewijzigd; die beschrijft wat je in het voorbeeld kunt doen en is geen gebruikszin.
