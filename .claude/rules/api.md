---
paths:
  - "src/api/**"
  - "src/core/api/**"
  - "deploy/**"
---

# Regels voor `src/api` en `src/core/api`

Letterlijk uit `docs/framework.md`; bij verschil wint het regelboek.

- **R-ARCH-01** App breidt uit door registreren, nooit core wijzigen; past iets niet: stel uitbreidingsplek in template voor; core-fout oplossen in template (0040)
- **R-WERK-09** Route alleen via `defineRoute({ method, path, input, output, permission, handler })`, één bestand per resource, contract in `src/shared/contracts/<resource>.ts`, pure logica zonder I/O in `src/api/domain`; nieuwe foutcode tekst in `src/web/copy/errors.ts` (AGENTS, rules)
- **R-CODE-03** Parse op elke grens met zod via `defineRoute()` (`.strict()`); env-schema alleen in `src/core/api/env.ts` (fw)
- **R-DB-03** `withUser(actor, tx => …)` enige ingang: één transactie per request (GET read only), controleert `current_user = session_user`, zet rol, `app.user_id`, `app.session_strength`, `app.request_id` (server-`requestId`) met `set_config(…, true)` (0042, 0051)
- **R-DB-04** Alleen `withUser()` vertaalt databasefouten (23505 `ALREADY_EXISTS`, 23503 `NOT_FOUND`, 42501 `FORBIDDEN`); route vangt ze niet af, gebruikt `ctx.actor`, geen query buiten `tx`, geen tweede verbinding (0042)
- **R-ARCH-06** API en database in één regio; kleine pool op moduleniveau; geen opeenvolgende queries per request (databasetijd in log: R-SEC-08); routes lazy; bundelbudget per scherm in `src/web/bundle-budget.ts`, getoetst door `test/ui/bundle-budget.test.ts` in `gate:fast` (fw)
- **R-SEC-02** Fouten naar buiten alleen `{ code, requestId }`; `logUnexpectedError()` logt nooit message, stack, query, cause; niet gedekt: foutlog Better Auth, stopmelding `src/core/api/env.ts`, standaardfout `src/core/api/http/web.ts` (fw)
- **R-SEC-08** Log per request `requestId`, gebruiker-ID, duur, databasetijd, zonder PII, via `src/core/api/obs`; clientfouten allowlist-velden, geen PII of vrije tekst, 5 min ontdubbeld (0045, 0051)
- **R-LAAG-05** Alleen `src/core/api/db` (driver `pg`, Drizzle) en `src/core/api/auth` (Better Auth als `auth_service`: schema `better_auth`, plus alleen `execute` op functies van klasse `auth` in `app`) maken databaseverbindingen; `src/api` gebruikt voor database alleen `drizzle-orm[/pg-core]`, nooit een driver (0042, 0043, 0075)
- **R-AUTH-01** Alleen inloggen vanuit browser; Better Auth gepind in `src/core/api/auth` op `/api/auth/*`; alleen plugins two-factor en magic link, andere vraagt ADR (0041)
- **R-AUTH-02** Sessie in database, `cookieCache` uit; cookie `__Host-`, `httpOnly`, `Secure`, `SameSite=Lax`; geen token in `localStorage`; 7 dagen absoluut, 12 uur idle, `freshAge` 10 min; wachtwoord- of 2FA-wijziging trekt andere sessies in; sessielijst nooit token, IP of ruwe user-agent (0041, 0043)
- **R-DB-06** `can()` regelt functieniveau, RLS rijniveau; rollen uit `user_roles`, nooit uit sessie; gebruikersbewerkbare velden nooit voor autorisatie (fw)
- **R-SEC-03** Rate limit op elke `defineRoute`-route (`lezen`, `schrijven`, `duur` via `rateLimit`; mail of duur rekenwerk: `rateLimit: 'duur'`, nooit eigen getal per route) en op inloggen/reset, opslag in database, IP alleen uit `CLIENT_IP_HEADER`; `bodyLimit` en paginagrootte uit `limits.ts`; health en ready zonder limiet (0041, 0049)
- **R-ARCH-05** Browser praat alleen met API, same-origin via `/api`; geen server-rendering; per host één adapter in `deploy/<host>/`, zonder logica (fw)
- **R-DB-15** `app.audit_log` append-only, RLS geforceerd, regel in dezelfde transactie, details alleen ID's en enums, termijn minstens 1 jaar, lezen alleen admin met MFA. Bekend gat: faalt route-commit na uitnodigen, dan account zonder rol en zonder auditregel (0051)
- **R-DB-16** App-acties in `src/shared/audit.ts` (nooit `core.`) via `ctx.audit()`; core-accountacties via `app.assign_role`, `app.set_account_blocked`, `app.audit_account_action` (0051)
- **R-TEST-03** Per permissie en policy negatieve test (een per verboden rol, `FORBIDDEN`), test voor ongeldige input, racetest met twee gelijktijdige requests bij uniekheid of geld (fw)
- `process.env`: **R-LAAG-08** (framework §2); app-variabelen komen als schema in src/api/env.ts zodra de app eigen variabelen heeft.
- CSRF-middleware vóór alle routes, geen `cors()`: **R-SEC-01** (framework §6).

Hoe (geen norm):

- Uitbreiden via `src/api/app.ts`, `src/api/kit.ts`, `src/shared/permissions.ts`, `src/shared/errors.ts` (nieuwe foutcode), `src/shared/limits.ts`; handlers in `src/api/routes/<resource>.ts` zijn dun; `input`/`output` zijn zod-schema's uit `src/shared`.
- Rate limit standaard GET `lezen`, anders `schrijven`; `duur` in het contract (R-SEC-03).
- Audit: `defineAuditActions`, sleutel `<onderwerp>.<actie>`, `ctx.audit(actie, doelId, details)`; de regel rolt met de route terug. Invite/reinvite via `app.audit_account_action` (`src/api/routes/accounts.ts`). Details: R-DB-15.
- Racetest: precies één van de twee requests slaagt.

## Besloten, nog niet gebouwd

Gebouwd: `withUser()` (Drizzle-`tx`, rol uit `user_roles`, foutvertaling), `createApp` (CSRF, `bodyLimit`, `secureHeaders()`, `onError`,
alleen routes uit `defineRoute`), `createRouteKit`/`defineRoute` in `src/core/api/route`, contracten met `defineContract` in
`src/shared/contracts/`, `src/api/kit.ts`, Better Auth (`src/core/api/auth`) en het env-schema. Een nieuwe route = eerst het contract
in `src/shared/contracts/<resource>.ts`, dan de handler in `src/api/routes/<resource>.ts`, dan beide in de lijsten
(`src/shared/contracts/index.ts`, `src/api/app.ts`). Routetests tegen de echte database: de testkit uit `src/core/api/db/testing.ts` (`beginTestDb`, `asUser(rol)` met een
`auth`-gateway voor `buildApp`). Tabellen en views voor `tx`: `src/api/db/schema.ts` (gegenereerd, `pnpm db:generate`); queries met `drizzle-orm`
(`eq`, `desc`, `sql`), nooit een driver (R-LAAG-05). Iets buiten de database (bijv. uitnodigen via Better Auth): via `ctx.services`
(`src/api/services.ts`), dat core-fouten vertaalt naar foutcodes. Voorbeeld van alles samen: `src/api/routes/accounts.ts`. Request-logging: `createApp({ log })` met `src/core/api/obs/request-log.ts`; een route logt niet zelf. Bouw er niet op vooruit; staat iets niet in `node scripts/kit/feiten.mjs`, vraag het.
