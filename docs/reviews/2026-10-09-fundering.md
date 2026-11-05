# Review fundering — 2026-10-09

Vier onafhankelijke reviews (alleen lezend): trouw aan het oorspronkelijke plan (sindsdien verwijderd, zie CHANGELOG), Claude Code-docs, auth/database/security, tooling/CI.
Versies uit npm-registry, Docker Hub, nodejs.org en GitHub-advisories op 2026-10-09. **(onzeker)** = niet zelf geverifieerd.
**Status:** doorgevoerd op 2026-10-09 (zie CHANGELOG en ADR 0003–0005). Open: alles wat bewijs op een machine met Docker vraagt
(A9, healthcheck; pgTAP-image; rollen en baseline-migratie) staat in roadmap fase 0.
Controle-review: ook `.claude/settings.json` gecorrigeerd (env-deny, `ask` = §10 met uitzonderingen, smallere push/commit-denies,
pnpm-aliassen, localhost via `excludedCommands`), na akkoord van de eigenaar.

## A. Blokkerend vóór fase 0

| # | Bevinding | Waar | Voorstel |
|---|---|---|---|
| A1 | `db/init` zet ook schema's, default privileges en pgTAP neer; die zijn per database, dus bestaan in productie niet | `db/init/01-roles.sql:6-15` | `db/init` alleen rollen; schema's, grants en default privileges (met `FOR ROLE`) naar de eerste migratie |
| A2 | `alter default privileges … on tables/sequences from public` doet niets (PUBLIC heeft daar geen defaults); geldt alleen voor objecten van de uitvoerende rol | `01-roles.sql:11,13`, `framework.md` §6 | Vervangen door: revoke op functies én types, `revoke all on database … from public`, `grant connect` per rol, per objectmakende rol `FOR ROLE` |
| A3 | `revoke usage on schema public` (PG15+) zonder `grant usage` aan `app_authenticated` → `public.user_roles` onbereikbaar | `01-roles.sql:10` | Grant in eerste migratie |
| A4 | pgTAP in `public` ná de functie-revoke → tests als `app_authenticated` falen; vervuilt snapshot en `check-secdef` | `01-roles.sql:15` | Eigen schema `tap`, alleen in testdatabase, `pg_dump -N tap` |
| A5 | `auth_service` is eigenaar van schema `auth` → kan DDL/drop; botst met "nooit als eigenaar" | `01-roles.sql:7` | Eigenaar = migratierol; `auth_service` alleen DML + `alter role … set search_path = auth` |
| A6 | Wie maakt de auth-tabellen? Better Auth CLI (`@latest`, tweede migratiebron) of dbmate; ID-type (text) vs `UserId`/`app.current_user_id()`; FK `user_roles → auth."user"`; RLS-invariant faalt op `auth.*` en `schema_migrations` | ADR 0003/0004 | Nieuwe ADR: `auth generate` (gepind) → SQL in dbmate-migratie; ID-type text; invariant met expliciete uitzonderingen |
| A7 | `session_strength` "uit de two-factor-plugin" bestaat niet; 2FA geldt niet voor magic link/OAuth/passkey; `trustDevice` slaat 2FA 30 dagen over | ADR 0003:17, `framework.md` §6 | Eigen `additionalField` op de sessie, gezet in after-hook op `/two-factor/verify-*`; admins geen magic link, geen `trustDevice` |
| A8 | "Intrekken werkt direct" klopt alleen met `cookieCache` uit (en die zat in een kritieke 2FA-bypass, GHSA-xg6x-h9c9-2m83) | ADR 0003:29 | Vastleggen + test |
| A9 | Healthcheck `pg_isready` via socket is al groen tijdens de init-server → `--wait` kan vóór `db/init` doorgaan **(onzeker)** | `compose.yaml:19` | `pg_isready -h 127.0.0.1 …` + `start_period` |
| A10 | dbmate leest `DATABASE_URL` (= `api_user`) en dumpt zelf `db/schema.sql` naast ons snapshot | `.env.example`, ADR 0004 | `DBMATE_NO_DUMP_SCHEMA=true`, dbmate met admin-URL via script |

## B. Security-ontwerp

