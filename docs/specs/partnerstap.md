---
status: gebouwd # #536
namespace: partnerstap
---

# Partnerstap in de route kit

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

Een route kan een partner op verzoek lezen zonder dat een gebruiker zonder recht de partner bereikt en zonder dat de aanroep
een databaseverbinding vasthoudt: rate limit, rol, permissie en MFA gaan vóór de aanroep, de aanroep loopt tussen twee
`withUser`-transacties (ADR 0077 punt 3 en 7, aanvulling op ADR 0060 punt 7; ST-15, bouwsteen M2). Geen nieuw ADR: volgorde,
foutvolgorde en `rateLimit: 'duur'` zijn in 0077 besloten. De voor-stap voor opslag (spec bestandsopslag, R-OPSL-03) verandert niet.

## Rollen en wie wat ziet

Wie de permissie van het contract heeft (admin met MFA), bereikt de partner; ieder ander krijgt de gewone fout van de kit
en de partner ziet niets. Bij een partnerfout ziet de gebruiker alleen de tekst van de `UPSTREAM_*`-code (R-SEC-10). De
partner ziet wat de app in de stap meestuurt (spec uitgaande-client), nooit de sessie of het verzoek van de gebruiker.

## Datawijzigingen (met grants)

n.v.t. — geen migratie, tabel of functie. De stap leest de schakelaar met de bestaande `readSwitch` (spec koppelingsregister).

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| — | geen nieuwe route; nieuwe vorm `definePartnerRoute` | die van het contract | bestaand: `UPSTREAM_INVALID` 502, `UPSTREAM_UNAVAILABLE` 503, `UPSTREAM_TIMEOUT` 504 |

**API** (`src/core/api/route/kit.ts`, typen in `src/core/api/route/partner.ts`; geen `any`, ≤ 3 parameters, OV-1):

```ts
// createRouteKit levert naast defineRoute:
definePartnerRoute(contract, partner: PartnerStep<Input, Services, Loaded, Result>, handler): RouteDef;

interface PartnerStep<Input, Services, Loaded, Result> {
  readonly integration: string; // naam uit het register (spec koppelingsregister)
  // Eerste withUser, read-only (OV-2): alleen wat de aanroep nodig heeft, bijv. een extern ID, en de controle op bestaan en
  // eigenaar van een resource uit de input (NOT_FOUND vóór de aanroep, ADR 0077 punt 7). Optioneel; zonder: undefined.
  readonly load?: (ctx: { input: Input; actor: RouteActor; tx: Tx }) => Promise<Loaded>;
  // Zonder transactie en zonder verbinding; de aanroep zelf via een IntegrationClient met `reading`.
  readonly call: (ctx: { input: Input; actor: RouteActor; loaded: Loaded; reading: SwitchReading;
    requestId: string; services: Services }) => Promise<Result>;
}
// De handler krijgt RouteContext plus `partner: Result`.
```

`RouteDef` krijgt een optioneel veld `partner` (de stap zonder typen); `defineRoute` en een route zonder stap veranderen niet.
`src/api/kit.ts` exporteert `definePartnerRoute` naast `defineRoute`.

**Types terug** (KAN-7): `RouteDef.partner` bewaart `load`, `call` en de handler met `unknown` voor `Loaded` en `Result`, zodat
`createApp` één routetype houdt. `definePartnerRoute` in `src/core/api/route/partner.ts` wikkelt `call` en de handler en zet
de waarde daar terug met `unsafeCast`, precies twee keer: `unsafeCast<Loaded>(loaded, 'komt uit load van dezelfde
definePartnerRoute; RouteDef bewaart hem zonder type')` en `unsafeCast<Result>(partner, 'komt uit call van dezelfde
definePartnerRoute; RouteDef bewaart hem zonder type')`. Nergens anders een `unsafeCast` voor de stap.

**Resource in de input** (ZOU-5): heeft de input een resource-ID, dan doet `load` de controle op bestaan en eigenaar (via RLS
of een expliciete eigenaarvoorwaarde) en gooit `NOT_FOUND`, zodat een vreemde of onbekende resource de partner niet bereikt.
De handler mag die controle herhalen, maar niet als enige plek hebben.

**Volgorde** (`routeHandler` in `src/core/api/http/create-app.ts` kiest bij `route.partner` een eigen pad in
`src/core/api/http/partner-route.ts`; functies ≤ 60 regels, R-CODE-02). `src/core/api/db` verandert niet:

