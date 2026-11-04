---
status: gebouwd # #515
namespace: uitgaande-client
---

# Uitgaande client en foutcodes voor partners

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

Core levert één uitgaande client in `src/core/api/outbound/` en de foutcodes `UPSTREAM_INVALID`, `UPSTREAM_UNAVAILABLE` en
`UPSTREAM_TIMEOUT` (ADR 0077 punt 2, 3 en 10; de eerste twee werkstappen van ST-15). Ze gaan samen in één PR, omdat de client zonder
de codes niets kan gooien.

## Rollen en wie wat ziet

Een gebruiker ziet bij een partnerfout alleen de tekst van de `UPSTREAM_*`-code. De app maakt per koppeling één client en mag grenzen
lager zetten, nooit hoger. De partner ziet methode, URL, body, de vaste `headers` van de app, de headers die
de client zet (`Accept`, `Content-Type`, `Idempotency-Key`) en de standaardheaders van `fetch` (`User-Agent`, `Accept-Encoding`).

## Datawijzigingen (met grants)

n.v.t. — geen migratie, tabel of functie.

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| — | geen nieuwe route | — | nieuw: `UPSTREAM_INVALID` 502, `UPSTREAM_UNAVAILABLE` 503, `UPSTREAM_TIMEOUT` 504 |

**API** (`src/core/api/outbound/index.ts`; geen `any`, ≤ 3 parameters per functie):

```ts
createOutboundClient(config: {
  name: string; // /^[a-z][a-z0-9-]*$/, in de log
  baseUrl: string; // uit app-env: origin plus optioneel padprefix, geen query, hash of userinfo
  hosts: readonly string[]; // exacte hostnamen, letterlijk in code
  appEnv: Env['appEnv']; // env().appEnv uit de compositie-root (besloten)
  headers?: Readonly<Record<string, string>>; // vast, bijv. Authorization; nooit gelogd
  timeoutMs?: number; budgetMs?: number; maxAttempts?: number; maxResponseBytes?: number;
  log?: OutboundLog; // standaard één JSON-regel op stdout
}): OutboundClient;

client.call<S extends z.ZodType, const E extends number = never>(request: {
  requestId: string; method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string; // sjabloon, bijv. '/items/:id'
  params?: Readonly<Record<string, string | number>>;
  query?: Readonly<Record<string, string | number | boolean>>;
  body?: unknown; // alleen POST, PUT, PATCH; als JSON
  schema: S; idempotencyKey?: string; expect?: readonly E[];
}): Promise<{ ok: true; status: number; data: z.output<S> } | { ok: false; status: E }>; // tweede vorm alleen bij expect

guardWithUser(withUser: WithUser): WithUser; // work-callback onder de markering
```

**Vertaling.** Een `UPSTREAM_*` is een `AppError` zonder `cause`, tekst, status of body van de partner.

| Uitkomst van de laatste poging | Herhaald | Uitkomst |
|---|---|---|
| 2xx en `schema.safeParse` slaagt (204 of lege body: schema krijgt `undefined`) | — | `ok: true` |
| 2xx met ongeldige JSON, schemafout of te groot; 3xx (nooit gevolgd); andere 4xx | nee | `UPSTREAM_INVALID` |
| status in `expect` (alleen 400–499 behalve 429) | nee | `ok: false` |
| 429, 502, 503, 504, netwerkfout | ja | `UPSTREAM_UNAVAILABLE` |
| andere 5xx | nee | `UPSTREAM_UNAVAILABLE` |
| poging afgebroken op haar eigen signaal | ja | `UPSTREAM_TIMEOUT` |

Een body die de client niet leest (`expect`, 3xx, herhaalde 429 of 5xx, te grote `Content-Length`), sluit hij met
`response.body?.cancel()`.

