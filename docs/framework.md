# Framework

Normatief. Dit document is de wet voor elke app die uit deze template start.
Wijzigen alleen via een PR met ADR, met review door de eigenaar.

## 1. Principes

1. **De fout onmogelijk maken, niet verbieden.** De browser heeft geen databaseclient; de databasemodule
   exporteert alleen `withUser()` (en `pingDatabase()` voor readiness en `closeDatabase()` bij het stoppen); een route bestaat alleen via `defineRoute()`. Wat het typesysteem afdwingt, hoeft geen regel te zijn.
2. **Afdwingen boven afspreken.** Wat niet onmogelijk te maken is, blokkeert een check in CI. CLAUDE.md, skills
   en hooks sturen en geven snelle feedback; de harde grens ligt in CI en op GitHub.
3. **Eén bron per feit.** Migraties voor het datamodel, zod-schema's voor contracten, één CSS-laag voor tokens, één script per check.
4. **Lokaal is gelijk aan productie.** Dezelfde Postgres-versie (exact gepind in `db/docker/Dockerfile`, gelijk aan de beheerde database van de app), dezelfde rollen, grants, RLS, migraties en checks.
5. **Rails groeien met bewijs.** Een check of regel komt erbij als een fout aantoonbaar doorglipte. Een rail-fix begint met een test die
   op de oude code faalt (eerst reproduceren); elke check heeft fixtures die falen, ook voor bekende omzeilingen (aliassen, re-exports,
   bracket-notatie, `bash -c`, niet-letterlijke `import()`). Hooks zijn gates en hebben dus ook tests (ADR 0011). De eigenaar reviewt elke PR en releaset.
6. **Provider-neutraal.** De template kent geen hostingprovider en geen database-as-a-service. Een app kiest die per
   ADR (zie §3); de code raakt de keuze alleen via een adapter.

## 2. Architectuur

Eén repository, één pakket, drie lagen in twee zones, bewaakt door dependency-cruiser (ook: geen cycles).

**Zones** (ADR 0008): `src/core/{api,web,shared}` is van de template — beschermd, in een app alleen gewijzigd door een template-merge.
App-code staat in `src/{api,web,shared}`. App mag core importeren; core importeert nooit app. Wat core van de app nodig heeft
(permissies, foutcodes, routes, contracten, env-uitbreiding), krijgt het als argument van een compositie-root in de app
(`src/api/app.ts`, `src/api/kit.ts`, `src/web/lib/api.ts`). Een app breidt uit door te registreren, nooit door core te wijzigen.

| Laag | Map (core / app) | Mag importeren | Mag nooit |
|---|---|---|---|
| Frontend (Vite + React SPA) | `src/core/web` / `src/web` | `src/core/shared`, `src/shared` (met de contracten in `src/shared/contracts`), `better-auth/react` alleen in `src/core/web/lib/auth.ts` | databasedriver, ORM, `process.env`, `import.meta.env` buiten `src/core/web/lib/env.ts`, iets uit `src/api` of `src/core/api` (ook geen types) |
| API (Hono) | `src/core/api` / `src/api` | `src/core/shared`, `src/shared` | `src/web`, `src/core/web` |
| Gedeeld | `src/core/shared` / `src/shared` | alleen libraries (zod) en `src/core/shared` | `web`, `api` (beide zones) |
| Database-toegang | `src/core/api/db` | driver (`pg`) en Drizzle — als enige | iets anders exporteren dan `withUser()` |
| Auth | `src/core/api/auth` | Better Auth met eigen verbinding als `auth_service`, alleen schema `better_auth` (ADR 0010) | data buiten `better_auth` lezen of schrijven |

Plaats per onderdeel (`defineRoute`, `withUser`, auth, CSRF, foutafhandeling, logging, env, API- en auth-client, `AsyncView`, `Form`,
UI-kit en tokens, `format`, `assert`, `unsafeCast`, `Cents`, cursor, branded IDs, foutcodes, `can()`, limieten) en hoe een app elk
uitbreidingspunt gebruikt: ADR 0008.

- De browser praat alleen met de API, same-origin via `/api`. Lokaal proxyt Vite (:5173) `/api` naar Hono (:8787).
- De Hono-app is host-onafhankelijk. Ingangen: `src/api/server.ts` (Node, lokaal en containerhosts) en per gekozen
  host één adapterbestand in `deploy/<host>/`. Een adapter importeert de app en doet verder niets.
- Geen server-rendering: alle schermen zitten achter een login.
- Prestaties: API en database in dezelfde regio; kleine pool op moduleniveau;
  geen opeenvolgende queries per request; databasetijd per request in de log; bundelbudget (size-limit); routes lazy.

## 3. Poorten en adapters

| Poort | Template levert | Per app te kiezen (ADR) | Voorbeeld |
|---|---|---|---|
| Postgres | Postgres 17 + pgTAP in Docker (`compose.yaml`), rollen via `db/init/`, migraties met dbmate | Beheerde Postgres | Supabase, Neon, RDS |
| Frontend + API hosting | `vite build` (statisch) + `src/api/server.ts`; containerimage die beide op één origin serveert (`Dockerfile`, ADR 0019) | Host + adapter in `deploy/<host>/` | Vercel, Cloudflare, Fly |
| Auth | Better Auth in de API op de eigen Postgres (ADR 0003) | Alleen bij ADR: externe provider | — |
| E-mail | Mailpit in Docker | SMTP-dienst | — |
| Fouttracking | Eigen tabel via `reportClientError()` (fase 2, `docs/roadmap.md`) | Optionele dienst | Sentry |

Regels voor elke keuze:
- De database is altijd gewoon Postgres. Geen provider-specifieke functies (`auth.uid()`, Data API, Storage-policies)
  in migraties of code. De gebruiker komt uit `app.current_user_id()`, gezet door `withUser()`.
- Biedt de provider een directe data-API aan de browser (zoals Supabase Data API, Storage of Realtime), dan staat die uit.
  Een smoketest bewijst met een echte gebruikerssessie dat de browser er niet bij kan.
- Geen provider-SDK in `src/web`. In `src/api` alleen in `deploy/<host>/` of een adapter die een ADR toestaat.

### Uitzonderingen (limitatief)

| Regel | Uitzondering | Waarom |
|---|---|---|
| Alleen `src/core/api/db` raakt `pg` | `src/core/api/auth` (als `auth_service`, alleen schema `better_auth`) | Better Auth beheert zijn eigen tabellen |
| Elke route via `defineRoute` | `/api/auth/*` (Better Auth-handler) en de clientfouten-route (ADR 0003) | De library levert de auth-routes; de clientfouten-route werkt zonder actor |
| Elke route vraagt login | `/api/auth/*` (inloggen, aanmelden, reset), de clientfouten-route, `GET /api/health` en `GET /api/ready` | Bestaan juist voor niet-ingelogden; auth en clientfouten met rate limit; health en ready geven alleen `{ ok }`, geen data en geen rate limit (ready: 503 als de database onbereikbaar is; uitkomst 1 s bewaard, hooguit één controle tegelijk, ADR 0018) |
| Elke schermroute heeft een `can()`-guard | Inlog-, aanmeld- en resetschermen (`/login`, `/uitnodiging`) | Publiek; ze tonen geen data |
| Spec vóór een nieuwe route | `GET /api/health` (skelet) en `GET /api/ready` (readiness, ADR 0018) | Infrastructuur zonder data of actor; health bestaat vóór `defineRoute`, de skeletpagina die hem toonde, is vervallen met de ingelogde startpagina (PR 7b) |
| Elke route via `defineRoute` en met login | `POST /api/dev/login-as` (ADR 0014) | Alleen bij `APP_ENV=local` geregistreerd (elders 404); logt in als een seed-account, met CSRF-controle |

## 4. Codeerkaders