1. sessie (`UNAUTHENTICATED`); ruwe input lezen, zoals nu.
2. **Eerste `withUser`**, onder de markering, met de rate limit (`RATE_LIMITED`; één telling per verzoek, spec rate-limit),
   altijd `readOnly: true`: input parsen (`VALIDATION`), rol (`FORBIDDEN`), `route.check` (`FORBIDDEN`, `MFA_REQUIRED`), dan
   `load` (een eigen fout zoals `NOT_FOUND` gaat ongewijzigd naar buiten), dan `readSwitch(tx, integration)`. De transactie sluit
   en de verbinding gaat terug naar de pool vóór stap 3.
3. **Aanroep**: `call` buiten elke transactie en buiten de markering, met `requestId` = `c.get('requestId')`. Een `AppError`
   (`UPSTREAM_*` van de client, of een eigen code na `expect`) gaat ongewijzigd naar buiten; elke andere fout, ook
   `OutboundUsageError`, wordt `INTERNAL_ERROR`. De kit vertaalt niets zelf en voegt geen eigen time-out toe: de client
   begrenst elke aanroep (`OUTBOUND_BUDGET_MAX_MS`), de lezing het geheel (`INTEGRATION_SWITCH_MAX_AGE_MS`).
4. **Sessie opnieuw** (MUST-1, OV-3): `auth.getSession(c.req.raw.headers)` nog een keer, ook de `set-cookie`-regels erbij.
   Geen sessie (gedeactiveerd, geblokkeerd, uitgelogd, verlopen of `session_version` verhoogd: `getSession` geeft dan `null`,
   `src/core/api/auth/auth.ts`) of een andere `userId` dan in stap 1: `UNAUTHENTICATED`, geen tweede transactie. De actor van
   stap 5 komt uit deze sessie. Nodig omdat `withUser` alleen `user_roles` leest en deactiveren of blokkeren de rol laat staan.
5. **Tweede `withUser`**, onder de markering, zonder rate limit, `readOnly` alleen bij `GET`, met `createRouteEffects`
   (`afterCommit`, `afterRollback`): rol en `route.check` opnieuw (OV-3), dan de handler met `ctx.partner`, dan de outputcontrole.

`timeDatabase` telt alleen de twee transacties, niet de aanroep. De markering staat om beide callbacks, dus de handler,
`load` en `afterCommit` kunnen de partner niet aanroepen (R-CODE-12).

**Opstart** (`createApp` gooit, melding noemt methode, pad en regel):
- een route met `partner` waarvan `rateLimitCategory(contract)` niet `'duur'` is ("route met partnerstap vraagt `rateLimit: 'duur'`");
- `partner.integration` niet in `config.integrations` (of geen `integrations` meegegeven).

**Foutvolgorde** (ADR 0077 punt 7): `UNAUTHENTICATED`, `RATE_LIMITED`, `VALIDATION`, `FORBIDDEN`, `MFA_REQUIRED`, fout uit
`load` (zoals `NOT_FOUND`), dan pas `UPSTREAM_*` of een eigen code uit `call`, dan `UNAUTHENTICATED` uit stap 4, dan
`FORBIDDEN`/`MFA_REQUIRED` uit stap 5 en de fouten van de handler. Een uitgezette koppeling geeft `UPSTREAM_UNAVAILABLE` zonder aanroep via de client (OV-4).

| Samen optredende situaties | Verwachte uitkomst |
|---|---|
| geen permissie + koppeling uit + partner zou time-outen | `FORBIDDEN`, 0 aanroepen |
| admin zonder MFA + partner geeft 503 | `MFA_REQUIRED`, 0 aanroepen |
| ongeldige input + geen permissie | `VALIDATION`, 0 aanroepen |
| `load` geeft `NOT_FOUND` + koppeling uit | `NOT_FOUND`, 0 aanroepen |
| rate limit op + alles verder geldig | `RATE_LIMITED`, 0 aanroepen |

**Web** (OV-5, besluit dat spec uitgaande-client OV-5 aan deze spec liet): `shouldRetry` in `src/core/web/lib/query.ts` herhaalt
een `ApiError` met code `UPSTREAM_INVALID`, `UPSTREAM_UNAVAILABLE` of `UPSTREAM_TIMEOUT` niet; de client herhaalt al binnen
zijn budget. Andere 5xx en netwerkfouten blijven zoals nu.

## Kopieer de vorm van