**Herhalen** alleen bij `GET`, `HEAD` of met `idempotencyKey` (header `Idempotency-Key`, bij elke poging dezelfde; 1 t/m
`MAX_ID_LENGTH` zichtbare ASCII-tekens). Wachten: willekeurig tussen 0 en `min(OUTBOUND_BACKOFF_MAX_MS, OUTBOUND_BACKOFF_BASE_MS ×
2^(n−1))`, of precies `Retry-After` (gehele seconden, of HTTP-datum naar boven afgerond op seconden; ongeldig telt als afwezig). Past de
wachttijd plus een minimale poging (`min(timeoutMs, 250 ms)`) niet in het restbudget, dan stopt de client met de uitkomst van de
laatste poging, zonder te wachten. Elke poging krijgt `AbortSignal.timeout(min(timeoutMs, restbudget))`, ook voor de body;
`redirect: 'manual'`.

**URL.** Tekenreeks `baseUrl` (zonder slot-`/`) plus sjabloon, dan `new URL`; nooit `new URL(path, base)`. Het sjabloon bevat alleen
`[A-Za-z0-9\-._~/:]`, begint met `/`, zonder `//` of `..`-segment. Parameters door `encodeURIComponent`, query door
`URLSearchParams`. Daarna moeten origin gelijk zijn en het pad op een segmentgrens met het padprefix van `baseUrl` beginnen.

**Foutklassen** (gewone `Error`, in een route dus `INTERNAL_ERROR`; melding noemt nooit een parameterwaarde, query of header):
`OutboundConfigError` bij opstart, `OutboundUsageError` bij een verkeerde aanroep, `OutboundForbiddenError` onder de markering. De
laatste twee gaan zonder netwerkaanroep.

- **Opstart** (`OutboundConfigError`): `name` ongeldig; `hosts` leeg, met schema, poort of `*`; host van `baseUrl` niet in `hosts`
  (beide genormaliseerd met `new URL('https://' + h).hostname`); `http:`, een IP-literal of `localhost` buiten `local` en `test`;
  in `headers` een van `Idempotency-Key`, `Content-Type`, `Content-Length`, `Host` of een hop-by-hop-header (RFC 9110
  §7.6.1, plus `Transfer-Encoding` en `Proxy-*`); een grens < 1 of boven
  de harde grens; `timeoutMs > budgetMs`.
- **Aanroep** (`OutboundUsageError`): sjabloon buiten de regels hierboven (ook `?` of `#`); `:naam` en `params` passen niet precies;
  parameter leeg, `.` of `..`; body bij `GET`, `HEAD`, `DELETE`; `expect` buiten 400–499 of met 429; ongeldige sleutel; URL-controle faalt.

**Markering.** Een `AsyncLocalStorage` (`node:async_hooks`). `routeHandler` in `createApp` zet de markering zelf om de
withUser-callback, zonder dat de app iets hoeft te doen: elke route is gedekt, ook als een app `guardWithUser` vergeet. Voor
`withUser` buiten een route (de login-policy, later app-code) wikkelt `guardWithUser` de work-callback erin; `src/api/server.ts` past
het één keer toe. Geen opstartcontrole op een gemarkeerde `withUser`: die zou elke bestaande test met een eigen `withUser` raken,
terwijl de routes al onvoorwaardelijk gedekt zijn; de lintregel van ST-15 sluit de rest. `createRouteEffects` (`src/core/api/http/route-effects.ts`)
zet de markering om de `afterCommit`-effecten (OV-3) en draait `afterRollback`-cleanup met `exit` buiten de markering, ook als die
vanuit de handler wordt geregistreerd. `src/core/api/db` verandert niet: dat is een kritiek pad (R-WERK-05).

**Log**, één regel per poging, zoals `src/core/api/obs/request-log.ts`: `time`, `requestId`, `outbound` (de `name`), `method`, `path`
(het sjabloon), `status` (`null` zonder antwoord), `durationMs`, `attempt` (vanaf 1), `outcome` (`OK`, `EXPECTED` of de
`UPSTREAM_*`-code) en `retry` (boolean: er volgt nog een poging). Nooit headers, body, query of geheimen. De `requestId` komt per
aanroep mee; de partnerstap (ADR 0077 punt 7) geeft `c.get('requestId')` door. Een gooiende logschrijver stopt de aanroep niet.