Alle lintregels op `error`; CI draait met `--max-warnings 0`. Checks op code gebruiken de AST (ESLint,
dependency-cruiser); checks op de database lezen de catalogus van de lokale database (`pg_policies`, `pg_proc`,
`information_schema`), nooit een regex over bronbestanden.

- **Lintmeldingen zijn instructies**: `no-restricted-imports`/`no-restricted-syntax` noemen de juiste helper.
- **Kleine eenheden**: max-lines-per-function 60 (`.ts`) / 120 (`.tsx`); sonarjs cognitive-complexity 15; max-params 3; max-depth 3.
- **Parse op elke grens**: zod via `defineRoute()` voor request en response (`.strict()`); env-schema in `src/core/api/env.ts`, de enige plek met `process.env` (de app levert alleen haar uitbreiding in `src/api/env.ts`).
- **Geen casts**: type-assertions (`x as T`, `<T>x`) zijn verboden (`consistent-type-assertions: never`); `as const` en `import { a as b }` mogen; `unsafeCast(value, reden)` in `src/core/shared` is de enige uitweg. CI zet het verschil in aantal op de PR.
- **`assert(cond, msg)`** in `src/core/shared`, actief in productie en gemeld aan de fouttracking; in de frontend vangt een ErrorBoundary per route hem op.
- **Types per resource** apart geëxporteerd uit de API, zodat de TypeScript-server niet trager wordt naarmate routes groeien.
- **Branded IDs** (`UserId`) via zod `.brand()`; `pnpm db:generate` zet `$type<…>()` in het gegenereerde Drizzle-schema. Elke kolom
  `id` of `*_id` krijgt een brand via een foreign key of via `db/ids.json` (of daar bewust `null`); anders faalt de generator.
- **Modules en aliassen**: aliassen via `imports` in `package.json` (`#core/*` → `./src/core/*`, `#api/*`, `#web/*`, `#shared/*`),
  zodat Node, Vite, Vitest en TypeScript dezelfde bron lezen. Hoe Node `src/api/server.ts` draait (native type stripping of een
  loader) en de bijbehorende tsconfig-flags legt het skelet vast en bewijst `pnpm dev`.