- **Sessiebeleid ontbreekt** (vervanger van plan's 15-min token): absolute + idle-timeout, `freshAge` voor admin/gevoelige acties, `revokeOtherSessions` bij wachtwoord/2FA-wijziging, ban-mechanisme, cookie-prefix `__Host-`.
- **CSRF**: Hono `csrf()` controleert alleen form-content-types; JSON-POST glipt erdoor. Eigen middleware: niet-GET eist `Sec-Fetch-Site: same-origin` of `Origin === APP_ORIGIN` en `Content-Type: application/json`. Geen `cors()`.
- **Rate limiting** van Better Auth is in-memory en alleen in productie aan → `storage: "database"`; IP alleen uit vertrouwde host-header.
- **Account**: HIBP-wachtwoordcheck, geen account-enumeratie, e-mailverificatie verplicht.
- **API4**: `bodyLimit`, max paginagrootte, `statement_timeout` en `idle_in_transaction_session_timeout` op `api_user`.
- **RLS-helpers**: `nullif(current_setting('app.user_id', true), '')` (lege string na eerder gebruik op dezelfde verbinding) **(onzeker)**; security-definer-functies eigendom van een NOLOGIN-rol, niet `postgres` (superuser).
- **FORCE RLS** werkt niet voor superusers/BYPASSRLS: lokaal is `postgres` eigenaar, dus lokaal ≠ productie; bij een niet-superuser-eigenaar ziet een datamigratie onder FORCE nul rijen. Moet in ADR.
- **Lekpreventie**: lint/AST-check tegen `SET ROLE` en `set_config(…, false)`; test dat na een request `current_user = session_user`.
- **Twee round-trips per request** (sessie via `auth_service`, dan `withUser`) en twee pools: meten in fase 0.
- **Versies**: Better Auth ≥ 1.6.13 (nu 1.7.7, 18 advisories, meeste in plugins → geen oidc-provider/api-key/organization zonder ADR). Hono-ondergrens "≥ 4.11.4" is achterhaald (nu 4.13.13, vijf advisories sinds) → geen versienummer in het framework, osv-scanner laat falen.
- **CSP** hoort bij de statische host (de SPA-HTML komt niet van Hono); nonce kan niet bij statische SPA; lokaal zet Vite de headers voor e2e. CAPTCHA lokaal botst met "offline".
- **Uitzonderingen expliciet maken**: `/api/auth/*` buiten `defineRoute`, routes zonder login (inloggen/reset/clientfouten), `pg` in `src/api/auth`, Better Auth-client in `src/web`.
- `.env.example` mist `AUTH_BASE_URL` (nodig voor `trustedOrigins` en `Secure`-cookies).

## C. Plan-trouw

- **Hoog**: `guard.yml` mag PR-code nooit uitvoeren (plan: "alleen als git-data") — ESLint/vitest-configs zijn JS. `pull_request_target` gebruikt sinds dec 2025 altijd de default branch (goed); PR-head alleen als data, geen `pnpm install`, `persist-credentials: false`.
- **Midden**: neutrale smoketest na deploy (inloggen + één leesactie) en lokaal bewijs dat `api_user` zonder `withUser()` niets ziet; `check-release-ci` ontbreekt in roadmap; lektest via de pooler van de gekozen provider ontbreekt in roadmap fase 3.
- **Laag (stil weggevallen)**: formulier valideren bij verlaten; assert → fouttracking; types per resource apart exporteren; Stop-hook overslaan in plan mode; readonly-bash-allowlist; `maxTurns` reviewer; MFA-inschrijfscherm; PWA-manifest; seed per rol (Better Auth-hashes → seed-script via auth-API met bekend TOTP-geheim voor admin).
- **Terecht vervallen** door ADR 0003: JWKS, algoritme-allowlist, `iss`/`aud`/`exp`, 401-refresh, token in localStorage. Tekstresten opruimen ("admin-token", jwk-reden voor Hono-versie).

## D. Claude Code-configuratie (getoetst aan code.claude.com/docs)

- `Bash(git commit:* --no-verify)` is **ongeldig** (`:*` alleen als achtervoegsel). Juist: `Bash(git commit * --no-verify*)`, `Bash(git * --no-verify*)`, `Bash(git -c core.hooksPath*)`, `Bash(git commit * -n*)`.
- Push-gaten: `git push -u origin main`, `feature:main`, `+main`, `--force` achteraan, `gh api … /merge`. Deny-regels zijn volgens de docs **geen beveiligingsgrens**; echte grens = branch protection + PreToolUse-hook op de huidige branch.
- `.env`: `Read(.env*)` + `Read(!.env.example)` (gitignore-stijl, alle dieptes). Read-deny dekt `cat`/`sed`, niet `grep -r` of scripts → sandbox nodig. `allow Read(./.env.example)` is overbodig.
- Docker: `docker exec … psql -U postgres` geeft superuser-toegang en is niet geblokkeerd; ook `docker run/start/kill`, `compose -f … up`. Voorstel: `Bash(docker *)` op deny, met uitzondering via hook voor `ps`/`logs`. (Mijn eigen verificatie hierboven werd door de `docker rm`-deny tegengehouden: de regels werken.)
- `ask` op `**/*.test.ts` vraagt ook bij nieuwe tests → botst met "toevoegen mag". Bestaande-tests-bescherming hoort in een PreToolUse-hook (bestand bestaat al in git?).
- `pnpm add` niet afgedekt door "geen dependency zonder akkoord" → `ask`.
- Sandbox ontbreekt: `enabled`, `failIfUnavailable: true`, `allowUnsandboxedCommands: false`, `network.allowedDomains`. Docker niet in `excludedCommands`.
- Hooks: timeout laat de actie door (ook PreToolUse) → korte expliciete `timeout`; Stop-hook moet `stop_hook_active` respecteren; reason verplicht.
- Subagents kunnen Bash niet per subcommando beperken via `disallowedTools` → PreToolUse-hook in de subagent-frontmatter; tester-hook ook op `Bash` matchen.
- Toon: de docs raden af MOET/MAG NOOIT in hoofdletters; liever korte imperatief + reden, afdwingen via checks.
- Tegenstrijdig: CLAUDE.md "niet via MCP" vs AGENTS.md "MCP alleen read-only".
- `paths:`-frontmatter in `.claude/rules/` en `@AGENTS.md`-import zijn correct.

## E. Tooling en repo

- **Template-updates**: `git merge template/main` faalt (unrelated histories). Eenmalig `git merge --allow-unrelated-histories -s ours template/main` na aanmaken, daarna gewone merges. README aanpassen.
- **Template kopieert geen rulesets/settings** → org-level ruleset via custom property, `check-github.mjs` blijft controle.
- **compose**: `name: app-template` laat apps op één machine botsen (volume, poorten) → `name` weg, poorten via env. Postgres 17.6 → 17.11 (5 security-releases achter), Mailpit `v1.27` → `v1.31.4` (CVE's in < 1.30), beide op digest.
- **TypeScript 7 is GA** (juli 2026), typescript-eslint ondersteunt < 6.1 → pin `~6.0.3` en Renovate-regel; TS 6 defaults (`types: []`) expliciet zetten; extra flags `verbatimModuleSyntax`, `noImplicitOverride`, `erasableSyntaxOnly`.
- **ESLint 10**: eslint-plugin-react ondersteunt het niet → `react/forbid-elements` vervangen door `no-restricted-syntax` op `JSXOpeningElement`; `as`-verbod via `consistent-type-assertions: never`; `switch-exhaustiveness-check` apart aanzetten.
- **pnpm**: 10.28 is verouderd (11.28 / 12.10); instellingen in `pnpm-workspace.yaml`; `minimumReleaseAge: 10080` (minuten); versie op één plek (`packageManager` met hash).
- **Node 24** gaat 20 okt naar maintenance, Node 26 wordt 28 okt LTS → beslissen; exact pinnen.
- **Tailwind/shadcn**: `@custom-variant dark` ontbreekt voor `[data-theme=dark]`; reset sloopt klassen die shadcn gebruikt (codemod of eigen registry); Vite `build.target` gelijk aan browserslist; `style-src 'self'` vs Radix **(onzeker)**.
- **GitHub-details**: "Allow Actions to approve PRs" is een Actions-instelling, geen ruleset; SHA-pinning afdwingbaar via Actions-policy; CodeQL via ruleset "Require code scanning results"; GitHub App sterker dan bot-PAT.
- **gitleaks** in onderhoudsmodus (opvolger Betterleaks) → pinnen, later heroverwegen.
- **CODEOWNERS/ask/AGENTS** — drie lijsten beschermde paden lopen uiteen; missen o.a. `pnpm-workspace.yaml`, `.npmrc`, `lefthook.yml`, `eslint.config.*`, `tsconfig*`, depcruise, `renovate.json`, `src/api/db`, `src/api/auth`, `src/api/env.ts`, `src/shared` (`can()`), `*.spec.tsx`, e2e. Eén lijst als bron.
- Klein: roadmap verwijst naar `0003-datapad` (nummer bezet); roadmap vinkt onbewezen dingen af; `.gitignore` mist `.claude/settings.local.json`, `mise.local.toml`, `*.log`; spec-goedkeuring "alleen commit van eigenaar" is vervalsbaar → via GitHub API (PR-review van eigenaar); terugweg ontbreekt als een tester-test fout is.

## F. Beslissingen voor de eigenaar

1. Node 24 (maintenance) of Node 26 (LTS per 28 okt)?
2. Better Auth houden gezien A6–A8 en B, of toch een externe OIDC-provider?
3. Bot-identiteit: fijnmazige PAT of GitHub App?
4. Toon van AGENTS.md: harde hoofdletters houden of herschrijven naar imperatief + reden (docs-advies)?
