# 0018 — Readiness: GET /api/ready

Status: vervangen door 0049

## Context

Roadmap stuk 7: een containerhost of load balancer moet weten of een instantie verkeer kan verwerken. `GET /api/health` is
liveness en hangt bewust van niets af: een onbereikbare database mag geen herstart van het proces veroorzaken. Er is
daarnaast een readiness-controle nodig die de database meeneemt. Die route is publiek en raakt de database, dus hij mag
geen data lekken, de database niet laten belasten en na een storing niet zelf blijven hangen.

## Besluit

1. `GET /api/ready` geeft 200 `{ ok: true }` of 503 `{ ok: false }`, zonder verdere data. `createApp({ ready })` registreert hem;
   zonder `ready` bestaat de route niet. Een uitzondering in framework §3 (publiek, geen spec vooraf), naast `GET /api/health`.
2. De controle is `pingDatabase()` uit `src/core/api/db`: `select 1` als `api_user`, zonder `withUser()`, over een **eigen
   verbinding** (pool met max 1), niet de pool van `withUser()`. Verbinden en de query zijn elk begrensd op 900 ms (samen korter dan de 2 s van punt 3)
   (`connectionTimeoutMillis`, `query_timeout`, `keepAlive`). Na een fout wordt de verbinding weggegooid; een idle verbinding
   die wegvalt, stopt het proces niet (`error`-listener op de pool).
3. `createReadiness` (`src/core/api/http/readiness.ts`) bewaart de uitkomst 1 s, laat hooguit één controle tegelijk lopen en
   telt na 2 s een controle als mislukt. Zolang een eerdere controle nog loopt, start er geen tweede. De bewaartijd gebruikt
   een monotone klok.
4. Geen rate limit op health en ready: health doet niets en ready raakt de database hooguit één keer per seconde.

## Alternatieven

- **Ping via de pool van `withUser()`.** Dan meet readiness ook of de pool vol is. Onder piekbelasting worden instanties dan
  uit de rotatie gehaald, wat de rest zwaarder belast (cascade), en een hangende ping houdt een van de vijf plekken vast.
- **Readiness in `GET /api/health`.** Dan herstart een host die health als liveness gebruikt het proces bij elke databasestoring.
- **Geen cache of single-flight.** Elke probe en elke anonieme aanvraag opent dan een databaseverbinding.

## Gevolgen

- `src/core/api/db` exporteert naast `withUser()` en `closeDatabase()` ook `pingDatabase()`. `closeDatabase()` sluit beide pools.
- Elke API-instantie heeft één extra databaseverbinding (alleen in gebruik tijdens een probe, daarna idle gesloten).
- Een host-adapter of runbook (fase 3) gebruikt `/api/health` voor liveness en `/api/ready` voor readiness.
