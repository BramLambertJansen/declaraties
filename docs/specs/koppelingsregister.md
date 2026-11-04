---
status: goedgekeurd # voorstel | goedgekeurd | gebouwd | vervallen (ADR 0046, 0062)
namespace: koppelingsregister
model: opus
modelreden: nieuwe tabel en security definer-functies, een export erbij in src/core/api/db (ADR 0062 punt 2)
---

# Register en schakelaar per koppeling

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

De app registreert elke koppeling één keer (naam, hosts, kenmerken) en een admin met MFA of het script zet haar aan of uit;
uit geeft `UPSTREAM_UNAVAILABLE` zonder netwerkaanroep (ADR 0077 punt 2, 5 en 7; ST-15, bouwsteen M0). Geen nieuw ADR:
register, schakelaar en het lezen in de eerste `withUser` zijn in 0077 besloten; dit is de besluit-PR voor de migratie (punt 10).

## Rollen en wie wat ziet

Een gebruiker ziet alleen de foutcode. Lezen: elke actor, als boolean per naam. Zetten: admin met MFA, of `app_migrator`
zonder actor (script, OV-7); het scherm komt in M7.

## Datawijzigingen (met grants)

Eén migratie, vorm van `one_time_use`:

- **`app.integration_switches`** (`name text primary key`, check `^[a-z][a-z0-9-]*$` en lengte ≤ 63, `enabled boolean not
null`, `updated_at timestamptz not null default now()`); geen persoonsgegevens. RLS aan en `force`. Grants alleen
  `select, insert, update` aan `app_definer`; `app_authenticated`, `api_user`, `auth_service` en `PUBLIC` niets. Policies
  `integration_switches_definer_select`, `_insert`, `_update` (`to app_definer`, `true`); geen delete.
- **`app.integration_enabled(p_name text) returns boolean`**: security definer, `stable`, `search_path = ''`, eigenaar
  `app_definer`. Zonder `app.current_user_id()` 42501. Geen rij = `false`. Execute: `app_authenticated`. Catalogus: `client`.
- **`app.set_integration_enabled(p_name text, p_enabled boolean)`**: security definer. Zonder toegang 42501: alleen
  `app.is_mfa_admin()`, of `session_user = 'app_migrator'` zonder actor (vorm `app.assign_role`). Ongeldige naam 22023. Eerst
  `pg_advisory_xact_lock(pg_catalog.hashtext('app.integration_switches:' || p_name))`, dan de huidige stand (geen rij = `false`).
  Gelijk: niets schrijven, geen rij, geen auditregel. Anders upsert met `updated_at` en in dezelfde transactie een auditregel
  `core.integration.enable` of `core.integration.disable`, doeltype `integration`, doel-ID de naam, details `{}`. Execute:
  `app_authenticated`, `app_migrator` (OV-5). Catalogus: `client`.
- **`app.retention`**: `('app.integration_switches', null, null, 'app', 'configuratie per koppeling, geen persoonsgegevens')`.

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| — | geen nieuwe route | — | bestaand: `UPSTREAM_UNAVAILABLE` 503 |

**Register** (`src/core/api/integrations/`):

```ts
registerIntegrations(list: readonly IntegrationDef[]): Integrations; // bij opstart, gooit IntegrationConfigError
IntegrationDef = { name; hosts: readonly string[]; traits: { auth: 'none' | 'app-key' | 'app-oauth2' | 'on-behalf-of-user';
  direction: readonly ('read' | 'write' | 'callback')[]; cadence: readonly ('on-demand' | 'periodic' | 'push')[];
  sensitivity: 'normal' | 'personal-data' | 'money'; cost: 'free' | 'per-app' | 'per-user' | 'paid';
  source: 'partner' | 'app' | 'shared' } };
integrations.client(name, config: Omit<OutboundConfig, 'name' | 'hosts'>): IntegrationClient;
readSwitch(tx: Tx, name: string): Promise<SwitchReading>;
integrationClient.call(reading: SwitchReading, request: OutboundRequest): Promise<OutboundResult>;
```

- **Eén bron voor hosts.** `name` en `hosts` staan alleen in het register. `createOutboundClient` verhuist naar
  `src/core/api/outbound/create.ts`; dependency-cruiser weigert die module buiten `^src/core/api/` (fixture in
  `test/rails/depcruise.test.ts`). `index.ts` houdt `guardWithUser`, de foutklassen en de types; `OutboundClient` verandert niet.
