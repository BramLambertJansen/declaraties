---
status: gebouwd # door de agent onder mandaat van de eigenaar (2026-10-11), open vragen volgens de aanbeveling; ter herziening
namespace: rate-limit
---

# Rate limit voor app-routes in `defineRoute`

> Goedgekeurd door de agent onder mandaat van de eigenaar (2026-10-11). Elke open vraag is besloten volgens de aanbeveling
> erbij; zie `docs/reviews/2026-10-11-keuzes-agent.md`. De eigenaar kan dit herzien.

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

Elke route die via `defineRoute` ontstaat, heeft vanzelf een rate limit per gebruiker, opgeslagen in Postgres, met grenzen uit `limits.ts` en
foutcode `RATE_LIMITED`, zodat een app er geen kan vergeten (framework §6, Verharding; roadmap stuk 3f).

## Rollen en wie wat ziet

| Rol | Ziet | Mag |
|---|---|---|
| anoniem | n.v.t.: een route van `defineRoute` eist login (401 vóór de rate limit) | — |
| `user`, `admin` | bij overschrijding de tekst van `RATE_LIMITED` | binnen de grens elke route die zijn permissie toelaat |
| ontwikkelaar van de app | kiest per contract een categorie (`lezen`, `schrijven`, `duur`) of de standaard per methode | grenzen alleen via `src/shared/limits.ts`, nooit boven de harde grens uit core |

- De teller is per gebruiker (`app.current_user_id()`), niet per sessie: meer tabbladen of apparaten delen dezelfde grens.
- Better Auth (`/api/auth/*`) houdt zijn eigen rate limit (`better_auth."rateLimit"`, ADR 0013); deze spec verandert daar niets aan.

## Datawijzigingen (met grants)

- **`app.rate_limits`** (`key text primary key`, `window_start timestamptz not null`, `hits integer not null check (hits > 0)`); `unlogged` (OV-3).
  RLS aan en geforceerd. Grants: geen aan `app_authenticated`; `select, insert, update, delete` aan `app_definer`.
  Policy `rate_limits_definer_all` (`for all to app_definer using (true) with check (true)`); geen andere policy.
- **`app.consume_rate_limit(p_bucket text, p_window_seconds integer, p_max integer) returns integer`** — `security definer`, eigenaar `app_definer`,
  `search_path = ''`, volledig gekwalificeerd; execute aan `app_authenticated`; klasse `client` in de functiecatalogus. Actorcontrole: zonder
  `app.current_user_id()` 42501. Sleutel `p_bucket || ':' || app.current_user_id()` (de aanroeper kiest dus nooit de gebruiker). Eén statement
  `insert … on conflict (key) do update`: een verlopen venster begint opnieuw op 1, anders `hits + 1`. Geeft 0 (toegestaan) of het aantal seconden tot
  het venster afloopt, naar boven afgerond en minstens 1 (`greatest(1, ceil(…))`; nooit `Retry-After: 0`). Vast venster, zoals Better Auth (OV-4).
  `p_window_seconds` en `p_max` > 0, anders 22023.
