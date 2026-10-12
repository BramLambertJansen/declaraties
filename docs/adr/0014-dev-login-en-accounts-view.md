# 0014 — Dev-login en de view `app.accounts`

Status: geaccepteerd (2026-10-10) — voorgesteld door de agent bij PR 7a, geaccepteerd door de eigenaar; de keuzes (dev-route als uitzondering in framework §3, kolom-allowlist op
`better_auth` voor `app_definer`, querybouwer in `src/api`) zijn van de eigenaar (spec `docs/specs/accountbeheer.md`, 2026-10-09).

## Context

De spec accountbeheer vraagt twee dingen die buiten de bestaande regels vallen:

- **Dev-rolwisselaar.** Lokaal wisselt een ontwikkelaar met één klik van rol. Dat vraagt een route zonder actor
  (`POST /api/dev/login-as`), terwijl framework §3 alleen `/api/auth/*`, de clientfouten-route en `GET /api/health` als publieke
  routes buiten `defineRoute` toestaat.
- **Accountlijst.** Een admin ziet naam, e-mail en status. Die staan in `better_auth`, en framework §6 en ADR 0010 sluiten dat schema
  voor iedereen behalve `auth_service`. De regel "via een security definer-view van `app_definer`" kan zonder grant niet werken.

## Besluit

1. **Dev-login.** `createApp` krijgt een optionele `devLogin`. `src/api/server.ts` geeft die alleen bij `APP_ENV=local` mee; zonder
   bestaat `POST /api/dev/login-as` niet (404). De route loopt door de CSRF-controle en accepteert alleen `{ rol: 'user' | 'admin' }`.
   Ze logt echt in via de Better Auth-handler als het seed-account van die rol (`src/core/api/dev/login-as.ts`). Voor de admin vult
   de server daarna de TOTP-code in met het vaste lokale geheim, zodat de sessie `mfa` is. Nieuwe rij in framework §3.
2. **`app.accounts`.** Een view van `app_definer` (`security_barrier`) die alleen rijen geeft als `app.is_mfa_admin()` waar is. `app_definer`
   krijgt `USAGE` op `better_auth` en `SELECT` op exact deze kolommen: `"user"(id, name, email, "createdAt")` en
   `account("userId", "providerId")`. Geen wachtwoord, sessies of TOTP-geheimen. De invariant in `db/tests/invarianten.sql` heeft die
   allowlist; elke andere grant, ook een extra kolom, faalt. De invariant controleert nu ook grants per kolom.
3. **Querybouwer in `src/api`.** `src/api` mag `drizzle-orm` en `drizzle-orm/pg-core` importeren (operators als `eq`, `desc`, `sql`), nooit een
   driver (`drizzle-orm/node-postgres`, `pg`). Dependency-cruiser-regel `api-alleen-querybouwer`, met fixtures.
4. **Services voor handlers.** `createRouteKit<Permission, Services>` en `createApp({ services })` geven handlers `ctx.services`
   (hier: uitnodigen via Better Auth). Zonder Services-type zijn ze weg te laten.

## Alternatieven

- Dev-login als `defineRoute` met een publieke permissie: dan bestaat er een permissie die "iedereen" betekent, ook buiten lokaal.
- De view als `app_migrator`: geen grants nodig, maar FORCE RLS laat de eigenaar geen rollen zien, en de view zou met de rechten van de
  eigenaar van alles draaien.
- Naam en status via Better Auth ophalen en in de handler samenvoegen: twee verbindingen, buiten RLS, paginering over twee bronnen.
- Operators via een core-bestand (`src/core/api/db/query.ts`): strakker, maar elke nieuwe operator vraagt een template-wijziging.

## Gevolgen

- Framework §3 en §6, ADR 0010 en `.claude/rules/` noemen de uitzonderingen. Een nieuwe kolom uit `better_auth` lezen vraagt een ADR en
  een regel in de allowlist.
- De seed-accounts en het vaste TOTP-geheim zijn nu ook de toegang van de dev-login; ze bestaan alleen lokaal (seed weigert elders).
- ADR 0026: de allowlist krijgt `"user".blocked_at` (select en update); "geen sessies" blijft staan.
