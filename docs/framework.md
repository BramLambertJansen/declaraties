# Framework

Deze regels gelden altijd. Afwijken alleen na een vraag en een expliciet akkoord van de eigenaar. Akkoord staat in de PR (template) of in app-ADR 0100+ (app). Vaste uitzonderingen staan limitatief in §3.

Elke norm is één regel `R-<domein>-<nr>` met herkomst (ADR-nummer of bron).

## 1. Principes

- **R-PRINC-01** Maak fout onmogelijk, niet verboden; wat type of gate afdwingt, krijgt geen proza (0046)
- **R-PRINC-02** Afdwingen boven afspreken: harde grens is CI en GitHub; instructies en hooks sturen alleen (0045)
- **R-PRINC-03** Eén bron per feit (migraties, zod-contracten, één tokenlaag, één script per check); lokaal gelijk aan productie (0042)
- **R-PRINC-04** Rail-fix begint met test die op oude code faalt; elke check heeft falende fixtures, ook voor omzeilingen (0045)
- **R-PRINC-05** Provider-neutraal: geen hostingprovider of database-as-a-service in template; alleen via adapter (0039)
- **R-PRINC-06** Eén ronde per besluit (R-WERK-05, R-WERK-07, R-WERK-08); prompts alleen voor wat vóór review werkt (0046, 0062)
- **R-PRINC-07** Meet vóór en na elke werkstraatwijziging (`pnpm meting`; per besluit telt `gh pr list --state merged` PR's en doorlooptijd); nulmeting is `pnpm new:resource demo --dry-run` plus droge walk-through van het gouden pad; regel blijft alleen als hij aantoonbaar helpt (0046)
- **R-PRINC-08** Geen roadmap-item, rail of ADR zonder aanleiding (app-behoefte, doorgeglipte fout, gemeten wrijving); anders vraag eigenaar (0046)
- **R-PRINC-09** Zwak nooit check, test, hook, RLS-regel of type af; zou fix dat doen: stop en vraag; strengere check is geen ADR (0046)
- **R-PRINC-10** Tokenwinst alleen met cijfers; controles, negatieve securitygevallen, onafhankelijke review nemen niet af (0057)
- **R-PRINC-11** Klaar = uitvoer van bewijzende check; verzin geen commando's, bestanden, uitslagen (AGENTS)

## 2. Architectuur

Afgedwongen door: dependency-cruiser (ook cycles), ESLint, `check-core`.

- **R-LAAG-01** Zones: `src/core/{api,web,shared}` is template (in app alleen via template-merge); app-code in `src/{api,web,shared}` (0040)
- **R-LAAG-02** App importeert core, core nooit app; core krijgt app-input als argument van compositie-root (`src/api/app.ts`, `src/api/kit.ts`, `src/web/lib/api.ts`); geen globale registratie of singleton (0040)
- **R-LAAG-03** Frontend importeert alleen `src/core/shared` en `src/shared` (contracten `src/shared/contracts`); nooit databasedriver, ORM, provider-SDK, iets uit `src/api` of `src/core/api` (ook geen types); data alleen via `src/web/lib/api.ts` (0040)
- **R-LAAG-04** API importeert niets uit web; `shared` alleen libraries (zod) en core/shared (AGENTS)
- **R-LAAG-05** Alleen `src/core/api/db` (driver `pg`, Drizzle) en `src/core/api/auth` (Better Auth als `auth_service`, alleen schema `better_auth`) maken databaseverbindingen; `src/api` gebruikt voor database alleen `drizzle-orm[/pg-core]`, nooit een driver (0042, 0043)
- **R-LAAG-06** `src/core/api/db` exporteert alleen `withUser()`, `pingDatabase()` (readiness) en `closeDatabase()` (stoppen) alleen vanuit `src/api/server.ts`, `createAuditFn()` uit audit.ts (enig bestand naast index, testing, types; alleen `app.audit` in `tx`), `testing.ts` (alleen tests) (0042)
- **R-LAAG-07** `better-auth/react` alleen in `src/core/web/lib/auth.ts`; `hono` alleen in `src/core` (0040)
- **R-LAAG-08** `process.env` alleen in `src/core/api/env.ts` (app-uitbreiding `src/api/env.ts` (nog niet gebouwd)); `import.meta.env` alleen in `src/core/web/lib/env.ts`; `MIGRATOR_DATABASE_URL` alleen in `scripts/`; alleen publieke waarden `VITE_` (0040)
- **R-ARCH-01** App breidt uit door registreren, nooit core wijzigen; past iets niet: stel uitbreidingsplek in template voor; core-fout oplossen in template (0040)
- **R-ARCH-02** Elk uitbreidingspunt heeft core-test dat app het zonder core-wijziging gebruikt (plaats en gebruik: ADR 0040 punt 10); core/app-tabel via `src/shared/{permissions,errors,limits,ids,audit}.ts` (0040)
- **R-ARCH-03** Nieuwe rol: `ROLES` in `src/core/shared/can.ts`, migratie voor CHECK op `public.user_roles.role`, seed-account in `src/core/api/dev/seed-accounts.ts`, naam in `roleLabels` (rules)
- **R-ARCH-04** App-config binnen harde core-grens (`createApp` weigert limiet boven core-grens) (0040)
- **R-ARCH-05** Browser praat alleen met API, same-origin via `/api`; geen server-rendering; per host één adapter in `deploy/<host>/`, zonder logica (fw)
- **R-ARCH-06** API en database in één regio; kleine pool op moduleniveau; geen opeenvolgende queries per request; databasetijd per request in log; routes lazy; bundelbudget per scherm in `src/web/bundle-budget.ts`, getoetst door `test/ui/bundle-budget.test.ts` in `gate:fast` (fw)
- **R-ARCH-07** `check-core` laat wijziging van `src/core/` in app falen behalve vertrouwde template-merge; verplicht in app-ruleset. Bekend gat: merge met oudere template-commit kan core terugzetten of wissen (0040)
- **R-ARCH-08** Mapindeling staat in §11a (R-ARCH-10); nieuwe topmap of laag vraagt regel (fw)

## 3. Poorten en adapters

Afgedwongen door: dependency-cruiser, lint, smoketest op provider-data-API.

- **R-PROV-01** Template levert Postgres 17 + pgTAP, dbmate, `db/init/`, Mailpit; hosting, beheerde Postgres, SMTP, fouttracking kiest eigenaar per app-ADR 0100+ (hosting-ADR bij eerste release); fouttracking standaard in eigen tabel via `reportClientError()` (fase 2, nog niet gebouwd), externe dienst optioneel; Supabase en Vercel zijn voorkeur van eigenaar, niet template (0039, 0040)
- **R-PROV-02** Geen provider-functies of -schema's (`auth.uid()`, Data API, `storage.*`, `realtime.*`); provider-data-API voor browser uit, smoketest bewijst dat (0039)
- **R-PROV-03** Geen provider-SDK in `src/web`; in `src/api` alleen in `deploy/<host>/` of door ADR toegestane adapter (0039)
- **R-PROV-04** Major van Node, pnpm of TypeScript vraagt ADR; geen Corepack; `package.json` enige bron pnpm-versie; Renovate blokkeert TypeScript 7; Postgres 18 pas als alle beoogde providers het bieden (0039, 0042, 0061)
- **R-PROV-05** Beheerde database: eigen rollen toegestaan; herhaal pooler-lektest tegen provider; Postgres-versie gelijk aan lokaal (0042)
- **R-PROV-06** Externe auth-provider alleen per ADR; release-workflows, smoketest, runbooks, jobs-trigger horen bij app-ADR (0039, 0041, 0050)
- **R-OPSL-01** Core levert poort `FileStorage` met contracttestsuite; geen provider-SDK of productieopslag in template; provider per app-ADR (0060, nog niet gebouwd)
- **R-OPSL-02** Opslag alleen via kortlevende signed URL (na permissie- en eigenaarcontrole, één object, één methode; upload schrijft eenmalig, download als bijlage met neutraal type); geen publieke buckets of listing (0060)
- **R-OPSL-03** Sleutel uit rij-id, nooit gebruikersinvoer; upload heeft metadatarij met `owner_id` en RLS; verwijderen via wachtrij; fout uit voor-stap pas na rol-, permissie-, MFA-, eigenaarcontrole; dev-adapter alleen `APP_ENV=local` of `test` (0060)
- **R-OPSL-04** Geen opslag in productie tot runner (ST-03) werkt (0060)
- **R-JOB-01** `startJobs()` (nog niet gebouwd) draait taken op interval vanuit `src/api/server.ts`, batch = één transactie met advisory lock; nul-schalende host: adapter roept `runJobsOnce()`; HTTP-cronpad alleen met hostgeheim, §3-uitzondering (0050)
- **R-JOB-02** `withJob()` gebruikt eigen pool als rol `app_jobs` (`JOBS_DATABASE_URL`, execute alleen klasse `job`, niets op `better_auth`); termijnen uit `limits.ts` gelijk in `app.retention` (0050, 0051)
- **R-JOB-03** `app.mail_outbox` (nog niet gebouwd): RLS geforceerd, geen link of token in payload, foutcode zonder adressen; erin alleen via `app.enqueue_mail` (security definer, definer per mailsoort); at-least-once met lease, link pas bij verzenden (0050)

### Uitzonderingen (limitatief)

- **R-UIT-01** Alleen `src/core/api/db` raakt `pg`; uitzondering `src/core/api/auth` (0041)
- **R-UIT-02** Route via `defineRoute` en met login; uitzondering `/api/auth/*` en clientfouten-route (fase 2, nog niet gebouwd; enige data-route zonder login: maximale grootte per melding, limiet per IP per minuut, geen onnodige vrije tekst); zonder login ook `GET /api/health`, `GET /api/ready` (alleen `{ ok }`) (0041, 0049)
- **R-UIT-03** Schermroute heeft `can()`-guard; uitzondering `/login`, `/uitnodiging`; spec vóór route: uitzondering `GET /api/health`, `GET /api/ready` (0049)
- **R-UIT-04** Geen voorafgaand besluit voor functionele UI in core: `src/core/web/ui` en `src/core/web/copy` volgens R-WERK-18 (0056, 0058)
- **R-UIT-05** `POST /api/dev/login-as` alleen `APP_ENV=local` (elders 404), CSRF-controle, alleen `{ rol: 'user' | 'admin' }`, echt inloggen als seed-account (0043)
- **R-UIT-06** Dev-opslagroute (OPSL) valt buiten `defineRoute`, login, CSRF, bodyLimit; alleen `APP_ENV=local` of `test` (0060)

## 4. Codeerkaders

Afgedwongen door: ESLint (`--max-warnings 0`), dependency-cruiser, `tsc`, gate-register `scripts/kit/gates.mjs`, ratchet `.kit/baseline.json`, `check-migrations`.

- **R-CODE-01** Checks op code via AST, op database via catalogus, nooit regex over bronbestanden; lintmeldingen noemen de juiste helper (0045)
- **R-CODE-02** Functie ≤ 60 regels (`.ts`) of 120 (`.tsx`), max 3 parameters, diepte 3, cognitive-complexity 15 (AGENTS)
- **R-CODE-03** Parse op elke grens met zod via `defineRoute()` (`.strict()`); env-schema alleen in `src/core/api/env.ts` (fw)
- **R-CODE-04** Geen `x as T` of `<T>x` (`as const` en `import { a as b }` mogen), `any`, `@ts-ignore`, `eslint-disable`; uitweg `unsafeCast(value, reden)`, CI zet het verschil in aantal op de PR (nog niet gebouwd); `assert()` actief in productie (melden aan de fouttracking: fase 2, nog niet gebouwd), ErrorBoundary per route vangt hem (AGENTS, dod)
- **R-CODE-05** Branded IDs via zod `.brand()`; kolom `id` of `*_id` krijgt brand via FK of `db/ids.json` (of `null` met reden); types per resource apart geëxporteerd (fw)
- **R-CODE-06** TypeScript streng (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); `strictTypeChecked` plus `switch-exhaustiveness-check` (fw)
- **R-CODE-07** Bedragen in gehele centen (`Cents`); tijd `timestamptz`/ISO-string; formatteren alleen via `lib/format.ts`; grenzen alleen uit `limits.ts` (CHECK met zelfde waarde krijgt gelijkheidstest) (0040)
- **R-CODE-08** Geen `SET ROLE` of `set_config(…, false)`; `set_config`/`current_setting` alleen in `src/core/api/db` en schema `app` (0042)
- **R-CODE-09** Paginering: cursor-contract `{ items, nextCursor }`, "Meer laden" alleen in query (fw)
- **R-CODE-10** Bestanden kebab-case, componenten PascalCase, tabellen en kolommen snake_case; UI Nederlands, code, commits, branches Engels (fw)
- **R-CODE-11** Mutaties met geld of voorraad idempotent: request-UUID, bonnetabel met payload-hash (`REQUEST_ID_CONFLICT`), `pg_advisory_xact_lock`, tombstone (0045)
- **R-CI-02** Ratchet: nieuwe overtreding faalt, opgeloste in baseline ook tot `pnpm ratchet:update`; baseline laten groeien is gate-wijziging (0045)
- **R-CI-03** Developer-stop draait geen volledige `gate:fast`; lokale feedback is geen bewijs van groene gate (0057)
- **R-TEST-01** Unit `*.test.ts(x)` naast code, integratie `*.int.test.ts` via `pnpm test:db`, pgTAP `db/tests/`, e2e `e2e/`; integratie en e2e tegen echte lokale stack, nooit gemockt, e2e met CSP aan, inloggen per rol, één kernflow per feature; per feature één echt-committende test; property-based tests voor reken- en parselogica (fw)
- **R-TEST-02** Voeg tests toe; elk AC voor gewijzigd gedrag inhoudelijke test; bestaande test wijzigen alleen als spec of opdracht gedrag verandert, met reden in PR; verwijderen, skippen, verzwakken alleen met akkoord eigenaar; lijkt test fout: leg eigenaar voor, daarna past tester hem aan, niet hoofdsessie (fw)
- **R-TEST-03** Per permissie en policy negatieve test (een per verboden rol, `FORBIDDEN`), test voor ongeldige input, racetest met twee gelijktijdige requests bij uniekheid of geld (fw)
- **R-TEST-04** Securitysuite (`test/security/`, `db/tests/security.sql`) draait in `pnpm test:db`; nieuwe resource staat in `test/security/resources.ts` met ingevulde samples (dod, AGENTS)
- **R-TEST-05** CSRF-wijziging heeft matrix uit ADR 0041 als tests; hooks hebben tabeltests; pgTAP begint met `set search_path = tap, public`, `plan()` vóór `set local role app_authenticated`; screenshot-baselines alleen in gepinde Playwright-image (0041, 0045)

## 5. Vaste patronen

Afgedwongen door: TypeScript, lint (`no-restricted-syntax`, rail `klassen`), `pnpm ui:check`.

- **R-WEB-01** Elke route heeft ErrorBoundary en `beforeLoad`-guard met `can()`; UI-state (filters, tabs, paginering) in URL; geen globale store, `matchMedia`, `userAgent`, `isMobile` (fw)
- **R-WEB-02** `useQuery`/`useMutation` alleen in `features/<resource>/queries.ts`; mutatie invalideert eigen resource plus "raakt ook"; optimistisch alleen als spec het vraagt (rules)
- **R-WEB-03** `fetch(` alleen in API-client; inloggen alleen via `src/core/web/lib/auth.ts`; elk niet-GET-request stuurt `Content-Type` (0040, 0041)
- **R-WEB-04** Formulieren via `<Form>`/`<FormField>` met gedeeld zod-schema, valideren bij verlaten en daarna bij typen, verzendknop uit tijdens verzenden, serverfouten via `setError`; laden, leeg, fout via `<AsyncView>` (fw)
- **R-WEB-05** Alle zichtbare tekst in `src/web/copy`, Nederlands volgens woordenlijst, ook zod-meldingen; `src/web/copy/errors.ts` is `Record<ErrorCode, string>` (basisteksten uit `src/core/web/copy`, app-codes erbij); per-formaatverschil via één gedeelde hook (fw)
- **R-WEB-06** `can()` in UI is dezelfde functie als in API; sessierol is alleen UI-hint (fw)
- **R-WEB-07** Schermwerk klaar na `pnpm ui:check` (375 en 1280 px, axe); feature volgt `docs/gouden-pad.md` (dod)
- **R-WEB-08** `/design-system` achter `guard('design-system:read')`, lazy, alleen voorbeelddata (echte data vraagt ADR); `/design`, dev-rolwisselaar alleen dev (0048)

## 6. Data-toegang en security

Afgedwongen door: `check-secdef`, `check-policies`, pgTAP-invarianten en functiecatalogus (`db/tests/`), ESLint, env-schema-tests, CSRF-tests, CodeQL, osv-scanner, Betterleaks. Ankers: OWASP Top 10:2025, API Top 10, ASVS 5.0 niveau 1.

- **R-DB-01** Rollen: `app_migrator` (eigenaar, geen superuser), `app_authenticated` (NOLOGIN), `api_user` (NOINHERIT, alleen `SET LOCAL ROLE app_authenticated`), `auth_service`, `app_definer` (NOLOGIN, eigenaar security definer); rollen nooit in migraties maar in `db/init/` en runbook (0042)
- **R-DB-02** `statement_timeout`, `idle_in_transaction_session_timeout` op `api_user` en `auth_service`; `lock_timeout` op `app_migrator` (fw)
- **R-DB-03** `withUser(actor, tx => …)` enige ingang: één transactie per request (GET read only), controleert `current_user = session_user`, zet rol, `app.user_id`, `app.session_strength`, `app.request_id` (server-`requestId`) met `set_config(…, true)` (0042, 0051)
- **R-DB-04** Alleen `withUser()` vertaalt databasefouten (23505 `ALREADY_EXISTS`, 23503 `NOT_FOUND`, 42501 `FORBIDDEN`); route vangt ze niet af, gebruikt `ctx.actor`, geen query buiten `tx`, geen tweede verbinding (0042)
- **R-DB-05** Elke tabel in `public` of `app` (behalve `public.schema_migrations`), nooit in `better_auth` of `tap`: RLS aan en `FORCE`, expliciete grants met alleen nodige rechten in dezelfde migratie (nooit TRUNCATE, REFERENCES, TRIGGER; PUBLIC niets), policies met `(select app.current_user_id())`, per policy pgTAP-test op naam (0042)
- **R-DB-06** `can()` regelt functieniveau, RLS rijniveau; rollen uit `user_roles`, nooit uit sessie; gebruikersbewerkbare velden nooit voor autorisatie (fw)
- **R-DB-07** Migratie = nieuw bestand in `db/migrations/` (dbmate, geen down, als `app_migrator`); nooit gecommitte migratie wijzigen; expand/contract; nooit handmatig aan productie (0042)
- **R-DB-08** Datamigratie over alle rijen: via gereviewde security definer-functie, nooit RLS uitzetten; tabel krijgt policy `to app_definer` met alleen nodige rechten en pgTAP-test (fw)
- **R-DB-09** `security definer` alleen met `set search_path = ''`, volledig gekwalificeerde namen, eigenaar `app_definer`, geen overload, nooit `alter function … security definer`, niet in `do`-blok of dynamische SQL (fw)
- **R-DB-10** Views: `security_invoker = true`; anders `security_barrier`, namen met schema, `app.`-functie als actorfilter (heuristiek: pgTAP en review), eigenaar `app_definer`; geen materialized views (fw)
- **R-DB-11** Elke functie in `public` en `app` staat in functiecatalogus (`db/tests/functies.sql`) als `client`, `intern` of `job`; client-functie controleert actor (0045, 0050)
- **R-DB-12** `db/schema.snapshot.sql` is enige schemabestand; `pnpm db:generate` schrijft het met `src/api/db/schema.ts`, nooit met de hand; lees snapshot, niet alle migraties (0042)
- **R-DB-13** `better_auth`-tabellen uit `node scripts/auth-schema.mjs` in migratie met `set local search_path = better_auth;` en `reset search_path;`, nooit `auth migrate`; rijen zijn van Better Auth: nooit direct uit `src/core/api/db` of app-code, alleen via `app_definer`-functie of -view (R-DB-14) of testkit-`asUser` (terugdraaiend) (0041, 0043)
- **R-DB-14** `app_definer` leest uit `better_auth` alleen kolom-allowlist in `db/tests/invarianten.sql` (extra kolom: ADR), schrijft alleen `blocked_at`, `deactivated_at`, `session_version`; voor `app.delete_account` ook delete op `"user"`, `verification`, select `verification."value"`; FK naar `better_auth."user"`: `on delete cascade` of `set null` (0043, 0051, 0052)
- **R-DB-15** `app.audit_log` append-only, RLS geforceerd, regel in dezelfde transactie, details alleen ID's en enums, termijn minstens 1 jaar, lezen alleen admin met MFA. Bekend gat: faalt route-commit na uitnodigen, dan account zonder rol en zonder auditregel (0051)
- **R-DB-16** App-acties in `src/shared/audit.ts` (nooit `core.`) via `ctx.audit()`; core-accountacties via `app.assign_role`, `app.set_account_blocked`, `app.audit_account_action` (0051)
- **R-DB-17** Bewaarcatalogus `app.retention`: elke tabel in `public` en `app` heeft rij; `app.retention_cutoff()` enige bron voor termijnen in policies en triggers; uitzondering op R-DB-05: migratie die tabel aanmaakt zet `app.retention` `no force`, voegt alleen die rij in, dan `force` (0051)
- **R-DB-18** Postgres 17 patch exact gepind in `db/docker/Dockerfile`; pgTAP alleen lokaal en CI; PgBouncer transaction mode bewezen zonder lekken (0042)
- **R-AUTH-01** Alleen inloggen vanuit browser; Better Auth gepind in `src/core/api/auth` op `/api/auth/*`; alleen plugins two-factor en magic link, andere vraagt ADR (0041)
- **R-AUTH-02** Sessie in database, `cookieCache` uit; cookie `__Host-`, `httpOnly`, `Secure`, `SameSite=Lax`; geen token in `localStorage`; 7 dagen absoluut, 12 uur idle, `freshAge` 10 min; wachtwoord- of 2FA-wijziging trekt andere sessies in; sessielijst nooit token, IP of ruwe user-agent (0041, 0043)
- **R-AUTH-03** `session_strength` `password` of `mfa` (`input: false`, `mfa` alleen na `/two-factor/verify-totp`); `/two-factor/disable` zet sessie terug op `password`; elke admin-permissie eist `mfa` in `can()` en RLS; admins geen magic link of `trustDevice` (0040, 0041, 0043)
- **R-AUTH-04** `/sign-up/email` en `/request-password-reset` geven 404; `POST /reset-password` blijft voor uitnodigingen; `disabledPaths` volgen ADR 0043 met test per pad (0041, 0043)
- **R-AUTH-05** E-mailverificatie verplicht; geen account-enumeratie; gelekte wachtwoorden geweigerd; wachtwoord ≥ 12 tekens en uitnodigingstoken 7 dagen uit `limits.ts`; CAPTCHA in staging en productie; GET-link die sessie maakt bevestigt met POST (0041, 0043)
- **R-AUTH-06** Uitnodigen via `POST /api/accounts/invite` (admin met MFA): gebruiker zonder credential-account, rol in dezelfde stap, accepteren geeft geen sessie; account- en e-mailwijziging volgen ADR 0043. Bekend gat: TOTP-code en e-maillink herbruikbaar binnen geldigheid; login geeft sessietoken nog in JSON (0043)
- **R-AUTH-07** Blokkeren en deactiveren alleen via `app.set_account_blocked` en `app.set_account_deactivated` (security definer, `app.is_mfa_admin()`, nooit eigen account, uitnodiging of laatste admin, audit in dezelfde transactie) (0043, 0052)
- **R-AUTH-08** Sessie telt alleen zonder blokkade of deactivatie en met gelijke `session_version`; blokkade verhoogt `session_version`, herstel geeft geen oude sessies terug; `last_login_at` alleen na volledig geslaagde login; geen inlogorakel (0052)
- **R-AUTH-09** Seed en dev-login alleen lokaal; integratietests bewijzen bij elke `better-auth`-update de auth-flows (0043)
- **R-SEC-01** CSRF: eigen middleware vóór alle routes, geen `cors()`; request behalve GET, HEAD, OPTIONS eist `application/json` en `Sec-Fetch-Site` of `Origin`; elke aanwezige header moet `same-origin` resp. `APP_ORIGIN` zijn, dubbele header geweigerd, anders 403 `CSRF_REJECTED`; GET wijzigt geen state (0041)
- **R-SEC-02** Fouten naar buiten alleen `{ code, requestId }`; `logUnexpectedError()` logt nooit message, stack, query, cause; niet gedekt: foutlog Better Auth, stopmelding `src/core/api/env.ts`, standaardfout `src/core/api/http/web.ts` (fw)
- **R-SEC-03** Rate limit op elke `defineRoute`-route (`lezen`, `schrijven`, `duur` via `rateLimit`; mail of duur rekenwerk: `rateLimit: 'duur'`, nooit eigen getal per route) en op inloggen/reset, opslag in database, IP alleen uit `CLIENT_IP_HEADER`; `bodyLimit` en paginagrootte uit `limits.ts`; health en ready zonder limiet (0041, 0049)
- **R-SEC-04** Headers (CSP, HSTS, nosniff, Referrer-Policy) uit `src/core/api/http/security-headers.ts`, lokaal ook via Vite zodat e2e met CSP draait; CSP `default-src 'self'`, `script-src 'self'`, `connect-src 'self'`, `style-src 'self'` (geen inline stijl, uitzondering per ADR), `img-src 'self' data:`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`; met CAPTCHA (nog niet gebouwd) krijgen `script-src` en `frame-src` het CAPTCHA-domein; service worker cachet nooit `/api/*` (0049)
- **R-SEC-05** Env-schema bij opstart; `APP_ENV` (`local`, `test`, `staging`, `production`) verplicht; buiten `local`/`test` weigert het `AUTH_SECRET` korter dan 32 bytes of met demo-waarde, database-URL met demo-wachtwoord (lijst in `src/core/api/env.ts`, test per regel), `http` in `APP_ORIGIN`/`AUTH_BASE_URL`, `AUTH_BASE_URL` ≠ `APP_ORIGIN`; geen productiegeheimen in werkmap; `.env.example` beschermd (fw)
- **R-SEC-06** Secret scanning met push protection en Betterleaks (gepind in `mise.toml`, pre-commit en CI-job `secrets`); scanner-uitzondering met reden en `ignoreUntil`; pnpm `minimumReleaseAge: 10080`, `strictDepBuilds`, `trustPolicy: no-downgrade`; Renovate gegroepeerd; Actions op SHA met `permissions: read-all`, runner `ubuntu-24.04`; CodeQL en osv-scanner op elke PR en wekelijks op `main`; deploy-secrets alleen in beschermde environments; geen nieuwe dependency zonder akkoord (0045)
- **R-SEC-08** Log per request `requestId`, gebruiker-ID, duur, databasetijd, zonder PII, via `src/core/api/obs`; clientfouten allowlist-velden, geen PII of vrije tekst, 5 min ontdubbeld (0045, 0051)
- **R-SEC-09** Agent via GitHub App zonder `workflows`-recht; tot dan grens: ruleset en eigenaarreview; MCP read-only, versie gepind; .mcp.json en .claude/commands beslist de app (0039, 0045)
- **R-PRIV-01** Inzage `GET /api/me/export` (permissie `app.use`, alleen eigen data, andere actor gemaskeerd, geen sessietoken); app registreert exporters via `createApp({ privacy })` die expliciet op eigenaar filteren (0051, nog niet gebouwd)
- **R-PRIV-02** Verwijderen alleen admin met MFA via `app.delete_account(id)` (niet eigen account, laatste-admin-lock, audit); echt verwijderen, geen anonimiseren of soft delete; app registreert verwijderaars (0051)
- **R-PRIV-03** Alleen functionele sessiecookie; per app vastleggen: grondslag, privacyverklaring, DPIA, verwerkers, regio, termijnen (0051)

## 7. Design system

Afgedwongen door: lint (`klassen`, rauwe elementen, axe), `check:catalogus`, `test/ui/contrast.test.ts`, woordenlijsttest op `src/web/copy`.

- **R-UI-01** Tokens in drie lagen: primitief (nooit direct), semantisch (enige app-laag, `src/web/styles/theme.css`), component; lijst via `node scripts/kit/feiten.mjs tokens` (0040)
- **R-UI-02** shadcn-basiskit in `src/core/web/ui`; app-componenten en varianten in `src/web/ui`, enige importbron voor `features/`; varianten in één CVA-recept, afleiden niet forken; basiscomponent voor elke app via PR in template (0040)
- **R-UI-03** Zoek eerst met `node scripts/kit/feiten.mjs componenten`; breid recept uit; past niets: stop en stel variant voor (AGENTS, rules)
- **R-UI-04** In `features/` en `routes/` alleen layout-klassen of `Stack`/`Inline`; geen kleuren, arbitrary values, `!`, `dark:`, `style` (AGENTS, rules)
- **R-UI-05** Geen rauwe `<button> <input> <select> <textarea> <dialog> <a>` buiten `src/core/web/ui` en `src/web/ui`; geen hex-kleuren buiten tokens; `outline-none` alleen met `focus-visible:ring-*`; één `scanAxe(page)` zonder uitzonderingen (fw)
- **R-UI-06** WCAG 2.2 AA, responsive met breakpoints en container queries, `prefers-reduced-motion`, één focusring en aanraakdoel 44 px (nooit uitschakelen), contrasttest per receptvariant (fw)
- **R-UI-07** Elk component en elke eindige stringvariant heeft voorbeeld op `/design-system`; publieke componenten in `src/web/ui/index.ts`; geen uitzonderingenlijst (0048)
- **R-UI-08** `@theme` reset kleur, radius, schaduw, lettertype, tekstmaat, gewicht en easing van Tailwind (`bg-red-500`, `text-xs`, `font-bold` bestaan niet); dark mode via `[data-theme=dark]` met `@custom-variant dark`; browserslist in `package.json`, Vite `build.target` gelijk daaraan (fw)

## 8. Werkstraat

Afgedwongen door: rolhek en hooks (`.claude/gates.json`), diff-guard, `check-document-status`, `check-roadmap`, CI.

- **R-WERK-01** Elke rol begint met `node scripts/kit/feiten.mjs`, alleen taakrelevante secties (`componenten` alleen bij UI, `adr --alle` alleen voor historie) (0045, 0057)
- **R-WERK-02** Twee routes: hoofdsessie kiest en noemt waarom, reviewer toetst keuze; "bug" of kleine diff is geen bewijs; bij twijfel volledig; route geeft geen extra schrijfrechten of vrijstelling (0058)
- **R-WERK-03** Licht: alleen afgebakende bugfix of kleine aanpassing binnen bestaande functionaliteit; nooit nieuwe feature, pagina, interactie, publiek contract, component-API, route, permissie, migratie, dependency; geen ADR of spec; resultaat, scope, bewijs in opdracht of PR; bij gedragswijziging eerst tester (0058)
- **R-WERK-04** Volledig: nieuwe feature, pagina of interactie, A2/A3/A4, auth, gegevensisolatie, RLS-/rollenmodel, vertrouwensgrenzen, moeilijk herstel, ook als klein of omkeerbaar; ook elk werk buiten de lichte grens: architect en spec, aparte tester vóór implementatie, onafhankelijke review, volledige CI, eigenaarmerge (0057, 0058)
- **R-WERK-05** Kritiek werk (eerst besluit-PR): elk ADR, auth en gegevensisolatie (`src/core/api/auth/`, `src/core/api/db/`, `db/init/`), de bewaking zelf (`altijdVragen`); bij twijfel kritiek (0062)
- **R-WERK-06** ADR bij A1 (contract tussen zones), A2 (migratie bestaande rijen, rollen/RLS, auth, provider, dependency), A3 (rechten verruimen of check afzwakken), A4 (geaccepteerd ADR wijzigen); template-ADR's `0001`-`0099`, app-ADR's vanaf `0100` (0046, 0040)

Stappen: spec, contract, tests, developer, reviewer (R-WERK-07 t/m 11); 6. **Opleveren** (R-WERK-12): alleen hoofdsessie, skill `opleveren`, `pnpm pr:verify <nr> --watch` tot groen, opruimen na merge; 7. **Eigenaar** reviewt en merget.

- **R-WERK-07** Spec volgens `docs/specs/_template.md` bij nieuwe feature, pagina, interactie, migratie, route, permissie (≤ 10 KB); alleen architect schrijft inhoud; passende bestaande spec hergebruiken; spec-review vóór bouwen; spec en bouw in één PR, spec in eerdere commit (0058, 0062)
- **R-WERK-08** Spec of ADR krijgt direct bedoelde status, merge is het besluit; alleen architect en hoofdsessie schrijven die status of wijzigen goedgekeurde spec; `gebouwd` = `# #<deze PR>` in bouw-PR (`pnpm docs:status`) of later met `gevalideerd: <sha>`; ADR nooit `gebouwd` (0046, 0054, 0062)
- **R-WERK-09** Route alleen via `defineRoute({ method, path, input, output, permission, handler })`, één bestand per resource, contract in `src/shared/contracts/<resource>.ts`, pure logica zonder I/O in `src/api/domain`; nieuwe foutcode tekst in `src/web/copy/errors.ts` (AGENTS, rules)
- **R-WERK-10** Tester schrijft alleen in testpaden, tests falen op asserties; developer: gate-pad in `voorReview` geweigerd, in onderhoudsmodus buiten `altijdVragen` met melding; ander gate-pad met melding "noem het in de PR" (0046, 0063)
- **R-WERK-11** Reviewer-agent toetst routekeuze en `docs/dod.md` met `bestand:regel` per bevinding, op `git diff origin/main...HEAD` vóór push; na latere wijziging opnieuw (`git diff <reviewer-sha>..HEAD`); bevindingen verwerkt vóór oplevering (0046)
- **R-WERK-12** Opleveren alleen hoofdsessie na review, skill `opleveren`: CI-lus `pnpm pr:verify <nr> --watch` tot groen, conflicten via `git merge origin/main` (nooit rebase); stop en vraag bij afgezwakte regel, zelfde fout drie keer, oorzaak buiten code, gate-pad; opruimen na merge met `--ff-only`, nooit `reset --hard` of `--force` (0046, 0061)
- **R-WERK-13** Leerlus: alleen hoofdsessie maakt issue in template-repo met precies één label `leerpunt`, generieke reproductie zonder appcode, appdata, geheimen; eigenaar triageert; geen telemetrie naar buiten (0059)
- **R-WERK-14** Overdracht: doel, spec, paden, open keuzes, exacte checkuitslagen; alleen benodigde broncontext; ruwe logs en afgeronde gesprekken gaan niet standaard mee (0057)
- **R-WERK-15** Docs in dezelfde PR als wijziging die gedrag, API, configuratie, conventies raakt; geen docs-stap na merge (fw)
- **R-WERK-16** Roadmap: bewijs beschikbaar, dan vinkt dezelfde PR het item af (testpad, checknaam of PR-nummer) met akkoord van de eigenaar, nooit zonder bewijs; heropenen om een check te omzeilen telt niet. `pnpm docs:status --roadmap` wijzigt alleen het vinkje van het item van de eigen spec; de precieze regel staat in `docs/dod.md` (0046)
- **R-WERK-17** Rollen: architect, developer, tester, reviewer, docs (optioneel; stelt statussen voor); reviewt nooit eigen werk (0045)
- **R-WERK-18** Functionele UI in template: mini-spec `scope: functionele-ui`, code, UI-tests, gebruiksdocs in één PR; alleen `src/core/web/ui`, `src/core/web/copy`, aansluitende app-UI; auth, API, queries, contracten, configuratie, overige core, dependencies, rails, agentinstructies erbuiten (0056, 0058)
- **R-WERK-19** Architect zet `model: sonnet|opus` per spec (opus alleen bij geld, gelijktijdigheid, datamigratie, auth, core) (0046)
- **R-WERK-20** Stop en vraag: beslissing ontbreekt (geen aanname), spec spreekt zichzelf tegen, regel staat opdracht in weg; na twee mislukte pogingen: vat samen, vraag richting (uitzondering CI-lus `opleveren`) (AGENTS, CLAUDE)
- **R-WERK-21** Commando's voor gebruiker (setup en later): genummerde stappen met terminal, werkmap, uitkomst, ingevulde waarden, zonder prompttekens, in één blok (splits alleen bij interactie, controle, andere terminal), nooit in lopende tekst; vragen meteen via vraagprompt, concreet, gebundeld, niet verstopt in uitleg of voortgang; zonder vraagtool: meld kort, stel apart; geen bevestiging voor toegestaan werk; in Claude Code lees en zoek met Read, Grep, Glob, niet Bash (0063)
- **R-WERK-22** Volg `docs/dod.md`: voer vereiste checks uit, noteer uitslag per opdracht in PR, lever alleen op met geslaagde uitslag of akkoord eigenaar (dod)
- **R-WERK-23** Runtime-specifieke instructies gelden alleen voor die runtime (hooks, permissies, sandbox in `.claude/`: Claude Code); elders zijn CI, diff-guard, GitHub de grens; claim nooit dat een instelling klopt die je niet kunt lezen (0045)
- **R-WERK-24** `.claude/decisions.json` bindt alleen `requiredChecks`; een besluitrecord geeft geen rechten, een eigenaarstatus komt via besluit-PR of feature-lane (0046, 0063)
- **R-WERK-25** Setup app (`docs/nieuwe-app.md`): nooit op `/mnt/c`; geen destructieve commando's; agent installeert geen toolchain; één overdracht tegelijk; na klaar-melding stopt setupsessie; `.env.local` alleen poorten (nieuwe-app)
- **R-WERK-26** Spec terug naar `voorstel` (vanaf elke status) is geen eigenaarstatus en mag altijd, ook in een PR met code (0062)
- **R-ROL-01** Schrijfrecht per rol staat in `.claude/gates.json`: architect specs en ADR's, tester testpaden, reviewer niets, docs alleen zijn docs-paden daar, geen gates; developer en hoofdsessie alles behalve gates en bestaande tests (0045)
- **R-ROL-02** `voorReview`-paden vragen hoofdsessie, weigeren developer; onbekende subagent krijgt strengste rol; onderhoudsmodus alleen via `onderhoud.repository` uit main én gelijke `origin`, nooit voor `altijdVragen`, versoepelt niets aan verboden acties; in app uit (0045)
- **R-ROL-03** Schrijven in `.git`-map is voor elke rol deny; rolhek blokkeert gegenereerde bestanden, gecommitte migraties, verwijderen of skippen van bestaande tests, wijzigen van fixtures en setup (ook `*.test.*` onder `test/rails/fixtures/` of `test/setup/`); bestaand hulpbestand in testpad (geen `*.test.*`, `*.spec.*` of `db/tests/`) wijzigen meldt het, verwijderen is gate (0045)
- **R-ROL-04** Reviewer en tester starten met schone context; reviewer schrijft niets; in Modus UX leest reviewer UX-screenshots uit tests met Read en toetst aan `docs/ontwerp/<bron>.md`, zonder screenshots meldt hij letterlijk dat hij alleen code toetst (0058)
- **R-ROL-05** Licht werk: reviewagent volstaat zonder technische isolatie (claim geen afgedwongen onafhankelijkheid); ontbreekt hij: eigenaar reviewt; volledig werk zonder afgedwongen isolatie: benoem ontbrekende stap, eigenaar voert hem uit vóór merge; rolnaam is geen reviewbewijs (0057)
- **R-ROL-06** `pnpm new:resource` draait alleen hoofdsessie; generator drukt gate-wijzigingen af, maakt geen tests, foutcodes, security definer-functies, componenten; zonder goedgekeurde spec alleen skelet (0047)
- **R-ROL-07** Rolhek staat `gh issue create` van hoofdsessie alleen toe met `--repo`/`-R` gelijk aan `onderhoud.repository` (in app: `TEMPLATE_REPOSITORY`) en precies één `--label leerpunt`, anders ask; subagent: geen issue, geen schrijvende gh issue (0059)
- **R-ROL-08** Rolhek weigert elke rol: `gh pr review`, elk label op `gh pr create`/`new`/`edit` en `gh issue edit`, `gh api` naar labels, reviews, statuses, check-runs, push naar `main`, force-push, mergen, `--no-verify`, `LEFTHOOK=0`, `core.hooksPath`, `gh alias set/import`, niet-letterlijke commandowoorden, schrijven op beschermd pad (elk redirect-token, `sed -i`, `tee`, `cp`, `mv`, `rm`, programma-opties; map dekt pad eronder), archief via Bash (alleen `git mv` zelfde naam); nieuwe branch alleen vanaf verse `origin/main` (0045, 0063)
- **R-ROL-09** Hooks: rolhek en werkstraat falen dicht bij ontbrekend anker; hook-timeout en exit 1 laten door (fail-open); meethook slaat nooit inhoud op; hookwijziging werkt na merge en volgende sessie; anker = SHA van `main` op de remote (`git ls-remote`, ververst door `werkstraat session-start`), nooit lokale `origin/main`; anker en cache in `.claude/hooks/.cache/`, lader controleert commit, trees en blobs zelf op hun hash; rolhek leest lijsten uit anker, geen netwerk (0045)
- **R-ROL-10** Rolhek is vangnet, geen grens; bekende gaten (interpreters, scripts, omhulsels, globs, links, `find -exec`) staan als open items in `docs/roadmap.md`; harde grens is GitHub, CI, diff-guard (0045, 0057)
- **R-ROL-11** Geaccepteerde valse positieven rolhek: subagent `grep gh x`, `cat x | grep api.github.com`; hoofdsessie `git merge … && gh pr view`, woord `merge` in PR-titel of -body, commitbericht met `merge` naast `gh`, `pr merge` of `grep 'pr review' gh` in argument, `xargs nice prettier`, `git ls-files -z | xargs -0 git add`, `time ls *.md`, `echo {a,b}`/`{1..3}`, `--jq`- of JS-object met komma, `echo $HOME run`; elke rol: `find … -delete`, `cp -r`, `git checkout -- <map>`, `git restore <map>` met beschermd pad eronder, een korte-optiecluster met `l` op `gh pr create`/`edit` (`-Bdevelop`) (0045, 0063)
- **R-ROL-12** MCP-tools alleen uit `mcpLezen`; permissieregels in `.claude/settings.json` zijn gemak, geen grens (sandbox en GitHub wel); subagents geen push- of PR-recht; geen check-status; externe diensten alleen via hun CLI (`gh`) (0045, 0061)
- **R-RUNNER-01** Database-, UI-, generatorchecks en `gate:slow` alleen via `scripts/runner.sh` in container, lokaal gelijk aan CI; repo read-only, alleen `.runner-output` schrijfbaar, symlinks geweigerd (0044)
- **R-RUNNER-02** Invoer uit `RUNNER_INPUTS` (uitbreiden is hostcode met eigenaarreview), nooit `.env*` of git-metadata; niet-getrackt bestand met > 1 hardlink geweigerd; basis uit `git ls-remote origin refs/heads/main` (runner)
- **R-RUNNER-03** Hostbestanden niet afwijken van merge-base met `main`; alleen eigenaar gebruikt `--sta-wijzigingen-toe`; agent nooit `CI=true`, override of directe Docker; gewijzigd railwerk via wegwerp-CI en `pnpm pr:verify`; ontbrekend runnerbewijs wordt geen routineklus voor eigenaar (0044)

## 9. Documentatie en tokenbudget

Afgedwongen door: `check-docs` (budgetten als ratchet in `.kit/baseline.json`).

- **R-DOC-01** Budgetten staan in `check-docs`; zonder check: `CLAUDE.md` ≤ 50, `.claude/rules/*.md` ≤ 60, skill ≤ 200 regels, `docs/operations/*` 1–2 pagina's; bestaande overschrijdingen in baseline die alleen omlaag mag (0063)
- **R-DOC-02** Regel die check kan zijn is open taak in `docs/roadmap.md`; padregel eindigt met "Besloten, nog niet gebouwd" (fw)
- **R-DOC-03** Dit boek is enig bindend regelboek; `.claude/rules/*` bevat regels letterlijk met zelfde R-id; ankers §1-§12 (met §11a) blijven; ADR legt waarom vast, ADR-punt waarnaar R-regel verwijst hoort bij die regel (0063)
- **R-DOC-04** Wat soms nodig is, hoort in een skill of padregel, niet in een `@`-import (fw)

## 10. Versiebeheer, CI en release

Afgedwongen door: ruleset op `main`, `guard.yml` (diff-guard, `document-status`, `check-core`), `check-docs`.

- **R-CI-01** Vereiste checks: `gate:fast`, `gate:slow` (precies volgens gate-register), CodeQL, osv-scanner (fw, 0048); CI: runner `ubuntu-24.04`, toolchain via `jdx/mise-action` (geen Corepack), `.github/workflows/ci.yml` op elke push naar `main` en elke PR, `gate:fast` en `gate:slow` naast elkaar, concurrency annuleert oude runs (fw)
- **R-CI-04** Feedbacklus: na elke bewerking ESLint en Prettier op dat bestand (PostToolUse); pre-commit format-controle, ESLint op staged, Betterleaks; commit-msg conventional commit; einde beurt `tsc -b`, ESLint en `vitest related` op geraakte bestanden (Stop-hook); pre-push `gate:fast` met waarschuwing bij achterstand op `origin/main`; `pnpm test:db` voor integratie en pgTAP; CI `gate:fast` en `gate:slow`; bron `lefthook.yml` en `.claude/settings.json` (fw)
- **R-REPO-01** GitHub App op huidige repo, zonder `workflows`-, admin-, instellingsrecht, niet in `goedkeurders`; eigenaar installeert en pusht workflowwijzigingen; alleen eigenaar merget (0039, 0057)
- **R-REPO-02** Ruleset `main` (eigenaar, `scripts/github-ruleset.sh`): alleen via PR, geen force push, delete of bypass, alle `requiredChecks` uit `.claude/decisions.json` van Actions, code scanning, goedkeuring vervalt bij push, opgeloste gesprekken, alleen merge en squash; onleesbaar = rood; code-owner-review en 1 goedkeuring pas met App; Actions-token read, geen PR's maken of goedkeuren, actions op volledige SHA; `.github/settings/main-protection.json` (nog niet gebouwd), `scripts/check-github.mjs` (nog niet gebouwd) volgen (0040, 0045, 0057)
- **R-REPO-03** Beschermde paden in `.claude/gates.json`, eigenaarakkoord; developer: `voorReview`-pad volgens R-WERK-10; `src/api/app.ts` en `src/shared/permissions.ts` geen gate; geen gegenereerde bestanden of `.env*` bewerken (0046)
- **R-REPO-04** App koppelt eenmalig met `git merge --allow-unrelated-histories -s ours template/main` (alleen bij gelijke trees); koppeling en template-update als merge-commit, nooit squash; gewone PR's squash (0040)
- **R-REPO-05** Eén onderwerp per PR, korte branches, conventional commits; push nooit naar `main`, nooit `--no-verify`, merge nooit; eigenaar pusht de twee setup-commits (nieuwe-app)
- **R-CI-05** A4: geaccepteerd ADR herschrijven (met `Herzien: JJJJ-MM-DD (#NNN): wat`) of verwijderen alleen in besluit-PR; vervallen ADR verandert niet; ADR nooit terug naar `voorgesteld` (0046, 0045)
- **R-CI-06** Alleen vervangen of vervallen ADR byte-gelijk naar `docs/adr/archief/`, spec naar `docs/template/specs/` (nog niet gebouwd); ADR-nummer nooit hergebruiken; alleen-templatedocs in `docs/template/` (nog niet gebouwd) (0053, 0063)
- **R-CI-07** Diff-guard (`pull_request_target`, scripts van `main`; PR-code alleen als git-data, nooit installeren of uitvoeren; `persist-credentials: false`): PR met gate-pad, `scripts` in `package.json` of bestaande test faalt zonder APPROVED van goedkeurder (niet auteur) op head-SHA; een label telt niet (0045, 0063)
- **R-CI-08** Volledige CI op elke PR, geen oude uitslag of cache; na fix opnieuw; bouwbewijs = merge met alle verplichte checks groen op head-SHA (0054, 0057, 0062)
- **R-REL-01** Database vóór code, eerst staging; productie alleen via release-tag en goedkeuring eigenaar (nooit agent); geen automatische Git-deploys; geen preview tegen productie, tegen staging alleen met migraties van die PR (fw)
- **R-REL-02** `check-release-ci` (nog niet gebouwd), vóór én na de build: commit is kop van `main` met groene CI, productie ook staging; `check-deployment-schema` (nog niet gebouwd): productieschema dekt code; beide falen dicht; eigen build per omgeving; smoketest na elke deploy (staging en productie): inloggen met testaccount, één leesactie, bewijs dat provider-data-API voor browser dicht is; lokaal bewijst een test dat `api_user` zonder `withUser()` niets ziet; rollback: code via host, database vooruit met nieuwe migratie, in nood uit back-up; na release uur fouten en logs volgen; runbook per host in `docs/operations/` (0045)
- **R-REL-03** Release: toon bewijs voor staging, schema-compatibiliteit, smoketest, vereiste CI-checks; volg runbook van de host (dod)
- **R-DEPLOY-01** `GET /api/health` liveness, `GET /api/ready` (alleen met `createApp({ ready })`) readiness: 200 of 503 `{ ok }`, `pingDatabase()` binnen 900 ms, uitkomst 1 s bewaard, plus ping als `app_jobs` tenzij OV-C4 anders (nog niet gebouwd); host gebruikt beide (0049)
- **R-DEPLOY-02** Met `WEB_DIR` serveert `src/api/server.ts` ook SPA (`/assets/*` onbeperkt cachen, rest no-cache; geen verborgen bestanden behalve `/.well-known/`, geen symlink buiten `WEB_DIR`); CDN-host zet dezelfde headers uit `security-headers.ts` (0049)
- **R-DEPLOY-03** Migraties aparte stap met dbmate, niet in image; geen `.env` in image; `AUTH_SECRET` en database-URL's alleen van host (0049)
- **R-DEPLOY-04** Image: basisimage op digest, `USER node`, `HEALTHCHECK` op `/api/health`, `.dockerignore` sluit `.env*`, `.git`, `.claude` uit; CI-job `image` (`scripts/check-image.sh`) (0049)

### Template-updates naar een app

`git merge template/main` op branch via PR (R-REPO-04); les van app naar template als issue met label `leerpunt` via leerpuntstap van `opleveren` (R-WERK-13, [ADR 0059](adr/0059-leerlus-van-app-naar-template.md)).

## 11. Lokaal ontwikkelen

Afgedwongen door: `scripts/doctor.sh`, `test/rails/excluded-commands.test.ts`.

- **R-TOOL-01** Ubuntu 24.04 of 26.04 (andere versie: stop en vraag), code op ext4; eigenaar installeert toolchain met `scripts/bootstrap.sh`; Compose alleen `127.0.0.1`; devcontainer nooit met host-socket (0039)
- **R-TOOL-02** Agent gebruikt `docker` niet; stack is van eigenaar (`pnpm dev`); alleen `pnpm test:db`, `pnpm ui:check`, `pnpm gate:slow`, `pnpm db:generate`, `pnpm check:snapshot` draaien buiten sandbox, elk na goedkeuring (0044)

## 11a. Repo-structuur

- **R-ARCH-09** `pnpm new:resource <naam>` genereert contract, 501-routes, permissies, migratie, `queries.ts`, scherm, route volgens gouden pad; schrijft niets als doel bestaat (0047)
- **R-ARCH-10** Mapindeling: `src/core/` template (`api/` route, db, auth, http, obs, dev, mail, env; `web/` ui, styles, lib, copy; `shared/` can, errors, limits, ids, assert, unsafeCast, Cents, cursor); `src/web/` routes, features, ui, styles, lib, copy, dev; `src/api/` app, kit, server, routes, domain, mail, db (gegenereerd); `src/shared/` contracts, schemas, permissions, errors, limits, audit; `deploy/<host>/` adapter per app; `db/` docker, init, migrations, tests, snapshot, ids; `e2e/` Playwright; `test/` tests buiten de broncode; `rails/hooks/` hookbron (`.claude/hooks/` zijn stubs); `scripts/` met `scripts/kit/` (gate-register, feiten, ratchet, checks); `.kit/` ratchet-baseline; `designs/` optioneel; `docs/`; `.claude/`; `.github/` (0040, 0045)

## 12. Fasering

- **R-FASE-01** Fase 0 en 1 in template; fase 2 (eerste features) en fase 3 (eerste release, providerkeuze per ADR) per app; wat in app doorglipt wordt eerst template-check; uitbreidingen alleen op aanleiding (fw)
- **R-FASE-02** Uitbreiding op aanleiding: bestanden (signed URL's) of realtime als de app ze nodig heeft, met eigen ADR; screenshot-regressie en axe in CI na doorgeglipte visuele of toegankelijkheidsfout; jscpd, knip, ast-grep als review herhaaldelijk kopieën, dode code of fout patroon vindt; mutation testing bij kritieke reken- of geldlogica; Renovate automatisch mergen en OpenTelemetry als de basis stabiel draait; devcontainer of agent-sandbox in Docker als iemand meewerkt of agents zonder toestemmingsprompts draaien (fw)