- `src/core/api/http/create-app.ts` — `routeHandler`: sessie, ruwe input, `guardWithUser`, `createRouteEffects`, `timeDatabase`.
- `src/core/api/integrations/client.ts` — `call` met een `SwitchReading` en de logregel `DISABLED`.
- `test/outbound/route-guard.int.test.ts` — echte `createApp` en `withUser` met `startFakePartner` en teller 0.
- `test/api/rate-limit.int.test.ts` — lagere `rateLimits` in `createApp` en de telling per verzoek.

## Hergebruik en UX

n.v.t. — geen scherm; de teksten van de `UPSTREAM_*`-codes bestaan (spec uitgaande-client), `AsyncView` en `Notice` tonen ze.

## Acceptatiecriteria

Tegen de nep-partner (`startFakePartner`, R-UIT-07) met echte `createApp`, `withUser` en database; "0 aanroepen" = teller 0.
Testroutes gebruiken een testpermissie alleen voor `admin` en een testkoppeling in het register met stand aan, tenzij anders vermeld.

- **partnerstap/AC-1** — Gegeven een gebruiker met rol `user`, of zonder rol, dan 403 `FORBIDDEN` en 0 aanroepen; `load` en de
  handler worden niet aangeroepen.
- **partnerstap/AC-2** — Gegeven een admin zonder MFA, dan 403 `MFA_REQUIRED` en 0 aanroepen; dezelfde admin met MFA krijgt 200
  na precies 1 aanroep.
- **partnerstap/AC-3** — Elke rij van de tabel "Samen optredende situaties" geeft de genoemde uitkomst met 0 aanroepen.
- **partnerstap/AC-4** — Gegeven een partner met `delayMs` 2000 en een client met `timeoutMs` 300 en `maxAttempts` 1, dan meet de
  test op het moment dat de nep-partner het verzoek ontvangt `pool.totalCount - pool.idleCount === 0` voor de pool van de app;
  het antwoord is 504 met precies `{ code: 'UPSTREAM_TIMEOUT', requestId }` en de handler draait niet.
- **partnerstap/AC-5** — Gegeven een route met partnerstap en een contract zonder `rateLimit` (een `POST`, dus `schrijven`), met
  `rateLimit: 'lezen'` of `'schrijven'`, dan gooit `createApp` bij opstart met een melding die het pad en `rateLimit: 'duur'`
  noemt; met `'duur'` start hij. Een `integration` die niet in het register staat, of geen `integrations`, geeft ook een opstartfout.
- **partnerstap/AC-6** — Gegeven de koppeling uit, dan 503 `UPSTREAM_UNAVAILABLE` met precies `{ code, requestId }`, 0 aanroepen,
  één logregel `DISABLED` en de handler draait niet.
- **partnerstap/AC-7** — Gegeven `rateLimits.duur` 2, dan slagen de eerste twee verzoeken (dus één telling per verzoek, niet twee)
  en geeft het derde 429 `RATE_LIMITED` met `Retry-After`; de partner telt 2.
- **partnerstap/AC-8** — Gegeven een geslaagde aanroep, dan leest `load` met de `tx` de eigen rij in `public.user_roles` en geeft
  de rol als ID, ziet de nep-partner die waarde in het pad, is `requestId` in `call` gelijk aan de header `X-Request-Id`, en
  schrijft de handler met `ctx.partner` via `ctx.audit` een regel in `app.audit_log` die na het antwoord bestaat (geen migratie
  nodig). Roept de handler zelf de client aan, dan 500 `INTERNAL_ERROR`, geen auditregel, en de partner telt 1.
- **partnerstap/AC-9** — Gegeven een partner die 503 geeft, of een 200 die niet bij het schema past met `partner-geheim` in de body,
  dan 503 `UPSTREAM_UNAVAILABLE` respectievelijk 502 `UPSTREAM_INVALID` met precies `{ code, requestId }`, zonder `partner-geheim`,
  en de handler draait niet. Gooit `call` een gewone `Error`, dan 500 `INTERNAL_ERROR`.
- **partnerstap/AC-10** — Gegeven een `load` die via `createAuditFn(tx, …)` een regel in `app.audit_log` schrijft, dan 500
  `INTERNAL_ERROR`, geen auditregel met de `requestId` van het verzoek en 0 aanroepen (eerste transactie read-only, OV-2).
- **partnerstap/AC-11** — Gegeven een admin met MFA wiens rol tijdens de vertraging van de partner wordt ingetrokken, dan 403
  `FORBIDDEN` uit de tweede transactie, de handler draait niet en de partner telt 1 (OV-3).
