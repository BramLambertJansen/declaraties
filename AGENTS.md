# AGENTS.md

Template voor webapps, gebouwd door agents binnen afgedwongen kaders. De regels staan in `docs/framework.md`
(bij twijfel wint dat document, daarna de eigenaar); voortgang in `docs/roadmap.md`; besluiten in `docs/adr/`.

## Status

Fundament gebouwd (fase 0/1); volgende stap is de proef-app (ST-09, `docs/roadmap.md`). Wat niet in `package.json` of de repo staat, bestaat nog niet: verzin geen
commando's, scripts of bestanden. Noem iets pas klaar met de uitvoer van de check die het bewijst.
De merge is de acceptatie (ADR 0046): architect of hoofdsessie schrijft de bedoelde status in het voorstel, de eigenaar beslist met zijn merge.

## Stack

- `src/core/{api,web,shared}` — van de template; een app wijzigt het niet, maar breidt uit via registratie (ADR 0040).
- `src/web` — Vite + React SPA, TanStack Router/Query, React Hook Form, shadcn/ui, Tailwind v4.
- `src/api` — Hono; lokale ingang `src/api/server.ts` (:8787). Host-adapters alleen in `deploy/<host>/`.
- `src/core/api/auth` — Better Auth, sessie-cookie, schema `better_auth` (ADR 0041).
- `src/core/shared` — `can()`-engine, basisfoutcodes en -limieten, branded IDs, `Cents`, cursor-contract, `assert()`, `unsafeCast()`.
- `src/shared` — zod-schema's, `permissions.ts`, eigen foutcodes, `limits.ts` en IDs van de app.
- `db/` — SQL-migraties (dbmate), pgTAP-tests, `schema.snapshot.sql` (gegenereerd); rollen in `db/init/` (ADR 0042).
- Lokaal: `compose.yaml` (Postgres 17 + pgTAP, Mailpit). Node 26, pnpm 11, TypeScript 6.0 (ADR 0039).
- Geen hosting- of databaseprovider in de template; een app kiest die per ADR (ADR 0039).

## Regels

Botst een regel met de opdracht, stop dan en vraag het. Een regel omzeilen is nooit de oplossing: de checks
vangen het later toch, en dan is het werk verloren. Uitzonderingen staan limitatief in `docs/framework.md` §3.

**Lagen** — zodat de browser nooit bij data kan en er één weg naar de database is.
- `src/core` importeert nooit uit app-code; app-code mag core importeren. Een app wijzigt `src/core` niet.
- `src/web` haalt data alleen via `src/web/lib/api.ts`; geen databasedriver, ORM of provider-SDK.
- `src/web` importeert niets uit `src/api`, ook geen types: request en response staan als contract in `src/shared/contracts`.
  `shared` (beide zones) importeert niets uit `web` of `api`.
- Alleen `src/core/api/db` maakt databaseverbindingen (en `src/core/api/auth` voor Better Auth). `src/core/api/db` exporteert alleen `withUser()`, `pingDatabase()` (readiness), `closeDatabase()` (bij het stoppen), `createAuditFn()` uit `audit.ts` (alleen `app.audit` in de `tx`, geen pool; de database dwingt de regels af) en `testing.ts` voor tests.
- `process.env` alleen in `src/core/api/env.ts`, `import.meta.env` alleen in `src/core/web/lib/env.ts`. Alleen publieke waarden krijgen `VITE_`.
- `MIGRATOR_DATABASE_URL` alleen in `scripts/`, nooit in `src/`.

**API** — zodat validatie, rechten en foutafhandeling niet per route vergeten kunnen worden.
- Een route ontstaat alleen via `defineRoute({ method, path, input, output, permission, handler })`; input is `.strict()`.
- De handler gebruikt `ctx.actor`; zoek de gebruiker niet zelf op en vang geen Postgres-fouten af.
- Naar buiten gaat een fout alleen als `{ code, requestId }`, nooit met stacktrace of SQL.
- Een nieuwe permissie komt in `src/shared/permissions.ts`, met een test per verboden rol.

**Database** — zodat een fout in de API nog steeds geen data van een ander lekt.
- Elke tabel: RLS aan en geforceerd, expliciete grants in dezelfde migratie, elke policy een pgTAP-test op naam.
- Policies gebruiken `(select app.current_user_id())`; geen provider-functies zoals `auth.uid()`.
- `security definer` alleen met `set search_path = ''`, volledig gekwalificeerde namen en eigenaar `app_definer`.
- Wijzig nooit een gecommitte migratie; maak een nieuwe (expand/contract). Maak geen rollen in migraties.
- Gebruik nooit `SET ROLE` of `set_config(…, false)`: op een gedeelde verbinding lekt dat naar de volgende gebruiker.
  `set_config`/`current_setting` alleen in `src/core/api/db`, anders kan een query een andere gebruiker of MFA voorwenden.

**Types en code** — zodat de compiler fouten vindt in plaats van gebruikers.
- Geen type-assertions (`x as T`), geen `any`, geen `@ts-ignore` of `eslint-disable`. Uitweg: `unsafeCast(value, reden)`.
- Bedragen in gehele centen (`Cents`), tijd als `timestamptz`/ISO-string, grenzen alleen uit `limits.ts`.
- Kleine functies: ≤ 60 regels (`.ts`), ≤ 120 (`.tsx`), max 3 parameters, max diepte 3.