- **Opstart** (`IntegrationConfigError`, melding noemt naam en regel): dubbele naam; naam buiten patroon of langer dan
  `INTEGRATION_NAME_MAX_LENGTH` (63, `limits.ts`); hosts volgens `OutboundConfig`; ontbrekend of onbekend kenmerk; een waarde
  zonder bouwsteen (OV-6). Nu toegestaan: `auth` `none`, `app-key`; `direction` `read`; `cadence` `on-demand`; `sensitivity`
  `normal`, `money`; `cost` en `source` vrij. Elke latere bouw-PR breidt de lijst uit. Ook `client` met een onbekende naam.
- **App**: `src/api/integrations/index.ts` exporteert het register (template: leeg), zonder bijwerking (geen env);
  `buildApp` geeft het als optie `integrations` aan `createApp`, voor de partnerstap (M2) en het beheer (M7).
- **Lezen** (OV-1). `readIntegrationSwitch(tx, name)` in `src/core/api/db` (vorm `createAuditFn`) roept
  `app.integration_enabled` aan. `readSwitch` in het register gebruikt hem, alleen onder de markering (binnen `withUser`;
  anders `OutboundUsageError`), en geeft een `SwitchReading` (naam, stand, `performance.now()`). Een lezing is
  alleen geldig als core haar maakte: een module-private `WeakSet`, dus `unsafeCast` werkt niet.
- **Volgorde in `IntegrationClient.call`**, telkens zonder aanroep: 1) onder de markering `OutboundForbiddenError`; 2) lezing
  ongeldig, van een andere koppeling of ouder dan `INTEGRATION_SWITCH_MAX_AGE_MS` (30 000, `limits.ts`) `OutboundUsageError`;
  3) stand uit `UPSTREAM_UNAVAILABLE` met één logregel `outcome: 'DISABLED'`, `attempt` 0, `status` null. Dan de gewone client.
- **Zetten zonder scherm**: `pnpm integration:switch --name <naam> --on|--off`, vorm van `scripts/admin-create.mjs`, met
  `MIGRATOR_DATABASE_URL`; weigert een naam buiten het register.

## Kopieer de vorm van

- `db/migrations/20261103160000_one_time_use.sql` — tabel zonder grants voor `app_authenticated`, definer-policies, retentierij.
- `db/tests/one_time_use.sql` — RLS, `policies_are`, grants per rol, functies.
- `src/core/api/db/audit.ts` — functie op `tx` die een databasefunctie aanroept.
- `scripts/admin-create.mjs` — script met `MIGRATOR_DATABASE_URL` en `app.assign_role`.
- `src/core/api/outbound/config.ts` — opstartcontrole met eigen foutklasse.

## Hergebruik en UX

n.v.t. — geen scherm; tekst van `UPSTREAM_UNAVAILABLE` bestaat.

## Acceptatiecriteria

Tegen de nep-partner; "geen aanroep" = teller 0.

- **koppelingsregister/AC-1** — Gegeven een register met dubbele naam, ongeldige of te lange naam, host met `*`, ontbrekend
  kenmerk, `direction: ['write']` of `sensitivity: 'personal-data'`, dan `IntegrationConfigError`; `client('onbekend', …)` ook.
- **koppelingsregister/AC-2** — Gegeven stand uit, dan geeft `call` `UPSTREAM_UNAVAILABLE` zonder aanroep met één logregel
  `DISABLED`; een testroute van `createApp` die die fout teruggeeft, antwoordt 503 met precies `{ code, requestId }`.
- **koppelingsregister/AC-3** — Gegeven geen rij, dan `app.integration_enabled` `false` en de client geen aanroep.
- **koppelingsregister/AC-4** — Gegeven aan, daarna uit via het script, dan doet een nieuwe lezing plus `call` geen aanroep.
- **koppelingsregister/AC-5** — Gegeven een lezing van een andere koppeling, ouder dan de grens, of een nagemaakt object, dan
  `OutboundUsageError`; onder de markering eerst `OutboundForbiddenError`, ook met een lezing die uit staat. Geen aanroep.
- **koppelingsregister/AC-6** — `set_integration_enabled` als gewone gebruiker of admin zonder MFA: 42501; als admin met MFA of
  `app_migrator`: precies één auditregel per echte wijziging, geen (en geen rij) bij `false` zonder rij.
- **koppelingsregister/AC-7** — `integration_enabled` zonder actor: 42501. Beide functies met naam `A`, `a_b` of 64 tekens: 22023.
- **koppelingsregister/AC-8** — `app_authenticated`, `api_user`, `auth_service` en `PUBLIC` hebben geen recht op de tabel;
  `app_definer` precies select, insert, update. Elke policy een pgTAP-test op naam; retentierij en beide functies in de catalogus.