- **partnerstap/AC-12** — Gegeven een spion om `withUser`, dan roept een route met partnerstap hem precies 2 keer aan en een route
  zonder stap precies 1 keer, en een spion om `getSession` telt 2 respectievelijk 1; de bestaande routetests blijven groen.
- **partnerstap/AC-13** — `shouldRetry(0, new ApiError(code, status))` is `false` voor `UPSTREAM_INVALID` 502, `UPSTREAM_UNAVAILABLE`
  503 en `UPSTREAM_TIMEOUT` 504, en blijft `true` voor `INTERNAL_ERROR` 500 en een netwerkfout (OV-5).
- **partnerstap/AC-14** — Gegeven een admin met MFA wiens account tijdens de vertraging van de partner (`delayMs`) wordt
  gedeactiveerd, dan 401 `UNAUTHENTICATED`, de handler draait niet, er komt geen auditregel van de handler en de partner telt 1
  (MUST-1). Hetzelfde voor een account dat in die tijd wordt geblokkeerd.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| `call` doet meerdere aanroepen en duurt langer dan de lezing geldt | de volgende aanroep weigert (spec koppelingsregister) | `INTERNAL_ERROR` |
| `call` vangt een `UPSTREAM_*` en geeft een eigen uitkomst (bijv. lege lijst) | toegestaan; de handler krijgt die uitkomst | — |
| koppeling tijdens de aanroep uitgezet | de lopende aanroep gaat door met haar lezing (spec koppelingsregister, OV-3) | — |
| `load` gooit een eigen `AppError` | ongewijzigd naar buiten, vóór elke aanroep | die code |
| handler faalt na een geslaagde aanroep | rollback van de tweede transactie; de leesaanroep is al gedaan (richting `read`, geen bijwerking) | die code |
| sessie verloopt, wordt uitgelogd of `session_version` stijgt tijdens de aanroep | tweede `getSession` geeft `null`, geen tweede transactie | `UNAUTHENTICATED` |

## Raakt ook

- **Lane: feature.** Geen kritiek pad: niet `src/core/api/db/**`, `src/core/api/auth/**`, `db/`, `scripts/`, `package.json` of een
  ander pad uit `KRITIEK` of `altijdVragen`; geen migratie en geen gewijzigde pgTAP-test. `AGENTS.md` en `.claude/rules/api.md`
  zijn vaste instructiepaden en mogen in de feature-lane (`VASTE_INSTRUCTIES` in `scripts/kit/lane.mjs`). Spec en bouw gaan
  samen in één PR (ADR 0062). Getoetst met `laneVan` op alle paden hieronder: `feature`.
- Code, nieuw: `src/core/api/route/partner.ts`, `src/core/api/http/partner-route.ts`. Gewijzigd: `src/core/api/route/kit.ts`,
  `src/core/api/http/create-app.ts` (keuze per route, opstartcontroles, commentaar bij `integrations`), `src/api/kit.ts`,
  `src/core/web/lib/query.ts`.
- Tests, nieuw: `src/core/api/http/partner-route.test.ts` (opstart, AC-5), `test/integrations/partner-step.int.test.ts` (AC-1 t/m
  AC-4, AC-6 t/m AC-12, AC-14). In `src/core/web/lib/query.test.ts` komt een nieuwe test (AC-13); de bestaande verwachtingen blijven
  (R-TEST-02).
- Checks: `pnpm test:db`, `pnpm test:unit`, `pnpm lint` (`rails/netwerk-api` blijft ongewijzigd: de stap gebruikt de client).
  Niet geraakt: `check:migrations`, `check:secdef`, policies, `check:snapshot`, `test/security/resources.ts` en
  permissietests per verboden rol (geen nieuwe route of permissie in de template; de testpermissie leeft alleen in de test).
