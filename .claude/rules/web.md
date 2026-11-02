---
paths:
  - "src/web/**"
  - "src/core/web/**"
---

# Regels voor `src/web` en `src/core/web`

Letterlijk uit `docs/framework.md`; bij verschil wint het regelboek.

- **R-UI-02** shadcn-basiskit in `src/core/web/ui`; app-componenten en varianten in `src/web/ui`, enige importbron voor `features/`; varianten in één CVA-recept, afleiden niet forken; basiscomponent voor elke app via PR in template (0040)
- **R-UI-03** Zoek eerst met `node scripts/kit/feiten.mjs componenten`; breid recept uit; past niets: stop en stel variant voor (AGENTS, rules)
- **R-UI-01** Tokens in drie lagen: primitief (nooit direct), semantisch (enige app-laag, `src/web/styles/theme.css`), component; lijst via `node scripts/kit/feiten.mjs tokens` (0040)
- **R-WEB-01** Elke route heeft ErrorBoundary en `beforeLoad`-guard met `can()`; UI-state (filters, tabs, paginering) in URL; geen globale store, `matchMedia`, `userAgent`, `isMobile` (fw)
- **R-UIT-03** Schermroute heeft `can()`-guard; uitzondering `/login`, `/uitnodiging`; spec vóór route: uitzondering `GET /api/health`, `GET /api/ready` (0049)
- **R-WEB-03** `fetch(` alleen in API-client; inloggen alleen via `src/core/web/lib/auth.ts`; elk niet-GET-request stuurt `Content-Type` (0040, 0041)
- **R-WEB-02** `useQuery`/`useMutation` alleen in `features/<resource>/queries.ts`; mutatie invalideert eigen resource plus "raakt ook"; optimistisch alleen als spec het vraagt (rules)
- **R-WEB-04** Formulieren via `<Form>`/`<FormField>` met gedeeld zod-schema, valideren bij verlaten en daarna bij typen, verzendknop uit tijdens verzenden, serverfouten via `setError`; laden, leeg, fout via `<AsyncView>` (fw)
- **R-UI-04** In `features/` en `routes/` alleen layout-klassen of `Stack`/`Inline`; geen kleuren, arbitrary values, `!`, `dark:`, `style` (AGENTS, rules)
- **R-UI-05** Geen rauwe `<button> <input> <select> <textarea> <dialog> <a>` buiten `src/core/web/ui` en `src/web/ui`; geen hex-kleuren buiten tokens; `outline-none` alleen met `focus-visible:ring-*`; één `scanAxe(page)` zonder uitzonderingen (fw)
- **R-WEB-05** Alle zichtbare tekst in `src/web/copy`, Nederlands volgens woordenlijst, ook zod-meldingen; `src/web/copy/errors.ts` is `Record<ErrorCode, string>` (basisteksten uit `src/core/web/copy`, app-codes erbij); per-formaatverschil via één gedeelde hook (fw)
- **R-CODE-07** Bedragen in gehele centen (`Cents`); tijd `timestamptz`/ISO-string; formatteren alleen via `lib/format.ts`; grenzen alleen uit `limits.ts` (CHECK met zelfde waarde krijgt gelijkheidstest) (0040)
- **R-WEB-07** Schermwerk klaar na `pnpm ui:check` (375 en 1280 px, axe); feature volgt `docs/gouden-pad.md` (dod)
- **R-UI-06** WCAG 2.2 AA, responsive met breakpoints en container queries, `prefers-reduced-motion`, één focusring en aanraakdoel 44 px (nooit uitschakelen), contrasttest per receptvariant (fw)
- **R-UI-07** Elk component en elke eindige stringvariant heeft voorbeeld op `/design-system`; publieke componenten in `src/web/ui/index.ts`; geen uitzonderingenlijst (0048)
- **R-WEB-08** `/design-system` achter `guard('design-system:read')`, lazy, alleen voorbeelddata (echte data vraagt ADR); `/design`, dev-rolwisselaar alleen dev (0048)

Hoe (geen norm):