**Grenzen** in `src/core/shared/limits.ts`, standaard en hard: `OUTBOUND_TIMEOUT_MS` 3 000 en `OUTBOUND_TIMEOUT_MAX_MS` 10 000;
`OUTBOUND_BUDGET_MS` 8 000 en `OUTBOUND_BUDGET_MAX_MS` 20 000; `OUTBOUND_MAX_ATTEMPTS` 3 en `OUTBOUND_MAX_ATTEMPTS_MAX` 5;
`OUTBOUND_BACKOFF_BASE_MS` 200, `OUTBOUND_BACKOFF_MAX_MS` 2 000; `OUTBOUND_MAX_RESPONSE_BYTES` 1 048 576, geteld op gedecodeerde
bytes. Een `Content-Length` boven de grens zonder `Content-Encoding` wordt niet gelezen; anders stopt het lezen bij de grens. Een
antwoord zonder body (HEAD, 204) telt de `Content-Length` niet.

**Foutcodes:** `coreErrorCodes` (`src/core/shared/errors.ts`), `ErrorStatus` en `STATUS` (`src/core/api/errors.ts`), teksten in
`src/core/web/copy/errors.ts`. Een onbekende app-code blijft 409, een niet-geregistreerde code `INTERNAL_ERROR`.

## Kopieer de vorm van

- `src/core/api/obs/request-log.ts` — logtype en standaardschrijver.
- `src/core/shared/limits.ts` — grens met `invalidRateLimits`.
- `src/core/api/db/testing.ts` — testhulp alleen voor tests.

## Hergebruik en UX

Geen nieuw scherm: `AsyncView` en `Notice` tonen de tekst; alleen de staat "fout" kan erbij; focus en toetsenbord ongewijzigd. Teksten
in `coreErrorTexts`, letterlijk:

| Code | Tekst |
|---|---|
| `UPSTREAM_INVALID` | "Een externe dienst gaf een onverwacht antwoord. Probeer het later opnieuw." |
| `UPSTREAM_UNAVAILABLE` | "Een externe dienst is nu niet bereikbaar. Probeer het later opnieuw." |
| `UPSTREAM_TIMEOUT` | "Een externe dienst reageerde niet op tijd. Probeer het later opnieuw." |

## Acceptatiecriteria

Tegen de nep-partner; "geen aanroep" betekent dat zijn teller 0 blijft.

- **uitgaande-client/AC-1** — Gegeven een GET met `timeoutMs` 300, `maxAttempts` 1 en 2 s vertraging, dan `UPSTREAM_TIMEOUT` na ten
  minste 300 en binnen 1000 ms, na 1 aanroep.
- **uitgaande-client/AC-2** — Gegeven elke 503 met `delayMs` 900, `timeoutMs` 1000, `budgetMs` 1500 en `maxAttempts` 3, dan hooguit 2
  aanroepen, klaar binnen 1800 ms, met `UPSTREAM_TIMEOUT` (de tweede poging krijgt hooguit 600 ms en breekt op haar signaal af).
- **uitgaande-client/AC-3** — Gegeven een POST zonder sleutel, dan 1 aanroep bij een 503 en bij een verbroken verbinding, beide
  `UPSTREAM_UNAVAILABLE`.
- **uitgaande-client/AC-4** — Gegeven een POST met sleutel, eerst 503 (en apart: eerst een time-out) en dan 201, dan slaagt hij na 2
  aanroepen met dezelfde `Idempotency-Key`.
- **uitgaande-client/AC-5** — Gegeven een GET, eerst 429 met `Retry-After: 1`, dan 200, dan slaagt hij en start de tweede aanroep ten
  minste 1000 ms na het eerste antwoord; met een HTTP-datum 2 s vooruit ook ten minste 1000 ms; met `Retry-After: soon` geldt de backoff.
- **uitgaande-client/AC-6** — Gegeven 429 met `Retry-After: 30` en budget 8 s, dan `UPSTREAM_UNAVAILABLE` binnen 500 ms na 1 aanroep,
  en een spion op `cancel` van de body ziet één aanroep (unit-assertie).
- **uitgaande-client/AC-7** — Gegeven een GET met 400, 404 of 500, dan 1 aanroep; altijd 503 met `maxAttempts` 3, dan 3 en een spion
  op `cancel` ziet elke ongelezen body afgebroken; eerst een verbroken verbinding en dan 200, dan slaagt hij na 2.