- **TypeScript streng**: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`,
  `noImplicitOverride`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `moduleResolution: bundler`, `types` expliciet per tsconfig;
  typescript-eslint `strictTypeChecked` plus `switch-exhaustiveness-check` (staat daar niet in). TypeScript `~6.0.3` (ADR 0005).
- **ESLint 10**: verboden elementen via `no-restricted-syntax` op `JSXOpeningElement` (eslint-plugin-react ondersteunt ESLint 10 niet).
- **Geen sessielek in de database**: lint verbiedt `SET ROLE`, `set_config(…, false)` en `set_config`/`current_setting` buiten
  `src/core/api/db`; `withUser()` controleert aan het begin van elke transactie `current_user = session_user` en een test controleert het na elke request.

### Feedbacklus

| Moment | Wat | Duur |
|---|---|---|
| Na elke bewerking (PostToolUse-hook) | ESLint + Prettier op dat bestand | ~1–2 s |
| Pre-commit (lefthook) | format, ESLint op staged, Betterleaks | < 10 s |
| Einde beurt (Stop-hook) | `tsc --incremental`, ESLint `--cache`, `vitest --changed` (alleen het unit-project) | ~10–30 s |
| Database-tests | `pnpm test:db`: integratie + pgTAP tegen lokale Postgres | ~20–60 s |
| Pre-push | `gate:fast` | < 60 s |
| CI | `gate:fast` + build, daarna `gate:slow` | 3–5 / 8–15 min |

- `gate:fast` = lint, typecheck, unit, dependency-cruiser, bundelbudget, `check-migrations`, `check-secdef` (statisch, op de migraties), `check-roadmap` (een nieuw `[x]` in `docs/roadmap.md` of een spec naar `gebouwd` zonder bewijs), `check-docs`.
- `gate:slow` = `test:db` met `check-policies` en de functiecatalogus (de runtime-kant van `check-secdef`, op `pg_proc`), squawk op migraties, schema-snapshot zonder verschil, kleine e2e-set — tegen een verse database.
- Verplicht naast CI: CodeQL en osv-scanner.
- **Gate-register**: `scripts/kit/gates.mjs` beschrijft per script wat het bewaakt en of het snel is (zonder database, dus in `gate:fast`);
  het is de enige gate-tabel. `check-docs` eist dat register en `gate:fast`/`gate:slow` gelijk zijn (ADR 0011).
- **Ratchet**: bestaande overtredingen staan in `.kit/baseline.json` (stabiele sleutels: bestand, policynaam) of in ESLint bulk-suppressions.
  Een nieuwe overtreding faalt; een opgeloste die nog in de baseline staat, faalt ook tot `pnpm ratchet:update` hem weghaalt. Zo daalt schuld
  alleen, en kan een app een nieuwe template-regel invoeren zonder eerst alles te repareren. De baseline laten groeien is een gate-wijziging.

### Tests

- Indeling: unit `*.test.ts(x)` naast de code (Vitest-project `unit`, draait in de sandbox); integratie `*.int.test.ts`
  (Vitest-project `int`, alleen via `pnpm test:db`); pgTAP in `db/tests/`; e2e in `e2e/` (Playwright, via `gate:slow`/`ui:check`).
- Unit (Vitest) op `src/api/domain`, `src/shared` en `src/core`; property-based (fast-check) voor reken- en parselogica.
- Integratie tegen lokale Postgres; `src/core/api/db/testing.ts` (alleen importeerbaar uit testbestanden) laat `withUser()` een
  geïnjecteerde transactie gebruiken (savepoint per test); per feature één test die echt commit.
- Races: elke mutatie met een uniekheidsregel of geld krijgt een test met twee gelijktijdige requests; precies één slaagt.
- E2E (Playwright) altijd tegen de echte lokale stack, nooit met gemockte API of database; inloggen per rol, één kernflow per feature, CSP aan.

## 5. Vaste patronen

### Frontend

| Gebied | Patroon | Afgedwongen door |
|---|---|---|
| Routing | TanStack Router, bestandsroutes, getypte zoekparameters; elke route ErrorBoundary + `beforeLoad`-guard met `can()` (uitzonderingen: §3) | Router-types; lint op routes zonder guard |
| State | Server-state in TanStack Query; UI-state in de URL; formulieren in React Hook Form; geen globale store | Lint verbiedt store-libraries |
| Data | Per resource één `queries.ts` met key-factory, hooks en mutaties; mutatie invalideert eigen resource + "raakt ook" | Lint: `useQuery`/`useMutation` alleen in `queries.ts` |
| API-client | Eén client in `src/core/web/lib/api-client.ts`, door de app gemaakt in `src/web/lib/api.ts`: same-origin met cookie, 401 → naar inloggen, foutcodes → `ApiError` | Lint verbiedt `fetch(` elders |
| Formulieren | `<Form>`/`<FormField>` met zodResolver op het gedeelde schema; valideren bij verlaten, daarna bij typen; verzendknop uit tijdens de mutatie; serverveldfouten via `setError` | Lint verbiedt `useForm` buiten de wrapper |
| Laden/leeg/fout | `<AsyncView query empty>` | Lint op `.isLoading`/`.isError` in `features/` |
| Teksten | `src/web/copy/errors.ts` als `Record<ErrorCode, string>` (basisteksten uit `src/core/web/copy`, app-codes erbij); zod-meldingen Nederlands | TypeScript |
| Rechten | Dezelfde `can()` als de API; de API blijft de echte controle | Eén functie |

### Data en waarden

| Gebied | Patroon |
|---|---|
| Datums | `timestamptz` in de database, ISO-strings in het contract, één formatter (Intl, Europe/Amsterdam) |
| Bedragen | Gehele centen, branded `Cents`, één formatter |
| Paginering | Cursor-contract `{ items, nextCursor }` in `src/core/shared`; "Meer laden" met de cursor alleen in de query (`useInfiniteQuery`), niet in de URL; zoeken, filters en sortering wel (spec lijstpagina, OV-1) |
| Naamgeving | Bestanden kebab-case, componenten PascalCase, hooks `useX`, routes meervoud, tabellen/kolommen snake_case; UI Nederlands, code en commits Engels |

## 6. Data-toegang en security

Ankers: OWASP Top 10:2025, OWASP API Security Top 10, ASVS 5.0 niveau 1 (checklist in de security-review-skill).

- **Alleen inloggen vanuit de browser**; alle data via de API.
- **Sessies** (ADR 0003): Better Auth in `src/core/api/auth`, sessie in de database (`cookieCache` uit), cookie `__Host-`, `httpOnly`,
  `Secure`, `SameSite=Lax`; geen token in `localStorage`. Absoluut 7 dagen, idle 12 uur, `freshAge` 10 min voor gevoelige acties;
  wachtwoord- of 2FA-wijziging trekt andere sessies in. Gebruikersbewerkbare velden nooit voor autorisatie.
  `session_strength` is `password` of `mfa` (sessieveld met `input: false`, standaard `password`, gezet in de after-hook op
  2FA-verificatie, en bij `/change-password` met `createdAt` overgenomen van de oude sessie, ADR 0024); 2FA uitzetten zet de huidige sessie terug op `password`. `none` bestaat alleen in de database: geen actor.
- **CSRF** (ADR 0007): eigen middleware vóór alle routes; elk request behalve GET, HEAD en OPTIONS vereist mediatype `application/json` (hoofdletterongevoelig; parameters zoals `charset` zijn toegestaan; ook zonder body, dus de client stuurt de header altijd). Minstens een van `Sec-Fetch-Site` en `Origin` moet aanwezig zijn; elke aanwezige header moet respectievelijk `same-origin` of exact `APP_ORIGIN` zijn (`Origin: null`, `same-site`, `cross-site` en `none` worden geweigerd). Ontbreken beide, komt een van deze headers (of `Content-Type`) dubbel voor, of klopt een aanwezige header niet, dan weigert de middleware het request. Testmatrix: ADR 0007. Geen `cors()`.
  GET-links die een sessie maken (e-mailverificatie, magic link) openen een scherm dat de actie met een POST bevestigt (geen login-CSRF).
- **Accounts**: e-mailverificatie verplicht, geen account-enumeratie bij aanmelden en reset, gelekte wachtwoorden geweigerd (staging/productie).
- **Eigen databaserol**: de API verbindt als `api_user` (NOINHERIT, geen eigen rechten, alleen lid van `app_authenticated`),
  nooit als superuser of eigenaar. Systeemjobs krijgen een aparte rol. Werkt de gekozen pooler (transaction mode) niet met
  deze rol, dan valt het ontwerp om: bewijzen vóór de keuze definitief is.
- **`withUser(actor, tx => …)` als enige ingang**: één transactie per request die de rol, `app.user_id` en `app.session_strength` zet; read only voor GET.
  `actor` is `{ userId: UserId; sessionStrength: 'password' | 'mfa' }`; het type van `tx` (pg-client of Drizzle-transactie) legt de datapad-ADR in fase 0 vast, zodat het in fase 1 niet verandert.
- **Rollen** (ADR 0004): `app_migrator` (eigenaar, migraties, geen superuser), `app_authenticated`, `api_user`, `auth_service`,
  `app_definer` (eigenaar van `security definer`-functies). Rollen zijn clusterbreed en ontstaan niet in migraties: lokaal in
  `db/init/01-roles.sql`, per omgeving via het runbook. Al het andere per database (schema's, grants, default privileges) staat in migraties.
  `MIGRATOR_DATABASE_URL` gebruiken alleen scripts in `scripts/`, nooit code in `src/`.
- **Timeouts**: `statement_timeout` en `idle_in_transaction_session_timeout` op `api_user` en `auth_service`; `lock_timeout` op `app_migrator`.
- **Rollen uit de database**, uit `user_roles` per request; een rol in de sessie is alleen een UI-hint. Elke request leest de sessie uit de database, dus uitloggen en blokkeren tellen direct.
- **Autorisatie zonder overlap**: `can(permissie)` op functieniveau (BFLA); RLS op rijniveau (BOLA). Elke tabel RLS aan
  (`FORCE ROW LEVEL SECURITY`), elke policy een pgTAP-test op naam. Policies gebruiken `(select app.current_user_id())`.
- **MFA voor admin**: elke permissie die aan de rol `admin` is toegekend, eist een sterkere sessie (core leidt dit af uit de rol, de app kan het niet uitzetten;
  ADR 0008) (`app.session_strength() = 'mfa'`, eigen sessieveld gezet na 2FA-verificatie, ADR 0003), in `can()` én in een RLS-helper; getest met een admin-sessie zonder MFA. Admins: geen magic link, geen `trustDevice`.
- **Grants**: PUBLIC krijgt niets (`alter default privileges for role app_migrator revoke execute on functions / usage on types from public`,
  `revoke all on database/schema public from public`); elke tabel expliciete grants in de migratie; een pgTAP-invariant eist dat geen
  API-rol TRUNCATE, REFERENCES of TRIGGER heeft en dat elke tabel in `public` en `app` RLS aan én geforceerd heeft
  (uitzondering: `public.schema_migrations`); schema `better_auth` heeft geen grants behalve aan `auth_service`, plus de kolom-allowlist van `app_definer` voor de view `app.accounts` (ADR 0014) en `update (blocked_at)` voor `app.set_account_blocked` (ADR 0026).
- **FORCE RLS werkt alleen voor niet-superusers**: daarom is `app_migrator` eigenaar en geen superuser, lokaal én in productie.
  Datamigraties die alle rijen moeten zien, lopen via een gereviewde `security definer`-functie van `app_definer`; omdat FORCE RLS
  ook voor `app_definer` geldt, krijgt de tabel daarvoor een eigen policy `to app_definer` met pgTAP-test.
- **`security definer`** alleen met `search_path = ''`, volledig gekwalificeerde namen en eigenaar `app_definer`. Twee lagen: `check-secdef`
  (`gate:fast`) leest de migraties statisch; de functiecatalogus in pgTAP (`gate:slow`) controleert in de draaiende database op `pg_proc`
  (`prosecdef`, `proconfig`, eigenaar).
  - Volledig gekwalificeerd: de functienaam, elke tabel en elke functieaanroep in de body heeft een schema, ook ingebouwde functies
    (`pg_catalog.now()`). Typen en operators niet: `pg_temp` wordt nooit doorzocht voor functies en operators; de echte aanval is een
    tijdelijke tabel die een ongekwalificeerde tabel overschaduwt.
  - Geen overload van een security definer-functie (over alle migraties heen); zo klopt het koppelen van de eigenaar op naam.
  - Nooit `alter function … security definer`: definer-rechten ontstaan alleen bij `create`, waar search_path en namen gecontroleerd
    worden. `security definer` op een plek die `check-secdef` niet als `create` leest (een `do`-blok, dynamische SQL) faalt.
  - Een view zonder `security_invoker = true` leest met de rechten van zijn eigenaar (zoals `app.accounts`). `check-secdef` eist dan:
    schema, `security_barrier`, namen met schema, een `where` die een functie uit schema `app` aanroept (het actorfilter) en eigenaar
    `app_definer`. Fail-closed: een materialized view, view-opties wijzigen of de view hernoemen via `alter`, een view in een `do`-blok
    of dynamische SQL, en `union`/`except`/`intersect` in zo'n view. Het actorfilter is een heuristiek; pgTAP en review blijven nodig.
- **Functiecatalogus** (pgTAP, ADR 0011): elke functie in `public` en `app` staat in een catalogus als `client` (uitvoerbaar voor `app_authenticated`)
  of `intern` (geen API-rol); de grants moeten bij die klasse passen, elke client-functie controleert de actor (`app.current_user_id()`)
  of heeft een vastgelegde reden waarom niet. Een nieuwe functie zonder klasse faalt.
- **Schema-snapshot**: `db/schema.snapshot.sql` via `pg_dump --schema-only -N tap --exclude-extension=pgtap` van de lokale database (het enige schemabestand; dbmate draait met `--no-dump-schema`); de agent leest dit, CI faalt bij verschil.
- **Eén actor**: `defineRoute` geeft `ctx.actor`; een handler zoekt de gebruiker nooit zelf op.
- **Audit log** (ADR 0021, spec `audit-log`): admin-acties laten in dezelfde transactie een regel achter in `app.audit_log`: append-only (guard-triggers,
  policy-allowlist, invariant in `db/tests/invarianten.sql`), met actor, databaserol en `app.request_id()`. `withUser()` zet `app.request_id` uit de
  server-gegenereerde `requestId` (`src/core/api/db/with-user.ts`); een client kan hem niet kiezen. Routes schrijven via `ctx.audit(actie, doelId, details)`
  (acties in `src/shared/audit.ts`, details strict); core-accountacties via `app.audit_account_action` (`src/api/routes/accounts.ts`).
- **Databasefouten op één plek**: `withUser()` vertaalt 23505 → `ALREADY_EXISTS`, 23503 → `NOT_FOUND`, 42501 → `FORBIDDEN`.
- **Limieten één keer**: harde grenzen in `src/core/shared/limits.ts`, app-grenzen in `src/shared/limits.ts` (ADR 0008); een CHECK-constraint met dezelfde waarde krijgt een gelijkheidstest.
- **Resourceverbruik (API4)**: `bodyLimit` op de Hono-app, maximale paginagrootte in `limits.ts`, database-timeouts (hierboven).
- **Verharding**: rate limit op elke route uit `defineRoute` per gebruiker en categorie (`lezen`, `schrijven`, `duur` via het contractveld `rateLimit`; eigen korte transactie vóór de routetransactie, spec `rate-limit`) en op inloggen/reset in Better Auth (opslag in de database, IP alleen uit een door de host gezette header); CAPTCHA op aanmelden/reset in staging en productie (lokaal uit, want offline);
  headers (CSP, HSTS, nosniff, Referrer-Policy) komen uit `src/core/api/http/security-headers.ts`: de server met `WEB_DIR` (ADR 0019) of de statische host zet ze voor de SPA, `secureHeaders()` voor `/api`; lokaal zet Vite dezelfde headers zodat e2e met CSP draait;
  CSP volledig uitgeschreven: `default-src 'self'`; `script-src 'self'` plus CAPTCHA-domein; `frame-src` CAPTCHA-domein; `connect-src 'self'`; `style-src 'self'` (geen nonce mogelijk bij een statische SPA; wat componenten inline zetten, wordt in e2e met CSP aan ontdekt en per ADR toegestaan); `img-src 'self' data:`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`; `object-src 'none'`; e2e draait met CSP aan
  (verwacht: Radix Dialog zet een inline `<style>`, dat vraagt een ADR of een andere scroll-lock); HSTS, nosniff, Referrer-Policy;
  service worker cachet nooit `/api/*`; één `onError` die `{ code, requestId }` teruggeeft, nooit stacktraces of SQL;
  `/design` bestaat alleen in dev-builds, `/design-system` staat achter `guard('design-system:read')` en toont alleen voorbeelddata (ADR 0015); de clientfouten-route (fase 2, nog niet gebouwd) is de enige data-route zonder login, met maximale grootte per melding, limiet per IP per minuut en geen onnodige vrije tekst.
- **Logging**: per request `requestId`, gebruiker-ID, duur, databasetijd. Clientfouten via `reportClientError()` naar een eigen tabel (fase 2, nog niet gebouwd); lint verbiedt kale `console.error` in `queries.ts` en de API-client.
  Een clientfout bevat alleen velden van een allowlist (bron, soort, foutcode, pad zonder query, telling, build-SHA), geen PII of vrije tekst, en wordt per 5 minuten ontdubbeld.
- **Secrets**: env-schema bij opstart; alleen publieke waarden krijgen `VITE_`. Geen productiegeheimen in de werkmap.
  `APP_ENV` (`local` | `test` | `staging` | `production`) is verplicht. Buiten `local`/`test` weigert het env-schema bij opstart:
  een `AUTH_SECRET` korter dan 32 bytes of met een demo-waarde erin; database-URL's met een demo-wachtwoord (URL geparsed, niet als
  hele string vergeleken); een `APP_ORIGIN` of `AUTH_BASE_URL` zonder `https`; `AUTH_BASE_URL` ≠ `APP_ORIGIN`. De demo-waarden staan
  als lijst in `src/core/api/env.ts` (niet uit `.env.example` gelezen); een test per regel bewijst het.
  Secret scanning met push protection; Betterleaks (opvolger van gitleaks, dat in onderhoudsmodus staat; versie gepind in `mise.toml`, lokaal en in CI dezelfde binary) in pre-commit en in CI over de hele geschiedenis (job `secrets`).
