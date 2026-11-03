---
paths:
  - "db/**"
  - "src/core/api/db/**"
  - "src/api/db/**"
---

# Regels voor `db/` en de database-toegang (`src/core/api/db`; `src/api/db` is gegenereerd)

Letterlijk uit `docs/framework.md`; bij verschil wint het regelboek.

- **R-DB-12** `db/schema.snapshot.sql` is enige schemabestand; `pnpm db:generate` schrijft het met `src/api/db/schema.ts`, nooit met de hand; lees snapshot, niet alle migraties (0042)
- **R-DB-07** Migratie = nieuw bestand in `db/migrations/` (dbmate, geen down, als `app_migrator`); nooit gecommitte migratie wijzigen; expand/contract; nooit handmatig aan productie (0042)
- **R-DB-01** Rollen: `app_migrator` (eigenaar, geen superuser), `app_authenticated` (NOLOGIN), `api_user` (NOINHERIT, alleen `SET LOCAL ROLE app_authenticated`), `auth_service`, `app_definer` (NOLOGIN, eigenaar security definer); rollen nooit in migraties maar in `db/init/` en runbook (0042)
- **R-DB-05** Elke tabel in `public` of `app` (behalve `public.schema_migrations`), nooit in `better_auth` of `tap`: RLS aan en `FORCE`, expliciete grants met alleen nodige rechten in dezelfde migratie (nooit TRUNCATE, REFERENCES, TRIGGER; PUBLIC niets), policies met `(select app.current_user_id())`, per policy pgTAP-test op naam (0042)
- **R-DB-17** Bewaarcatalogus `app.retention`: elke tabel in `public` en `app` heeft rij; `app.retention_cutoff()` enige bron voor termijnen in policies en triggers; uitzondering op R-DB-05: migratie die tabel aanmaakt zet `app.retention` `no force`, voegt alleen die rij in, dan `force` (0051)
- **R-TEST-05** CSRF-wijziging heeft matrix uit ADR 0041 als tests; hooks hebben tabeltests; pgTAP begint met `set search_path = tap, public`, `plan()` vóór `set local role app_authenticated`; screenshot-baselines alleen in gepinde Playwright-image (0041, 0045)
- **R-CODE-10** Bestanden kebab-case, componenten PascalCase, tabellen en kolommen snake_case; UI Nederlands, code, commits, branches Engels; uitzondering alleen voor de harness: bestanden onder `scripts/`, `rails/`, `.claude/` en `.github/`, de tests van de harness, `pnpm`-scriptnamen, lintregelnamen `rails/*` en sleutels in `.claude/*.json` mogen Nederlands zijn; productcode (`src/`, `db/`, `deploy/`, `e2e/`) blijft Engels; documentatie (`docs/`, proza) valt niet onder deze regel (fw)
- **R-CODE-07** Bedragen in gehele centen (`Cents`); tijd `timestamptz`/ISO-string; formatteren alleen via `lib/format.ts`; grenzen alleen uit `limits.ts` (CHECK met zelfde waarde krijgt gelijkheidstest) (0040)
- **R-DB-09** `security definer` alleen met `set search_path = ''`, volledig gekwalificeerde namen, eigenaar `app_definer`, geen overload, nooit `alter function … security definer`, niet in `do`-blok of dynamische SQL (fw)
- **R-DB-10** Views: `security_invoker = true`; anders `security_barrier`, namen met schema, `app.`-functie als actorfilter (heuristiek: pgTAP en review), eigenaar `app_definer`; geen materialized views (fw)
- **R-DB-08** Datamigratie over alle rijen: via gereviewde security definer-functie, nooit RLS uitzetten; tabel krijgt policy `to app_definer` met alleen nodige rechten en pgTAP-test (fw)
- **R-DB-11** Elke functie in `public` en `app` staat in functiecatalogus (`db/tests/functies.sql`) als `client`, `intern` of `job`; client-functie controleert actor (0045, 0050)
- **R-DB-13** `better_auth`-tabellen uit `node scripts/auth-schema.mjs` in migratie met `set local search_path = better_auth;` en `reset search_path;`, nooit `auth migrate`; rijen zijn van Better Auth: nooit direct uit `src/core/api/db` of app-code, alleen via `app_definer`-functie of -view (R-DB-14) of testkit-`asUser` (terugdraaiend) (0041, 0043)
- **R-DB-14** `app_definer` leest uit `better_auth` alleen kolom-allowlist in `db/tests/invarianten.sql` (extra kolom: ADR), schrijft alleen `blocked_at`, `deactivated_at`, `session_version`; FK naar `better_auth."user"`: `on delete cascade` of `set null` (0043, 0051, 0052)
- **R-PROV-02** Geen provider-functies of -schema's (`auth.uid()`, Data API, `storage.*`, `realtime.*`); provider-data-API voor browser uit, smoketest bewijst dat (0039)
- **R-CODE-08** Geen `SET ROLE` of `set_config(…, false)`; `set_config`/`current_setting` alleen in `src/core/api/db` en schema `app` (0042)
- **R-CODE-05** Branded IDs via zod `.brand()`; kolom `id` of `*_id` krijgt brand via FK of `db/ids.json` (of `null` met reden); types per resource apart geëxporteerd (fw)
- **R-DB-03** `withUser(actor, tx => …)` enige ingang: één transactie per request (GET read only), controleert `current_user = session_user`, zet rol, `app.user_id`, `app.session_strength`, `app.request_id` (server-`requestId`) met `set_config(…, true)` (0042, 0051)
- **R-DB-15** `app.audit_log` append-only, RLS geforceerd, regel in dezelfde transactie, details alleen ID's en enums, termijn minstens 1 jaar, lezen alleen admin met MFA. Bekend gat: faalt route-commit na uitnodigen, dan account zonder rol en zonder auditregel (0051)
- **R-LAAG-06** `src/core/api/db` exporteert alleen `withUser()`, `pingDatabase()` (readiness) en `closeDatabase()` (stoppen) alleen vanuit `src/api/server.ts`, `createAuditFn()` uit audit.ts (enig bestand naast index, testing, types; alleen `app.audit` in `tx`), `testing.ts` (alleen tests) (0042)

