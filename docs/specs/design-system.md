---
status: gebouwd # gebouwd in PR #51
namespace: design-system
---

# Design system: de componentcatalogus als beveiligde pagina in de app

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

De componentcatalogus `/design-system` (nu alleen in dev) wordt een echte pagina in de app: ook in de productiebundel, binnen de
AppShell, achter `guard('design-system:read')` (alleen admin), zonder axe-fouten en binnen het bundelbudget. Architectuurbesluit:
[ADR 0015](../adr/0015-design-system-in-de-app.md) (`voorgesteld`).

## Huidige stand (feiten, 2026-10-10)

- Route `src/web/routes/design-system.tsx`: buiten de layout `_app`, zonder guard; `beforeLoad` gooit `notFound()` buiten dev; de pagina
  komt lazy uit `src/web/dev/design-system-page.tsx`.
- `devOnlyModules()` in `vite.config.ts` maakt bij `build` van elke module uit `src/web/dev/` een lege module. Zolang de pagina daar
  staat, bestaat zij niet in productie, wat er ook aan de route verandert.
- Het admin-dashboard toont lokaal de link "Design system" via `src/web/dev/dashboard-links.tsx` (PR #39; spec accountbeheer, rij Dashboard).
- `check:catalogus` (`scripts/kit/catalogus.mjs`) leest de catalogus uit het vaste pad `src/web/dev/design-system-page.tsx`.
- De catalogus toont een volledige demo-`AppShell` (eigen `<main>`, `<aside>`, `<header>`, navigatie "Hoofdmenu", knoppen "Menu openen" en
  "Profielmenu"). Dat gaat nu goed omdat de pagina zelf niet in een AppShell staat.
- Framework §3 (uitzondering op de `can()`-guard), §6 ("`/design-system` en `/design` bestaan alleen in dev-builds") en §7 ("alleen in dev")
  leggen de dev-only-regel vast; roadmap stuk 3c ook.
- Bundelbudget: `test/ui/bundle-budget.test.ts` (JS totaal 260 kB, grootste chunk 115 kB, CSS 15 kB gzip; bij invoering 209,8 / 91,7 / 5,1 kB).
  Die test draait in het Vitest-project `unit`, dus in `test:unit` en daarmee in `gate:fast` (roadmap stuk 4, #38), niet in `gate:slow`.
- Dev-only-bewijs: `test/ui/bundle.test.ts`, test "bevat de catalogus en de rolwisselaar uit src/web/dev niet (spec accounts/AC-8)".

## Rollen en wie wat ziet

| Rol | `/design-system` | Link "Design system" op het dashboard |
|---|---|---|
| anoniem | naar `/login` (guard) | — (geen dashboard) |
| `user` | "Je hebt geen toegang tot deze pagina." | — (geen dashboard) |
| `admin` zonder MFA-sessie | naar inloggen (`MFA_REQUIRED`), zoals `/admin` | — |
| `admin` met MFA | de catalogus, binnen de AppShell | zichtbaar (`can(actor, 'design-system:read')`) |

- Nieuwe permissie `design-system:read` met rollen `['admin']`; core eist MFA voor elke admin-permissie.
- De guard verbergt de pagina; hij beschermt geen geheim. De catalogus komt in de statische productiebundel en die kan iedereen
  downloaden. De pagina toont daarom alleen voorbeelddata, nooit echte data of API-aanroepen (AC-10).
- De dev-rolwisselaar blijft alleen lokaal (ADR 0014); deze spec raakt hem niet.

## Datawijzigingen (met grants)

n.v.t. — geen migratie, tabel, policy of grant; de pagina toont geen data en roept geen API aan.

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| — (schermroute, geen API) | `/design-system` (kindroute van `_app`: `src/web/routes/_app/design-system.tsx`) | `design-system:read` | geen API-route; de guard toont bij `FORBIDDEN` "Je hebt geen toegang tot deze pagina." en stuurt bij `UNAUTHENTICATED`/`MFA_REQUIRED` naar `/login` |

- Geen nieuwe API-route en geen nieuwe foutcode. De permissie komt in `src/shared/permissions.ts` (beschermd pad) en daarmee in de
  tabeltest per verboden rol (`src/shared/permissions.test.ts`).

## Hergebruik en UX

- **Bestaande componenten** (uit `node scripts/kit/feiten.mjs`): de catalogus toont Button, Card*, CenteredCard, Dialog, DropdownMenu,
  Field, Form, FormField, Input, Notice, PageHeader, QrCode, Select, Table* en ThemeToggle. `AppShell` toont hij niet meer los: de pagina
  staat zelf in de echte AppShell (uitzondering in `scripts/kit/catalogus.mjs`). De pagina gebruikt `PageHeader` voor de titel (in plaats
  van de eigen `<h1>` met `ThemeToggle`: de themaschakelaar staat al in de topbalk) en op het dashboard `Button asChild` met `Link`, zoals
  "Accounts". Geen sidebar-item en geen nieuw component.
- **Staten per scherm:** laden: de lazy chunk laadt (router-pending, zoals de andere lazy routes); leeg, bezig, gelukt, verouderd:
  n.v.t. (geen data); fout: de ErrorBoundary van de route (`RouteError`), en "Je hebt geen toegang tot deze pagina." bij `FORBIDDEN`.
  De voorbeelden in de catalogus (formulier, dialoog) houden hun eigen demo-staten.
- **Alle zichtbare tekst letterlijk:**

| Plek | Tekst |
|---|---|
| Pagina | titel "Design system" (bestaand), uit `src/web/copy/ui.ts` |
| Dashboard | link "Design system" (bestaand), uit `src/web/copy/ui.ts`; zichtbaar voor wie `design-system:read` heeft in plaats van "alleen lokaal" |
| Sectietitels en voorbeelden | ongewijzigd ten opzichte van `src/web/dev/design-system-page.tsx`, bij de catalogus (voorbeelden, geen app-teksten); de sectie "AppShell" vervalt |
| Sectie Button | de variantnamen (`default`, `outline`, …) blijven als code-namen zichtbaar (besluit eigenaar) |

  Een nieuwe zichtbare tekst die de developer nodig blijkt te hebben, staat hier niet en vraagt eerst akkoord van de eigenaar.
- **Focusvolgorde en toetsenbord:** zoals elke pagina binnen de AppShell: menuknop (smal), topbalk, inhoud. Binnen de inhoud de
  secties van boven naar beneden; dialoog en menu: Esc sluit en de focus gaat terug naar de knop (bestaande e2e-afspraken).
  Er is precies één `main`, één navigatie "Hoofdmenu" en één knop "Profielmenu" op de pagina.

## Besluiten

Besluiten van de eigenaar (2026-10-10, doorgegeven via de coördinator): bij elke vraag de aanbeveling van de architect.

| Vraag | Besluit | Verworpen |
|---|---|---|
| OV-1 Rol | Nieuwe permissie `design-system:read`, rollen `['admin']`; één regel erbij in de tabeltest `src/shared/permissions.test.ts` | ook `user`; bestaande `accounts:read` of `app.use` |
| OV-2 Pad | `/design-system`, kindroute van `_app` | `/admin/design-system` (raakt verwijzingen in `scripts/`, `.claude/`, framework) |
| OV-3 Menu-item | Geen sidebar-item; de bestaande dashboardlink krijgt de voorwaarde `can(actor, 'design-system:read')` in plaats van `isDev` | sidebar-item; geen link |
| OV-4 Teksten | Paginatitel en dashboardlink in `src/web/copy/ui.ts`; voorbeeldteksten bij de catalogus; Engelse variantnamen blijven als code-namen | alles in copy; alles bij de catalogus |
| OV-5 Geneste AppShell | De demo-AppShell vervalt; `AppShell` krijgt een uitzondering met reden in `scripts/kit/catalogus.mjs` ("de catalogus staat zelf in de AppShell") | `preview`-variant in core; iframe (CSP `frame-ancestors 'none'`); route buiten `_app` |
| OV-6 Bundelbudget | Lazy chunk; budget blijft 260 / 115 / 15 kB; nieuwe test: de catalogus zit niet in de entry-chunk. Overschrijdt de meting het budget, dan stopt de developer en vraagt de eigenaar | budget verhogen; lazy chunks buiten het totaal |
| OV-7 Bundeltest | `test/ui/bundle.test.ts`: de asserties op 'Design system' en 'Dialoog openen' eruit, testnaam "bevat de rolwisselaar uit src/web/dev niet (spec accounts/AC-8)" | de test geheel vervangen |
| OV-8 Plek | `src/web/features/design-system/`, eigen klassen vervangen door `PageHeader` en bestaande componenten; lukt dat niet, dan stopt de developer en stelt een variant voor | `src/web/ui/design-system/` |
| OV-9 ADR | [ADR 0015](../adr/0015-design-system-in-de-app.md), status bij het besluit `voorgesteld`, inmiddels `geaccepteerd` | alleen de spec |

**Gewijzigde bestaande tests** (elk met reden in de PR, label `gate-wijziging`, akkoord van de eigenaar):
- `test/ui/bundle.test.ts` — reden: "spec design-system: de catalogus hoort nu in de productiebundel; het dev-only-bewijs blijft voor de rolwisselaar".
- `e2e/design-system.spec.ts` — logt eerst in als admin met MFA; de test "profielmenu … toont de initialen AV" verandert, want de demo-shell met "Anna de Vries" vervalt.
- `e2e/accounts.spec.ts`, test "themaschakelaar in de topbalk … lokaal een link naar het design system" — "lokaal" vervalt in naam en gedrag.
- `src/web/dev/design-system-page.test.tsx` — verhuist naar `src/web/features/design-system/`; inhoud gelijk.
- `src/shared/permissions.test.ts` — één regel `'design-system:read': ['admin']` in `expected`.
- `test/rails/catalogus.test.ts` — alleen als die het pad van de catalogus of de uitzonderingenlijst vastlegt.

## Acceptatiecriteria

Aanvulling eigenaar 2026-10-13 ([ADR 0028](../adr/0028-volledige-ui-catalogus.md)): de uitzonderingen uit OV-5 en de oorspronkelijke
AC-9 vervallen. Broninventarisatie, hergebruik via de barrel en bereikbare voorbeelden gelden voor de hele UI-kit. Dezelfde bronindex
staat zoekbaar op de pagina (zoekparameter `q`) en in de agentfeiten; `AsyncView` gebruikt uitsluitend lokale voorbeelddata. De
schermvoorbeelden gebruiken `preview` om geen extra landmarks of documenttitels te maken. Guard, permissie, lazy chunk en bundelbudget blijven gelijk.

- **design-system/AC-1** — Gegeven een anonieme bezoeker, wanneer hij `/design-system` opent, dan komt hij op `/login` (met `redirect` naar `/design-system`).
- **design-system/AC-2** — Gegeven een `user`, wanneer hij `/design-system` opent, dan ziet hij "Je hebt geen toegang tot deze pagina.".
- **design-system/AC-3** — Gegeven een admin met MFA, wanneer hij `/design-system` opent, dan ziet hij de kop "Design system" binnen de AppShell
  van de app; de route bestaat ook in een productiebuild (bewijs: AC-6).
- **design-system/AC-4** — Gegeven een admin zonder MFA-sessie, wanneer hij `/design-system` opent, dan wordt hij naar inloggen gestuurd
  (`MFA_REQUIRED`), zoals bij `/admin`.
- **design-system/AC-5** — Gegeven een admin met MFA op `/design-system`, wanneer de pagina op 375 en 1280 px, licht en donker, wordt gescand,
  dan geeft `scanAxe` geen fouten, is er geen CSP-schending en geen horizontaal scrollen, en heeft de pagina precies één `main`, één
  navigatie "Hoofdmenu" en één knop "Profielmenu".
- **design-system/AC-6** — Gegeven de productiebundel, dan staat "Dialoog openen" in een andere chunk dan de entry-chunk, en bevat de bundel
  "Lokaal inloggen als" en "Rol wisselen (alleen lokaal)" niet (accounts/AC-8 blijft).
- **design-system/AC-7** — Gegeven de productiebundel, dan blijft `test/ui/bundle-budget.test.ts` ongewijzigd groen (260 / 115 / 15 kB gzip).
- **design-system/AC-8** — Gegeven een admin met MFA op het dashboard, wanneer hij op "Design system" klikt, dan opent `/design-system`;
  gegeven een actor zonder `design-system:read`, dan rendert het dashboard de link niet (`can()`), en er is geen sidebar-item "Design system".
- **design-system/AC-9** — Gegeven `pnpm check:catalogus`, dan ontdekt hij alle componenten in beide UI-mappen, eist publieke barrel-exports
  en bereikbare voorbeelden met eindige stringvarianten op `src/web/features/design-system/`, zonder uitzonderingen. De bestaande AppShell
  en providers tellen via hun renderpad; een titel, import of ongebruikt voorbeeld telt niet.
- **design-system/AC-10** — Gegeven `/design-system` geopend door een admin met MFA, dan doet de pagina geen enkele aanroep naar `/api/`
  buiten wat de AppShell zelf al doet (`/api/me`).

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Sessie verloopt terwijl de catalogus open is | Pas bij de volgende navigatie of guard naar `/login` met "Je sessie is verlopen. Log opnieuw in."; de pagina zelf vraagt niets op | `UNAUTHENTICATED` |
| Lazy chunk kan niet laden (netwerk, nieuwe deploy) | ErrorBoundary van de route (`RouteError`) | — |
| Iemand opent de JS-chunk van de catalogus direct zonder in te loggen | Kan; statische bundel. Daarom alleen voorbeelddata (AC-10, ADR 0015) | — |
| Een component of variant komt erbij | `check:catalogus` faalt tot hij in de catalogus staat (ongewijzigd) | — |
| Voorbeeldformulier versturen | Doet niets buiten de pagina (`Promise.resolve()`), geen API | — |
| Admin wordt gedegradeerd terwijl de pagina open is | Pas bij de volgende guard (navigatie) "Je hebt geen toegang tot deze pagina." | `FORBIDDEN` |

## Raakt ook

- `vite.config.ts` (`devOnlyModules`: "catalogus" uit het commentaar; de plugin blijft voor de rolwisselaar); `src/web/routes/design-system.tsx`
  wordt `src/web/routes/_app/design-system.tsx` met guard; `src/web/routeTree.gen.ts` (gegenereerd); `src/web/dev/dashboard-links.tsx` vervalt
  en `src/web/features/dashboard/dashboard-page.tsx` toont de link via `can()`; `src/web/copy/ui.ts` krijgt de paginatitel en de linktekst.
- Beschermde paden, alleen met akkoord van de eigenaar en label `gate-wijziging`: `src/shared/permissions.ts`, `scripts/kit/catalogus.mjs`
  (pad en uitzondering `AppShell`), `docs/framework.md` §3, §6, §7, `docs/roadmap.md` stuk 3c, `.claude/rules/web.md` ("`/design-system`
  alleen in dev").
- Spec accountbeheer, rij Dashboard: "alleen lokaal ook link Design system" klopt na de bouw niet meer. Die goedgekeurde spec past alleen
  de eigenaar aan; deze spec wijzigt hem niet.
- Geen query-invalidatie, geen foutcode, geen limiet.

## Buiten scope

`/design` (prototypes uit `designs/`) blijft alleen in dev. Screenshot-baselines van de catalogus (roadmap stuk 3c, open). Nieuwe
componenten of varianten buiten de aanvulling van ADR 0028. De dev-rolwisselaar. Een sidebar-item. Live-voorbeelden met echte data.

## Testplan

- **Unit:** `src/shared/permissions.test.ts` (één regel; de tabel test `user` → `FORBIDDEN` en admin zonder MFA → `MFA_REQUIRED`);
  `src/web/routes.test.tsx` krijgt tests voor AC-1, AC-2, AC-4 en de zichtbaarheid van de dashboardlink (AC-8); de sectietest verhuist mee.
- **Bundel (unit-project):** `test/ui/bundle.test.ts` gewijzigd volgens OV-7; nieuwe test voor AC-6 (eigen chunk, niet de entry-chunk);
  `test/ui/bundle-budget.test.ts` ongewijzigd (AC-7).
- **Rails:** `pnpm check:catalogus` (AC-9).
- **E2E (`pnpm ui:check`, echte stack, CSP aan):** `e2e/design-system.spec.ts` logt eerst in als admin met MFA, daarna axe op 375 en 1280 px
  in licht en donker, CSP, geen horizontaal scrollen, één `main` (AC-3, AC-5), dialoog- en menutoetsenbord (bestaand), geen extra
  `/api/`-aanroep (AC-10); een `user` ziet de geen-toegang-melding (AC-2); `e2e/accounts.spec.ts` dashboardlink (AC-8).
- **Productiebuild:** de e2e draait tegen de Vite-devserver (`playwright.config.ts`); dat de pagina in productie bestaat, bewijst de
  bundeltest (AC-6). Een e2e tegen `vite preview` bestaat niet en valt buiten deze spec.