- **Opruimen:** een rij per gebruiker per categorie; een verlopen rij wordt bij de volgende request hergebruikt, dus de tabel groeit hooguit tot
  gebruikers × categorieën. Periodiek opruimen van rijen van inactieve gebruikers hangt af van ADR 0020 (achtergrondtaken, `voorgesteld`, PR #69); tot dat besluit niet.
- Geen nieuwe rol. De pgTAP-invariant (RLS geforceerd, geen TRUNCATE/REFERENCES/TRIGGER) dekt de tabel vanzelf.

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| alle | elke route uit `defineRoute` (nu `/api/me`, `/api/accounts*`) | ongewijzigd | erbij: `RATE_LIMITED` (HTTP 429, header `Retry-After` in seconden) |

- **Plek:** `createApp` roept `withUser(actor, …, { rateLimit })` aan; `withUser` doet de telling in een **eigen korte transactie**
  (zelfde verbinding, `begin; enterActor; select app.consume_rate_limit(…); commit`) en pas daarna de transactie van de route. Twee redenen:
  een GET draait `read only` (geen insert mogelijk), en een route die faalt en terugrolt, moet toch meetellen. `withUser` blijft de enige ingang;
  er komt geen nieuwe export uit `src/core/api/db` (OV-2).
- **Telling direct na `getSession`, vóór de inputvalidatie.** Nu valideert `routeHandler` de input vóór `withUser`, dus een `VALIDATION` zou niet
  tellen en een script met ongeldige input zou de grens omzeilen. Daarom leest `routeHandler` de body nog vóór de telling (geen verbinding vast
  tijdens het lezen), maar draaien JSON-parse en zod pas in de callback van `withUser`, als eerste stap vóór de rolcontrole (de volgorde
  `VALIDATION` vóór `FORBIDDEN` blijft). Prijs: een ongeldig verzoek opent nu ook de routetransactie. Alleen 401, CSRF en een te grote body
  tellen niet (die komen vóór de actor).
- **Categorie per contract:** `defineContract({ …, rateLimit?: 'lezen' | 'schrijven' | 'duur' })`; zonder veld: GET → `lezen`, anders `schrijven`.
  `inviteContract`, `reinviteContract` en (spec accountbeheer-uitbreiding) `reset-link` krijgen `duur` (ze versturen mail). Uitzetten kan niet.
- **Grenzen** (OV-1): harde grens in `src/core/shared/limits.ts` (`RATE_LIMIT_WINDOW_SECONDS = 60`; per categorie het maximum per venster:
  `lezen` 300, `schrijven` 60, `duur` 10); een app mag in `src/shared/limits.ts` lager, nooit hoger (test in `limits.test.ts`, zoals `MAX_PAGE_SIZE`).
- **IP:** routes uit `defineRoute` hebben altijd een actor, dus de sleutel is de gebruiker. Een IP-sleutel (alleen uit `CLIENT_IP_HEADER`, ADR 0013)
  is voor routes zonder actor, zoals de clientfouten-route (framework §3); die bouwt deze spec niet, maar de functie krijgt er in die spec een variant bij (OV-5).
- `AppError('RATE_LIMITED', { retryAfter })`; `onError` zet `Retry-After` en geeft alleen `{ code, requestId }` terug.

## Hergebruik en UX

- **Bestaande componenten:** geen nieuw scherm. De bestaande foutweergave (`AsyncView` bij laden, `Notice` of veldfout bij een mutatie) toont de
  tekst uit `src/core/web/copy/errors.ts`. Opnieuw proberen gebeurt al niet: `shouldRetry` in `src/core/web/lib/query.ts` herhaalt geen 4xx en
  mutaties hebben `retry: false` (bestaand gedrag, geen wijziging).
- **Staten per scherm:** alleen "fout" komt erbij; na `Retry-After` werkt de volgende handeling weer. Laden, leeg, bezig, gelukt, verouderd: ongewijzigd.
- **Alle zichtbare tekst letterlijk:**

| Plek | Tekst |
|---|---|
| Elke foutmelding bij `RATE_LIMITED` | "Te veel pogingen. Probeer het over een paar minuten opnieuw." (bestaande tekst; geen nieuwe) |

- **Focusvolgorde en toetsenbord:** ongewijzigd; de melding heeft `role="alert"` en krijgt de focus, zoals elke foutmelding.

## Acceptatiecriteria

- **rate-limit/AC-1** — Gegeven een `user` die binnen één venster het maximum van `schrijven` aan POST-verzoeken heeft gedaan, wanneer hij er nog één
  doet, dan krijgt hij 429 met `{ code: 'RATE_LIMITED', requestId }` en een header `Retry-After` met een geheel getal tussen 1 en 60.
- **rate-limit/AC-2** — Gegeven die geblokkeerde `user`, wanneer een andere gebruiker dezelfde route aanroept, dan slaagt die.
- **rate-limit/AC-3** — Gegeven een afgelopen venster, wanneer de `user` opnieuw een verzoek doet, dan slaagt het en begint de telling op 1.
- **rate-limit/AC-4** — Gegeven een route die faalt (`VALIDATION` door zod of ongeldige JSON, `FORBIDDEN`, of een fout in de handler), wanneer een
  gebruiker hem herhaalt, dan telt elke poging mee.
- **rate-limit/AC-5** — Gegeven een GET-route, wanneer de grens van `lezen` bereikt is, dan geeft de volgende GET `RATE_LIMITED`, terwijl de route
  zelf nog steeds read only draait.
- **rate-limit/AC-6** — Gegeven een admin op `/admin/accounts` en een uitgenodigd account, wanneer hij binnen één venster 11 keer "Opnieuw
  uitnodigen" kiest (grens `duur` 10), dan ziet hij na de 11e keer "Te veel pogingen. Probeer het over een paar minuten opnieuw." en staan er
  precies 10 uitnodigingen in Mailpit.
- **rate-limit/AC-7** — Gegeven een app-grens in `src/shared/limits.ts` boven de harde grens uit core, dan faalt `limits.test.ts`.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Twee gelijktijdige verzoeken op de laatste vrije plek | precies één slaagt (rijvergrendeling van de upsert) | `RATE_LIMITED` |
| Verzoek zonder sessie | 401 vóór de telling; telt niet, maar kost wel een sessie-query (geen limiet; Better Auth en CSRF ervoor) | `UNAUTHENTICATED` |
| Verzoek met ongeldige JSON of input | telt mee (telling vóór de validatie) | `VALIDATION` |
| CSRF of te grote body | geweigerd vóór de telling; telt niet | `CSRF_REJECTED`, `PAYLOAD_TOO_LARGE` |
| Database onbereikbaar tijdens de telling | verzoek faalt, geen doorlaten zonder telling (fail closed) | `INTERNAL_ERROR` |
| Klok van de API wijkt af | geen effect: het venster gebruikt `pg_catalog.now()` van de database | — |
| Directe aanroep van de functie met een negatief of nul maximum | geweigerd | — (22023) |
| Directe `select` op `app.rate_limits` als `app_authenticated` | geweigerd (geen grant) | — (42501) |
| Crash of failover van de database | tellers kwijt (`unlogged`); grens begint opnieuw | — |
| Dev-login lokaal | valt buiten `defineRoute`, geen telling | — |

## Raakt ook

- `src/core/api/db` (`WithUserOptions.rateLimit`, tweede transactie), `src/core/api/http/create-app.ts`, `src/core/api/route/kit.ts` en
  `src/shared/contracts/kit.ts` (veld `rateLimit`), `src/core/api/errors.ts` (`retryAfter`, header in `onError`), `src/core/shared/limits.ts`, `src/shared/limits.ts`.
- `src/core/api/http/create-app.ts`: inputvalidatie verhuist naar binnen de `withUser`-callback. Request-log telt `RATE_LIMITED` mee (bestaand veld `code`).
- **Bekend gat (vervolg):** `/api/auth/change-password`, `/change-email` (spec eigen-account) en `/two-factor/generate-backup-codes` (spec
  accountbeheer-uitbreiding) vallen buiten `defineRoute` en hebben alleen de limiet van Better Auth (3 per 10 s per IP en pad), niet per gebruiker.
- Framework §6 (Verharding) noemt de rate limit van app-routes en de tweede transactie; `.claude/rules/api.md` noemt het contractveld.
- De generator (`scripts/kit/templates/contract.ts.tmpl`) laat `rateLimit` weg (standaard per methode); dat is een opmerking in het sjabloon.

## Buiten scope

Rate limit per IP voor routes zonder actor (clientfouten-route, eigen spec), CAPTCHA, schuivend venster of token bucket, een externe opslag (Redis),
opruimen van oude rijen (ADR 0020), headers `RateLimit-*` naast `Retry-After`, de grenzen van Better Auth.

## Testplan

- **Unit:** standaardcategorie per methode; `limits.ts`: elke app-grens ≤ harde grens; `onError` zet `Retry-After` en lekt niets; de bestaande
  test van `shouldRetry` (geen retry op 4xx) blijft groen.
- **pgTAP:** policy `rate_limits_definer_all` op naam; geen grant aan `app_authenticated` op de tabel; `app.consume_rate_limit`: zonder actor 42501,
  telt per gebruiker, venster verloopt, grens exact (max toegestaan, max + 1 niet), restduur naar boven afgerond en ≥ 1, ongeldige parameters 22023; functiecatalogus (`client`, reden: actor uit
  `app.current_user_id()`); invarianten (RLS geforceerd).
- **Integratie (`pnpm test:db`):** AC-1 t/m AC-5 met een verlaagde testgrens (grens als parameter van `createApp` in de testkit, niet via env);
  racetest "twee verzoeken op de laatste plek"; een gefaalde route telt mee, ook `VALIDATION` en ongeldige JSON; GET blijft read only; per verboden
  rol telt de geweigerde request mee (`user` op `/api/accounts` → `FORBIDDEN`, daarna `RATE_LIMITED`).
- **E2E (`pnpm ui:check`, echte stack, CSP aan):** AC-6 met de echte grens (11 klikken, geen testknop of aparte e2e-grens; telling van de mails in
  Mailpit); axe op 375 en 1280 px voor `/admin/accounts` met de melding van `RATE_LIMITED` zichtbaar.

## Open vragen voor de eigenaar

- **OV-1** — Grenzen: venster 60 s; `lezen` 300, `schrijven` 60, `duur` 10 per gebruiker per venster? Aanbeveling: deze waarden; ruim genoeg voor
  normaal gebruik met meerdere tabbladen, laag genoeg tegen een script.
- **OV-2** — Telling in `withUser` (eigen transactie, geen nieuwe export) of een aparte export `consumeRateLimit()` uit `src/core/api/db`? Aanbeveling:
  in `withUser`; de exportlijst in AGENTS.md en framework §2 blijft dan gelijk. Kosten in beide gevallen: twee transacties per request (extra
  round-trips) en één hete rij per gebruiker per categorie (gelijktijdige verzoeken van één gebruiker wachten kort op elkaars rijvergrendeling).
- **OV-3** — Tabel `unlogged` (geen WAL per request; tellers weg na crash en niet op een replica) of gewoon? Aanbeveling: `unlogged`; een verloren
  teller kost hooguit één extra venster. Controleer bij de providerkeuze (ADR per app) dat `unlogged` daar mag.
- **OV-4** — Vast venster (zoals Better Auth) of schuivend? Aanbeveling: vast; eenvoudig, één rij, en aan de rand hooguit twee keer de grens.
- **OV-5** — Ook per IP tellen voor ingelogde routes? Aanbeveling: nee; met een actor is de gebruiker de betere sleutel, en achter een NAT delen veel
  gebruikers één IP. IP alleen voor routes zonder actor, in hun eigen spec.