Hoe (geen norm):

- Migratie in dbmate-formaat (`-- migrate:up`); expand/contract: de vorige codeversie blijft werken. Grants en schema's: R-DB-05. De policynaam staat letterlijk in de pgTAP-test (`app_authenticated` heeft geen TEMP). Geld in `bigint`/`integer` centen.
- Security definer: `alter function … owner to app_definer` (`pnpm check:secdef`, R-DB-09). Een view zonder `security_invoker` eist van `check:secdef` een `where` met de actorfilter.
- Voorbeeld van R-DB-13: `app.accounts` is een view van `app_definer` op `better_auth."user"`; `app.set_account_blocked` schrijft `blocked_at`. dbmate schrijft `schema_migrations` in dezelfde transactie.
- `pnpm db:generate` draait in de runner op een verse test-database; commit snapshot en `src/api/db/schema.ts` met de migratie. ID's in `db/ids.json` met `brandedId()` uit `src/core/shared/ids.ts`. Een onbekend kolomtype (of `timestamp` zonder tijdzone) laat de generator falen.
- `app.request_id()` leest `app.request_id`, gezet door `withUser()` (R-DB-03). `app.audit_log`: verwijderen na de termijn via `app.retention_cutoff` (R-DB-17); schrijven via `app.audit`/`app.audit_account_action` en door `app.assign_role` en `app.set_account_blocked`.
- `audit.ts` levert `createAuditFn` voor `ctx.audit` (R-LAAG-06). `app.session_strength` is `password` of `mfa` (anders weigert `withUser()`); daarbuiten geeft `app.session_strength()` `none`.

## Besloten, nog niet gebouwd

Gebouwd: `withUser()` met Drizzle-`tx` en foutvertaling; pgTAP-invarianten (`db/tests/invarianten.sql`: RLS
geforceerd, geen TRUNCATE/REFERENCES/TRIGGER, `better_auth` dicht, niets voor PUBLIC) en de functiecatalogus
(`db/tests/functies.sql`: een nieuwe functie krijgt daar een regel, in dezelfde PR als de migratie); de testkit in
`testing.ts` (`beginTestDb(pool)`: `asUser(rol)`, `withUser` met een savepoint per aanroep, `rollback()`; de pool verbindt
als `app_migrator` en wordt alleen in `test/` gemaakt).
`pnpm db:generate` met `db/schema.snapshot.sql` en `src/api/db/schema.ts` (eigen generator in `scripts/db/`, geen drizzle-kit).
`pnpm check:secdef` (statisch op de migraties, in `gate:fast`; de functiecatalogus is de runtime-kant in `gate:slow`).
`pnpm check:snapshot` (snapshot-vergelijking, in `gate:slow`) en `check-policies` (elke policy een pgTAP-assert op naam, in `pnpm test:db`).
