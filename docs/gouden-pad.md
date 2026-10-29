# Gouden pad: een feature door alle lagen

Licht alleen voor beperkte fixes binnen bestaand gedrag; anders volledig — framework §8. Dit pad beschrijft het volledige werk.

Voor overige functionele UI-wijzigingen aan bestaande componenten in de template mag de mini-spec met
`scope: functionele-ui`, samen met code, tests en gebruiksdocumentatie in één PR (ADR 0056). De mini-spec verkort het
document, niet de rollen: architect, tester en onafhankelijke review blijven zoals framework §8 ze vraagt. De
[agentdoorloop](operations/agent-doorloop.md#feature-lane-en-mini-spec-adr-0046) beschrijft scope en bouwbewijs.
De bestaande toast-API is `useToast().success/error`, met `ToastProvider` in `src/web/main.tsx` en `Toaster` in AppShell.
Een succesmelding verdwijnt na vijf seconden actieve tijd, ook als een scherm haar vanuit een mount-effect aanmaakt.
Hover en focus pauzeren de aftellers; een nieuwe melding herstart bestaande aftellers niet. Foutmeldingen blijven tot
sluiten of verdringing door het bestaande maximum. Regressies: `src/core/web/ui/toast-effect-timers.test.tsx`.
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
3. Een nieuwe resource volgt altijd de volledige straat uit framework §8: de aparte tester schrijft eerst de tests
   (pgTAP per policy, integratie, e2e), zet de declaratie in
   `test/security/resources.ts` en vult de samples in (tot dan is `pnpm test:db` rood), de developer voegt de velden toe in
   een nieuwe migratie met kolomgrants en bouwt de handlers. De stappen hieronder gelden dan per bestand.

`pnpm check:new-resource` bewijst in een tijdelijke kopie dat de uitvoer `pnpm gate:fast` haalt (eigen job in CI, niet in elke
`gate:fast`). De generator voegt geen dependency toe: de route-tree komt van de al geïnstalleerde `@tanstack/router-plugin`
(ADR 0047 punt 8–9).

## Padparameters en foutvolgorde

Leg bij "Routes en foutcodes" voor iedere padparameter (zoals `:id`) de toegestane vorm, het gedeelde zod-schema
in het contract, de foutcode en het validatiemoment vast. Een body-schema alleen dekt een padparameter niet.
De vorm volgt het domein: een UUID voor een UUID-resource, geen UUID-aanname voor bijvoorbeeld een Better Auth-ID.
Een typebrand bewijst geen vormvalidatie: `brandedId` in `src/core/shared/ids.ts` controleert alleen lengte. Noem dus
het schema dat de vereiste vorm werkelijk controleert; alleen de naam van een branded ID is niet voldoende.
Beschrijf vóór een externe aanroep hoe de gebruikte padparameters worden gevalideerd; ongeldige invoer mag die
aanroep niet bereiken. Toets ook scheidingstekens en gecodeerde invoer, zoals `..%2F..%2Fx`, tegen de gekozen vorm;
een UUID-parameter hoort zulke waarden af te wijzen.

Toets de foutvolgorde aan de bestaande kit, na de algemene HTTP-middleware: sessie, rate limit, contractvalidatie,
ontbrekende rol, permissie, MFA, handler en outputvalidatie. Bronnen: `routeHandler` in
`src/core/api/http/create-app.ts`, `createWithUser` in `src/core/api/db/with-user.ts` en `check` in
`src/core/shared/can.ts`. Een nieuwe voor-stap mag die zichtbare foutvolgorde niet stilzwijgend veranderen.

Specificeer bij een voor-stap welke validatie eraan voorafgaat, welke externe aanroep zij doet en wanneer haar fout
zichtbaar wordt. Een fout van de externe dienst mag `FORBIDDEN` of `MFA_REQUIRED` niet vervangen. Beschrijf zo nodig
hoe de fout wordt bewaard tot na de rechtencontrole en de route-specifieke beschikbaarheids- en eigenaarcontrole.
Controleer of de kit dat mechanisme al biedt; een ontwerp in een ADR is nog geen beschikbare API.

Neem gecombineerde fouten als acceptatiecriteria op; een losse test per fout bewijst de volgorde niet:

| Samen optredende situaties | Verwachte uitkomst |
|---|---|
| Geen geldige sessie, ongeldige padparameter en externe dienst onbereikbaar | `UNAUTHENTICATED` |
| Geldige sessie, rate limit overschreden en ongeldige padparameter | `RATE_LIMITED` |
| Geldige sessie, binnen rate limit, ongeldige padparameter en externe dienst onbereikbaar | `VALIDATION`; externe aanroep niet uitgevoerd |
| Geldige invoer, ontbrekende of verboden rol en externe dienst onbereikbaar | `FORBIDDEN` |
| Geldige invoer, toegestane adminrol zonder vereiste MFA en externe dienst onbereikbaar | `MFA_REQUIRED` |
| Geldige invoer en vereiste rechten/MFA, externe dienst onbereikbaar | Route-specifieke foutcode en volgorde van beschikbaarheids- en eigenaarcontrole expliciet in de spec |

## Transactiegrens in de spec

Toets het transactieplan aan `routeHandler` in `src/core/api/http/create-app.ts` en de context in
`src/core/api/route/kit.ts`: de handler en outputvalidatie draaien binnen één `withUser`-transactie. De handler krijgt
`ctx.tx`, geen `withUser` om zelf een tweede transactie te openen. Een fout uit de handler of outputvalidatie breekt de
transactie af; wijzigingen en audit worden teruggedraaid. Een wijziging bewaren en daarna een `AppError` gooien werkt dus niet.

Een aanroep via `ctx.services` vanuit de handler gebeurt ook binnen die transactie. Vereist de flow een externe
netwerkaanroep tussen twee databasestappen zonder een open transactie of vastgehouden verbinding, leg dan eerst een
expliciet kitmechanisme vast in de spec en controleer of de kit het al ondersteunt. Het `prepare`-ontwerp uit
[ADR 0060](adr/0060-bestandsopslag-als-poort.md) is geen beschikbare handler-API zolang de route kit het niet implementeert.

`ctx.afterCommit` en `ctx.afterRollback` plannen externe gevolgen of compensatie na de transactie; ze splitsen de handler
niet in twee transacties (`src/core/api/http/route-effects.ts`). Een fout na commit draait gecommitteerde data niet terug.

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
