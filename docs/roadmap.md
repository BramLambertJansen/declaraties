# Roadmap

Uitwerking van [framework.md](framework.md) §12. Vink alleen af met bewijs (checkuitslag of test) in de PR.
Fase 0 en 1 horen in de template; fase 2 levert verbeteringen terug aan de template; fase 3 is per app.
Reviews: [2026-10-09 fundering](reviews/2026-10-09-fundering.md), [2026-10-09 framework](reviews/2026-10-09-framework.md).

De aanbevelingen uit de starter-beoordeling van 2026-10-11 staan hieronder als
[agenttaken](#agenttaken-uit-de-starter-beoordeling-2026-10-11), met scope, afhankelijkheden en bewijscriteria.
Ze werken bestaande items uit; de bestaande vinkjes, besluiten en bouwvolgorde blijven leidend.

## Beslissingen

Een ADR met status `voorgesteld` is geen besluit; afvinken gebeurt pas als de eigenaar hem accepteert.

- [x] Provider-neutraal — ADR 0002
- [x] Auth in de API met Better Auth, sessiebeleid en MFA — ADR 0003
- [x] Postgres 17, rollen, dbmate, pgTAP — ADR 0004
- [x] Node 26, pnpm 11, TypeScript 6.0, GitHub App, toon van de regels — ADR 0005
- [x] App uit de template: koppeling, merge-commits voor updates, ADR-nummers, tussentijdse ruleset — ADR 0006
- [x] CSRF-controle en testmatrix — ADR 0007
- [x] Grens tussen core en app — ADR 0008
- [x] Tests buiten de sandbox: runner-container — ADR 0009
- [x] Schema `better_auth` — ADR 0010
- [x] Railwerk: rolhek, geteste hooks, ratchet, gate-register, feiten, vijf rollen, diff-guard — ADR 0011
- [x] Uitnodigen en MFA in Better Auth — ADR 0013
- [x] Datapad: `withUser()` met `pg`, transactie per request, Drizzle als `tx` — ADR 0012
- [x] Werkstraat tot de merge: reviewer vóór push en PR, stap Opleveren — ADR 0025 (WS-02, 03, 04a, 06 gebouwd; open: WS-04b skill `opleveren`,
      WS-05 modelkeuze, zie `docs/reviews/2026-10-12-werkstraat.md`)
- [x] Account blokkeren: `blocked_at` in `better_auth`, schrijfrecht voor `app_definer`, sessies direct ingetrokken — ADR 0026 (gebouwd in #117)
- [ ] Achtergrondtaken: opruimen (verlopen sessies, uitnodigingen, rate-limit-rijen), mail via een outbox, eigen databaserol voor
      systeemjobs (framework §6); keuze tussen worker in het proces, queue in Postgres of cron van de host — ADR (bouwen: stuk 7)
      ADR 0020 geaccepteerd (agent, onder mandaat): runner in het API-proces, eigen rol `app_jobs`, outbox zonder token;
      gecorrigeerd na review (2026-10-11), met de bouwvolgorde van 0020–0022
- [x] Taal: alleen Nederlands, teksten in `src/web/copy` en `src/core/web/copy`; geen meertaligheid in de template (besluit eigenaar 2026-10-10)
- [ ] Audit log van admin-acties (rol toekennen, uitnodigen, blokkeren) standaard in core, in plaats van "op aanleiding" (framework §12) — ADR
      ADR 0021 geaccepteerd (agent, onder mandaat; aanbevelingen OV-1..7); gecorrigeerd na review (2026-10-11)
- [ ] AVG: wat de template levert voor inzage, verwijderen en bewaartermijnen van persoonsgegevens (mechanisme in core, inhoud per app) — ADR
      ADR 0022 geaccepteerd (agent, onder mandaat; aanbevelingen OV-1..7); gecorrigeerd na review (2026-10-11)
- [ ] Ontwikkelplatform: alleen Ubuntu/WSL2, of ook macOS (sandbox, `scripts/bootstrap.sh`, `scripts/doctor.sh`)

## Fase 0 — Bewijs

Bewijs: PR #11 (`pnpm test:db` door de eigenaar, 2026-10-09: Vitest 17/17, pgTAP 10/10; `pnpm dev` bij #9).

Eerst door de eigenaar op de eigen machine (de agent gebruikt geen Docker):
- [x] `docker compose --env-file .env.local up -d --build --wait`: image met pgTAP bouwt, `db/init` draait vóór "healthy"
- [x] Baseline-migratie draait als `app_migrator` met dbmate

Daarna (de PR mag het minimum uit stuk 1 meenemen dat hiervoor nodig is: `pg`, Vitest, tsconfig):
- [x] `withUser()` met `pg` in `src/core/api/db`: `SET LOCAL ROLE` + `set_config(…, true)`; lektest over parallelle requests, nul lekken;
      na elke request `current_user = session_user`; `api_user` ziet zonder `withUser()` niets
- [x] Dezelfde test via PgBouncer (transaction mode) als compose-profiel `pooler`
- [x] FORCE RLS: bewijzen dat `app_migrator` (geen superuser) onder RLS valt; `app_definer` ziet alleen rijen via een eigen policy
- [x] Meten: twee verbindingen per request (sessie + `withUser`), latency lokaal
- [x] Contract vastleggen: `Actor`, type van `tx` (pg of Drizzle), `testing.ts` voor geïnjecteerde transacties
      (vastgelegd in ADR 0012: `tx` wordt een Drizzle-transactie; de savepoint-variant van `testing.ts` bouwt stuk 3a)
- [x] Uitkomst in een ADR "Datapad" (volgende vrije nummer in `docs/adr/`)

Verplaatst naar fase 1, stuk 2 (heeft Better Auth nodig): `session_strength` via after-hook op 2FA-verificatie, `cookieCache` uit, intrekken werkt direct.

## Fase 1 — Fundament

- [ ] ADR 0027: taakgebonden beschermde broncode, bewijsgebonden ADR/spec-statussen, documentatielabel en automatische runner/CI-opvolging. Spec: `docs/specs/taakmandaat-frameworkwerk.md`; invoering vereist groene bestaande checks en eigenaarreview, daarna actieve controle vanuit main.

Zeven verticale stukken. Elk stuk is één branch; een groot stuk mag in deel-PR's (zoals 3a–3d), een spec in een eigen PR ervoor.
Een stuk is klaar als elk punt onder **Klaar als** met een checkuitslag of testuitvoer in de PR staat.
Core-onderdelen komen in `src/core/`, app-code en de referentie-feature in `src/{api,web,shared}` (ADR 0008).
Rails en test-infra komen vóór de code die ze bewaken, zodat de referentie-feature er vanaf het begin aan voldoet.

**Volgorde vanaf 2026-10-10** (afgesproken met de eigenaar): eerst bewijzen dat de template als basis voor een app werkt, daarna meer rails.
1. CI-job `gate:slow`, osv-scanner en Renovate (stuk 4) — de RLS- en pgTAP-invarianten draaien nu alleen lokaal.
2. Stuk 7: de API draait buiten `pnpm dev`, logt per request en stopt netjes.
3. De drie testopdrachten door de werkstraat (stuk 5, **Klaar als**).
4. Proef-app met een template-update (stuk 6).
5. ADR's uit **Beslissingen** (achtergrondtaken, audit log, AVG) en de open punten van stuk 3.
6. De starter-basis: stuk 3f, de nieuwe punten in 3e en de repo-punten in stuk 6.

Op aanleiding, niet in de basis (eigenaar 2026-10-10): feature flags, onderhoudsmodus, waarschuwing bij niet-opgeslagen formulieren.

Overige rails uit stuk 4 (sonarjs, better-tailwindcss, squawk) volgen pas als de testopdrachten of de proef-app laten zien dat ze nodig zijn (framework §1.5).

### 1. Skelet, rails en test-infra

- [x] `mise.toml`, `.gitattributes`, `.editorconfig`, browserslist, `pnpm-workspace.yaml`, `.env.example` (bestanden staan er; nog niet in gebruik)
- [x] `docs/nieuwe-app.md`: setup-playbook voor Claude Code (machine → repo → koppeling → stack → databasebewijs)
- [x] `tsconfig` (flags uit framework §4), TypeScript `~6.0.3`; aliassen via `package.json` `imports`; hoe Node `server.ts` draait, bewezen met `pnpm dev` (#8, #9)
- [x] Vite + React in `src/web`, Hono in `src/api` met `src/api/server.ts`, Vite-proxy `/api`, headers/CSP in Vite; poorten via `WEB_PORT`/`API_PORT` (#8)
- [x] Eén publieke route `GET /api/health` (uitzondering in framework §3) en een pagina die hem toont via de client in `src/core/web/lib/api-client.ts` (#8; de pagina is vervallen in #29 zodra er een ingelogde startpagina was, framework §3)
- [x] ESLint 10 flat config: strictTypeChecked, `consistent-type-assertions: never`, `switch-exhaustiveness-check`; Prettier (#9)
- [x] Rails vooraf: dependency-cruiser (lagen, core → app verboden, geen cycles) en `no-restricted-imports`/`no-restricted-syntax`
      (elementen, `fetch`, env, `SET ROLE`, `set_config`, `hono` buiten core, niet-letterlijke `import()`) — elk met een fixture die bewijst dat hij faalt,
      ook voor bekende omzeilingen (alias, re-export, bracket-notatie) (#9: `test/rails/`)
- [x] Ratchet: `.kit/baseline.json` + `pnpm ratchet:update`, ESLint bulk-suppressions + `lint:prune`; faalt in beide richtingen (#9: `test/rails/ratchet.test.ts`)
- [x] Gate-register `scripts/kit/gates.mjs` en eerste `scripts/kit/feiten.mjs` (gates, ADR-statussen, volgende vrije migratie- en ADR-nummer) (#9)
- [x] Vitest-projecten `unit` en `int`; Playwright in `e2e/`; `pnpm test:db` (integratie + `pg_prove`) en `pnpm ui:check` in de runner-container van ADR 0009 (#9, #11)
- [x] `scripts/bootstrap.sh`, `scripts/doctor.sh` (versies, inotify, sandbox, Docker, jq, bubblewrap; `--quick` voor de SessionStart-hook) (#9)
- [x] dbmate en Betterleaks gepind in `mise.toml`; dbmate via script (#9)
- [x] `pnpm dev`: Docker-check, `.env.local`, `compose --env-file .env.local up --build --wait`, migraties, Hono + Vite (met headers/CSP) (#8, #9)
- [x] lefthook (pre-commit: format, lint op staged, Betterleaks; pre-push: `gate:fast`) (#9)
- [x] `gate:fast` (eerste versie: lint, typecheck, unit, dependency-cruiser) (#9; dependency-cruiser via `pnpm ratchet`)
- [x] `ci.yml` (`ubuntu-24.04`, mise-action, Actions op SHA, `permissions: read-all`, concurrency) met job `gate:fast` — het commit met
      `.github/workflows/` pusht de eigenaar (#12)

**Klaar als:** `pnpm gate:fast` groen (uitvoer); pre-commit houdt een commit met `any` of `as` tegen (uitvoer); elke fixture-test van de
rails groen (ook de omzeilingen); de ratchet-test bewijst beide richtingen; de isolatietest uit ADR 0009 groen; CI-job `gate:fast` groen op de PR;
de eigenaar bevestigt dat `pnpm dev` op een verse machine de pagina met `/api/health` toont.

### 2. Auth

Spec eerst (migraties en routes).
- [x] Better Auth (gepind) in `src/core/api/auth`, schema `better_auth`: tabellen via `auth generate` → migratie, `__Host-`-cookie, sessiebeleid, rate limit in database (#18)
- [x] `session_strength` als sessieveld (`input: false`, standaard `password`), gezet in een after-hook op 2FA-verificatie, doorgegeven aan `withUser()`; `cookieCache` uit (#18)
- [x] ~~Rolcontrole in auth-hooks (admin: geen magic link) via een `security definer`-functie van `app_definer`, niet via grants~~ — vervallen: geen magic link (ADR 0013, alleen two-factor)
- [x] Inloggen, aanmelden, reset, e-mailverificatie via Mailpit; geen account-enumeratie; GET-links die een sessie maken, bevestigen met een POST — volgens ADR 0013: aanmelden en "wachtwoord vergeten" dicht; uitnodigen via de reset-flow, e-mail geverifieerd bij accepteren (#18, #28, #29)
- [x] MFA met inschrijfscherm; admins zonder magic link en zonder `trustDevice` (#18, #29; geen magic link, ADR 0013)
- [x] CSRF-middleware (testmatrix uit ADR 0007), `bodyLimit`, `secureHeaders()`, `onError` met `{ code, requestId }` (#16)
- [x] Env-schema met `APP_ENV` en de regels uit framework §6 (Secrets) (#16)
- [x] `scripts/seed` via de auth-API: gebruiker per rol, admin met vast lokaal TOTP-geheim (#19; per rol uit `ROLES` sinds #29)

**Klaar als:** één test per rij van de CSRF-matrix groen; een ingetrokken sessie geeft bij de volgende request 401; een admin-sessie zonder MFA
heeft sterkte `password`; de Better Auth-client stuurt bij sign-out `Content-Type: application/json`; per Secrets-regel een env-test die faalt
bij opstart; e2e-inlog per rol tegen de echte stack groen.

### 3. Secure route en gebruikersbeheer (referentie-feature)

Spec eerst. Gebruikersbeheer is het voorbeeld waar agents van kopiëren: gebruiker beheert eigen profiel en sessies;
admin (MFA verplicht) zoekt gebruikers met cursor-paginering, kent rollen toe en trekt ze in, blokkeert gebruikers.
Vier deel-PR's, in deze volgorde.

**3a. Backend-kern**
- [x] `defineRoute()` met `ctx.actor`, `createRouteKit`/`createApp` (ADR 0008), getypte client (contracten in `src/shared/contracts`), types per resource
- [x] `withUser()` met foutvertaling; Drizzle-schema uit de catalogus met branded IDs (`pnpm db:generate`)
- [x] Foutcoderegister, `limits.ts`, `assert()`, `unsafeCast()`, `Cents`, cursor-contract — met uitbreiding door de app (ADR 0008)
- [x] `user_roles` (FK naar `better_auth."user"`), `can()` met permissietabel van de app, MFA-eis afgeleid uit de rol in `can()` én RLS-helper, admin-test zonder MFA
- [x] pgTAP-invarianten (RLS geforceerd, geen TRUNCATE/REFERENCES/TRIGGER, `better_auth` dicht), racetest-patroon
- [x] Functiecatalogus in pgTAP (framework §6): elke functie client of intern, grants passend, actorcontrole, `search_path = ''`
- [x] Testkit in `src/core`: `asUser(rol)`, factories, savepoint per test

**3b. Frontend-basis**
- [x] TanStack Router met guards + ErrorBoundary; API-client (401 → inloggen, `ApiError`)
- [x] `AsyncView`, `<Form>`/`<FormField>`, `lib/format.ts`, `lib/env.ts`

**3c. Tokens en UI-kit**
- [x] Tokens in drie lagen, `@custom-variant dark`, basiskit Button, Input, Field, Card, Dialog (codemod vervalt: componenten met de hand op de tokens, geen `shadcn add`)
- [x] Contrasttest over recepten (bewijst ook dat een bekende foute kleur faalt), `scanAxe`, `/design-system` alleen in dev
- [x] Woordenlijsttest op `src/web/copy` en `src/core/web/copy` (`src/web/copy/woordenlijst.test.ts`, met zelftest) (#33)
- [x] `scanAxe`-uitzonderingen: geen, en een lintregel houdt ze tegen (`rails/axe-import`: alleen `e2e/support/axe.ts` gebruikt axe;
      `rails/axe-uitzondering`: geen `disableRules`/`exclude`/`include`/`options` daarin), fixtures in `test/rails/eslint.test.ts`
- [x] `check:catalogus`: AST-index van beide UI-mappen, publieke barrel-exports en bereikbare voorbeelden met eindige stringvarianten;
      dezelfde index voor agents en `/design-system`, zonder uitzonderingen (ADR 0028, `test/rails/catalogus-coverage.test.ts`,
      `src/web/features/design-system/component-index.test.tsx`; `gate:fast`: 1.186 tests groen, `docs/reviews/design-system-coverage.md`)
- [ ] Screenshot-baselines van de catalogus in de Playwright-image (uit fase 2)
- [x] Toasts standaard in de basiskit (besluit eigenaar 2026-10-10, zelf gebouwd zonder dependency): `ToastProvider` in `main.tsx`, `Toaster` in de AppShell en
      `useToast().success/error` met `aria-live`, op `/design-system` en in `check:catalogus` (`src/core/web/ui/toast.test.tsx`).
      Bestaande `Notice`-meldingen na een mutatie zijn nog niet omgezet (aparte taak; let daar op toasts onder een open modale `Dialog`, die inert is, en op pauze bij hover/focus, WCAG 2.2.1)
- [ ] Toasts: opvolging uit de review. Pauze bij hover en focus en geen automatisch verdwijnen van een fout (WCAG 2.2.1), en een besluit van de
      eigenaar over de duur (nu 5 s en 8 s, een aanname)
- [ ] Toasts: bereikbaar onder een open modale `Dialog` (inert: niet voorgelezen, sluitknop onbereikbaar), en een `Toaster` voor schermen in
      `CenteredCard` (`/login`, `/uitnodiging`), waar een toast nu nooit verschijnt
- [ ] Toasts: geen dubbele aankondiging (`role` binnen een `aria-live`-container, NVDA), en de toonklassen in een CVA-recept in plaats van
      gekopieerd uit `Notice`, zodat de contrasttest ze dekt
- [ ] Toasts: bestaande `Notice`-meldingen na een mutatie omzetten (`name-section.tsx`, `sessions-section.tsx`, `row-actions.tsx`), met
      bijgewerkte tests; `.claude/rules/web.md` en `docs/gouden-pad.md` noemen dan Toast (beschermd pad: akkoord eigenaar)
- [x] `/design-system` als echte pagina (besluit eigenaar 2026-10-10): onder `/_app` in de AppShell, met menu-item en `can()`-guard, ook in
      productie; vervangt "alleen in dev" hierboven en in framework §6 en §7. Eerst een spec (#44, ADR 0015, #51)

**3d. De feature**
- [x] Eerste feature met de hand door alle lagen (uit fase 2: dit is die feature); app-gegevens uit `better_auth."user"` via een `security definer`-view
- [x] `docs/gouden-pad.md` (≤ 1 pagina) met verwijzingen naar de bestanden van deze feature

**3e. Rest van gebruikersbeheer** — de beschrijving hierboven belooft meer dan de spec `accountbeheer` bouwde (daar buiten scope).
Elke app heeft dit nodig, dus het hoort in de template. Elk punt eerst een spec.
- [x] Admin blokkeert en deblokkeert een gebruiker; blokkeren trekt alle sessies direct in (de laatste-admin-regel geldt ook hier)
      (spec `accountbeheer-uitbreiding` AC-11..14 en 22..24, ADR 0026, #117: `db/tests/account_blocking.sql`,
      `test/api/account-blocking.int.test.ts`, `e2e/account-blocking.spec.ts`, `src/core/api/auth/blocked.test.ts`)
- [x] Gebruiker bekijkt en beëindigt de eigen sessies (spec `eigen-account`, deel 2; `test/api/eigen-account-deel2.int.test.ts`,
      `e2e/eigen-account-deel2.spec.ts`, `src/web/features/account/account-deel2.test.tsx`)
- [ ] Backupcodes voor TOTP, zodat een admin die zijn telefoon kwijt is niet alleen via `admin:create` terugkomt
- [x] Gebruiker wijzigt het eigen wachtwoord en de eigen naam (spec `eigen-account`, ADR 0024; `test/api/eigen-account.int.test.ts`,
      `e2e/eigen-account.spec.ts`, `src/web/account.test.tsx`)
- [ ] Admin trekt een openstaande uitnodiging in (opnieuw versturen bestaat al: `reinviteRoute`)
- [ ] Admin stuurt een gebruiker een resetlink ("wachtwoord vergeten" blijft dicht, ADR 0013; nu is `admin:create` de enige uitweg)
- [x] Gebruiker wijzigt het e-mailadres, met bevestiging naar het oude en het nieuwe adres (spec `eigen-account`, deel 2, ADR 0024)

**3f. Basis die elke app nodig heeft** (lijst eigenaar 2026-10-10). Nieuwe route, permissie of migratie: eerst een spec.
- [x] Lijstpagina-patroon: zoeken, filteren en sorteren in de search params, op het cursor-contract en `Table`; `new:resource` gebruikt het
      (spec `lijstpagina`; AC-8: `test/rails/new-resource-lijst.test.ts`, sjablonen in `scripts/kit/templates/`, voorbeeld `src/web/features/accounts`). Accounts en de generator zijn klaar; `check:new-resource` slaagt (AC-8)
- [x] `ConfirmDialog` in de kit voor destructieve acties (focus op Annuleren, `busy` blokkeert sluiten), op `/design-system` en in
      `check:catalogus` (`src/core/web/ui/confirm-dialog.test.tsx`, `e2e/design-system.spec.ts`)
- [x] Schil toegankelijk: paginatitel per scherm (`useDocumentTitle` via de h1, app-naam uit `src/web/index.html`), skip-link naar de inhoud,
      focus naar de h1 na een routewissel (`src/core/web/ui/app-shell.test.tsx`, `e2e/shell.spec.ts`)
- [ ] Focus naar de h1 na een routewissel naar een **lazy** route (`/design-system`): in e2e (Vite dev) staat de focus daarna op
      `body`. Geprobeerd: `routeKey` uit `resolvedLocation`, wachten op een (zichtbare) h1 met een MutationObserver, en
      terugzetten als de focus verloren gaat. Vermoeden: pending-weergave of het laden van de chunk duurt langer dan
      `HEADING_WAIT_MS` (2 s), of het pad naar `resolvedLocation` loopt anders. Eerst reproduceren met een trace
      (`pnpm ui:check`), dan pas repareren
- [x] Rate limit voor app-routes in `defineRoute` (nu alleen in Better Auth), met grenzen uit `limits.ts` en foutcode `RATE_LIMITED`
      (spec `rate-limit`; `app.consume_rate_limit`, `src/core/api/http/rate-limit.test.ts`, `test/api/rate-limit.int.test.ts`, `e2e/rate-limit.spec.ts`)
- [x] Mail-layout in core: één basissjabloon (HTML en platte tekst, afzender, voettekst) met snapshot-test; uitnodiging gebruikt hem
      (`src/core/api/mail/layout.ts`, escaping en alleen http(s)-links getest)
- [ ] Versie en build-SHA in `GET /api/health` en onderaan in de app
- [x] `favicon` (`src/web/public/favicon.svg`), `<meta name="robots" content="noindex, nofollow">` met een `robots.txt` die crawlen toestaat (anders ziet een crawler de noindex niet) (`test/ui/public.test.ts`)
- [ ] `/.well-known/security.txt`: vraagt een contactadres per app (eigenaar)

**Klaar als:** unit, pgTAP (elke policy op naam plus de invarianten), integratie, racetest "rol toekennen", e2e per rol en axe op 375 en
1280 px groen (uitvoer); een test per verboden rol per route; een test bewijst dat een app een permissie, foutcode en componentvariant
toevoegt zonder `src/core` te wijzigen; een core-test bewijst dat `createApp` geen route buiten `defineRoute` toelaat.

### 4. Rails afronden

Elke regel uit `AGENTS.md` die een check kan zijn, wordt een check; een check telt pas met een fixture die bewijst dat hij faalt.
- [ ] Overige ESLint-regels: sonarjs, better-tailwindcss, functielengte, max-params, max-depth, `useQuery`/`useForm`/`console.error`-restricties
      Deels gebouwd: functielengte (60 / 120 in `.tsx`, niet in tests), max-params 3, max-depth 3 met fixtures (#35); `useQuery`/`useMutation` alleen in
      `queries.ts`, `useForm` alleen in de wrapper, geen `console.error` in `queries.ts` en de API-client (#36); sonarjs en
      better-tailwindcss vragen een nieuwe dependency
- [ ] `check-migrations`, `check-docs` (framework §10: identifiers tussen backticks, `.claude/gates.json` = CODEOWNERS = `ask`, register = gates,
      statussen), `check-secdef`, `check-policies`, `check-core`, bundelbudget
      Deels gebouwd: `check-docs` in de ratchet (paden en scripts tussen backticks, links in `docs/`, statussen, "Hergebruik en UX",
      CODEOWNERS = `ask`) (#34); nog zonder vergelijking met `.claude/gates.json` (stuk 5);
      `check-policies` (elke policy een pgTAP-assert op naam, in `test:db`) en het bundelbudget (JS 260 kB, grootste chunk 115 kB, CSS 15 kB
      gzip, in `gate:fast`) (#38); `check-secdef`: eigenaar en `search_path` in de database via de functiecatalogus in pgTAP
      (`db/tests/functies.sql`, #23), en `check:secdef` in `gate:fast` op de migraties (`search_path = ''`, namen met schema, eigenaar
      `app_definer`; fixtures in `test/rails/fixtures/secdef/`) (#60);
      `check:migrations` (geen gecommitte migratie gewijzigd, verwijderd of hernoemd t.o.v. het afsplitspunt met `origin/main`, namen en
      versies uniek, in `gate:fast`; CI haalt daarvoor de volledige geschiedenis op)
- [x] `check-secdef` voor security definer-views (zoals `app.accounts`): barrier, actorfilter, namen met schema, eigenaar; fail-closed bij
      materialized views, opties of naam wijzigen via `alter`, views in dynamische SQL en set-operaties (`test/rails/fixtures/secdef-views/`)
- [x] Roadmap-vinkjes afdwingen: `check:roadmap` (blokkerend, in `gate:fast`; `scripts/kit/check-roadmap.mjs`) meldt een nieuw of gewijzigd `[x]` in
      `docs/roadmap.md` zonder bewijs erachter (PR-nummer, testpad of checknaam) en een spec die naar `gebouwd` gaat zonder bewijs; met fixtures
      (`test/rails/check-roadmap.test.ts`, `test/rails/fixtures/roadmap/`)
- [ ] Diff-guard met label `gate-wijziging` + goedkeuring op exact de head-SHA, niet van de auteur (framework §10), met tests per geval
      Gebouwd, nog niet verplicht (ADR 0017): `scripts/kit/diff-guard.mjs` met tabeltests en `.github/workflows/guard.yml`; zolang de
      auteur zelf goedkeurder is, uitslag `overgang`. Verplicht bij de overstap op de GitHub App (stuk 6)
- [ ] `gate:fast` definitief, `gate:slow` (squawk, snapshot `pg_dump -N tap --exclude-extension=pgtap` zonder verschil, `check-policies`, e2e)
      Deels gebouwd: `gate:slow` = `test:db` (met `check-policies`) + `ui:check` + `check:snapshot` (snapshot en Drizzle-schema zonder
      verschil) (#38); squawk vraagt een nieuwe tool
- [x] Scripts uit `excludedCommands` (`test:db`, `ui:check`, `gate:slow`, `db:generate`, `check:snapshot`) bestaan in `package.json`, alle vijf in de runner van ADR 0009
      Bewezen door `test/rails/excluded-commands.test.ts` (WS-03)
- [x] CI: `gate:slow`-job, gewijzigde tests als lijst, `guard.yml` (PR-code alleen als data, met de diff-guard), CodeQL, osv-scanner (PR + wekelijks;
      uitzonderingen met reden en `ignoreUntil`), Betterleaks (versie gepind in `mise.toml`), Renovate (gegroepeerd, blokkeert TS 7)
      Eerst, als eigen PR (volgorde punt 1): `gate:slow`-job met de Postgres-image uit `db/docker/`, osv-scanner en Renovate
      Gebouwd: `gate:slow`-job (#59), osv-scanner en Renovate (#61), `guard.yml` met de diff-guard (#62), CodeQL (`codeql.yml`,
      `security-extended`, TypeScript en workflows) en Betterleaks over de hele geschiedenis (job `secrets`, versie gepind in
      `mise.toml` in plaats van een image op digest). Gewijzigde of verwijderde tests als lijst staan in de samenvatting van de
      diff-guard (`scripts/kit/diff-guard.mjs`, "Gewijzigde of verwijderde tests"; op elke PR via `guard.yml`)

**Klaar als:** tabel in de PR met per regel uit `AGENTS.md` de check en de fixture-test die bewijst dat hij faalt (alle fixture-tests groen);
CI weigert `any`, een databaseclient in `src/web`, een route buiten `defineRoute` en een gewijzigde migratie (uitvoer);
de bewaker houdt een afgezwakt check-script tegen; regels zonder check staan met reden als roadmap-item.

### 5. Agent-opzet

- [x] `AGENTS.md`, `CLAUDE.md`, padregels, spec-sjabloon, DoD (tekst; nog niet afgedwongen)
- [ ] `.claude/settings.json` bewezen: sandbox start op Ubuntu/WSL2 (bubblewrap, socat), deny-regels getest (ook `Read(!.env.example)` en `cat .env`)
- [x] Rolhek-hook + `.claude/gates.json` (één lijst voor hook, diff-guard, CODEOWNERS en `ask`), met tabeltest van echte payloads incl. omzeilingen (#40; `check-docs` vergelijkt hem met CODEOWNERS en `ask`)
- [x] "Groen vóór klaar" (SubagentStop developer) en de overige hooks uit framework §8, elk met timeout en tabeltest (#41)
- [x] Vijf subagents (architect, developer, tester sonnet, reviewer opus, docs) met `model`, `maxTurns`, "eerst de feiten" (#42)
- [x] Skills (spec, nieuw-route, nieuw-scherm, nieuw-component, migratie, release, security-review) met `!`-injectie uit `scripts/kit/feiten.mjs`
      (routes, permissies, foutcodes, componenten) (#42; `release` volgt in fase 3)
- [x] `pnpm new:resource <naam>` afgeleid uit het gouden pad (ADR 0016): spec-skelet, daarna werkstraat-stap 2 met 501-handlers; `check:new-resource` als eigen CI-job

**Klaar als:** per hook een tabeltest die hem met echte invoer aanroept en de exitcode controleert (blokkeert wat moet, laat door wat mag), groen;
code uit `pnpm new:resource` haalt `gate:fast`; drie testopdrachten door de hele werkstraat met per opdracht: ingegrepen hook of check, aantal beurten, correcties van de eigenaar.

### 6. GitHub

- [x] `CODEOWNERS`, PR-template (bestanden; nog niet actief)
- [ ] Organisatie, GitHub App voor de agent, org-ruleset via custom property, Actions-instellingen
      Deels gebouwd: `scripts/github-ruleset.sh` met `test/scripts/github-ruleset.test.ts` (#104) zet de ruleset van één repo; de org-ruleset via custom property en de GitHub App ontbreken
      (daarna in de ruleset: code-owner-review en 1 goedkeuring aan; private repo's vragen Pro/Team)
- [ ] `.github/settings/` + `scripts/check-github.mjs` (ook `app_id` van verplichte checks, `enforce_admins`, conversation resolution), `check-spec-approval`
- [ ] `docs/operations/rails-checklist.md`: instellingen buiten de repo, per stuk afgevinkt met bewijs
- [ ] Pushen met het App-token zonder het token van de eigenaar in de agent-omgeving (`docs/operations/`); daarna `denyRead` op `~/.config/gh`
- [x] `pnpm app:init <slug> "<App-naam>"`: de handstappen uit `docs/nieuwe-app.md` (naam, README, titel) als script met test; de template-sectie verdwijnt
      (`scripts/kit/app-init.mjs`, `test/scripts/app-init.test.ts`)
- [ ] Template-versie: tag per template-release, de app legt de versie vast, upgrade-notities bij breaking changes in `CHANGELOG.md` (ADR 0006)
      Deels gebouwd: `CHANGELOG.md` met "Bij een update"-notities en `scripts/kit/app-init.mjs` die de template-SHA vastlegt; nog geen tags of versieschema
- [x] `.vscode/extensions.json` en `.vscode/settings.json` (ESLint, Prettier, Tailwind), gelijk aan de gates
- [ ] `LICENSE`: eigendom en geen open-source-licentie
- [ ] Proef-app: een app via `docs/nieuwe-app.md`, daarna één echte template-update (`git merge template/main`) via een PR.
      Conflicten en handwerk vastleggen; wat terugkomt, wordt een regel of script in de template (ADR 0006)

**Klaar als:** `check-github` groen; een test-PR van de bot is zonder review van de eigenaar niet te mergen; een push naar `main` wordt geweigerd;
de proef-app neemt een template-update over met conflicten alleen in bestanden die vooraf als verwacht zijn vastgelegd.

### 7. Draaien buiten `pnpm dev`

Provider-neutraal: wat elke host nodig heeft, hoort in de template; de adapter per host blijft fase 3.
- [x] `startServer` neemt host en poort uit het env-schema: `API_HOST` (standaard `127.0.0.1`; de containerimage zet `0.0.0.0`) en `API_PORT`
- [x] Netjes stoppen: bij SIGTERM/SIGINT geen nieuwe verbindingen, lopende requests afmaken binnen `SHUTDOWN_TIMEOUT_MS` (standaard 10 s),
      daarna de pools sluiten via `onStopped` uit `src/api/server.ts` (`src/core/api/http/serve.test.ts`)
- [x] Request-logging in `src/core/api/obs/` (framework §6): één JSON-regel per request op stdout met `requestId`, routepatroon, status,
      gebruiker-ID, duur en databasetijd (tijd binnen `withUser`); geen body, query of PII. Eigen logger, geen dependency (besluit eigenaar
      2026-10-10); `createApp({ log })`, `server.ts` geeft `writeJsonLine` mee (`src/core/api/obs/request-log.test.ts`)
- [x] Readiness: `GET /api/ready` (200 `{ ok: true }` of 503 `{ ok: false }`) via `pingDatabase()` naast `GET /api/health` (liveness); uitkomst 1 s
      bewaard, hooguit één controle tegelijk, timeout 2 s; eigen verbinding met timeouts; regel in framework §3, ADR 0018 (`src/core/api/http/readiness.test.ts`, `test/datapad/ping.int.test.ts`)
- [x] `pnpm start` (`node src/api/server.ts`, geen buildstap voor de API) en een containerimage (non-root) die SPA en API op één origin serveert
      (ADR 0019, `Dockerfile`, CI-job `image` met `scripts/check-image.sh`; `src/core/api/http/web.test.ts`)
- [ ] Achtergrondtaken volgens de ADR uit **Beslissingen**: opruimen en mail-outbox, elk met een integratietest (volgorde: ADR 0020,
      sectie Bouwvolgorde)

**Klaar als:** de image start met een niet-lokale `APP_ENV` tegen de lokale stack (uitvoer van de eigenaar); per request één logregel
(test); na SIGTERM eindigt een lopend request zonder afgebroken transactie (test); een opruimtaak verwijdert alleen verlopen rijen (test).

**Fase 1 klaar als:** verse machine komt met `bootstrap.sh` + `pnpm dev` tot een ingelogde app zonder extern account;
CI weigert `any`, een databaseclient in `src/web`, een route buiten `defineRoute` en een gewijzigde migratie;
de bewaker houdt een afgezwakt check-script tegen; `check-github` groen; elke rol logt in via e2e;
`gate:slow` draait in CI; de proef-app neemt een template-update over (stuk 6).

## Fase 2 — Eerste app, terug naar template

Eerste feature, `new:resource` en `check:catalogus` zijn naar fase 1 verplaatst (stuk 3 en 5).
- [ ] Clientfouten naar eigen tabel: allowlist-velden, geen PII, 5 min dedupe, build-SHA (framework §6)
- [ ] Elke fout die in een app doorglipt, wordt eerst een check of regel in de template (met fixture), daarna gerepareerd in de app

## Fase 3 — Release (per app)

- [ ] ADR `0100`+: hosting en beheerde Postgres (moet eigen rollen toestaan); adapter in `deploy/<host>/`
- [ ] Lektest via de pooler van de provider; rollen per omgeving via runbook
- [ ] Staging en productie, beschermde environments, release-workflows, `check-release-ci` (vóór én na de build), `check-deployment-schema`
      (faalt dicht, weigert preview tegen productie)
- [ ] Smoketest na deploy; headers/CSP op de host; CAPTCHA; PWA-manifest
- [ ] Runbooks in `docs/operations/` (platform, back-up en herstel met acceptatietabel); back-up één keer teruggezet

## Agenttaken uit de starter-beoordeling (2026-10-11)

Doel: van een stevig framework naar een bewezen start-app die een agent zonder eigen architectuurkeuzes kan uitbreiden.
P0 betekent noodzakelijk voor een veilige basis, P1 voor een herbruikbare en bewezen starter, P2 optioneel op aanleiding.
Dit vervangt **Volgorde vanaf 2026-10-10** niet: de proef-app blijft vóór verdere uitbreiding komen.
Een taak blijft open totdat de toepasselijke checks en het hieronder genoemde bewijs in een PR staan.
Een bestaand script of ADR bewijst niet dat de bijbehorende capability compleet of actief is.

### Werkwijze voor de uitvoerende agent

- Lees AGENTS.md, de relevante ADR's, specs en bestaande code; begin met de feiten uit het feiten-script.
- Zoek eerst bestaande implementaties en open PR's. Breid de bestaande taak/spec uit; bouw geen tweede mechanisme naast de eerste.
- Nieuwe route, permissie of migratie: eerst een spec volgens [het sjabloon](specs/_template.md), daarna eigenaargoedkeuring.
  Deze roadmap is geen goedgekeurde featurespec en verleent geen toestemming voor nieuwe dependencies of providerkeuzes.
- Beschrijf in de spec contracten, verboden rollen, foutgevallen, hergebruik, grenzen en bewijsmatrix.
  Splits omvangrijk werk in kleine PR's; volg [de DoD](dod.md) en de werkstraat uit [het framework](framework.md).
- Verander geen bestaande vinkjes of ADR-statussen op basis van deze lijst. Meld onbesliste waarden aan de eigenaar.
- Houd de core klein. SaaS, PWA, storage en app-specifieke notificaties zijn optionele uitbreidingen, geen standaard afhankelijkheden.

### ST-01 — P0: GitHub-bescherming daadwerkelijk activeren

- [ ] **Aansluiting:** fase 1, stuk 6 en diff-guard in stuk 4.
  **Doel:** een agent kan beschermd werk niet zonder de juiste eigenaarreview samenvoegen.
  **Werk:** werk de gewenste instellingen als code en de rails-checklist uit: PR-plicht, verbod op force/delete,
  verplichte checks met hun verwachte GitHub Actions-identiteit, CodeQL, opgeloste gesprekken, review op de huidige head-SHA
  en geen bot-bypass. Onderscheid expliciet de overgang onder het eigenaaraccount van de definitieve GitHub App-opzet.
  Implementeer de alleen-lezende controle; een onleesbare instelling is een fout. Laat de eigenaar organisatie, App en instellingen activeren.
  Privésleutels en het eigenaar-token blijven buiten de agentomgeving; beschrijf de verstrekking van kortlevende App-tokens.
  **Afhankelijkheden:** ADR 0005, 0006, 0011 en 0017; beschikbaarheid van de vereiste CI-checks.
  **Klaar als:** negatieve fixtures voor ontbrekende/bypassbare instellingen; bewijs dat directe push naar main wordt geweigerd
  en een bot-PR zonder vereiste review niet mergebaar is. Geen actieve bescherming claimen op basis van alleen JSON-bestanden.

### ST-02 — P0: accountbeheer en herstel volledig maken

- [ ] **Aansluiting:** fase 1, stuk 3e; bestaande accountbeheer-specs.
  **Stand 2026-10-12:** gebouwd: eigen sessies en e-mail wijzigen (#93), naam en wachtwoord (spec `eigen-account`, #93), blokkeren en
  deblokkeren (#117). Open: backupcodes, uitnodiging intrekken, admin-resetlink.
  **Werk:** inventariseer per open 3e-item de huidige spec/PR en implementeer de ontbrekende flow:
  blokkeren/deblokkeren, eigen sessies intrekken, TOTP-backupcodes, naam/wachtwoord wijzigen, uitnodiging intrekken,
  admin-resetlink en e-mail wijzigen. Houd publieke wachtwoordvergeten-flow dicht volgens ADR 0013.
  Specificeer herauthenticatie, sessie-intrekking, tokenverval, oude/nieuwe adresbevestiging en herstel zonder rolpromotie.
  Koppel audit en mail aan ST-04/ST-03; kopieer geen synchroon mailpad als de outbox de geldende route wordt.
  **Afhankelijkheden:** ADR 0013; audit voor admin-acties; de relevante stappen uit ADR 0020.
  **Klaar als:** echte-stack e2e van elke flow; verboden rol en admin zonder MFA geweigerd; blokkeren werkt bij de volgende request;
  laatste-admin-racetest; herstelcode eenmalig, ook bij parallel gebruik; ingetrokken/verlopen links werken niet;
  gewijzigd e-mailadres is pas actief na de vereiste bevestigingen. Elk deel krijgt afzonderlijk bewijs.

### ST-03 — P0: runner, opruimen en betrouwbare mail-outbox

- [ ] **Aansluiting:** fase 1, stuk 7; [ADR 0020](adr/0020-achtergrondtaken.md).
  **Werk:** volg de sectie Bouwvolgorde van ADR 0020 letterlijk voor audit, bewaarcatalogus, jobrol, runner en outbox.
  Verbindingen blijven in de bestaande db/auth-laag; de runner krijgt ze geïnjecteerd. Voeg batches, locks, leases,
  begrensde retries, definitieve foutstatus en herstel na een procescrash toe volgens de ADR.
  Bewaar geen uitnodigingstoken in de outbox. Maak verzendstatus zichtbaar voor de admin en schrijf een herstelrunbook.
  Een naar nul schalende host krijgt later een eigen adapter; kies nu geen queue-provider.
  **Afhankelijkheden:** ST-04 en ST-05 volgens de ADR-bouwvolgorde; akkoord voor beschermde rol/env-wijzigingen.
  **Klaar als:** twee runners claimen dezelfde rij niet tegelijk; crash/lease-verval en SMTP-uitval zijn getest;
  definitief mislukte mail blijft herstelbaar; alleen verlopen rijen worden verwijderd; stoppen wacht op de lopende batch
  vóór het sluiten van pools. Documenteer at-least-once-verzending: dit bewijst geen exactly-once-mailbezorging.

### ST-04 — P0: audit en rate limiting op app-routes

- [ ] **Aansluiting:** auditbesluit, stuk 3f en [ADR 0021](adr/0021-audit-log.md).
  **Stand 2026-10-12:** gebouwd: rate limiting op app-routes (#87, spec `rate-limit`) en een requestId die de server zelf kiest (#83).
  Audit log (spec `audit-log`) deel A, B en C in één PR: migratie, `ctx.audit`, invite/reinvite; bewijs ontbreekt tot `pnpm test:db` groen is. Open: merge, `/admin/audit` (eigen spec) en de routes revoke/reset-link.
  **Werk audit:** servergegenereerde request-ID, audit-context in de transactie, append-only-tabel en vaste grants/policies;
  registreer app-acties met getypte, strict gevalideerde details. Gebruik de aparte core-auditwriter voor Better Auth-acties.
  Beschrijf de transactionele grens bij het aanmaken van een uitnodiging en de beheerdersrechten van de migrator eerlijk.
  Geen willekeurige payloads, e-mailadressen of vrije tekst in auditdetails.
  **Werk rate limiting:** eigen spec voor limieten in defineRoute, los van bestaande Better Auth-limieten.
  Leg sleutel, venster, atomair tellen over meerdere API-instanties, responsecontract en gedrag bij store-uitval vast;
  waarden komen uit limits.ts en worden door de eigenaar vastgesteld. Houd dit een afzonderlijke implementatie-PR.
  **Afhankelijkheden:** auditstappen 1–4 uit ADR 0020; goedgekeurde rate-limit-spec.
  **Klaar als:** audit wordt met de actie teruggedraaid; verboden schrijver/lezer geweigerd; auditdetails falen buiten de allowlist;
  vervalste client-request-ID wordt niet gebruikt. Parallelle requests overschrijden de vastgestelde limiet niet;
  RATE_LIMITED heeft de afgesproken clientweergave; lagere app-limieten worden werkelijk toegepast.

### ST-05 — P0: privacymechanisme, export en verwijderen

- [ ] **Aansluiting:** AVG-besluit; [ADR 0022](adr/0022-avg.md).
  **Werk:** bouw bewaarcatalogus, FK-invarianten, eigen export, admin-verwijdering en app-registratie van exporters/erasers
  in de volgorde uit ADR 0020. Accountverwijdering en audit blijven in één transactie; vermijd een tweede verbinding
  die op dezelfde laatste-admin-lock wacht. Exporters filteren expliciet op eigenaar, ook als RLS gedeelde data toelaat.
  Valideer bewaartermijnen en retention-kolommen; negatieve termijnen of ongeschikte kolommen worden geweigerd.
  Neem catalogusregistratie mee in de generator. Lever het privacyregister-sjabloon; juridische inhoud en back-uptermijnen blijven per app.
  **Afhankelijkheden:** audit, bewaarcatalogus en outbox volgens ADR 0020; goedgekeurde export/verwijder-specs.
  **Klaar als:** gedeelde data van anderen ontbreekt in export; accountverwijdering ruimt ook tokens/outbox op;
  laatste-admin en eigen-admin-verwijdering worden geweigerd; terugrollen herstelt actie en audit samen;
  cascades/nullable SET NULL en catalogusregistratie hebben negatieve pgTAP-fixtures;
  app-exporter/eraser werkt zonder core-aanpassing. Retention is techniek, geen claim van volledige AVG-conformiteit.

### ST-06 — P1: generator tot complete CRUD-flow uitbreiden

- [ ] **Aansluiting:** fase 1, stuk 5, 3f en ADR 0016; de huidige generator levert bewust 501-handlers.
  **Stand 2026-10-12:** gebouwd: zoeken en sorteren in de generatorlijst (#111, #113). De handlers blijven bewust 501.
  **Werk:** ontwerp na de proef-app een uitbreiding voor eenvoudige owner-scoped resources: migratie/RLS-tests,
  strict contracten, permissies, lijst/detail/aanmaken/wijzigen/verwijderen, query-hooks, formulieren en ConfirmDialog.
  Gebruik het gedeelde lijstpatroon; search params bevatten zoeken/filter/sorteren en volgen het cursor-contract.
  Geen generieke oplossing voor elke resource: documenteer welke relaties en bijzondere mutaties handwerk vragen.
  Behoud spec-eerst, dry-run, weigering om te overschrijven en rollback bij mislukte generatie.
  **Afhankelijkheden:** bewijs uit ST-09, lijstpatroon ST-07, ADR/spec voor wijziging van generatorgedrag, retention uit ST-05.
  **Klaar als:** een gegenereerde fixture-resource werkt door alle lagen tegen de echte stack;
  tenant-isolatie, verboden rollen, validatiefouten, paginering en destructieve acties getest;
  generatie haalt de toepasselijke gates en build; dry-run toont alle schrijfdoelen, waaronder de route-tree;
  een mislukking laat geen half gegenereerde resource achter.

### ST-07 — P1: herbruikbare schermpatronen en design-system

- [ ] **Aansluiting:** fase 1, stuk 3c/3f, ADR 0015 en componentcatalogus.
  **Stand 2026-10-12:** gebouwd: lijstpagina-patroon (#92, #114; generator #111, #113). Open: toasts en focus na een routewissel naar een lazy route.
  **Werk:** rond lijstpatroon, mutatiefeedback/toasts en lazy-route-focus af. Leg herbruikbare recepten vast voor
  lijst/detail/formulier, empty/loading/error/forbidden, bevestigen en succes/foutfeedback.
  Inventariseer ontbrekende componentvarianten op basis van de proef-app; volg de bestaande tokens en registratielaag.
  Reproduceer de lazy-route-focusfout eerst met een trace. Behoud documenttitel- en focusgedrag bij nieuwe AppShell-mounts.
  **Afhankelijkheden:** bestaande shell/ConfirmDialog; eigenaarbesluit over toastdependency; concrete behoeften uit ST-09.
  **Klaar als:** patronen in de catalogus en voorbeelden; keyboard/focus en aria-live inhoudelijk getest;
  axe op 375/1280 px groen zonder uitzonderingen; geen dubbele mutatie bij busy-state;
  ConfirmDialog documenteert retries na fouten. App-varianten vereisen geen core-wijziging.

### ST-08 — P1: operationele monitoring en foutdiagnose

- [ ] **Aansluiting:** request-logging/readiness uit stuk 7 en clientfouten in fase 2.
  **Werk:** verbind serverfouten, clientfouten, build-SHA en request-ID; bouw de geplande clientfoutentabel met allowlist,
  dedupe en retention. Definieer signalen voor readiness-uitval, foutpercentage, jobachterstand en mislukte verzending.
  Core levert contracts/uitbreidingspunten; de app kiest pas bij release de monitor en alarmering.
  Leg per signaal drempel, verantwoordelijke en herstelactie vast in het app-runbook, na eigenaarbesluit.
  **Afhankelijkheden:** ST-03/ST-05 voor jobstatus/retention, ST-12 voor versie/buildidentiteit; spec voor clientfouten.
  **Klaar als:** geforceerde fout is traceerbaar zonder PII/tokens/body/query; dedupe en opruimen getest;
  een daadwerkelijk alert en herstel zijn in staging bewezen. Geen telemetry-provider verplicht in core.

### ST-09 — P1: bewijs met proef-app én template-update

- [ ] **Aansluiting:** fase 1, stuk 6; prioriteit blijft zoals afgesproken op 2026-10-10.
  **Werk:** kies met de eigenaar één kleine echte app met een owner-scoped resource en een adminactie.
  Start via het nieuwe-app-playbook, bouw een complete verticale flow en registreer elke handmatige stap,
  onduidelijke instructie, ontbrekende component en core-aanpassing. Houd app-domein buiten deze template.
  Neem daarna één echte template-update over via de bestaande merge-history-aanpak van ADR 0006.
  **Afhankelijkheden:** bestaande runtime/auth/generator; de eigenaar levert de lokale stack en de appkeuze.
  **Klaar als:** nieuwe gebruiker/admin doorloopt de flow tegen de echte stack; verboden toegang getest;
  update behoudt app-code en instellingen; verwacht versus werkelijk conflict vastgelegd;
  rapport met exacte checks, handwerk en verbeter-PR's terug naar template. Een demo in deze repo alleen telt niet.

### ST-10 — P1: staging, release en aantoonbaar herstel

- [ ] **Aansluiting:** fase 3, per app; herbruikbare contracts/runbook-sjablonen terug naar template.
  **Werk:** na provider-ADR een adapter, gescheiden omgevingen, schema-compatibiliteitscontrole,
  release-CI-controle op exact commit, protected production approval en smoketest implementeren.
  Beschrijf code-rollback, vooruitmigratie, back-up/herstel en omgang met verwijderde gegevens in back-ups.
  Eigenaar kiest beschikbaarheidsdoelen/RPO/RTO, regio en bewaartermijnen; de agent verzint die niet.
  **Afhankelijkheden:** providerbesluit, ST-01, ST-08, privacyregister en productie-runbooks.
  **Klaar als:** preview tegen productie faalt; vereiste CI en staging horen bij exact het releasecommit;
  smoketest bewijst login/lezen en gesloten browser-datatoegang; een back-up is werkelijk in een aparte omgeving
  teruggezet, met gemeten dataverlies/hersteltijd. Productiegoedkeuring blijft bij de eigenaar.

### ST-11 — P2: optionele notificatie- en storage-uitbreidingen

- [ ] **Doel:** app-behoeften ondersteunen zonder de starter-core standaard te belasten.
  **Notificaties:** bouw alleen bij een concrete app een registratiecontract voor berichtsoorten,
  ontvangers/autorisatie, voorkeuren en kanalen. Hergebruik mail-layout/outbox; in-app inbox en push vragen eigen specs.
  **Storage:** ontwerp een provider-neutrale grens voor uploads/downloads met owner-controle,
  toegestane typen/grootte, korte signed-URL-geldigheid, metadata en opruimen van verweesde bestanden.
  Geen provider-SDK in de browser; adapter en credentials blijven server-side.
  **Afhankelijkheden:** concrete appbeslissing; ST-03/ST-05; provider-ADR voor storage/push; dependencygoedkeuring.
  **Klaar als:** ontvangstrechten en voorkeuren getest; herhaalde jobs veroorzaken geen dubbele inboxregels;
  twee gebruikers kunnen elkaars bestanden niet benaderen; verlopen links en ongeldige uploads geweigerd;
  accountverwijdering en retention behandelen bestanden. Zonder activering voegt dit geen service of runtimeverplichting toe.

### ST-12 — P2: templateversies en upgradecontrole

- [ ] **Aansluiting:** fase 1, stuk 6 (template-versie) en 3f (versie/build-SHA).
  **Werk:** beschrijf releaseversie, opgenomen templatecommit en app-build-SHA als verschillende waarden.
  Leg templateversie/commit vast bij app-init en update; lever upgrade-notities voor breaking changes,
  migraties, nieuwe instellingen en noodzakelijke handstappen. Controleer vóór een update core/app-grens en ontbrekende stappen.
  Een versiecontrole adviseert; hij wijzigt geen app automatisch en vervangt de mergeprocedure van ADR 0006 niet.
  Health/UI tonen alleen afgesproken publieke buildmetadata, geen secrets of interne infrastructuur.
  **Afhankelijkheden:** proef-update ST-09; eigenaarbesluit over versieschema/metadataformat; spec voor healthcontractwijziging.
  **Klaar als:** app-init legt de juiste herkomst vast; update wijzigt die controleerbaar;
  fixture detecteert ontbrekende upgradevoorwaarde; buildmetadata komt overeen met het gebouwde commit;
  een app kan een template-update reviewen en terugvinden zonder core-code te kopiëren.

### ST-13 — P2: optionele SaaS- en PWA-pakketten

- [ ] **Werk:** documenteer activeringsgrenzen en aparte ADR/spec per gekozen pakket.
  SaaS: workspace/tenant, lidmaatschap en rollen; abonnement/betaling alleen bij concrete behoefte.
  PWA: manifest/installatie, veilige updateflow en alleen afgesproken offlinegedrag; push apart van installatie behandelen.
  Storage blijft ST-11. Kies geen billing-, push- of hostingprovider als onderdeel van deze roadmap.
  **Afhankelijkheden:** bewezen starter; eigenaar kiest een concrete app en pakket; provider/dependencybesluiten vóór bouw.
  **Klaar als:** pakket is weglaatbaar en voegt zonder activatie geen tabellen, dependencies of externe dienst toe;
  SaaS-tests bewijzen tenant-isolatie over API én database; PWA-tests bewijzen updates en uitloggen zonder achterblijvende
  privé-cache. Feature flags, onderhoudsmodus en unsaved-form-waarschuwingen blijven op aanleiding zoals eerder besloten.

### ST-14 — P1: documentatie en bouwresten opruimen

- [ ] **Doel:** een repo waarmee mensen en agents apps kunnen bouwen zonder eerst het bouwproces van het framework te reconstrueren.
  De teksten moeten helder, natuurlijk Nederlands zijn. Bouwen met agents blijft het uitgangspunt van de template.
  **Behoud van agentinformatie:** verwijder niets dat agents helpt de template of het framework correct te gebruiken.
  Behoud instructies, skills, hooks, voorbeelden, specs, ontwerpcontext, bekende valkuilen, herstelstappen, overdracht en bewijs.
  Dat informatie over agents of het bouwproces gaat, maakt haar niet overbodig. Bij twijfel blijft ze staan.
  **Eerste stap:** README, changelog en leeswijzer zijn herschreven; de volledige opschoonronde staat nog open.
  **Inventarisatie:** loop alle bijgehouden bestanden na: documentatie, codecommentaar, gebruikers- en mailteksten,
  scripts, agentinstructies en GitHub-templates. Noteer per kandidaat wie hem leest, waar hij wordt gebruikt en of hij
  blijft, wordt herschreven, wordt samengevoegd of verdwijnt. Controleer imports, links, generators en checks die erop rekenen.
  Beoordeel ook gebruik als agentcontext: afzonderlijk geladen padregels, sessieherstel, voorbeelden en preventie van eerdere fouten.
  Begin bij oude plannen, reviewverslagen, voortgangsbestanden, herstelnotities en toelichting op mislukte bouwpogingen.
  **Redactie:** schrijf over de huidige werking. Verwijder gesprekstaal, zelfbeoordelingen, opgeblazen formuleringen,
  lege herhaling en verouderde statusclaims. Behoud herhaling waar afzonderlijk geladen agentcontext die nodig heeft.
  Zet besliste open vragen om in besluiten, met behoud van datum, herkomst, alternatieven en relevante afwegingen.
  Gebruik roadmaptaken voor open werk, ADR's voor keuzes en de changelog voor wijzigingen die een app raken.
  Houd de menselijke leesroute kort: README → leeswijzer → gebruik of ontwikkeling.
  **Opruimen:** een bouwverslag mag alleen verdwijnen als het geen nut meer heeft voor mensen of agents.
  Verplaats unieke, bruikbare informatie eerst naar een passende, vindbare plek en controleer de verwijzingen ernaartoe.
  Leg per verwijdervoorstel vast waarom geen instructie, ontwerpcontext of leerpunt verloren gaat.
  Git of een oude PR alleen is geen vervanging voor informatie die een agent tijdens het werken nodig heeft.
  Bewijs voor een open taak blijft bereikbaar totdat die taak is afgerond.
  Verwijder geen tests, fixtures, migraties, gates, veiligheidsregels of goedkeuringshistorie als vermeend bouwafval.
  Raakt opruimen zo'n onderdeel, leg de wijziging apart aan de eigenaar voor. Herschrijf geen Git-geschiedenis.
  **GitHub:** vul een korte beschrijving en passende topics in; controleer de template-instelling en de uitleg voor nieuwe apps.
  Voorgestelde beschrijving: "Template om webapps met code-agents te bouwen. React, Hono en Postgres, met agentinstructies, UI-componenten en ontwikkelcontroles."
  De controle op 2026-10-11 vond geen beschrijving of topics en een uitgeschakelde template-instelling.
  **Afhankelijkheden:** eigenaarreview van de opruiminventaris; geldende besluiten en bewijscriteria; app-init die README/changelog gebruikt.
  **Klaar als:** elk bestand in de inventaris heeft een onderbouwde bestemming; overbodige bouwresten zijn verwijderd
  en verwijzingen aangepast; documentatie klopt met code en beschikbare commando's; een menselijke lezer kan de app starten
  en de bouwafspraken vinden zonder reviewlogs te lezen. Documentatiecontrole en toepasselijke gates zijn groen;
  app-init blijft werken; een zoekronde vindt geen achtergebleven verwijzingen naar verwijderde bestanden.
  De inventaris toont waar alle bruikbare agentinformatie behouden is. Loop de agentprocedure voor een nieuwe app en
  een feature na: instructies, voorbeelden, beslissingen en herstelcontext zijn nog bereikbaar vanuit hun normale startpunten.
  De eigenaar leest de instappagina's en een steekproef van de overige teksten. Een woordfilter alleen bewijst geen goede redactie.
