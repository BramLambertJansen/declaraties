---
paths:
  - "db/**"
  - "src/core/api/db/**"
  - "src/api/db/**"
---

# Regels voor `db/` en de database-toegang (`src/core/api/db`; `src/api/db` is gegenereerd)

- Lees `db/schema.snapshot.sql` voor de huidige stand, niet alle migraties.
- Nieuwe wijziging = nieuwe migratie in `db/migrations/` (dbmate-formaat `-- migrate:up`, geen down). Draait als `app_migrator`. Rollen maak je nooit in een migratie (`db/init/`). Een migratie die op `main` staat, raak je nooit aan.
- Expand/contract: de vorige versie van de code moet blijven werken na de migratie.
- Elke nieuwe tabel in dezelfde migratie:
  1. `alter table … enable row level security; alter table … force row level security;`
  2. expliciete `grant` aan `app_authenticated` met alleen de nodige rechten (nooit TRUNCATE, REFERENCES, TRIGGER);
     tabellen in `public` of `app`, nooit in `better_auth` of `tap`;
  3. policies die `(select app.current_user_id())` gebruiken;
  4. een pgTAP-test in `db/tests/` per policy, met de policynaam letterlijk in de test.
- pgTAP staat in schema `tap`: elke test begint met `set search_path = tap, public` en roept `plan()` aan vóór
  `set local role app_authenticated` (die rol heeft geen TEMP).
- Tabellen en kolommen snake_case; `timestamptz` voor tijd; geld in `bigint`/`integer` centen.
- CHECK-constraint met een grens uit `src/shared/limits.ts`: test dat beide waarden gelijk zijn.
- `security definer`-functies: `set search_path = ''`, alles volledig gekwalificeerd (`public.x`, `pg_catalog.y`),
  eigenaar `app_definer` (`alter function … owner to app_definer`) met alleen de rechten die de functie nodig heeft.
  Geen overload, nooit `alter function … security definer` en geen `security definer` in een `do`-blok of dynamische SQL
  (`pnpm check:secdef`, framework §6).
- Views: standaard `with (security_invoker = true)` (RLS van de aanroeper). Zonder dat leest de view met de rechten van zijn
  eigenaar en eist `check:secdef` `security_barrier`, namen met schema, een `where` met een `app.`-functie als actorfilter en
  eigenaar `app_definer`. Geen materialized views.
- Datamigraties die alle rijen moeten zien: via zo'n functie, nooit door RLS uit te zetten. FORCE RLS geldt ook voor
  `app_definer`: geef de tabel in dezelfde migratie een policy `to app_definer` met alleen wat de functie nodig heeft, met een pgTAP-test.
- Auth-tabellen: SQL uit `node scripts/auth-schema.mjs` (gepinde versie) in een migratie die begint met `set local search_path = better_auth;`
  en eindigt met `reset search_path;` (dbmate schrijft `schema_migrations` in dezelfde transactie); nooit `auth migrate`.
- Heeft een auth-hook data buiten `better_auth` nodig (bijv. rol uit `user_roles`), of de app gegevens uit `better_auth."user"`:
  via een `security definer`-functie of -view van `app_definer` (zoals `app.accounts`). `app_definer` leest uit `better_auth` alleen de
  kolommen in de allowlist van `db/tests/invarianten.sql` (ADR 0014) en schrijft alleen `blocked_at` (ADR 0026); een extra kolom vraagt een ADR.
- `set_config` en `current_setting` alleen in `src/core/api/db` en in de helpers in schema `app`; nooit in app-SQL of handlers.
- Rijen in schema `better_auth` zijn van Better Auth (ADR 0010); lees of schrijf ze nooit vanuit `src/core/api/db` of app-code (uitzonderingen: `app.set_account_blocked` voor `blocked_at`, ADR 0026; `asUser` in de testkit, binnen een testtransactie die terugdraait). Geen provider-specifieke schema's of functies (`storage.*`, `realtime.*`, `auth.uid()`).
- Na een migratie: `pnpm db:generate` (verse test-database in de runner) schrijft `db/schema.snapshot.sql` en
  `src/api/db/schema.ts`; commit beide met de migratie, nooit met de hand bewerken. Een kolom `id` of `*_id` zonder
  foreign key naar een gebrande kolom: zet hem in `db/ids.json` met een ID gemaakt met `brandedId()` uit `src/core/shared/ids.ts`, of `null` met reden.
  Een kolomtype dat de generator niet kent (of `timestamp` zonder tijdzone) laat hem falen.
- `src/core/api/db` exporteert alleen `withUser()`, `pingDatabase()` (alleen voor readiness, vanuit `src/api/server.ts`), `closeDatabase()` (alleen bij het stoppen, vanuit `src/api/server.ts`) en `testing.ts` (alleen voor testbestanden). Die controleert aan het begin
  van elke transactie `current_user = session_user`, zet de rol, `app.user_id` en `app.session_strength` (`password` of `mfa`; elke
  andere waarde weigert hij) en vertaalt fouten. Buiten `withUser()` geeft `app.session_strength()` `none`.

## Besloten, nog niet gebouwd

Gebouwd: `withUser()` met Drizzle-`tx` en foutvertaling (ADR 0012); pgTAP-invarianten (`db/tests/invarianten.sql`: RLS
geforceerd, geen TRUNCATE/REFERENCES/TRIGGER, `better_auth` dicht, niets voor PUBLIC) en de functiecatalogus
(`db/tests/functies.sql`: een nieuwe functie krijgt daar een regel, in dezelfde PR als de migratie); de testkit in
`testing.ts` (`beginTestDb(pool)`: `asUser(rol)`, `withUser` met een savepoint per aanroep, `rollback()`; de pool verbindt
als `app_migrator` en wordt alleen in `test/` gemaakt).
`pnpm db:generate` met `db/schema.snapshot.sql` en `src/api/db/schema.ts` (eigen generator in `scripts/db/`, geen drizzle-kit).
`pnpm check:secdef` (statisch op de migraties, in `gate:fast`; de functiecatalogus is de runtime-kant in `gate:slow`).
`pnpm check:snapshot` (snapshot-vergelijking, in `gate:slow`) en `check-policies` (elke policy een pgTAP-assert op naam, in `pnpm test:db`).