- **koppelingsregister/AC-9** — Twee gelijktijdige `set_integration_enabled(x, true)` zonder rij: één rij, één auditregel.
- **koppelingsregister/AC-10** — Het script met een onbekende naam stopt met een melding, zonder databasewijziging.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Rij voor een naam die niet (meer) geregistreerd is | genegeerd | — |
| Lezing aan, daarna uit gezet | aanroepen met die lezing gaan nog tot de grens (OV-3) | — |

## Raakt ook

- Checks: `check:migrations`, `check:secdef`, `test:db` (pgTAP, `check-policies`, `db/tests/functies.sql`), `check:snapshot`
  (`pnpm db:generate`); niet `test/security/resources.ts` of permissietests (geen route).
- Code: `src/core/api/db/index.ts` (export erbij), `src/core/api/outbound/` (`create.ts`, outcome `DISABLED`),
  `src/core/api/http/create-app.ts` (optie), `src/core/shared/limits.ts` (twee grenzen, test gelijk aan de CHECK),
  `src/api/integrations/index.ts`, `src/api/app.ts`.
- Hoofdsessie (gate-paden): `.dependency-cruiser.mjs`, `scripts/`, `package.json`, `eslint.config.js` (melding van
  `rails/netwerk-api` wijst naar `integrations.client` i.p.v. `createOutboundClient`) met `test/rails/eslint-netwerk.test.ts`;
  R-LAAG-06 in `docs/framework.md` en `AGENTS.md` (export `readIntegrationSwitch`); R-DB-16 (`core.integration.*`).
- Docs die anders onwaar worden (R-WERK-15): `docs/specs/uitgaande-client.md` ("per koppeling één client" via het register;
  `attempt` 0 bij `DISABLED`), `docs/specs/geheimen-in-env.md` (voorbeeld met `createOutboundClient`),
  `docs/specs/netwerk-en-geheim-rails.md` AC-14 (melding), `docs/roadmap.md` ST-15 "Gebouwd:".

## Buiten scope

Scherm en permissie (M7), partnerstap (M2), check per koppelingsmap (M3), feiten (M8). De runner heeft geen actor: ST-03 krijgt
een eigen `job`-functie met migratie.

## Testplan

- **Unit**: register (AC-1), lezing en volgorde in de client met nep-partner (AC-2, AC-5), grens gelijk aan de CHECK.
- **Integratie** (`*.int.test.ts`): lezen in echte `withUser`, script (AC-4, AC-10), testroute via `createApp` (AC-2), race met
  twee verbindingen (AC-9, R-TEST-03).
- **pgTAP** `db/tests/integration_switches.sql`: AC-3, AC-6 t/m AC-8; fixture in `test/rails/depcruise.test.ts`.

## Open vragen

- **OV-1** — Waar lezen? Aanbeveling: `readIntegrationSwitch` in `src/core/api/db` (kritiek pad, past in deze besluit-PR);
  elders mag geen SQL (`database-alleen-in-core-db`). Geen cache: één indexlezing in een transactie die er al is, gelijk over processen.
- **OV-2** — Ontbrekende rij? Aanbeveling: uit (fail-closed); een nieuwe koppeling gaat pas aan na een expliciete zet.
- **OV-3** — Geldigheid van een lezing? Aanbeveling: 30 s; één aanroep duurt hooguit 20 s (`OUTBOUND_BUDGET_MAX_MS`).
- **OV-4** — Audit door de core-functie zelf (vorm `set_account_blocked`) i.p.v. een registratiemechanisme (0077 punt 5)?
  Aanbeveling: ja, alleen voor deze actie; het algemene mechanisme blijft voor M7.
- **OV-5** — Admin-tak en grant voor `app_authenticated` nu al? Alleen `app_migrator` geeft het kleinste aanvalsoppervlak, maar
  M7 vraagt dan een migratie en besluit-PR. Aanbeveling: nu al, met `is_mfa_admin()` en pgTAP op beide takken.
- **OV-6** — Waarde zonder bouwsteen weigeren? Aanbeveling: ja (0077 punt 1); `personal-data` tot ST-05 er is.
- **OV-7** — Het script als tweede weg naast de admin met MFA (0077 punt 5)? Aanbeveling: ja, zoals `admin:create`: wie
  `MIGRATOR_DATABASE_URL` heeft, kan al alles; de auditregel draagt `db_role` `app_migrator`. Zonder scherm is het de enige weg.
- **OV-8** — Script in `package.json` (`altijdVragen`)? Aanbeveling: ja, zoals `admin:create`.
