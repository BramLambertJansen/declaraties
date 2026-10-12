---
paths:
  - "src/web/**"
  - "src/core/web/**"
---

# Regels voor `src/web` en `src/core/web`

- `src/core/web` is van de template (ADR 0008): in een app niet wijzigen. Basiskit, `AsyncView`, `Form`, API- en auth-client
  en tokens staan daar; de app importeert ze via `src/web/ui` (barrel) en `src/web/lib/api.ts`.
- Eerst zoeken wat er is: componenten in `src/web/ui` (her-exporteert core), voorbeelden op `/design-system`. Bestaand recept uitbreiden,
  geen nieuw component ernaast. Een variant leid je af in `src/web/ui` uit de basis en variantkaart van core. Past niets: stop en stel een variant voor.
- Route: bestandsroute in `routes/`, met `beforeLoad`-guard die `can()` controleert en een ErrorBoundary.
  Alleen inlog-, aanmeld- en resetschermen zijn publiek (framework §3).
- Inloggen alleen via `src/core/web/lib/auth.ts` (Better Auth-client). Bij 401 van de API naar het inlogscherm.
- Data per resource in `features/<resource>/queries.ts` (key-factory, hooks, mutaties). Een mutatie invalideert
  haar eigen resource plus wat de spec onder "raakt ook" noemt. Optimistisch alleen als de spec het vraagt.
- Laden, leeg en fout altijd via `<AsyncView>`. Formulieren via `<Form>`/`<FormField>` met het gedeelde zod-schema;
  verzendknop uit tijdens de mutatie; serverveldfouten via `setError`.
- UI-state (filters, tabs, paginering) in de URL. Geen globale store.
- Styling in `features/`: alleen layout-utilities (flex, grid, gap, padding, breedte) of `Stack`/`Inline`/`Container`.
  Kleur, radius, schaduw en typografie komen uit componenten.
- Responsive met breakpoints en container queries. Wat echt per formaat verschilt: één gedeelde hook, niet per component.
- Alle zichtbare tekst in `src/web/copy`, Nederlands, volgens de woordenlijst ("Annuleren", niet "Annuleer").
- Datums en bedragen alleen via `lib/format.ts`.
- Schermwerk is pas klaar na `pnpm ui:check` (375 en 1280 px + axe).
- Aanraakdoelen ≥ 44 px en zichtbare focusring zitten in de recepten; nooit uitschakelen.

## Besloten, nog niet gebouwd

Gebouwd (stuk 3b): bestandsroutes in `src/web/routes` (TanStack Router; `routeTree.gen.ts` is gegenereerd), de router in
`src/web/lib/router.ts` met `RouteError`/`NotFound` als ErrorBoundary per route, de guard `guard('<permissie>')` uit
`src/web/lib/session.ts` voor `beforeLoad`, `createQueryClient` (401 → `/login`), `AsyncView`, `Form`/`FormField`/`useZodForm`,
`format` en `readWebEnv`/`isDev`, foutteksten in `src/web/copy/errors.ts`. Componenttests in het Vitest-project `web` (jsdom).
Gebouwd (stuk 3c): tokens in drie lagen (`src/core/web/styles`, thema van de app in `src/web/styles/theme.css`), de basiskit
Button, Input, Field, Card, Dialog (native `<dialog>`, geen Radix: CSP), DropdownMenu, NavLink en de layoutblokken AppShell,
Sidebar (`visibleNavItems` per rol), Topbar en CenteredCard; alles via `src/web/ui/index.ts`. `/design-system` in de app achter `guard('design-system:read')`, alleen voorbeelddata (ADR 0015);
`src/web/dev/` is leeg in de productiebundel (alleen dynamisch importeren). Contrasttest `test/ui/contrast.test.ts` (nieuwe
Button-variant = nieuwe rij), `scanAxe` in `e2e/support/axe.ts`.
Gebouwd (stuk 3d, accountbeheer): de auth-client `src/core/web/lib/auth.ts` (via `src/web/lib/auth.ts`), schermen in
`src/web/features/*` met routes in `src/web/routes` (`_app` = ingelogde layout met guard), Table, Select, PageHeader, Notice en
QrCode in de kit. Voorbeeld van een scherm door alle lagen: `docs/gouden-pad.md`.
Gebouwd (stuk 4): `pnpm check:catalogus` (uitzonderingen met reden in `scripts/kit/catalogus.mjs`) en de woordenlijsttest
`src/web/copy/woordenlijst.test.ts`.
`scanAxe` zonder uitzonderingen: twee lintregels (axe-import en axe-uitzondering in `eslint.config.js`) houden ze tegen.
Nog niet: screenshot-baselines van de catalogus in de Playwright-image (roadmap, stuk 3c).
