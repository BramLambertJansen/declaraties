# 0021 — Audit log van admin-acties in core

Status: vervangen door 0051

## Context

Roadmap (Beslissingen) vraagt of een audit log van admin-acties standaard in core komt, in plaats van "op aanleiding" (framework §12).
Wat de repo nu laat zien en het ontwerp bepaalt:

1. **Admin-acties lopen langs twee wegen.** Rol toekennen gaat via `app.assign_role` (security definer van `app_definer`) in de
   transactie van `withUser()`. Uitnodigen, opnieuw uitnodigen en (spec `accountbeheer-uitbreiding`, PR #77) intrekken en resetlink
   lopen via Better Auth (`ctx.services.invitations`) over een **eigen verbinding** als `auth_service`, buiten die transactie.
   Bij uitnodigen bestaat het account-ID pas na `createUser`; de route krijgt het in de `beforeMail`-callback van `inviteUser`.
   Blokkeren wordt `app.set_account_blocked` (security definer, PR #77). De spec wacht op dit besluit: "elke route krijgt een audit-regel".
2. **Nu herleidbaar is alleen de request-log** (`src/core/api/obs/request-log.ts`): `requestId`, gebruiker-ID, route, status, op stdout.
   Daarin staat niet wát er met wie gebeurde, en de bewaartijd hangt af van de host. De `requestId` komt van Hono's `requestId()`,
   dat een geldige `X-Request-Id` van de client overneemt: een client kan dus een ID kiezen of hergebruiken.
3. **`app_migrator` is eigenaar** van elke tabel en lid van `app_definer`. Een eigenaar kan triggers uitzetten, de tabel wijzigen of
   verwijderen; FORCE RLS houdt hem niet tegen. Als lid van `app_definer` valt hij bovendien onder elke policy `to app_definer`.
   Binnen één database zonder superuser is "onwijzigbaar" dus nooit absoluut.
4. Scripts (`pnpm admin:create`, seed) kennen rollen toe als `app_migrator` zonder actor (`app.assign_role`, uitzondering zonder actor).

## Besluit (voorstel)

1. **Tabel `app.audit_log`**, append-only, RLS aan en geforceerd:
   `id bigint generated always as identity`, `at timestamptz not null default pg_catalog.now()`, `actor_id text` (null = script of taak),
   `db_role text not null default session_user`, `action text not null` (patroon `^[a-z]+(\.[a-z_]+)+$`), `target_type text`
   (patroon `^[a-z_]+$`), `target_id text` (patroon `^[A-Za-z0-9_.:-]{1,128}$`), `request_id text`, `details jsonb not null default '{}'`
   (CHECK: object, hooguit 2 KB). Geen foreign keys naar `better_auth."user"`: een verwijderd account laat zijn ID staan (ADR 0022).
   **Vocabulaire van `target_type`**: core gebruikt alleen `account` (een ID uit `better_auth."user"`). Een app registreert eigen
   doeltypen samen met zijn acties (punt 5); `account` is voor core.
2. **Geen PII buiten ID's.** Geen naam, e-mail, IP of vrije tekst; `details` alleen ID's en enum-waarden (bijv.
   `{ "role": "admin", "previous": "user" }`). De TypeScript-kant (punt 5) valideert `details` per actie met zod; de CHECK begrenst de omvang, het patroon
   op `target_id` houdt er een e-mailadres of vrije tekst uit (`@` en spaties passen niet).
3. **Schrijven in dezelfde transactie als de actie**, alleen via functies van `app_definer`.
   - Core-acties in de database (`core.role.assign`, `core.account.block`, `core.account.unblock`, `core.account.delete`) schrijft de
     security definer-functie zelf, in dezelfde body als de wijziging. Ook een script als `app_migrator` laat zo een regel achter
     (`actor_id` null, `db_role` = `app_migrator`).
   - Acties via Better Auth (`core.account.invite`, `.reinvite`, `.revoke`, `.reset_link`) schrijft de route met
     `app.audit_account_action(action, target_id)` (security definer, klasse `client`): eist `app.is_mfa_admin()` (anders 42501),
     accepteert alleen deze vier acties (allowlist in de functie), zet `target_type` vast op `account` en `actor_id` op
     `app.current_user_id()`. Bij uitnodigen roept de route hem aan in de `beforeMail`-callback (na `createUser`, in de transactie
     van de route), naast `app.assign_role`; bij de andere acties vóór de aanroep van de service. Met de outbox (ADR 0020) zet de
     route de mail in dezelfde transactie: auditregel en mail committen samen.
   - `app.audit(action, target_type, target_id, details)` (security definer, klasse `client`) is voor app-acties. Wat hij afdwingt:
     `actor_id` is altijd `app.current_user_id()` (null → 42501), een actie die met `core.` begint of `target_type` `account` wordt
     geweigerd, en de patronen en de omvang van punt 1. Wat hij **niet** afdwingt: dat de actie echt gebeurde, of dat het doel
     bestaat of van de actor is. Dat bewaakt de route: alleen server-code roept hem aan (de browser heeft geen databaseclient), via
     `ctx.audit` met een geregistreerde actie en zod-gevalideerde `details`.
4. **`requestId` in de database.** `withUser()` zet ook `app.request_id` met `set_config(…, true)` (alleen in `src/core/api/db`);
   `app.request_id()` leest hem. Zo koppelt een auditregel aan de regel in de request-log. **Voorwaarde** (wordt los gebouwd, ADR 0020
   Bouwvolgorde stap 1): de `requestId` is server-gegenereerd; een `X-Request-Id` van de client wordt niet overgenomen, dus de
   request-log en de audit log gebruiken dezelfde, niet door de client gekozen ID.
5. **Een app registreert eigen acties zonder core te wijzigen** (ADR 0008), zoals foutcodes: `src/shared/audit.ts` doet
   `defineAuditActions({ 'invoice.approve': { target: 'invoice', details: z.object({ … }) } })`; de route kit geeft handlers
   `ctx.audit(action, targetId, details)`, getypt op die sleutels, dat `app.audit` in de eigen `tx` aanroept. Een app-functie van
   `app_definer` mag ook rechtstreeks `app.audit` aanroepen. Een app-actie heeft nooit het voorvoegsel `core.`.
6. **Append-only afgedwongen** met triggers van `app_definer`: `before update` en `before truncate` falen altijd; `before delete` faalt
   tenzij de rij ouder is dan de bewaartermijn (punt 7). Dat geldt ook voor de eigenaar `app_migrator` bij gewone DML.
   **Policy-allowlist** (exact deze, de invariant faalt bij elke andere):
   - `audit_log_definer_insert`: `for insert to app_definer` (de schrijvende functies);
   - `audit_log_select_admin`: `for select to app_authenticated using ((select app.is_mfa_admin()))`;
   - `audit_log_definer_select`: `for select to app_definer` (export, ADR 0022, en het lezen dat `delete … where` nodig heeft);
   - `audit_log_definer_delete`: `for delete to app_definer using (at < app.retention_cutoff('app.audit_log'))` (opruimen, ADR 0022).
   Grants: `insert, select, delete` aan `app_definer`, `select` aan `app_authenticated`; niets anders.
   **Wat dit niet tegenhoudt** (context 3): `app_migrator` kan als lid van `app_definer` via `audit_log_definer_insert` rechtstreeks een
   regel invoegen, ook met een verzonnen `actor_id`, en als eigenaar triggers uitzetten of de tabel wijzigen. Daartegen: een invariant
   in pgTAP eist dat de triggers bestaan en aan staan en dat policies en grants exact de allowlist zijn, en `db/migrations/` is een
   beschermd pad met review van de eigenaar. `db_role` laat zien dat een regel van `app_migrator` komt.
7. **Bewaartermijn** via het mechanisme van ADR 0022: `app.audit_log` staat in de bewaarcatalogus met standaard 1 jaar (OV-5); de
   opruimtaak (ADR 0020) verwijdert verlopen rijen via `app.purge_expired`. Een pgTAP-test eist dat `keep` voor `app.audit_log` niet
   null is en minstens 1 jaar: een app mag verlengen; verkorten wijzigt die test en vraagt dus review van de eigenaar.
8. **Lezen** alleen voor een admin met MFA: policy `audit_log_select_admin`. Namen tonen gebeurt bij het lezen (join op
   `app.accounts`); een verwijderd account toont "verwijderd account". Geen scherm in deze stap (OV-6). De export van een gebruiker
   (ADR 0022) leest zijn regels via een definer-functie.
9. **Buiten scope**: lees-acties ("wie bekeek wat"), inloggen en mislukte pogingen (Better Auth, rate limit), en export naar een
   externe, onwijzigbare opslag (per app, OV-3).

## Tests

- **pgTAP**: per policy een test op naam; `insert`, `update`, `delete` en `truncate` falen voor `app_authenticated`, `api_user`,
  `auth_service` en `app_jobs`; `update` en `truncate` falen ook als `app_migrator` en `app_definer`; `delete` van een rij binnen de
  termijn faalt voor iedereen; de invariant op triggers, policies en grants met een opzettelijke fout; `keep` van de audit log ≥ 1 jaar;
  `app.assign_role` schrijft precies één regel met actor, `db_role` en `request_id`; teruggedraaide actie laat geen regel;
  `app.audit` weigert `core.*`, `target_type` `account`, een lege actor, een `target_id` met `@` of spatie en > 2 KB `details`;
  `app.audit_account_action` weigert een `user`, een admin zonder MFA en een actie buiten de allowlist; een `user` ziet geen regels,
  een admin zonder MFA ook niet. Functiecatalogus: `app.audit` en `app.audit_account_action` `client`, triggerfuncties `intern`.
- **Integratie** (`pnpm test:db`): uitnodigen schrijft `core.account.invite` (doel: het nieuwe account) met de `request_id` van de
  response; een falende service (bijv. `ALREADY_EXISTS`) laat geen regel achter; een mail die later in de worker faalt, laat de regel
  staan (de uitnodiging gebeurde; de outbox toont de mislukte verzending); een `X-Request-Id` van de client komt niet in de regel;
  `ctx.audit` met een niet-geregistreerde actie compileert niet (type-test) en faalt bij zod.

## Alternatieven

- **Triggers op de gewijzigde tabellen** (generiek: oude en nieuwe rij als JSON). Vangt elk pad, ook cascades, maar logt PII mee, kent
  de bedoeling niet (uitnodigen of rol wijzigen) en werkt niet voor acties in `better_auth` via `auth_service`.
- **Alleen de request-log uitbreiden.** Niet in dezelfde transactie, bewaartijd per host, en wat er gebeurde staat er niet in.
- **Op aanleiding houden** (framework §12). Dan bouwt elke app het opnieuw, en PR #77 heeft het nu al nodig.
- **Eigen tabeleigenaar zonder `app_migrator`.** Kan niet zonder rol buiten migraties; `app_migrator` is lid van `app_definer`.
- **Core-acties via `app.audit` met een uitzondering voor `core.account.*`.** Dan kan elke ingelogde route een core-actie schrijven;
  een aparte functie met MFA-admin-eis en vaste allowlist is smaller.

## Gevolgen

- Migratie voor tabel, triggers, `app.audit`, `app.audit_account_action`, `app.request_id()` en aanpassing van `app.assign_role`
  (`create or replace`).
- `withUser()` krijgt de `requestId` mee; `createRouteKit` krijgt de auditacties van de app; `ctx.audit` in core.
- Framework §6 (audit log, invariant) en §12 (rij "Audit log" weg) wijzigen: beschermd, akkoord van de eigenaar.
- De routes uit spec `accountbeheer-uitbreiding` krijgen elk een auditregel; dat staat in de spec vóór `goedgekeurd`.
- Bouwvolgorde: ADR 0020, sectie Bouwvolgorde (stap 1–4).

## Open punten (agent, 2026-10-11: elk punt besloten volgens de aanbeveling)

- **OV-1 — Standaard in core of op aanleiding.** Aanbeveling: in core, nu; PR #77 heeft het nodig en achteraf toevoegen mist de oude acties.
- **OV-2 — Schrijfwijze.** (a) expliciet in definer-functies en via `app.audit`/`ctx.audit`; (b) generieke triggers. Aanbeveling: (a).
- **OV-3 — Bescherming tegen de eigenaar.** Triggers + invariant + review van migraties (punt 6) erkennen dat `app_migrator` het kan
  omzeilen. Echte onwijzigbaarheid vraagt export naar externe opslag: per app, bij een wettelijke eis. Aanbeveling: zo.
- **OV-4 — Velden.** Alleen ID's en enum-waarden in `details`, zod per actie, hooguit 2 KB. Aanbeveling: zo; geen e-mail van de genodigde.
- **OV-5 — Standaardtermijn.** 1 jaar, per app te verlengen in de bewaarcatalogus (ADR 0022). Aanbeveling: 1 jaar.
- **OV-6 — Scherm voor admins.** Aanbeveling: niet in deze stap; later `/admin/audit` via een eigen spec op het lijstpatroon (PR #77).
- **OV-7 — Gat bij Better Auth-acties.** Na de correcties (A1, A3) zijn opnieuw uitnodigen, resetlink en verwijderen atomair: de
  auditregel, de mail in de outbox en (bij verwijderen) de verwijdering zitten in één transactie. Er blijft één gat: bij uitnodigen
  maakt `auth_service` het account vóór de commit van de route; faalt die commit, dan bestaat een account zonder rol en zonder regel
  (zeldzaam, zichtbaar in de request-log met status 500). Intrekken valt eronder tenzij de spec het bouwt als verwijderen van een
  uitgenodigd account via `app.delete_account` (ADR 0022). Aanbeveling: accepteren en noemen.

## Correcties na review (2026-10-11)

- **Core-auditregels voor Better Auth-acties** (A2): nieuwe functie `app.audit_account_action(action, target_id)`, klasse `client`,
  eist `app.is_mfa_admin()`, allowlist van de vier `core.account.*`-acties, `target_type` vast `account`; bij uitnodigen in de
  `beforeMail`-callback (punt 3). Was: de route schrijft via een niet-gespecificeerde weg, terwijl `app.audit` `core.*` weigert.
- **`requestId` van de server** (B3): niet langer overgenomen van de client; voorwaarde, los gebouwd (punt 4, context 2).
- **Test bij mislukte mail** (C1): met de outbox blijft de auditregel staan als de mail later faalt (Tests).
- **Policy-allowlist en vocabulaire** (C2): vier policies en de grants vastgelegd, `target_type` `account` voor core (punt 1, 6).
- **Eerlijk over `app.audit`** (C3): hij dwingt actor, voorvoegsel, patroon en omvang af, niet de waarheid van de inhoud; patroon en
  lengte op `target_id` (punt 1, 3). Was: "een gebruiker kan alleen over zichzelf schrijven".
- **`app_migrator` kan rechtstreeks invoegen** (C4): erkend in punt 6; pgTAP eist `keep` ≥ 1 jaar (punt 7).
- **OV-7** bijgewerkt: het gat geldt nog alleen voor het aanmaken bij uitnodigen (en intrekken, afhankelijk van de spec).
