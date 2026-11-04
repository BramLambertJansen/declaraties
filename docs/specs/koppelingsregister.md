---
status: goedgekeurd # voorstel | goedgekeurd | gebouwd | vervallen (ADR 0046, 0062)
namespace: koppelingsregister
model: opus
modelreden: nieuwe tabel en security definer-functies (ADR 0062 punt 2) en een gewijzigd core-contract van de uitgaande client
---

# Register en schakelaar per koppeling

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

De app registreert elke koppeling één keer (naam, hosts, kenmerken) en een admin met MFA of een script zet haar aan of uit; uit geeft
`UPSTREAM_UNAVAILABLE` zonder netwerkaanroep (ADR 0077 punt 2, 5 en 7; ST-15, bouwsteen M0). Geen nieuw ADR: register,
schakelaar en het lezen in de eerste `withUser` zijn in 0077 besloten; deze spec is de besluit-PR voor de migratie (punt 10).

## Rollen en wie wat ziet

Een gebruiker ziet alleen de foutcode. Lezen: elke actor, als boolean per naam. Zetten: admin met MFA, of `app_migrator`
zonder actor (script); het scherm komt in M7.

## Datawijzigingen (met grants)

Eén migratie, vorm van `one_time_use`:

- **`app.integration_switches`** (`name text primary key` met `^[a-z][a-z0-9-]{0,62}$`, `enabled boolean not null`,
  `updated_at timestamptz not null default now()`); geen persoonsgegevens. RLS aan en `force`. Grants alleen aan `app_definer`
  (select, insert, update); `app_authenticated` en `PUBLIC` niets. Policies `integration_switches_definer_select`, `_insert`,
  `_update` (`to app_definer`, `true`); geen delete. De actorcontrole zit in de functies.
- **`app.integration_enabled(p_name text) returns boolean`**: security definer, `stable`, `search_path = ''`, eigenaar
  `app_definer`. Zonder `app.current_user_id()` 42501. Geen rij = `false`. Execute: `app_authenticated`. Catalogus: `client`.