- **uitgaande-client/AC-8** — Opstartfouten: gegeven een host buiten `hosts`; `hosts` met `*`, poort of schema; een ongeldige `name`;
  `Host` of `Idempotency-Key` in `headers`; `http:`, `127.0.0.1` of `localhost` met `appEnv` `staging` of `production`; een grens boven
  de harde grens, 0, of `timeoutMs > budgetMs`; dan een `OutboundConfigError`. Met `local` of `test` mogen `http:` en `127.0.0.1`.
- **uitgaande-client/AC-9** — Gegeven een 302 naar een tweede nep-partner, dan `UPSTREAM_INVALID`; de eerste telt 1, de tweede 0.
- **uitgaande-client/AC-10** — Gegeven parameter `a/b?c`, dan ziet de nep-partner `/items/a%2Fb%3Fc`. Gegeven `..`, een sjabloon met
  `?`, `#`, `//` of een volledige URL, een ontbrekende of extra parameter, een body bij GET of een sleutel met een spatie, dan een
  `OutboundUsageError` zonder aanroep, waarvan de melding de parameterwaarde niet bevat.
- **uitgaande-client/AC-11** — Gegeven een 200 die niet bij het schema past of geen JSON is, dan `UPSTREAM_INVALID`; een 204 of lege
  200 geeft het schema `undefined`. Een route van `createApp` die die fout teruggeeft, antwoordt 502 met precies `{ code, requestId }`,
  zonder `partner-geheim` uit de partnerbody.
- **uitgaande-client/AC-12** — Gegeven een 404 zonder `expect`, dan `UPSTREAM_INVALID`; met `expect: [404]` `{ ok: false, status: 404 }`
  en een spion op `cancel` ziet de body afgebroken; met `expect: [429]` of `[500]` een `OutboundUsageError` zonder aanroep.
- **uitgaande-client/AC-13** — Gegeven een antwoord boven `maxResponseBytes`, met en zonder `Content-Length`, dan `UPSTREAM_INVALID`.
- **uitgaande-client/AC-14** — Gegeven query `token=q-geheim`, header `Authorization: Bearer h-geheim`, body met `b-geheim` en parameter
  `p-geheim`, dan heeft elke logregel precies de velden uit deze spec, `path` `/items/:id`, en nergens `geheim`; een gooiende
  logschrijver laat de aanroep slagen.
- **uitgaande-client/AC-15** — Gegeven een echte `withUser` zonder `guardWithUser`: een route van `createApp` waarvan de handler
  of een `afterCommit`-effect de client aanroept, geeft 500 `INTERNAL_ERROR`, en een `void client.call()` in een handler geeft een
  afgewezen belofte met `OutboundForbiddenError`. Met `guardWithUser` geeft ook een `withUser` buiten een route die afgewezen belofte.
  Telkens geen aanroep. Een `afterRollback`-cleanup en dezelfde client buiten `withUser` slagen.
- **uitgaande-client/AC-16** — `statusFor` geeft 502, 503 en 504 volgens de tabel, `coreErrorTexts` de teksten hierboven;
  `statusFor('LAST_ADMIN')` blijft 409.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Partner geeft zelf 504 | partnerstatus, geen eigen time-out | `UPSTREAM_UNAVAILABLE` |
| `Retry-After` in het verleden | wachttijd 0 | — |

## Raakt ook

- Nieuw: `src/core/api/outbound/` met `testing.ts`. Gewijzigd: `src/core/shared/errors.ts`, `src/core/api/errors.ts`,
  `src/core/web/copy/errors.ts`, `src/core/shared/limits.ts`, `src/core/api/http/route-effects.ts`, `src/core/api/http/create-app.ts` (markering om de withUser-callback), `src/api/server.ts`
  (`guardWithUser`). Tests op de codelijst of statussen (`src/core/api/errors.test.ts`) veranderen mee; reden: deze spec.