- `docs/framework.md`, voorstel (hoofdsessie; `voorReview`, niet kritiek; de eigenaarmerge is het akkoord), deels uit de "Eisen
  uit het regelboek" van ST-15 (R-DOC-10):
  - R-WERK-09: "Route alleen via `defineRoute({ method, path, input, output, permission, handler })`" wordt "Route alleen via
    `defineRoute({ method, path, input, output, permission, handler })` of `definePartnerRoute`"; de rest blijft.
  - R-UIT-02: "Route via `defineRoute` en met login" wordt "Route via `defineRoute` of `definePartnerRoute` en met login"; de rest blijft.
  - R-SEC-03: "Rate limit op elke `defineRoute`-route" wordt "Rate limit op elke `defineRoute`- en `definePartnerRoute`-route", en
    na "…nooit eigen getal per route)" komt "; een route met partnerstap (`definePartnerRoute`): `rateLimit: 'duur'`, anders
    weigert `createApp` bij opstart (0077)".
  - R-CODE-12: aan het eind komt "; in een route alleen via de partnerstap (`definePartnerRoute`): rate limit, rol, permissie en MFA
    vóór de aanroep, bestaan en eigenaar van een resource uit de input in `load`, `FORBIDDEN`, `MFA_REQUIRED` en `NOT_FOUND`
    vóór elke `UPSTREAM_*`-fout, de aanroep zonder transactie, daarna de sessie opnieuw (0077)".
  - R-CODE-03: "Parse op elke grens met zod via `defineRoute()`" wordt "Parse op elke grens met zod via `defineRoute()` of
    `definePartnerRoute()`"; de rest blijft.
- Letterlijke kopieën (R-DOC-03, `test/rails/leesbudget-instructies.test.ts` AC-8; hoofdsessie): `.claude/rules/api.md` krijgt
  dezelfde nieuwe tekst voor R-WERK-09, R-CODE-03 en R-SEC-03 (R-UIT-02 en R-CODE-12 staan er niet). In de proza van
  `.claude/rules/api.md` wordt "alleen routes uit `defineRoute`" "alleen routes uit `defineRoute` of `definePartnerRoute`", en
  "`createRouteKit`/`defineRoute` in `src/core/api/route`" wordt "`createRouteKit`/`defineRoute`/`definePartnerRoute` in
  `src/core/api/route`".
- Melding in `createApp` (`src/core/api/http/create-app.ts`, de controle met `isRouteDef`): "createApp: alleen routes uit
  defineRoute (ADR 0040)" wordt "createApp: alleen routes uit defineRoute of definePartnerRoute (ADR 0040)".
- `AGENTS.md`, sectie API (hoofdsessie): "Route alleen via `defineRoute({ method, path, input, output, permission, handler })`"
  wordt "Route alleen via `defineRoute({ method, path, input, output, permission, handler })` of `definePartnerRoute`"; de rest
  blijft (budget: nu 8252 van 9216 bytes, dit voegt ongeveer 25 bytes toe).
- `docs/roadmap.md` ST-15: "Gebouwd:" krijgt "partnerstap (spec partnerstap)"; uit "Eisen uit het regelboek" gaan de foutvolgorde
  van de partnerstap en `rateLimit: 'duur'`; niet afvinken.
- `docs/gouden-pad.md`, "Padparameters en foutvolgorde": één zin dat een partnerstap de volgorde van deze spec volgt, met
  `src/core/api/http/partner-route.ts` als bron, en dat bestaan en eigenaar van een resource uit de input in `load` getoetst
  worden, dus vóór de aanroep.
