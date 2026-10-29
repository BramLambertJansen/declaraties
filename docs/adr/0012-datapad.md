# 0012 — Datapad: `withUser()` met `pg`, transactie per request, Drizzle als `tx`

Status: vervangen door 0042
geaccepteerd door de eigenaar na `pnpm test:db` (Vitest 17/17, pgTAP 10/10; PR #11).

## Context

Fase 0 (`docs/roadmap.md`) moet bewijzen dat het datapad van framework §6 werkt vóór er features op bouwen:
een verbinding als `api_user` (NOINHERIT, zonder eigen rechten), per request één transactie met `SET LOCAL ROLE app_authenticated`
en `set_config(…, true)`, zonder dat een gebruiker of rol naar de volgende request lekt, ook niet achter een pooler in
transaction mode zoals beheerde providers die aanbieden. Daarnaast moet vaststaan dat FORCE RLS ook de eigenaar `app_migrator`
raakt en dat `app_definer` alleen via een eigen policy rijen ziet, en welk type `tx` de handlers krijgen, zodat dat in fase 1
niet meer verandert.

## Besluit

1. **Driver**: `pg` (node-postgres), één kleine pool per proces (5 verbindingen) in `src/core/api/db/pool.ts`.
2. **`withUser(actor, tx => …, { readOnly })`** in `src/core/api/db` is de enige export (plus `testing.ts` voor tests):
   - controleert de actor (`sessionStrength` alleen `password` of `mfa`, geen lege `userId`);
   - `begin` (of `begin read only` voor GET), daarna `current_user = session_user`; zo niet, dan weigert hij en gooit de verbinding weg;
   - `set local role app_authenticated` en `set_config('app.user_id', …, true)`, `set_config('app.session_strength', …, true)`;
   - `commit`, of bij een fout `rollback` (faalt die, dan gaat de verbinding weg).
   Alles is transactie-lokaal, dus het werkt identiek direct en via PgBouncer in transaction mode.
3. **Contract**: `Actor = { userId; sessionStrength: 'password' | 'mfa' }`. `userId` wordt in stuk 3a de branded `UserId`
   (`src/core/shared/ids.ts`). `none` bestaat alleen in de database (`app.session_strength()` buiten `withUser()`).
4. **Type van `tx`**: een **Drizzle-transactie** over dezelfde verbinding, vanaf stuk 3a (Drizzle-introspectie en branded IDs).
   Fase 0 levert de `pg`-client (`Tx = PoolClient`) als tussenstap; 3a vervangt alleen dat type, niet de werking.
   `drizzle-orm` wordt in 3a ter goedkeuring voorgelegd.
5. **`testing.ts`**: alleen importeerbaar uit testbestanden (dependency-cruiser `testing-alleen-in-tests`). Nu: eigen pools
   per URL (`createPool`, `createWithUser`) voor de lektest. In 3a: een geïnjecteerde transactie per test (savepoint), zodat
   integratietests niets committen behalve één test per feature.
6. **Grens afgedwongen** met dependency-cruiser: buiten `src/core/api/db` alleen `index.ts` (`db-alleen-via-index`); `pg` alleen
   in `src/core/api/{db,auth}` (`database-alleen-in-core-db`). `SET ROLE` en `set_config(…, false)` blokkeert ESLint overal,
   `set_config`/`current_setting` buiten `src/core/api/db` ook.
7. **Pooler**: compose-profiel `pooler` (lokaal) en `test-pooler` (runner): `edoburu/pgbouncer` 1.26.0 op digest, transaction mode,
   `scram-sha-256`.
8. **Foutvertaling** (23505 → `ALREADY_EXISTS`, 23503 → `NOT_FOUND`, 42501 → `FORBIDDEN`) komt in stuk 3a in `withUser()`.

## Bewijs

| Bewering | Test |
|---|---|
| 60 gelijktijdige requests op 5 verbindingen zien elk alleen hun eigen `user_id` en sterkte; rol `app_authenticated` | `test/datapad/with-user.int.test.ts`, direct en via PgBouncer |
| Na de requests: elke verbinding `current_user = session_user`, geen `app.user_id` | idem |
| Een fout in de handler draait terug en laat geen actor achter | idem |
| `readOnly` geeft een read-only transactie | idem |
| `api_user` zonder `withUser()` mag niets in schema `app` (42501) | idem, en `db/tests/datapad.sql` (geen schema-, tabel- of PUBLIC-grants) |
| `app_migrator` is geen superuser, heeft geen BYPASSRLS en valt onder FORCE RLS | `db/tests/datapad.sql` |
| `app_definer` ziet rijen alleen via een eigen policy, via een `security definer`-functie met `search_path = ''` | `db/tests/datapad.sql` |
| Ongeldige sessiesterkte of lege `userId` geweigerd | `src/core/api/db/with-user.test.ts` |

## Meting

Twee verbindingen per request (sessie als `auth_service`, daarna `withUser()`), 200 opeenvolgende requests in de runner
(`[meting]`-regels in de uitvoer van `pnpm test:db`):

| Pad | p50 | p95 | max |
|---|---|---|---|
| direct | 0,91 ms | 1,16 ms | 14,82 ms |
| via PgBouncer (transaction mode) | 1,36 ms | 1,71 ms | 14,72 ms |

Gemeten op 2026-10-09 door de eigenaar (WSL2, lokale Docker). PgBouncer kost ongeveer 0,5 ms per request; de uitschieter
(max) is bij beide de eerste verbinding.

## Alternatieven

- **Sessie-instellingen (`SET ROLE`, `set_config(…, false)`)**: lekt op een gedeelde verbinding en werkt niet in transaction mode. Verworpen.
- **Rol per gebruiker in de database**: geen pool mogelijk, en rollen zijn clusterbreed (ADR 0004). Verworpen.
- **`pg`-client als blijvend `tx`-type**: geen extra dependency, maar ongetypeerde SQL in elke handler. Verworpen door de eigenaar.
- **Andere driver (`postgres.js`)**: werkt ook, maar Drizzle en Better Auth ondersteunen `pg` het breedst.

## Gevolgen

- Stuk 3a bouwt hierop: foutvertaling, Drizzle als `tx`, branded `UserId`, savepoint-transacties in `testing.ts`.
- Een app die een pooler kiest (fase 3), herhaalt de lektest tegen de pooler van de provider.
- De probe-tabel in `db/tests/datapad.sql` bestaat alleen binnen een teruggedraaide transactie; er is geen migratie.