- **Nep-partner** `startFakePartner(routes)`: `node:http` op `127.0.0.1`, poort 0; per `'METHODE /pad'` een antwoord of een reeks
  (de laatste herhaalt) met `status`, `headers`, `json` of ruwe `body`, `delayMs`, `bodyDelayMs` en `destroy`; `calls(key)`, `requests` (methode,
  pad met query, headers, body, aankomsttijd `at`) en `close()`. `.dependency-cruiser.mjs`: `testing-alleen-in-tests` dekt ook dit bestand (hoofdsessie).
- `docs/framework.md`, voorstel (de eigenaarmerge van de PR is het akkoord):
  - §3 Uitzonderingen: "**R-UIT-07** Een integratietest mag een lokale nep-partner gebruiken (`startFakePartner` uit
    `src/core/api/outbound/testing.ts`: echte HTTP-server in de test, vastgelegde antwoorden); eigen code en database blijven echt.
    Elke koppeling krijgt daarnaast één handmatige run tegen de testomgeving van de partner, met commando en uitkomst in de PR (0077)"
  - §4 R-TEST-01: na "nooit gemockt" komt "(uitzondering R-UIT-07)".
  - §4: "**R-CODE-12** Netwerk naar een externe dienst vanuit `src/api` en `src/core/api` alleen via `src/core/api/outbound`
    (uitgezonderd `src/core/api/mail/smtp.ts`, een opslagadapter die een ADR toestaat en `deploy/<host>/`); de client weigert een aanroep in de `withUser` van een route of via `guardWithUser`, en in `afterCommit` (0077)"
  - §6: "**R-SEC-10** Partnerfouten gaan naar buiten alleen als `UPSTREAM_INVALID` (502), `UPSTREAM_UNAVAILABLE` (503) of
    `UPSTREAM_TIMEOUT` (504); nooit tekst, status of body van de partner in het antwoord; in de log alleen de HTTP-status, nooit
    tekst of body (0077)"
- `docs/gouden-pad.md`, "Transactiegrens in de spec": één zin dat de client weigert in de `withUser` van een route of via `guardWithUser`, en in `afterCommit`.
- `docs/roadmap.md` ST-15: niet afvinken; uit "Eisen uit het regelboek" gaan foutcodes, nep-partner en het verbod voor `withUser`
  en `afterCommit` (R-DOC-10); de lintregels tegen netwerk buiten de client en `withJob` blijven.
- ST-03: de runner wikkelt `withJob` op dezelfde manier en geeft zijn run-ID als `requestId`.
- Niet geraakt: `check:migrations`, `check:secdef`, policies, `test/security/resources.ts`, permissietests.

## Buiten scope

De latere werkstappen van ST-15 (ADR 0077 punt 10): register en schakelaar, `secret()`, lintregels, partnerstap, vaste vorm met
contracttest, tokens per gebruiker. Ook later: een toegestane SDK krijgt de `fetch` van de client. Niet gepland: streaming of
binaire antwoorden, uitgaande proxy, circuit breaker.

## Testplan

- **Unit** (`src/core/api/outbound/*.test.ts`, nep-partner): de AC's zonder wachttijd, de spionnen op `cancel`, de
  `Retry-After`-parser en de jitter; AC-16 in `src/core/api/errors.test.ts`.
- **Integratie** (`*.int.test.ts`, `pnpm test:db`): de AC's met echte wachttijden, AC-15 met echte `createApp` en `withUser`, en het
  routedeel van AC-11.

## Open vragen

- **OV-2 ✅ besloten** — Andere 4xx dan 429: `UPSTREAM_INVALID`, status alleen in de log; een app vangt een verwachte status met
  `expect` en maakt er een eigen uitkomst van (bijv. 404 → `NOT_FOUND`), zonder body van de partner.
- **OV-3 ✅ besloten** — Ook `afterCommit` markeren: ja; ADR 0077 punt 3 verbiedt het, de markering maakt het onmogelijk (R-PRINC-01).
- **OV-4 ✅ besloten** — Grenzen zoals hierboven; `appEnv` als config, niet `env()` in de client.
- **OV-5 ✅ besloten** — `shouldRetry` herhaalt een 5xx bij een query tot 2 keer, dus tot 9 partneraanroepen: nu niet wijzigen;
  de spec van de partnerstap beslist, met `rateLimit: 'duur'`.
