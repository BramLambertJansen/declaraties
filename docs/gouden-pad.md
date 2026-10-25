# Gouden pad: een feature door alle lagen

Voor functionele UI-wijzigingen aan bestaande componenten in de template volstaat de mini-spec met
`scope: functionele-ui`, samen met code, tests en gebruiksdocumentatie in één PR (ADR 0056). De
[agentdoorloop](operations/agent-doorloop.md#feature-lane-en-mini-spec-adr-0046) beschrijft scope en bouwbewijs.
De bestaande toast-API is `useToast().success/error`, met `ToastProvider` in `src/web/main.tsx` en `Toaster` in AppShell.
Werk dit gebruiksvoorbeeld bij wanneer de plaatsing verandert; daarvoor hoeft de agentinstructie niet mee te wijzigen.

Kopieer van accountbeheer (spec `docs/specs/accountbeheer.md`). Volgorde zoals de werkstraat (framework §8): eerst de spec,
dan van database naar scherm. Elke stap verwijst naar het bestand dat het voordoet.

## Begin met `pnpm new:resource <naam>`

Voor een resource met een eigenaar per rij (ADR 0047). Naam: meervoud, kebab-case, Engels (`invoices`). Alleen de hoofdsessie
draait hem; `--dry-run` toont het plan zonder te schrijven, en bestaat een doel al, dan schrijft hij niets.

1. **Zonder spec:** `pnpm new:resource <naam>` maakt `docs/specs/<naam>.md` (status `voorstel`) met de afgeleide routes,
   permissies en policies; rollen, velden, zichtbaarheid voor een admin, verwijderde accounts en teksten staan als open vraag, bewust vooraan, onder een `OV-1 ⚠ open`-regel die `goedgekeurd` blokkeert tot de eigenaar ze beantwoordt; de sectie "Kopieer de vorm van" verwijst naar `src/api/routes/accounts.ts`.
2. **Spec `goedgekeurd`:** `pnpm new:resource <naam> --rollen user,admin` maakt werkstraat-stap 2 (contract, handlers die 501
   geven), zonder tests:
   - nieuw: `src/shared/contracts/<naam>.ts`, `db/migrations/<tijdstempel>_<naam>.sql` (tabelpatroon uit
     [de security-review](reviews/2026-10-10-tabelpatroon.md); een naam met `-` wordt `_` in SQL; de migratie registreert de tabel ook in `app.retention`, framework §6), `src/api/routes/<naam>.ts`,
     `src/web/features/<naam>/queries.ts`, `src/web/features/<naam>/<naam>-page.tsx`, `src/web/routes/_app/<naam>.tsx`
     (en `src/web/routeTree.gen.ts` opnieuw);
   - gewijzigd: `src/shared/contracts/index.ts`, `src/shared/ids.ts` (aangemaakt als hij ontbreekt) en `db/ids.json` (brand `<Naam>Id`), `src/shared/limits.ts`
     (paginagrootte), `src/web/copy/ui.ts` (teksten, te vervangen door die uit de spec), `src/web/lib/nav.ts` (menu-item),
     `src/shared/permissions.ts` (`<naam>:read` en `<naam>:write`) en `src/api/app.ts` (de routes); die twee zijn geen
     gate meer (ADR 0046 punt 32), het risico-overzicht van de diff-guard noemt de nieuwe permissie en routes;
   - bestaande tests, als afgedrukte wijziging die de hoofdsessie met Edit zet: `src/shared/permissions.test.ts` en
     `src/web/routes.test.tsx` (menu per rol). Noem de twee testwijzigingen met reden in de PR;
   - de declaratie voor de securitysuite, als afgedrukte wijziging (`--- test/security/resources.ts`): één regel per route in
     `routeClassificatie` (scope `eigenaar`) en één regel in `resources`, met de samples als `INVULLEN`. `createTweede` is
     verplicht voor de cursorproef: A en B krijgen ieder twee verschillende rijen. `rol` kiest een toegestane testrol
     (`user` indien toegestaan, anders de opgegeven rol); admin-acteurs krijgen echte MFA-sessies. De generator schrijft
     dit bestand niet (`scripts/kit/new-resource.mjs`, `declaratieInhoud`).
3. Daarna de werkstraat: de tester schrijft de tests (pgTAP per policy, integratie, e2e), zet de declaratie in
   `test/security/resources.ts` en vult de samples in (tot dan is `pnpm test:db` rood), de developer voegt de velden toe in
   een nieuwe migratie met kolomgrants en bouwt de handlers. De stappen hieronder gelden dan per bestand.

`pnpm check:new-resource` bewijst in een tijdelijke kopie dat de uitvoer `pnpm gate:fast` haalt (eigen job in CI, niet in elke
`gate:fast`). De generator voegt geen dependency toe: de route-tree komt van de al geïnstalleerde `@tanstack/router-plugin`
(ADR 0047 punt 8–9).

## Stappen

1. **Spec** met status `goedgekeurd`: `docs/specs/accountbeheer.md` (routes, foutcodes, teksten, ACs, testplan).
2. **Migratie** met RLS, grants en policies, of een view van `app_definer`: `db/migrations/*_user_roles.sql`, `*_accounts_view.sql`; een functie van `app_definer` die in `better_auth` schrijft: `*_account_blocking.sql` (ADR 0043).
   pgTAP per policy: `db/tests/user_roles.sql`, `db/tests/accounts.sql`; nieuwe functie → regel in `db/tests/functies.sql`.
3. **Schema genereren**: `pnpm db:generate` (snapshot en `src/api/db/schema.ts`); nieuwe id-kolom → `db/ids.json`.
4. **Permissie** en **foutcode**: `src/shared/permissions.ts`, `src/shared/errors.ts`, tekst in `src/web/copy/errors.ts`.
5. **Contract** (zod, `.strict()`): `src/shared/contracts/accounts.ts`, opgenomen in `src/shared/contracts/index.ts`.
6. **Route** met `defineRoute` en `tx`: `src/api/routes/accounts.ts`, opgenomen in `src/api/app.ts`. Iets buiten de database
   via `ctx.services`: `src/api/services.ts`.
7. **Integratietests** (verboden rol, admin zonder MFA, ongeldige input, ACs): `test/api/accounts.int.test.ts` met de testkit
   (`beginTestDb`, `asUser`).
8. **Queries** (key-factory met de search in de key, hooks, `placeholderData`, mutaties die invalideren): `src/web/features/accounts/queries.ts`.
9. **Scherm** met kitcomponenten uit `src/web/ui` en teksten uit `src/web/copy/ui.ts`: `src/web/features/accounts/accounts-page.tsx`,
   `invite-dialog.tsx`. Een lijst met zoeken en sorteren in de search params (`defineListSearch`, `useListSearch`, `uniqueById`, `ListToolbar`;
   spec [lijstpagina](specs/lijstpagina.md)); `new:resource` maakt die uit de sjablonen, met de sorteringen nieuwste en oudste.
10. **Route** met guard: `src/web/routes/_app/admin/accounts.tsx`; menu-item per rol in `src/web/lib/nav.ts`.
11. **E2E** per AC met axe op 375 en 1280 px: `e2e/accounts.spec.ts`.

Bewijs per PR: `pnpm gate:fast`, `pnpm test:db` en `pnpm ui:check`. De agent voert de veilige runner uit of verzamelt de werkelijke CI-uitslag op de juiste SHA; zie [agentdoorloop](operations/agent-doorloop.md).