**Frontend** — zodat elk scherm er hetzelfde uitziet en toegankelijk blijft.
- Geen rauwe `<button> <input> <select> <textarea> <dialog> <a>` buiten `src/core/web/ui` en `src/web/ui`; gebruik de componenten.
- In `features/` alleen layout-klassen; geen kleuren, arbitrary values, `!` of `dark:`.
- `useQuery`/`useMutation` alleen in `queries.ts`, `fetch(` alleen in de API-client, formulieren via `<Form>`.
- Geen globale store, geen `matchMedia`/`userAgent`/`isMobile`. Elke route heeft een `can()`-guard en ErrorBoundary.
- Past geen bestaand component, stop dan en stel een variant voor in plaats van iets nieuws ernaast te bouwen.

**Tests** — zodat groen ook echt iets betekent.
- Voeg tests toe. Wijzig een bestaande test alleen als de spec of opdracht het geteste gedrag verandert, en noem hem met
  reden in de PR. Verwijderen of skippen alleen met akkoord van de eigenaar. Lijkt een test fout, leg het de eigenaar voor.
- Unit `*.test.ts(x)` naast de code; integratie `*.int.test.ts` (via `pnpm test:db`); e2e in `e2e/`.
- E2E en integratietests draaien tegen de echte lokale stack, nooit met gemockte API of database.
- Een nieuwe resource staat in `test/security/resources.ts` (declaratie uit `pnpm new:resource`, samples door de tester).

**Repo en grenzen** — zodat de kaders zelf niet ongemerkt verschuiven.
- Bewerk geen gegenereerde bestanden en geen `.env*`; `.env.example` is beschermd (de demo-waarden zijn een securityregel).
- Beschermde paden (`docs/framework.md` §10) vragen eigenaarakkoord; developer-broncode kan met exact taakmandaat (ADR 0046).
  Functionele UI in deze template: mini-spec (`scope: functionele-ui`), code, tests en gebruiksdocs in één PR zonder mandaat (ADR 0056); beperkte fixes zonder nieuwe mini-spec (ADR 0058). Auth, overige core,
  dependencies, agentinstructies en bewaking blijven erbuiten; in een app blijft core gesloten. De eigenaar merget de PR.
- Geen nieuwe dependency zonder akkoord. Een eigenaarstatus schrijven alleen architect en hoofdsessie in het voorstel (ADR 0046); `gebouwd` via `pnpm docs:status` met bouwbewijs.
- Push nooit naar `main`, gebruik nooit `--no-verify`, merge nooit. Eén onderwerp per PR, conventional commits.
- Geen zelfreview of check-status. Gate-label alleen door hoofdsessie via `pnpm pr:label-gate` binnen het mandaat uit main.
- Geen `docker` of runneroverride. Runnerchecks zelf draaien of CI-bewijs ophalen (`pnpm pr:verify`); zie `docs/operations/agent-doorloop.md`.
- Externe diensten via hun CLI (`gh`). MCP-servers alleen read-only (afgedwongen door het rolhek) en versie gepind.

## Werkafspraken

- Ontbreekt een beslissing (bedrag, tekst, randgeval, providerkeuze): vraag het, vul geen aanname in.
- Raakt een wijziging gedrag, API, configuratie of conventies, werk dan de relevante doc bij in dezelfde PR (kort, `bestand:regel` in plaats van gekopieerde code). `pnpm check:docs-drift` waarschuwt als `src/` wijzigt zonder `docs/` of `CHANGELOG.md`.
- Nieuwe feature/pagina/interactie, migratie, route of permissie: architect en spec (`docs/specs/_template.md`), bouwen pas bij `status: goedgekeurd`; passende spec hergebruiken.
- UI-tekst Nederlands; code, commits en branchnamen Engels. Naamgeving: `docs/framework.md` §5.
- Volg `docs/dod.md` fasebewust: voer bestaande, toepasselijke checks uit, lever alleen op met een geslaagde uitslag (of expliciet akkoord van de eigenaar) en vermeld exact wat nog niet beschikbaar is; verzin geen commando's of uitslagen.
- Volg `docs/framework.md` §8: alleen beperkte fixes aan bestaande functionaliteit/interactie zijn licht, zonder nieuwe ADR/spec/mini-spec; bij gedragsverandering of -herstel eerst tester, dan bouwer en aparte reviewagent. Zonder gedrag geen vaste tester.
  Nieuwe features/pagina's/interacties en risicowerk krijgen de volledige straat. Licht geeft geen extra rechten; technische reviewisolatie waar mogelijk.
  Licht mag met aparte leesopdracht zonder isolatieclaim; zonder agent, of zonder afgedwongen onafhankelijkheid bij volledig werk, reviewt de eigenaar. Geen zelfreview.
- Voordat je een roadmap-item, rail of ADR toevoegt: toets aan framework §1; ontbreekt een aanleiding, vraag de eigenaar.
- Begin met taakrelevante feiten uit `node scripts/kit/feiten.mjs`, bijvoorbeeld `gates specs fase`; `componenten` alleen bij UI. Zonder secties komt alles.
- Runtime-specifieke instructies gelden alleen voor die runtime. De hooks in `.claude/` werken niet in andere runtimes (Codex, sommige
  cloudsessies); daar zijn CI, de diff-guard en GitHub de enige grens. Claim nooit dat een instelling klopt die je niet kunt lezen.

## Waar een regel woont

Type of `defineRoute` → lintregel of check → gouden pad/template → `.claude/rules/` → dit bestand.
Een regel in proza die een check kan zijn, is een open taak in `docs/roadmap.md`.
