# Gouden pad: een feature door alle lagen

Kopieer van accountbeheer (spec `docs/specs/accountbeheer.md`). Volgorde zoals de werkstraat (framework §8): eerst de spec,
dan van database naar scherm. Elke stap verwijst naar het bestand dat het voordoet.

## Begin met `pnpm new:resource <naam>`

Voor een resource met een eigenaar per rij (ADR 0016). Naam: meervoud, kebab-case, Engels (`invoices`). Alleen de hoofdsessie
draait hem; `--dry-run` toont het plan zonder te schrijven, en bestaat een doel al, dan schrijft hij niets.

1. **Zonder spec:** `pnpm new:resource <naam>` maakt `docs/specs/<naam>.md` (status `voorstel`) met de afgeleide routes,
   permissies en policies; rollen, velden, zichtbaarheid voor een admin, verwijderde accounts en teksten staan als open vraag.
2. **Spec `goedgekeurd`:** `pnpm new:resource <naam> --rollen user,admin` maakt werkstraat-stap 2 (contract, handlers die 501
   geven), zonder tests:
   - nieuw: `src/shared/contracts/<naam>.ts`, `db/migrations/<tijdstempel>_<naam>.sql` (tabelpatroon uit
     [de security-review](reviews/2026-10-10-tabelpatroon.md); een naam met `-` wordt `_` in SQL), `src/api/routes/<naam>.ts`,
     `src/web/features/<naam>/queries.ts`, `src/web/features/<naam>/<naam>-page.tsx`, `src/web/routes/_app/<naam>.tsx`
     (en `src/web/routeTree.gen.ts` opnieuw);
   - gewijzigd: `src/shared/contracts/index.ts`, `src/shared/ids.ts` en `db/ids.json` (brand `<Naam>Id`), `src/shared/limits.ts`
     (paginagrootte), `src/web/copy/ui.ts` (teksten, te vervangen door die uit de spec), `src/web/lib/nav.ts` (menu-item);
   - gate-bestanden, als afgedrukte wijziging die de hoofdsessie met Edit zet: `src/shared/permissions.ts`,
     `src/shared/permissions.test.ts`, `src/api/app.ts` en `src/web/routes.test.tsx` (menu per rol). Noem de twee
     testwijzigingen met reden in de PR.
3. Daarna de werkstraat: de tester schrijft de tests (pgTAP per policy, integratie, e2e), de developer voegt de velden toe in
   een nieuwe migratie met kolomgrants en bouwt de handlers. De stappen hieronder gelden dan per bestand.

`pnpm check:new-resource` bewijst in een tijdelijke kopie dat de uitvoer `pnpm gate:fast` haalt (eigen job in CI).

## Stappen

1. **Spec** met status `goedgekeurd`: `docs/specs/accountbeheer.md` (routes, foutcodes, teksten, ACs, testplan).
2. **Migratie** met RLS, grants en policies, of een view van `app_definer`: `db/migrations/*_user_roles.sql`, `*_accounts_view.sql`.
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
   `invite-dialog.tsx`. Een lijst met zoeken en sorteren in de search params (`defineListSearch`, `useListSearch`, `ListToolbar`;
   spec [lijstpagina](specs/lijstpagina.md)); `new:resource` maakt die uit de sjablonen, met de sorteringen nieuwste en oudste.
10. **Route** met guard: `src/web/routes/_app/admin/accounts.tsx`; menu-item per rol in `src/web/lib/nav.ts`.
11. **E2E** per AC met axe op 375 en 1280 px: `e2e/accounts.spec.ts`.

Bewijs per PR: `pnpm gate:fast`, `pnpm test:db` en `pnpm ui:check` (de laatste twee in de runner, door de eigenaar).