- **Supply chain**: Renovate gegroepeerd; pnpm-instellingen in `pnpm-workspace.yaml`: `minimumReleaseAge: 10080` (minuten = 7 dagen), `strictDepBuilds` met expliciete `allowBuilds`, `trustPolicy: no-downgrade`;
  versies in het framework zijn ondergrenzen bij schrijven, nooit de bewaking: osv-scanner faalt op bekende advisories;
  een uitzondering (osv, Betterleaks) heeft een reden en een einddatum (`ignoreUntil`), daarna wordt de check vanzelf weer rood;
  Actions gepind op SHA, `permissions: read-all`, runner gepind op `ubuntu-24.04`; deploy-secrets alleen in beschermde GitHub-environments;
  CodeQL en osv-scanner op elke PR en wekelijks op `main`.
- **Agentveiligheid**: de agent werkt via een GitHub App zonder `workflows`-recht (ADR 0005); het token van de eigenaar staat niet in de agent-omgeving.
  Tot die App bestaat (roadmap fase 1, GitHub) werkt de agent wél met de `gh`-login van de eigenaar; de grens is dan alleen de ruleset en de review van de eigenaar; permissieregels zijn geen beveiligingsgrens, de sandbox en GitHub wel; MCP-servers alleen read-only en versie gepind;
  het rolhek laat alleen MCP-tools uit `mcpLezen` (`.claude/gates.json`) door, anders hoofdsessie `ask` en subagent `deny`
  (`decideMcp` in `.claude/hooks/lib/rolhek.mjs`); tweede laag: `disallowedTools: mcp__*` voor architect, tester en docs;
  geen nieuwe dependency zonder akkoord van de eigenaar.

## 7. Design system

- **Tokens in drie lagen** in CSS (enige bron): primitief (OKLCH-palet, nooit direct gebruikt) → semantisch (shadcn-namen:
  `--background`, `--foreground`, `--primary`, … `--radius`; de enige laag die een app aanpast) → component (`--control-h-*`, `--focus-ring-*`).
- In `@theme` worden kleur, radius en schaduw van Tailwind gereset; `bg-red-500` bestaat niet. Dark mode via `[data-theme=dark]` met `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));`.
  De reset sloopt klassen die shadcn gebruikt (`bg-black/50`, `shadow-xs`): de codemod vangt die op. Vite `build.target` gelijk aan browserslist.
- **Tokens per zone** (ADR 0008): primitief, component en standaard-semantisch in `src/core/web/styles/`; een app past alleen de
  semantische laag aan in `src/web/styles/theme.css`.
