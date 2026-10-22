# 0049 — Productie: readiness en productie-image op één origin

Status: geaccepteerd

Vervangt [0018](0018-readiness.md) en [0019](0019-productie-image.md). Drempel: A4. Consolidatie zonder inhoudelijke wijziging
(eigenaarbesluit 2026-10-21, [0038](0038-beslisroute.md) Gevolgen). Punt 3 is het voorwaardelijke agentvoorstel uit
[0036](0036-achtergrondtaken-correcties.md) punt 6, met dezelfde voorwaarde; geen eigenaarbesluit over de inhoud.

## Context

0018 en 0019 zijn op 2026-10-10 door de agent geaccepteerd onder mandaat van de eigenaar, ter herziening; de eigenaar koos
"zelfde besluiten, compact". Een containerhost of load balancer moet weten of een instantie verkeer kan verwerken, zonder dat
een databasestoring het proces laat herstarten. De app moet in productie op één origin draaien: de sessie-cookie is `__Host-`,
de CSRF-controle vergelijkt `Origin` met `APP_ORIGIN` (ADR 0007) en de CSP staat alleen `connect-src 'self'` toe. Een
containerhost heeft geen statische host die de SPA-headers zet.

## Besluit

**Readiness**

1. **Twee routes** (was 0018 punt 1). `GET /api/health` is liveness en hangt van niets af. `GET /api/ready` geeft 200
   `{ ok: true }` of 503 `{ ok: false }`, zonder verdere data; `createApp({ ready })` registreert hem, zonder `ready` bestaat hij
   niet. Beide zijn een uitzondering in framework §3 (publiek, geen spec vooraf).
2. **Controle op een eigen verbinding** (was 0018 punt 2). `pingDatabase()` uit `src/core/api/db` doet `select 1` als
   `api_user`, zonder `withUser()`, over een eigen pool met max 1, niet de pool van `withUser()`. Verbinden en de query zijn elk
   begrensd op 900 ms. Na een fout wordt de verbinding weggegooid; een idle verbinding die wegvalt, stopt het proces niet.
3. **Ook de jobs-verbinding, voorwaardelijk** (agentvoorstel, was 0036 punt 6; spec achtergrondtaken OV-C4 optie (a)). Naast de
   ping van punt 2 doet `pingDatabase()` tegelijk een tweede ping over een eigen verbinding als `app_jobs`
   (`JOBS_DATABASE_URL`): `select session_user`, die faalt als het antwoord niet `app_jobs` is. Hij wacht op beide uitkomsten;
   readiness is pas 200 als beide slagen. Elke ping is begrensd op 900 ms en ze lopen parallel, dus samen binnen de 2 s van
   punt 4. Dit geldt tenzij de eigenaar in spec achtergrondtaken OV-C4 optie (b) (controle bij opstart) of (c) (alleen een
   logregel) kiest; dan vervalt dit punt.
4. **Cache en single-flight** (was 0018 punt 3). `createReadiness` bewaart de uitkomst 1 s (monotone klok), laat hooguit één
   controle tegelijk lopen en telt na 2 s een controle als mislukt.
5. **Geen rate limit** op health en ready (was 0018 punt 4): health doet niets, ready raakt de database hooguit één keer per
   seconde (met punt 3: één controle per seconde over twee verbindingen, was 0036 punt 6).

**Productie-image**

6. **Eén proces, één origin** (was 0019 punt 1). Met `WEB_DIR` gezet serveert `src/api/server.ts` via `createWebApp` naast `/api`
   de build van de SPA. `/api` en `/api/*` gaan ongewijzigd naar de API-app; een bestand uit de build krijgt de SPA-headers; een
   schermroute zonder bestand krijgt `index.html`; een ontbrekend bestand met extensie blijft 404. `/assets/*` mag onbeperkt in de
   cache, de rest `no-cache`. Geen verborgen bestanden (behalve `/.well-known/`), geen symlink naar buiten `WEB_DIR`. Lokaal blijft
   `WEB_DIR` leeg en serveert Vite.
7. **Headers uit één bron** (was 0019 punt 2). `src/core/api/http/security-headers.ts` levert CSP, HSTS, nosniff en
   Referrer-Policy aan Vite dev, `vite preview` en `createWebApp`; voor `/api` blijft `secureHeaders()` in `createApp`.
8. **Geen buildstap voor de API** (was 0019 punt 3). Node draait de TypeScript direct (type stripping, afgedwongen met
   `erasableSyntaxOnly`); `pnpm start` = `node src/api/server.ts`, met de omgeving van de host, geen `.env`-bestand.
9. **Image** (was 0019 punt 4). Basisimage op digest (gelijk aan de runner in `compose.yaml`), pnpm-versie gelijk aan
   `packageManager`, `vite build` in een buildstage, in de runtime alleen productie-dependencies en de serverkant van `src/`,
   `USER node`, `API_HOST=0.0.0.0`, poort 8080, `HEALTHCHECK` op `/api/health`, `STOPSIGNAL SIGTERM`. `.dockerignore` houdt `.env*`, `.git` en
   `.claude` buiten de context. Migraties draaien niet in de image, maar als aparte stap met dbmate.
10. **Bewijs in CI** (was 0019 punt 5): job `image` bouwt de image en controleert hem met `scripts/check-image.sh`.

## Alternatieven

- **Ping via de pool van `withUser()`** (was 0018): onder piekbelasting gaan instanties uit de rotatie (cascade), en een hangende
  ping houdt een plek in de pool vast.
- **Readiness in `/api/health`** (was 0018): een host die health als liveness gebruikt, herstart dan bij elke databasestoring.
- **Geen cache of single-flight** (was 0018): elke probe opent dan een databaseverbinding.
- **SPA op een aparte statische host of CDN** (was 0019): twee hosts moeten samen één origin vormen en de CSP staat op een plek
  die de template niet test. Kan per app nog via `deploy/<host>/`, met `WEB_DIR` leeg.
- **Reverse proxy in de image** (was 0019): een tweede proces met eigen configuratie en CVE's; dezelfde CSP op twee plekken.
- **API compileren met `tsc` of een bundler** (was 0019): een extra buildstap terwijl Node de bestanden direct draait.

## Gevolgen

- Elke API-instantie heeft één extra databaseverbinding, alleen in gebruik tijdens een probe; `closeDatabase()` sluit hem ook
  (was 0018 Gevolgen). Met punt 3 zijn het er twee, en een storing die alleen `app_jobs` raakt, haalt dan alle instanties uit
  de rotatie, ook voor routes die geen taak nodig hebben (was 0036 punt 6).
- Een host-adapter of runbook gebruikt `/api/health` voor liveness en `/api/ready` voor readiness (was 0018).
- De image bevat de broncode van de serverkant, geen geheimen; `AUTH_SECRET` en de database-URL's komen altijd van de host
  (was 0019).
- Een app die de SPA via een CDN serveert, zet in `deploy/<host>/` dezelfde headers uit `security-headers.ts` (was 0019).
- pnpm komt in de buildstages via `npm install --global` met een vaste versie; `minimumReleaseAge` en `trustPolicy` gelden alleen
  voor de lockfile. pnpm zit niet in de runtime-image (was 0019).
- De job `image` is pas een harde grens als de eigenaar hem verplicht maakt in de ruleset (was 0019).