- `src/core/web` (basiskit, `AsyncView`, `Form`, API- en auth-client, tokens) is van de template; de app importeert via `src/web/ui` (barrel) en `src/web/lib/api.ts`. Een variant leid je af in `src/web/ui` uit de basis en variantkaart van core; voorbeelden op `/design-system`.
- Route: bestandsroute in `routes/`. Bij 401 van de API naar het inlogscherm. `queries.ts` bevat key-factory, hooks en mutaties.
- Styling: layout-utilities als gewone string (flex, grid, gap, padding, breedte); kleur, radius, schaduw en typografie uit componenten (`Text`, `Heading`); de rail `klassen` in `eslint.config.js` dwingt het af. Woordenlijst: "Annuleren", niet "Annuleer". Aanraakdoel en focusring zitten in de recepten (R-UI-06).

## Gebouwd en nog open

Gebouwd (stuk 3b): bestandsroutes in `src/web/routes` (TanStack Router; `routeTree.gen.ts` is gegenereerd), de router in
`src/web/lib/router.ts` met `RouteError`/`NotFound` als ErrorBoundary per route, de guard `guard('<permissie>')` uit
`src/web/lib/session.ts` voor `beforeLoad`, `createQueryClient` (401 → `/login`), `AsyncView`, `Form`/`FormField`/`useZodForm`,
`format` en `readWebEnv`/`isDev`, foutteksten in `src/web/copy/errors.ts`. Componenttests in het Vitest-project `web` (jsdom).
Gebouwd (stuk 3c): tokens in drie lagen (`src/core/web/styles`, thema van de app in `src/web/styles/theme.css`), de basiskit
Button, Input, Field, Card, Dialog (native `<dialog>`, geen Radix: CSP), DropdownMenu, NavLink en de layoutblokken AppShell,
Sidebar (`visibleNavItems` per rol), Topbar en CenteredCard; alles via `src/web/ui/index.ts`. `/design-system` in de app achter `guard('design-system:read')`, alleen voorbeelddata (R-WEB-08);
`src/web/dev/` is leeg in de productiebundel (alleen dynamisch importeren). Contrasttest `test/ui/contrast.test.ts` (nieuwe
Button-variant = nieuwe rij), `scanAxe` in `e2e/support/axe.ts`.
Gebouwd (stuk 3d, accountbeheer): de auth-client `src/core/web/lib/auth.ts` (via `src/web/lib/auth.ts`), schermen in
`src/web/features/*` met routes in `src/web/routes` (`_app` = ingelogde layout met guard), Table, Select, PageHeader, Notice en
QrCode in de kit. Voorbeeld van een scherm door alle lagen: `docs/gouden-pad.md`.
Gebouwd (stuk 4): `pnpm check:catalogus` ontdekt UI uit beide UI-mappen en eist barrel-exports, bereikbare voorbeelden en eindige
stringvarianten; geen uitzonderingen. Dezelfde bronindex staat in `feiten.mjs componenten` en op `/design-system` (R-UI-07). De woordenlijsttest
`src/web/copy/woordenlijst.test.ts`.
`scanAxe` zonder uitzonderingen: twee lintregels (axe-import en axe-uitzondering in `eslint.config.js`) houden ze tegen.
Toastgebruik en de plaatsing van `Toaster` staan in `docs/gouden-pad.md`; gebruik de bestaande `useToast`-API.
Lichte fixes zonder mini-spec, overige functionele UI met mini-spec; route en rollen: framework §8 (R-WERK-03, R-WERK-18).
Gebouwd (#145, #146, #150): Checkbox, RadioGroup, Textarea, StatusBadge, EmptyState, `busy` op Button en DropdownMenu, de
bijbehorende Form-velden, Combobox, FormComboboxField, Accordion, List en DescriptionList; vindbare catalogusvoorbeelden. De
actuele lijst staat in `pnpm check:catalogus` en `node scripts/kit/feiten.mjs componenten`.
Nog niet: screenshot-baselines van de catalogus in de Playwright-image (roadmap, stuk 3c).