- **Componenten**: shadcn/ui gekopieerd naar `src/core/web/ui` (basiskit, van de template); app-specifieke componenten en
  afgeleide varianten in `src/web/ui`, die ook de enige importbron voor `features/` is (her-exporteert core). Een basiscomponent dat
  elke app kan gebruiken, komt via een PR in de template. Na elke `shadcn add` zet een codemod het component op de eigen tokens; varianten in één CVA-recept; afleiden, niet forken; 44 px en focusring in de basis van elk recept.
- **Afgedwongen**: alleen bestaande klassen; in `features/` geen arbitrary values, `!` of `dark:` en alleen layout-klassen;
  geen rauwe `<button> <input> <select> <textarea> <dialog> <a>` buiten `src/core/web/ui` en `src/web/ui`; geen hex/benoemde kleuren buiten tokens;
  contrasttest over alle receptvarianten; `outline-none` alleen met `focus-visible:ring-*`; één `scanAxe(page)` (wcag2a/aa, 21aa, 22aa; lint verbiedt losse `AxeBuilder`);
  woordenlijsttest op `src/web/copy`; geen `matchMedia`/`userAgent`/`isMobile` in `src/web`; browserslist in `package.json`.
- **Hergebruik**: de schermskill haalt via `scripts/kit/feiten.mjs componenten` de actuele componenten op; lintmeldingen over rauwe elementen
  verwijzen naar datzelfde commando. Past geen component, dan stopt de agent en stelt een variant voor.
- **Catalogus en contrast** (vanaf het eerste component): `check:catalogus` eist dat elk component op `/design-system` staat of een
  uitzondering met code en reden heeft (in de ratchet); screenshot-baselines van de catalogus in de gepinde Playwright-image; de
  contrasttest bewijst ook dat een bekende foute kleur zou falen.
- **Startkit**: Button, Input, Field, Card, Dialog. Groeit per app-behoefte. WCAG 2.2 AA (4,5:1 tekst, 3:1 UI), één focusring, `prefers-reduced-motion`, 44 px aanraakdoelen.
- `/design-system` (catalogus, in de app voor admins, ADR 0015) en optioneel `/design` (prototypes uit `designs/`, alleen in dev).

## 8. Werkstraat

Elke rol begint met de feiten: `node scripts/kit/feiten.mjs` (gates, routes, permissies, foutcodes, componenten, ADR-statussen,
volgende vrije migratie- en ADR-nummer), niet met wat in proza staat.

1. **Spec** (architect) in `docs/specs/` volgens `_template.md` — alleen bij migratie, nieuwe route of nieuwe permissie. De architect schrijft
   alleen specs en ADR's (status `voorstel`) en stopt dan. Status `goedgekeurd` zet alleen de eigenaar; een goedgekeurde spec heeft een ingevulde
   sectie "Hergebruik en UX" (`check-docs`).
2. **Contract**: zod-schema's en routes die `501` teruggeven wanneer de wijziging een API-contract toevoegt.
3. **Tester-agent** schrijft acceptatietests tegen het contract; ze compileren en falen op hun asserties. Schrijft alleen in testpaden;
   per permissie en per policy ook de negatieve test.
4. **Developer** (hoofdsessie of developer-agent) bouwt tot groen; schrijft niet in gate-paden. Mag tests toevoegen. Een bestaande test wijzigen mag alleen als de spec of opdracht het geteste
   gedrag verandert; elke gewijzigde test staat met reden in de PR. Verwijderen of skippen alleen met akkoord van de eigenaar.
   Lijkt een test van de tester fout zonder dat het gedrag verandert, dan stopt de hoofdsessie en legt het de eigenaar voor;
   na akkoord past de tester (niet de hoofdsessie) de test aan.
5. **Reviewer-agent** met schone context controleert `docs/dod.md`: correctheid, duplicatie, spec-afwijking en testinhoud per criterium,
   en of de doc-wijziging in de PR zit (raakt de diff gedrag, API of conventies; zo ja, ontbreekt de doc, dan is dat een bevinding),
   elke blokkerende bevinding met bestand:regel en een pad van invoer naar fout. Stijl is werk van de lint.
   De review draait op de lokale branch (`git diff origin/main...HEAD`), direct nadat de developer groen is en vóór push en PR;
   de bevindingen zijn verwerkt voordat er opgeleverd wordt (ADR 0025). Wijzigt de code daarna nog (CI-fixes, conflicten),
   dan reviewt de reviewer die wijziging opnieuw (`git diff <reviewer-sha>..HEAD`).
6. **Opleveren** (alleen de hoofdsessie, pas na stap 5): featurebranch pushen, PR openen, CI-lus, conflicten via `git merge origin/main`,
   eindmelding. Mergen, goedkeuren, labels, check-statussen en statusovergangen blijven van de eigenaar; push naar `main` en force-push
   blijven verboden (ADR 0025 punt 1). Het rolhek dwingt die grenzen al af (tabel hieronder, WS-04a); de skill `opleveren` volgt in WS-04b.
7. **Eigenaar** reviewt en merget.

**Docs horen bij de wijziging**: de developer werkt bij elke wijziging die gedrag, API, configuratie of conventies raakt de relevante doc
mee, in dezelfde commit en PR (kort, met `bestand:regel`-verwijzingen, zonder code te kopiëren). Spec naar `gebouwd`, roadmap-vinkje en ADR-status
horen daar ook bij, met de goedkeuring van de eigenaar waar het beschermde paden zijn: een item waarvan het bewijs beschikbaar is, wordt in
diezelfde PR afgevinkt, en nooit zonder bewijs (`docs/dod.md`, Altijd). `check:docs-drift` waarschuwt in CI (geen blokkade) als `src/`
wijzigt zonder `docs/` of `CHANGELOG.md`. `check:roadmap` (in `gate:fast`) blokkeert wel: een nieuw of gewijzigd `[x]` zonder testpad, checknaam of PR-nummer, en een spec die naar `gebouwd` gaat zonder bewijs (`scripts/kit/check-roadmap.mjs`). Er is geen docs-stap na de merge.

Licht pad: geen migratie, route of permissie → plan, bouwen, review, opleveren.

CI zet gewijzigde bestaande tests als lijst in de PR.

