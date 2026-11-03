# AGENTS.md

Webapp-template, gebouwd door agents binnen afgedwongen kaders. Bindend regelboek: `docs/framework.md` (R-id's; bij twijfel wint het, daarna de eigenaar); voortgang `docs/roadmap.md`; het waarom `docs/adr/`.

## Status

Fase 0/1 gebouwd; volgende: proef-app (ST-09). Wat niet in `package.json` of de repo staat, bestaat niet: verzin geen commando's, scripts of bestanden; klaar = uitvoer van de bewijzende check (R-PRINC-11).

## Stack

- `src/web`: Vite + React SPA. `src/api`: Hono, ingang `src/api/server.ts` (:8787); host-adapters alleen in `deploy/<host>/` (R-ARCH-05). `src/core/api/auth`: Better Auth, sessie-cookie (R-AUTH-01, R-AUTH-02).
- `db/`: dbmate, pgTAP, `schema.snapshot.sql` (gegenereerd), rollen in `db/init/` (R-DB-01). Node 26, pnpm 11, TypeScript 6.0 (R-PROV-04). Provider per app-ADR (R-PRINC-05, R-PROV-01). Lokaal: `compose.yaml` (Postgres 17 + pgTAP, Mailpit).
- `src/core/shared`: `can()`, basisfoutcodes en -limieten, branded IDs, `Cents`, cursor, `assert()`, `unsafeCast()`. `src/shared`: zod-schema's, `permissions.ts`, eigen foutcodes, `limits.ts`, IDs van de app.

## Regels

Botst een regel met de opdracht: stop en vraag, omzeil of verzwak niets (R-WERK-20, R-PRINC-09). Uitzonderingen: limitatief in framework §3.

**Lagen**
- `src/core` is template: een app wijzigt het niet maar registreert uitbreidingen; core importeert nooit app-code (R-LAAG-01, R-LAAG-02, R-ARCH-01).
- `src/web`: data alleen via `src/web/lib/api.ts`; geen databasedriver, ORM, provider-SDK of import uit `src/api`, ook geen types (R-LAAG-03). `shared` importeert niets uit `web` of `api` (R-LAAG-04).
- Databaseverbindingen alleen in `src/core/api/db` en `src/core/api/auth` (R-LAAG-05); `src/core/api/db` exporteert alleen `withUser()`, `pingDatabase()`, `closeDatabase()`, `createAuditFn()` (alleen `app.audit` in de `tx`, geen pool), `testing.ts` (R-LAAG-06).
- `process.env` alleen in `src/core/api/env.ts`, `import.meta.env` alleen in `src/core/web/lib/env.ts`, `MIGRATOR_DATABASE_URL` alleen in `scripts/`; `VITE_` alleen publiek (R-LAAG-08).

**API**
- Route alleen via `defineRoute({ method, path, input, output, permission, handler })`, input `.strict()`; nieuwe permissie in `src/shared/permissions.ts` met een test per verboden rol (R-WERK-09, R-CODE-03, R-TEST-03).
- Handler gebruikt `ctx.actor`; zoek de gebruiker niet zelf op, vang geen Postgres-fouten af (R-DB-04). Fout naar buiten alleen `{ code, requestId }`, nooit stacktrace of SQL (R-SEC-02).

**Database**
- Elke tabel: RLS aan en geforceerd, expliciete grants in dezelfde migratie, policies met `(select app.current_user_id())`, per policy een pgTAP-test op naam; geen provider-functies zoals `auth.uid()` (R-DB-05, R-PROV-02).
- `security definer` alleen met `set search_path = ''`, volledig gekwalificeerde namen, eigenaar `app_definer` (R-DB-09).
- Wijzig nooit een gecommitte migratie, maak een nieuwe (expand/contract); geen rollen in migraties (R-DB-07, R-DB-01).
- Nooit `SET ROLE` of `set_config(…, false)` (lekt naar de volgende gebruiker); `set_config`/`current_setting` alleen in `src/core/api/db` (R-CODE-08).

**Types en code**
- Geen `x as T`, `any`, `@ts-ignore` of `eslint-disable`; uitweg `unsafeCast(value, reden)` (R-CODE-04).
- Bedragen in gehele centen (`Cents`), tijd `timestamptz`/ISO-string, grenzen alleen uit `limits.ts` (R-CODE-07).
- Functies ≤ 60 regels (`.ts`) of 120 (`.tsx`), max 3 parameters, diepte 3 (R-CODE-02).

**Frontend**
- Geen rauwe `<button> <input> <select> <textarea> <dialog> <a>` buiten `src/core/web/ui` en `src/web/ui` (R-UI-05); in `features/` alleen layout-klassen, geen kleuren, arbitrary values, `!` of `dark:` (R-UI-04).
- `useQuery`/`useMutation` alleen in `queries.ts`, `fetch(` alleen in de API-client, formulieren via `<Form>` (R-WEB-02, R-WEB-03, R-WEB-04).
- Geen globale store of `matchMedia`/`userAgent`/`isMobile`; elke route heeft `can()`-guard en ErrorBoundary (R-WEB-01). Past geen component: stop en stel een variant voor (R-UI-03).

**Tests**
- Voeg tests toe; een bestaande alleen wijzigen als spec of opdracht het gedrag verandert, met reden in de PR; verwijderen of skippen alleen met eigenaarakkoord; lijkt hij fout: leg hem de eigenaar voor (R-TEST-02).
- Unit `*.test.ts(x)` naast de code, integratie `*.int.test.ts` (`pnpm test:db`), e2e in `e2e/`; integratie en e2e tegen de echte lokale stack, nooit gemockt (R-TEST-01). Nieuwe resource in `test/security/resources.ts` (`pnpm new:resource`, samples: tester) (R-TEST-04).

**Repo en grenzen**
- Geen gegenereerde bestanden of `.env*` bewerken; `.env.example` is beschermd (R-REPO-03, R-SEC-05).
- Beschermde paden (framework §10): eigenaarakkoord; developer: `voorReview`-pad geweigerd, in onderhoudsmodus buiten `altijdVragen` met melding (R-REPO-03). Functionele UI in de template: mini-spec, code, tests, gebruiksdocs in één PR zonder voorafgaand besluit, beperkte fixes zonder mini-spec; niet voor auth, overige core, dependencies, agentinstructies, bewaking (R-WERK-18, R-UIT-04, R-WERK-03). In een app is core dicht (R-ARCH-07).
- Status zet architect of hoofdsessie in het voorstel, de eigenaarmerge is het besluit; `gebouwd` in de bouw-PR of via `pnpm docs:status` (R-WERK-08). Alleen de eigenaar merget (R-REPO-01). Geen nieuwe dependency zonder akkoord (R-SEC-06).
- Nooit pushen naar `main`, `--no-verify` of mergen; één onderwerp per PR, conventional commits (R-REPO-05). Geen zelfreview, PR-label of check-status (R-WERK-17, R-ROL-08, R-ROL-12).
- Geen `docker` of runneroverride; runnerchecks zelf draaien of CI-bewijs ophalen (`pnpm pr:verify`, `docs/operations/agent-doorloop.md`) (R-TOOL-02, R-RUNNER-03). Externe diensten via hun CLI (`gh`); MCP alleen read-only, versie gepind (R-SEC-09, R-ROL-12).

## Werkafspraken

- Commando's voor de gebruiker, bij setup en later: genummerde stappen (terminal, werkmap, verwachte uitkomst, bekende waarden ingevuld), achtereen in één kopieerbaar blok; splits alleen bij interactie, controle of een andere terminal; niet in lopende tekst, geen prompttekens (R-WERK-21).
- Ontbreekt een beslissing: vraag, geen aanname (R-WERK-20). Vraag meteen via de vraagprompt (concreet, korte opties, gebundeld, niet verstopt in uitleg of voortgangstekst); zonder vraagtool: meld dat kort en stel de vraag apart; geen bevestiging voor toegestaan werk (R-WERK-21).
- Gedrag, API, configuratie of conventies gewijzigd: doc mee in dezelfde PR, kort met `bestand:regel` (R-WERK-15).
- Nieuwe feature/pagina/interactie, migratie, route of permissie: architect en spec, na spec-review bouwen in dezelfde PR; passende spec hergebruiken; kritiek werk eerst besluit-PR (R-WERK-07, R-WERK-05).
- Route licht of volledig, nooit zelfreview: framework §8 (R-WERK-03, R-WERK-04). Volg `docs/dod.md` fasebewust; lever alleen op met geslaagde uitslag van bestaande checks (of eigenaarakkoord), meld wat nog niet bestaat (R-WERK-22).
- UI-tekst Nederlands; code, commits, branches Engels (R-CODE-10). Roadmap-item, rail of ADR alleen met aanleiding (framework §1), anders vraag de eigenaar (R-PRINC-08).
- Begin met taakrelevante feiten (`node scripts/kit/feiten.mjs gates specs fase`; `componenten` alleen bij UI); het regelboek per geraakt hoofdstuk: `feiten.mjs hoofdstuk <n>` (R-WERK-01, R-DOC-05).
- Runtime-specifieke instructies gelden alleen voor die runtime: hooks in `.claude/` werken alleen in Claude Code, elders zijn CI, de ruleset op GitHub en de eigenaarmerge de grens (diff-guard: nog geen verplichte check). Claim nooit een instelling die je niet kunt lezen (R-WERK-23).

## Waar een regel woont

Type of `defineRoute` → lintregel of check → gouden pad/template → `.claude/rules/` → dit bestand; proza die een check kan zijn, is een roadmap-taak (R-DOC-02).