- **Gebouwde specs**: geen tekst moet mee. `uitgaande-client` (OV-5 laat de webherhaling aan deze spec; regel over `requestId` klopt)
  en `koppelingsregister` (optie `integrations` "voor de partnerstap") blijven waar. Wel prettig maar niet nodig: in
  `uitgaande-client` OV-5 een verwijzing naar deze spec; die kan nu niet mee (leerpunt #532) en is geen onwaarheid.

## Buiten scope

Schrijven naar de partner (outbox, M4: nooit via de partnerstap); token per gebruiker via een `client`-functie (M6: `load` is
de plek, deze spec bouwt het niet); vaste vorm en contracttest (M3); de skill en feiten (M8). De combinatie met de voor-stap
`prepare` van bestandsopslag: die is nog niet gebouwd; de bouw daarvan laat `createApp` een route met beide weigeren. Afbreken
van de aanroep als de gebruiker het verzoek afbreekt.

Vervolgtaken (kritiek of later, niet in deze PR):
- `scripts/kit/diff-guard.mjs` (`routeAanroepen`) zoekt alleen op `defineRoute(` en ziet een `definePartnerRoute(` dus niet.
  Het script is kritiek (`KRITIEK` in `scripts/kit/lane.mjs`), dus dit wordt een eigen taak met besluit-PR.
- Voor M8: `test/security/controles.ts` heeft voor een partnerroute een nep-partner of een schakelaar nodig (stand uit geeft
  zonder aanroep `UPSTREAM_UNAVAILABLE`), anders kan de securitysuite zo'n route niet doorlopen. Pas nodig zodra een app een
  partnerroute heeft; de template heeft er geen.

## Testplan

- **Unit** (`src/core/api/http/partner-route.test.ts`): opstartcontroles (AC-5); `query.test.ts` (AC-13).
- **Integratie** (`test/integrations/partner-step.int.test.ts`, `pnpm test:db`), één opzet voor alle AC's daar:
  - `createPool(required('DATABASE_URL'))` met de echte `createWithUser` uit `src/core/api/db/testing.ts`, en `createApp` met een
    eigen `AuthGateway` (vorm `gatewayFor` in `test/outbound/route-guard.int.test.ts`) en een register met één testkoppeling.
    Niet `beginTestDb`: die houdt zelf een verbinding vast (AC-4) en negeert `readOnly` (`src/core/api/db/test-transaction.ts`),
    dus AC-10 vraagt de echte `withUser`. Dat geldt voor AC-4, AC-10, AC-11 en AC-14; de andere AC's gebruiken dezelfde opzet.
  - Gebruikers en rollen gecommit via de migrator-pool (`MIGRATOR_DATABASE_URL`, `app.assign_role`), en per run een unieke
    schakelaarnaam `partner-${randomUUID().slice(0, 8)}`, aan of uit gezet met `app.set_integration_enabled` en in `afterAll`
    opgeruimd met gebruikers, rollen en auditregels, zoals `test/integrations/race.int.test.ts`.
  - AC-4, AC-11 en AC-14: poll `partner.requests.length` tot 1, dan meten (AC-4) of rol intrekken (AC-11) of het account
    deactiveren met `app.set_account_deactivated` respectievelijk blokkeren met `app.set_account_blocked`, door een tweede admin
    met MFA via `withUser` (vorm `test/api/account-lifecycle.int.test.ts`) (AC-14), daarna het antwoord afwachten.
  - AC-14: de `AuthGateway` van de test leest bij elke `getSession` de rij in `"user"` en geeft `null` bij `deactivated_at` of
    `blocked_at`, zoals de echte gateway (die vertaling bewijst `test/api/account-lifecycle.int.test.ts` al). De test bewijst dat
    de kit `getSession` opnieuw vraagt en `null` als `UNAUTHENTICATED` behandelt.
  - `startFakePartner` met teller; spionnen om `withUser` en `getSession` (AC-12); logschrijver van de client opvangen (AC-6).

## Open vragen

- **OV-1** — Vorm: aparte `definePartnerRoute(contract, partner, handler)` of een optie op `defineRoute`? Aanbeveling: apart.
  `defineRoute` en elke bestaande route blijven gelijk, het type van `ctx.partner` volgt uit `call` (inferentie van links naar
  rechts), en het blijft bij 3 parameters.
- **OV-2** — Eerste transactie altijd read-only? Aanbeveling: ja; de stap leest alleen wat de aanroep nodig heeft (0077 punt 7),
  schrijven hoort in de handler na de aanroep. Een token vernieuwen (M6) is zelf een partneraanroep en valt daar niet onder.
- **OV-3 ✅ besloten** (spec-review, MUST-1 optie a) — Vóór de tweede transactie vraagt de kit de sessie opnieuw op
  (`auth.getSession`); geen sessie of een andere gebruiker geeft `UNAUTHENTICATED`. Daarna toetst de tweede transactie rol en
  permissie opnieuw. Reden: `withUser` leest alleen `user_roles`, en deactiveren of blokkeren laat de rol staan; zonder de tweede
  sessiecontrole bereikt een account dat tijdens de aanroep (tot 20 s) werd gedeactiveerd de handler. Kost één sessielezing extra,
  alleen voor partnerroutes.
- **OV-4** — Moet de kit bij stand uit zelf stoppen, vóór `call`? Aanbeveling: nee; `IntegrationClient.call` weigert al zonder
  aanroep en schrijft de logregel `DISABLED` (één bron), en de app kan een uitval zelf opvangen (randgeval). `call` kan de
  partner alleen via die client bereiken (`rails/netwerk-api`).
- **OV-5** — Herhaalt de web-client een `UPSTREAM_*`-fout (uitgaande-client OV-5: tot 3 verzoeken × 3 pogingen = 9 aanroepen)?
  Aanbeveling: nee; de server herhaalt al binnen zijn budget en elke herhaling kost een `duur`-telling (10 per minuut).
- **OV-6** — Eén koppeling per partnerstap? Aanbeveling: ja; `integration` is één naam en `reading` één lezing. Twee partners in
  één verzoek vraagt een nieuwe spec.