**Eisen aan de rollen, ongeacht runtime:** de tester kan alleen in testpaden schrijven; de reviewer is read-only (geen schrijfrechten; alleen leescommando's, `git diff/log/show/status`, `gh pr view/diff/checks` en de checks uit `docs/dod.md`) met een begrensd aantal beurten; beide starten met schone context en alleen de afgebakende opdracht. Een rol telt alleen als onafhankelijk, ook als ad-hoc subagent, wanneer de runtime die eisen afdwingt. Is dat niet zo, of ontbreekt de rol, voer dan geen onafhankelijke review voor die rol op: benoem de ontbrekende stap expliciet en laat de eigenaar die uitvoeren vóór samenvoegen. De hoofdsessie reviewt nooit haar eigen werk.

**Claude Code-implementatie** (ADR 0011): vijf subagents — architect, developer, tester (sonnet), reviewer (opus, `tools: Read, Grep, Glob, Bash`), docs (optioneel, geen vaste stap) —
elk met `model` en `maxTurns`; schrijfrecht per rol bepaalt de rolhek-hook, niet de tools-lijst. Hooks, permissies, sandboxinstellingen en
agentconfiguratie zijn runtime-specifiek; documenteer en activeer ze alleen voor de runtime waarvoor ze zijn getest, en zeg in AGENTS.md dat ze
voor andere runtimes (Codex, cloudsessies) niet gelden. De eisen hierboven gelden voor elke runtime.

**Rolhek en gate-paden**: `.claude/gates.json` is de enige lijst met `gates` (paden die alleen via een gate-wijziging veranderen), `testpaden`,
`jsonGates` (`package.json` → `scripts`: alleen die sleutel is een gate), `goedkeurders` en `schrijfrecht` per rol (architect: specs en ADR's;
tester: testpaden; reviewer: niets; docs (optioneel): `docs/reviews/`, `docs/operations/`, `docs/README.md`, `docs/gouden-pad.md`, `README.md`,
`CHANGELOG.md`, geen gate-paden: roadmap-vinkjes en spec- of ADR-statussen stelt hij voor; developer en hoofdsessie: alles behalve gates en bestaande tests). De rolhek-hook leest hem lokaal,
de diff-guard in CI leest dezelfde lijst, en `check-docs` vergelijkt CODEOWNERS en `ask` ermee. Een bestaand hulpbestand in een testpad (geen
`*.test.*`/`*.spec.*`/`db/tests/`) wijzigen meldt het rolhek ("hulpbestand gewijzigd"), verwijderen is een gate; een bestaand bestand onder
`test/rails/fixtures/` of `test/setup/` wijzigen ook, ook als het `*.test.*` heet (`existingTest` in `.claude/hooks/lib/rolhek.mjs`). `check-docs`
faalt als `schrijfrecht` van een rol overlapt met `gates`, behalve architect → `docs/adr/**` en `docs/specs/**`, tester → testpaden, en developer
en hoofdsessie (het rolhek handelt gates voor hen af met ask/deny); alleen de bestandsnaam-gates uit `testpaden` (`**/*.test.*`, `**/*.spec.*`)
tellen niet mee, map-gates als `test/**` en `e2e/**` wel (`schrijfrechtViolations` in `scripts/kit/check-docs.mjs`).

Hooks (exit 2 blokkeert; exit 1 en een timeout laten het toolgebruik door — fail-open. Elke hook is daarom kort en deterministisch,
met een korte expliciete `timeout` en `set -euo pipefail` met `trap 'exit 2' ERR`; de harde grens blijven sandbox, CI en GitHub).
SubagentStop staat in `.claude/settings.json` (matcher = agentnaam), niet in de frontmatter van de subagent:

| Hook | Doet |
|---|---|
| PostToolUse (Edit/Write) | ESLint + Prettier op het bewerkte bestand |
| Stop | typecheck/lint/unit op geraakte bestanden; `{"decision":"block","reason":…}` met ≤ 40 regels; stopt direct bij `stop_hook_active`; overslaan in plan mode of zonder wijzigingen; nooit netwerk of database |
| SubagentStop "groen vóór klaar" (developer) | blokkeert met `{"decision":"block"}` en de laatste 40 regels tot `gate:fast` groen is, ook bij een schone werkmap (een commit bewijst niet dat de pre-commit draaide) |
| SubagentStop (tester, reviewer) | tester → lint en typecheck groen, en de nieuwe tests falen alleen op asserties (de acceptatietests zijn rood tot de developer klaar is); reviewer → rapport geschreven |
| SessionStart | spec, branch, laatste checkuitslag, status lokale stack (`doctor --quick`) als `additionalContext` |
| PreToolUse rolhek (Edit/Write/Bash, alle rollen) | schrijfrecht per rol uit `.claude/gates.json` (ook voor Bash-schrijfdoelen: redirect, `sed -i`, `tee`, `cp`, `mv`, `rm`, `git checkout/restore`); simuleert Edit/Write op `jsonGates` en vergelijkt de sleutel; blokkeert gegenereerde bestanden, gecommitte migraties (= in de merge-base met `origin/main`, zoals `check:migrations`; onleesbaar → `HEAD` met de hint `git fetch origin`), verwijderen of skippen van bestaande tests en hulpbestanden, wijzigen van fixtures en setup; wijzigen van een bestaande test of hulpbestand meldt hij als `additionalContext` |
| PreToolUse rolhek (Bash, alle rollen) | blokkeert push naar `main`, force-push (`--force` en elke afkorting vanaf `--forc`, `-f` ook in een cluster, `--force-with-lease`, `--force-if-includes`, refspec met `+`), mergen (`gh pr merge` ook `--auto`, `gh api` naar `…/merge`, `…/merges` of `…/auto-merge` met elke methode, ook GET: lees de status met `gh pr view --json merged`; GraphQL `mergePullRequest`/`enablePullRequestAutoMerge`/`mergeBranch`; `ghForbidden` en `gitForbidden` in `.claude/hooks/lib/rolhek.mjs`), `LEFTHOOK=0`, `--no-verify`/`-n`, `core.hooksPath` (leesvormen met `--get` mogen, per commandosegment), `gh pr review`, het label `gate-wijziging`, `gh api` naar labels, reviews, statuses of check-runs; voor subagents ook elke push, `git merge`, rebase en `reset --hard`; reviewer alleen `pnpm check:*`/`test*`/`gate:*`, `git diff/log/show/status`, `gh pr view/diff/checks` |
| PreToolUse rolhek (`mcp__.*`, alle rollen) | een MCP-tool die niet exact in `mcpLezen` (`.claude/gates.json`) staat: hoofdsessie `ask`, elke subagent (ook een onbekende) `deny`; standaard is de lijst leeg |

Alle hooks werken in de root uit de payload: de git-root van `cwd` (een worktree), terugval `CLAUDE_PROJECT_DIR` (`.claude/hooks/lib/root.mjs`).
Elke hook heeft een tabeltest (`test/hooks/*.test.ts`): echte stdin-payloads met de verwachte exitcode, inclusief omzeilingen (tweede commando na
een leesuitzondering, aanhalingstekens rond redirect-doelen). Wat tekstheuristiek niet vangt (`bash -c`, `node -e`), vangt de diff-guard in CI.

Permissieregels in `.claude/settings.json` zijn gemak, geen grens (Claude Code-docs): deny op `.env*` en `*secret*`, pushes naar `main`,
force, `--no-verify`, `LEFTHOOK=0`, mergen, zelfreview (`gh pr review`, labels, statuses) en `docker`; `disableBypassPermissionsMode: "disable"`; `ask` op de beschermde paden (§10), op `pnpm add/install/update/remove`, op `sed -i`/`perl -pi`
(Edit-regels dekken Bash-schrijfacties niet) en op elk commando uit `excludedCommands`, zodat de eigenaar elke run buiten de sandbox goedkeurt.
Permissieregels vangen alleen de gangbare vormen (bijv. `git commit -n` midden in de opties niet); de rolhek-hook dekt dat.
De sandbox (`failIfUnavailable`, `allowUnsandboxedCommands: false`, `denyRead` op `~/.ssh` en `~/.aws`; `~/.config/gh` volgt zodra de agent met het App-token werkt) en GitHub zijn de grens.
De sandbox draait niet op native Windows: met `failIfUnavailable` start Claude Code daar niet; werk in WSL2. Op Linux/WSL2 bereikt een
commando in de sandbox `localhost` niet; commando's die de lokale stack nodig hebben (`pnpm test:db`, `pnpm gate:slow`, …) staan
in `excludedCommands` als patroon met ` *`, zodat argumenten meekomen (zonder wildcard matcht het exact). Daarmee draaien ook door de agent geschreven tests buiten de sandbox; hoe dat gat dichtgaat, staat in ADR 0009. `scripts/runner.sh` (`check_host_files`) weigert te starten als de host-bestanden lokaal afwijken van de merge-base met `origin/main` (onleesbaar → weigeren: `git fetch origin`) of in CI van `HEAD`; alleen de eigenaar slaat dat over met `--sta-wijzigingen-toe` (ADR 0025 punt 4). De toolchain (mise: Node, pnpm, dbmate, Betterleaks) installeert de eigenaar via `scripts/bootstrap.sh`, niet de agent.

## 9. Documentatie en tokenbudget

| Bestand | Inhoud | Laadt | Budget |
|---|---|---|---|
| `AGENTS.md` | Stack, commando's, harde regels | Altijd | ≤ 100 regels |
| `CLAUDE.md` | `@AGENTS.md` + werkstraat | Altijd | ≤ 50 regels |
| `.claude/rules/*.md` | Conventies per pad | Bij bestanden op dat pad | ≤ 60 regels |
| `.claude/skills/*/SKILL.md` | Procedures met live feiten | Bij gebruik | ≤ 200 regels |
| `docs/specs/` | Featurespecs | Tijdens de feature | 1–2 pagina's |
| `docs/adr/` | Beslissingen | Op verzoek | 1 pagina |
| `docs/operations/` | Release, rollback, back-up en herstel | Bij release of incident | 1–2 pagina's |

Wat een type of check afdwingt, staat niet in proza. Wat soms nodig is, hoort in een skill of padregel, niet in een `@`-import.
Groeit een altijd-geladen bestand over zijn budget, dan ontbreekt er een gate: maak de gate, haal de regel weg (de eigenaar of de optionele docs-rol bij een opschoning).
Elke padregel eindigt met "Besloten, nog niet gebouwd": wat besloten is maar nog niet bestaat, zodat de agent er niet op vooruit bouwt.
Live feiten (gates, routes, componenten, nummers) komen uit `scripts/kit/feiten.mjs` via `!`-injectie in skills, niet uit proza.

## 10. Versiebeheer, CI en release

- Repo in een organisatie; de agent pusht via een GitHub App zonder `workflows`-recht en zonder admin (ADR 0005). De eigenaar merget.
- Ruleset op `main` (op organisatieniveau via een custom property, want "Use this template" kopieert geen rulesets of settings):
  alleen via PR; geen force push of delete; verplichte checks `gate:fast`, `gate:slow`, osv-scanner; "Require code scanning results"
  (CodeQL); code-owner-review; goedkeuring vervalt bij nieuwe push; geen bypass voor de bot; merge-methoden alleen merge en squash.
  Tot de GitHub App bestaat, pusht de agent onder het account van de eigenaar en kan die zijn eigen PR niet goedkeuren: dan 0 goedkeuringen
  en geen code-owner-review, wel PR-plicht, geen force push en geen delete (ADR 0006). Rulesets op private repo's vragen GitHub Pro of Team.
- Actions-instellingen: "Allow GitHub Actions to create and approve pull requests" uit; "Require actions to be pinned to a full-length commit SHA" aan.
- **Beschermde paden** (bron: `.claude/gates.json`, ADR 0011; CODEOWNERS spiegelt hem volledig, `ask` in `.claude/settings.json` zonder de paden waarin de agent
  hoort te schrijven: tests (`*.test.*`, `*.spec.*`, `db/tests/`, `e2e/`, `test/`) en `docs/specs/`. Toevoegen mag daar; verwijderen of skippen
  van bestaande tests blokkeert de rolhek-hook, `goedgekeurd` bewaakt `check-spec-approval`. `check-docs` bewaakt beide spiegelingen):
  `AGENTS.md`, `CLAUDE.md`, `docs/framework.md`, `docs/dod.md`, `docs/roadmap.md`, `docs/adr/`, `docs/specs/`, `.github/`, `.claude/`, `scripts/`,
  `db/init/`, `db/docker/`, `db/tests/`, `compose*.yaml`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `.pnpmfile.cjs`,
  `mise.toml`, `.env.example`, `eslint.config.*`, `eslint-suppressions.json`, `.kit/`, `osv-scanner.toml`, `.betterleaksignore`,
  `tsconfig*.json`, `.dependency-cruiser.*`, `lefthook.yml`, `renovate.json`, `.gitattributes`,
  `src/core/`, `src/api/app.ts`, `src/api/kit.ts`, `src/api/server.ts`, `src/api/env.ts`, `src/shared/permissions.ts`, `deploy/`,
  alle `*.test.*`/`*.spec.*`, `e2e/`, `test/`, en de configs die checks bepalen: `vitest.config.ts`, `playwright.config.ts`, `vite.config.ts`,
  `.prettierrc.json`, `.prettierignore`, `Dockerfile`, `.dockerignore`, `db/test.env`, `docs/nieuwe-app.md`.
  `src/core/` is daarnaast core (ADR 0008): in een app wijzigt alleen een template-merge het, bewaakt door `check-core`.
- Instellingen als code in `.github/settings/main-protection.json`; `scripts/check-github.mjs` controleert alleen-lezend dat ze actief zijn en faalt als de agent
  onder het account van de eigenaar werkt, als een verplichte check niet van GitHub Actions komt (`app_id`, anders is een status te vervalsen), als
  beheerders de regels kunnen omzeilen of als reviewgesprekken niet opgelost hoeven te zijn. Wat niet als code kan (host, database-provider),
  staat als checklist in `docs/operations/rails-checklist.md`; een onleesbare instelling telt als fout, nooit als goed.
- `check-docs`: elk pad, `pnpm`-script en identifier tussen backticks in `AGENTS.md`, `CLAUDE.md` en `.claude/**` bestaat; relatieve links in `docs/` kloppen;
  `.claude/gates.json`, CODEOWNERS en `ask` zijn gelijk (op de genoemde uitzonderingen na); het gate-register is gelijk aan `gate:fast`/`gate:slow`;
  spec- en ADR-statussen uit de vaste woordenlijst; een goedgekeurde spec heeft "Hergebruik en UX"; elk component heeft een rij in de catalogus.
- **Spec goedkeuren**: een spec komt in een eigen PR met `status: voorstel`; de eigenaar zet `goedgekeurd` in die PR en keurt hem goed.
  `check-spec-approval` controleert via de GitHub API dat de wijziging naar `goedgekeurd` in een PR zit met een goedkeuring van de eigenaar
  (commit-auteurs zijn te vervalsen).
- `guard.yml` (`pull_request_target`, draait altijd de versie van de default branch) voert de check-scripts van `main` uit. PR-code wordt
  alleen als git-data in een aparte map uitgecheckt en nooit uitgevoerd: geen `pnpm install`, geen configs of scripts uit de PR,
  `persist-credentials: false`, minimale `permissions`; controleert dat base-repo en -branch kloppen en beide SHA's volledig (40 tekens) zijn.
- **Diff-guard** (in `guard.yml`, ADR 0011): raakt een PR een pad uit `gates` in `.claude/gates.json`, de sleutel `scripts` in `package.json`, of
  wijzigt hij een bestaande test (toevoegen is vrij), dan faalt de check tenzij de PR het label `gate-wijziging` heeft én de laatste beslissende
  review van een goedkeurder (niet de auteur) APPROVED is op exact de head-SHA. Een label alleen is geen akkoord. Paden uit `git diff -z` (NUL-gesplitst).
- Korte branches, één onderwerp, squash-merge, conventional commits. Uitzondering: de template-koppeling en template-updates
  landen als merge-commit; squash gooit de tweede ouder weg en dan conflicteert elke volgende update op alles (ADR 0006).
- CI: runner `ubuntu-24.04`, toolchain via `jdx/mise-action` (geen Corepack); snelle job op elke push, trage job op PR's en `main`; concurrency annuleert oude runs; pad-filters en caches.

### Release (geldt voor elke host)

- Lokaal → PR → staging → productie. Database vóór code, altijd eerst staging. Merge op `main` → staging; release-tag + goedkeuring
  van de eigenaar in een beschermde environment → productie. Automatische Git-deploys van de host staan uit: CI bouwt en zet neer.
- Geen preview-deploys tegen staging zonder de migraties van die PR. Een preview-build tegen de productiedatabase faalt (de check weigert de combinatie).
- `check-release-ci`, vóór én na de build: het commit is nog de kop van `main` en CI was groen voor exact dit commit (en voor productie: staging ook). `check-deployment-schema`: het productieschema
  heeft alleen-lezend de tabellen en kolommen die de code verwacht, afgeleid uit het Drizzle-schema.
- Per omgeving een eigen build (publieke `VITE_`-waarden zitten in de build): hetzelfde commit, niet dezelfde build.
- Migraties append-only en expand/contract; `check-migrations` vergelijkt met `origin/main` en eist unieke versienummers
  (dbmate-tijdstempels voorkomen botsingen bij `git merge template/main`). Nooit handmatig aan productie.
- Smoketest na elke deploy (staging en productie): inloggen met een testaccount, één leesactie, en bewijzen dat een
  eventuele provider-data-API voor de browser dicht is. Lokaal bewijst een test dat `api_user` zonder `withUser()` niets ziet.
- Rollback: code via de host, database vooruit met een nieuwe migratie, in nood uit back-up. Na een release een uur fouten en logs volgen.
  Concreet per host in `docs/operations/` (fase 3, per app).

### Template-updates naar een app

"Use this template" maakt een nieuwe geschiedenis. Direct na het aanmaken eenmalig:
`git remote add template <url>`, `git fetch template`, `git merge --allow-unrelated-histories -s ours template/main`.
Daarna haalt een gewone `git merge template/main` op een branch, via een PR, de updates binnen; de eigenaar merget met
**Create a merge commit**, nooit squash. Workflow-wijzigingen pusht de eigenaar. App-eigen ADR's nummeren vanaf `0100`;
`0001`–`0099` zijn van de template. Het hele traject voor een nieuwe app staat in [nieuwe-app.md](nieuwe-app.md) (ADR 0006).

### Meten

CI logt per PR welke checks faalden. Na een wijziging aan de agent-opzet bouwt de agent dezelfde drie testopdrachten opnieuw;
een regel blijft alleen als hij aantoonbaar helpt.

## 11. Lokaal ontwikkelen

- Ubuntu 24.04 (native of WSL2), code op ext4 (`~/code`), Docker Engine, mise (`mise.toml`), gh, `bubblewrap` en `socat` (sandbox van Claude Code). WSL2: `systemd=true` in `/etc/wsl.conf`
  (nodig voor Docker Engine), `fs.inotify.max_user_watches=524288`, `networkingMode=mirrored`.
- `compose.yaml` levert Postgres (eigen image met pgTAP) en Mailpit, gebonden aan `127.0.0.1`. De app (Vite, Hono) draait native, niet in Docker.
- `pnpm dev` (fase 1): Docker-check, `.env.local` uit `.env.example`, `docker compose --env-file .env.local up -d --build --wait`, migraties, Hono :8787 + Vite :5173.
  Poorten via `.env.local`, zodat meerdere apps naast elkaar draaien. Compose leest zonder `--env-file` alleen `.env`, en de poort
  staat ook in de URL's: een andere poort betekent `PG_PORT` én de drie database-URL's aanpassen, en `SMTP_PORT` én `SMTP_URL`.
  Vite- en Hono-poort worden in het skelet instelbaar (`WEB_PORT`, `API_PORT`), met `APP_ORIGIN` en `AUTH_BASE_URL` erop afgestemd.
- De agent gebruikt `docker` niet (deny); de stack is van de eigenaar. Draait de stack niet (vanaf fase 1 meldt de SessionStart-hook dat via `doctor --quick`), dan vraagt de agent de eigenaar `pnpm dev` te starten. Sandbox met `failIfUnavailable: true`; alleen `pnpm test:db`, `pnpm ui:check`,
  `pnpm gate:slow`, `pnpm db:generate` en `pnpm check:snapshot` draaien buiten de sandbox (`excludedCommands`), elk na goedkeuring van de eigenaar;
  `test/rails/excluded-commands.test.ts` bewijst dat elk patroon een script is en elk Docker-script erin staat.
  CODEOWNERS op hun scripts is niet genoeg: ze laden door de agent geschreven tests en configs. Isolatie daarvan: ADR 0009.
- Screenshot-baselines alleen in de gepinde Playwright-image.
- Devcontainer (optioneel): Docker-in-Docker, nooit de host-socket doorgeven.

## 11a. Repo-structuur

```
src/core/     van de template (ADR 0008); een app wijzigt dit niet
  api/        route/ (createRouteKit, defineRoute) db/ (pool, withUser, foutvertaling) auth/ (Better Auth)
              http/ (createApp: CSRF, bodyLimit, secureHeaders, onError) obs/ env.ts (basisschema, enige process.env)
  web/        ui/ (basiskit, AsyncView, Form) styles/ (tokens) lib/ (api-client.ts, auth.ts, env.ts, format.ts; report-error.ts volgt in fase 2) copy/ (basisteksten)
  shared/     can.ts (engine) errors.ts (basiscodes) limits.ts (harde grenzen) ids.ts assert unsafeCast Cents cursor
src/web/      routes/ features/ ui/ (eigen componenten + barrel) styles/theme.css lib/ (api.ts, env.ts) copy/ dev/
src/api/      app.ts kit.ts server.ts env.ts (zodra de app eigen variabelen heeft) routes/ domain/ db/ (gegenereerd: schema, ids.ts)
src/shared/   schema's, permissions.ts, errors.ts, limits.ts, ids.ts (app-uitbreidingen)
deploy/<host>/ adapter per gekozen host (per app)
db/           docker/ (Postgres+pgTAP) init/ (rollen, alleen lokaal) migrations/ (dbmate) tests/ (pgTAP) schema.snapshot.sql
e2e/          Playwright-tests tegen de echte lokale stack
scripts/seed  testgebruikers per rol via de auth-API (wachtwoordhashes, vast lokaal TOTP-geheim voor admin)
scripts/      dev bootstrap doctor runner (db, ui, gen) db-generate check-*
scripts/kit/  gates.mjs (gate-register) feiten.mjs ratchet.mjs diff-guard.mjs check-*.mjs (ADR 0011)
.kit/         baseline.json (ratchet)
designs/      optioneel: prototype-exports
docs/         framework.md roadmap.md dod.md nieuwe-app.md gouden-pad.md specs/ adr/ operations/ reviews/
.claude/      settings.json gates.json agents/ skills/ rules/ hooks/ (rolhek, werkstraat)
.github/      workflows/ settings/ CODEOWNERS pull_request_template.md
compose.yaml  mise.toml  AGENTS.md  CLAUDE.md  CHANGELOG.md
```

## 12. Fasering

| Fase | Inhoud |
|---|---|
| 0. Bewijs | `api_user` + `withUser()` via `pg`, direct én via PgBouncer (transaction mode) in compose, zonder lekken |
| 1. Fundament | Verticale stukken: skelet met rails en test-infra, auth, secure route met gebruikersbeheer als referentie-feature (gouden pad), rails afdwingen, agent-opzet (met `new:resource`), GitHub — zie `roadmap.md` |
| 2. Eerste features (per app) | Clientfouten; wat in een app doorglipt, wordt eerst een check in de template |
| 3. Eerste release (per app) | Providerkeuze per ADR, adapter, staging/productie, runbooks |

Fase 0 en 1 horen in de template; het gouden pad en de generator ontstaan in fase 1 uit gebruikersbeheer. Fase 2 levert verbeteringen terug aan de template; fase 3 is per app.

### Uitbreidingen, op aanleiding

| Uitbreiding | Toevoegen wanneer |
|---|---|
| Bestanden (signed URL's) of realtime | De app heeft ze nodig, met een eigen ADR |
| Idempotente mutaties (ADR 0011): request-UUID die de client vóór het netwerkverzoek vastlegt en bij herhalen hergebruikt; bonnetabel met payload-hash (zelfde UUID, andere inhoud → `REQUEST_ID_CONFLICT`); `pg_advisory_xact_lock` per UUID; opvragen of annuleren (tombstone) van een onbekende uitkomst | Mutaties met geld of voorraad |
| Screenshot-regressie en axe in CI | Een visuele of toegankelijkheidsfout glipte door |
| jscpd, knip, ast-grep | Review vindt herhaaldelijk kopieën, dode code of een fout patroon |
| Mutation testing | Kritieke reken- of geldlogica |
| Renovate automatisch mergen, OpenTelemetry | De basis draait stabiel |
| Devcontainer of agent-sandbox in Docker | Iemand werkt mee, of agents draaien zonder toestemmingsprompts |