- **`app.set_integration_enabled(p_name text, p_enabled boolean)`**: security definer, toegang als `app.assign_role`
  (`app.is_mfa_admin()`, of `session_user = 'app_migrator'` zonder actor), anders 42501; naam buiten het patroon 22023. Upsert;
  alleen bij een echte wijziging `updated_at` en een auditregel in dezelfde transactie: `core.integration.enable` of
  `core.integration.disable`, doeltype `integration`, doel-ID de naam, details `{}`. Execute: `app_authenticated`, `app_migrator`.
  Catalogus: `client`.
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
readSwitch(tx: Tx, integration: string): Promise<SwitchReading>; // alleen binnen withUser
client.call(reading: SwitchReading, request: OutboundRequest): Promise<OutboundResult>;
```

- **Eén bron voor hosts.** `name` en `hosts` staan alleen in het register; `integrations.client` maakt de uitgaande client daaruit.
  `createOutboundClient` blijft core-intern; dependency-cruiser weigert een import buiten `src/core/api/` (hoofdsessie).
- **Opstart** (`IntegrationConfigError`, melding noemt naam en regel): dubbele of ongeldige naam; hosts volgens de regels van
  `OutboundConfig`; ontbrekend of onbekend kenmerk; een kenmerkwaarde waarvan de bouwsteen nog niet bestaat (nu toegestaan: `none`,
  `app-key`, `read`, `on-demand`; elke latere bouw-PR breidt de lijst uit); `client` met een naam buiten het register.
- **App**: `src/api/integrations/index.ts` exporteert het register (template: leeg); `buildApp` geeft het als `integrations` aan
  `createApp` door, voor de partnerstap (M2) en het beheer (M7).
- **Schakelaar lezen.** `readSwitch` roept `app.integration_enabled` aan in een transactie die er al is: de eerste `withUser` van
  de partnerstap (0077 punt 7), later de claim van de runner. `SwitchReading` (naam, stand, leestijd) kan alleen core maken. De
  client controleert vóór elke aanroep: andere naam of ouder dan `INTEGRATION_SWITCH_MAX_AGE_MS` (30 000, `limits.ts`) geeft
  `OutboundUsageError`; stand uit geeft `UPSTREAM_UNAVAILABLE` met één logregel (`attempt` 0, `status` null). Telkens geen aanroep.
- **Zetten zonder scherm**: `pnpm integration:switch --name <naam> --on|--off`, vorm van `scripts/admin-create.mjs`, met
  `MIGRATOR_DATABASE_URL`; weigert een naam buiten het register.

## Kopieer de vorm van

- `db/migrations/20261103160000_one_time_use.sql` — tabel zonder grants voor `app_authenticated`, definer-policies, retentierij.
- `db/tests/one_time_use.sql` — RLS, `policies_are`, grants per rol, functies.
- `scripts/admin-create.mjs` — script met `MIGRATOR_DATABASE_URL` en `app.assign_role`.
- `src/core/api/outbound/config.ts` — opstartcontrole met eigen foutklasse.

## Hergebruik en UX

n.v.t. — geen scherm; tekst van `UPSTREAM_UNAVAILABLE` bestaat.

## Acceptatiecriteria

Tegen de nep-partner; "geen aanroep" = teller 0.

- **koppelingsregister/AC-1** — Gegeven een register met dubbele naam, ongeldige naam, host met `*`, ontbrekend kenmerk of
  `direction: ['write']`, dan `IntegrationConfigError` bij opstart; `client('onbekend', …)` ook.
- **koppelingsregister/AC-2** — Gegeven stand uit, dan geeft `call` `UPSTREAM_UNAVAILABLE` zonder aanroep; via `createApp` 503 met
  precies `{ code, requestId }`.
- **koppelingsregister/AC-3** — Gegeven geen rij, dan `app.integration_enabled` `false` en de client geen aanroep.
- **koppelingsregister/AC-4** — Gegeven aan, daarna uit via het script, dan doet een nieuwe `readSwitch` plus `call` geen aanroep.
- **koppelingsregister/AC-5** — Gegeven een lezing van een andere koppeling of ouder dan de grens, dan `OutboundUsageError`
  zonder aanroep.
- **koppelingsregister/AC-6** — `set_integration_enabled` als gewone gebruiker of admin zonder MFA geeft 42501; als admin met
  MFA of `app_migrator` precies één auditregel per echte wijziging, geen bij gelijke stand.
- **koppelingsregister/AC-7** — `app_authenticated` kan de tabel niet lezen of schrijven; elke policy heeft een pgTAP-test op
  naam; de retentierij en beide functies staan in de catalogus.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Rij voor een naam die niet (meer) geregistreerd is | genegeerd | — |
| Twee wijzigingen tegelijk | rijslot; één auditregel per echte wijziging | — |
| Lezing aan, daarna uit gezet | aanroepen met die lezing gaan nog tot de grens (OV-3) | — |

## Raakt ook

`check:migrations`, `check:secdef`, `test:db` (pgTAP, `check-policies`, `db/tests/functies.sql`), `check:snapshot`
(`pnpm db:generate`); `src/core/api/outbound` (aanroep met lezing; bestaande tests mee, reden: deze spec); `limits.ts`;
`src/api/integrations/index.ts`, `src/api/app.ts`; `.dependency-cruiser.mjs`, `scripts/`, `package.json` (gate-paden,
hoofdsessie); framework R-DB-16 (core-actie `core.integration.*`); niet: `test/security/resources.ts`, permissietests.

## Buiten scope

Scherm en permissie (M7), partnerstap (M2), lezen door de runner (ST-03), check per koppelingsmap (M3), feiten (M8).

## Testplan

- **Unit**: register-opstartfouten (AC-1), lezing en client met nep-partner (AC-2, AC-5).
- **Integratie** (`*.int.test.ts`): `readSwitch` in echte `withUser`, script, route via `createApp` (AC-2 t/m AC-4, AC-6).
- **pgTAP** `db/tests/integration_switches.sql`: AC-6, AC-7.

## Open vragen

- **OV-1** — Cache of lezen? Aanbeveling: lezen in de transactie die er al is, geen cache: één indexlezing, gelijk over
  processen; zelf lezen kan de client niet zonder actor of een wijziging in `src/core/api/db`.
- **OV-2** — Ontbrekende rij? Aanbeveling: uit (fail-closed); een nieuwe koppeling gaat pas aan na het script.
- **OV-3** — Geldigheid van een lezing? Aanbeveling: 30 s; begrenst hoe lang uit doorwerkt, laat een paar aanroepen toe.
- **OV-4** — Audit door een core-functie zelf (vorm `set_account_blocked`) i.p.v. een registratiemechanisme (0077 punt 5)?
  Aanbeveling: ja, alleen voor deze actie; het algemene mechanisme blijft voor M7.
- **OV-5** — Admin-tak en grant voor `app_authenticated` nu al? Aanbeveling: ja, dan vraagt M7 geen migratie.
- **OV-6** — Kenmerk zonder bouwsteen weigeren bij opstart? Aanbeveling: ja, maakt 0077 punt 1 afdwingbaar.
- **OV-7** — Scriptnaam in `package.json` (`altijdVragen`)? Aanbeveling: ja, zoals `admin:create`.
