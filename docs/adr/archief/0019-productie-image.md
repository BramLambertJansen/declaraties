# 0019 — Productie-image: SPA en API op één origin

Status: vervangen door 0049

## Context

Roadmap stuk 7 vraagt `pnpm start`, een productiebuild en een containerimage (non-root) die elke containerhost kan draaien.
De app moet in productie op **één origin** draaien: de sessie-cookie is `__Host-`, de CSRF-controle vergelijkt `Origin` met
`APP_ORIGIN` (ADR 0007) en de CSP staat alleen `connect-src 'self'` toe. Framework §6 liet de SPA-headers over aan "de statische
host", maar een containerhost heeft er geen: dan zou elke app zelf een reverse proxy met dezelfde CSP moeten opzetten.

## Besluit

1. **Eén proces, één origin.** Met `WEB_DIR` gezet serveert `src/api/server.ts` via `createWebApp` (`src/core/api/http/web.ts`)
   naast `/api` de build van de SPA (`dist/web`). `/api` en `/api/*` gaan ongewijzigd naar de API-app; een bestand uit de build
   krijgt de SPA-headers; een schermroute zonder bestand krijgt `index.html`; een ontbrekend bestand met extensie blijft 404.
   `/assets/*` (hash in de naam) mag onbeperkt in de cache, de rest `no-cache`. Lokaal blijft `WEB_DIR` leeg en serveert Vite.
2. **Headers uit één bron.** `src/core/api/http/security-headers.ts` levert CSP, HSTS, nosniff en Referrer-Policy aan de Vite-dev-server,
   `vite preview` en `createWebApp`. Voor `/api` blijft `secureHeaders()` in `createApp` gelden.
3. **Geen buildstap voor de API.** Node 26 draait de TypeScript direct (type stripping; `erasableSyntaxOnly` dwingt af dat dat kan),
   net als `pnpm dev`. `pnpm start` = `node src/api/server.ts`, met de omgeving van de host (geen `.env`-bestand).
4. **Image** (`Dockerfile`): basisimage op digest (gelijk aan de runner in `compose.yaml`), pnpm-versie gelijk aan `packageManager`,
   `vite build` in een buildstage, alleen productie-dependencies en de serverkant van `src/` in de runtime, `USER node`,
   `API_HOST=0.0.0.0`, poort 8080, `HEALTHCHECK` op `/api/health`, `STOPSIGNAL SIGTERM`. `.dockerignore` houdt `.env*`, `.git` en
   `.claude` buiten de build-context. Migraties draaien niet in de image, maar als aparte stap met dbmate (fase 3, runbook).
5. **Bewijs in CI**: job `image` bouwt de image en draait `scripts/check-image.sh`: niet als root, liveness 200, readiness 503 zonder
   database, SPA met CSP op een schermroute, asset met `immutable`, API-fout als `{ code, requestId }`, exitcode 0 na SIGTERM.

## Alternatieven

- **SPA op een aparte statische host of CDN, API in de container.** Dan moeten twee hosts samen één origin vormen (proxyregels per
  provider), en staat de CSP op een plek die de template niet test. Kan per app nog steeds (fase 3, `deploy/<host>/`): `WEB_DIR` blijft dan leeg.
- **Reverse proxy (nginx, Caddy) in de image.** Een tweede proces met eigen configuratie en CVE's; dezelfde CSP op twee plekken.
- **API compileren met `tsc` of een bundler.** Een extra buildstap en sourcemaps, terwijl Node de bestanden al direct draait.

## Gevolgen

- Framework §3 (hosting) en §6 (Verharding: headers) noemen deze server naast de statische host.
- De image bevat de broncode van de serverkant (geen geheimen); `AUTH_SECRET` en de database-URL's komen altijd van de host.
- Een app die de SPA via een CDN wil, laat `WEB_DIR` leeg en zet in `deploy/<host>/` dezelfde headers uit `security-headers.ts`.
- pnpm komt in de buildstages via `npm install --global pnpm@<versie>`: de versie staat vast (`test/scripts/dockerfile.test.ts`), maar
  `minimumReleaseAge` en `trustPolicy` gelden alleen voor de lockfile, niet voor pnpm zelf. pnpm zit niet in de runtime-image.
- De CI-job `image` telt pas als harde grens als de eigenaar hem verplicht maakt in de ruleset (stuk 6).
- `createWebApp` serveert geen verborgen bestanden (behalve `/.well-known/`) en volgt geen symlink naar buiten `WEB_DIR`.
