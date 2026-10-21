# 0051 — Audit log en AVG: inzage, verwijderen en bewaartermijnen

Status: geaccepteerd

Vervangt [0021](0021-audit-log.md) en [0022](0022-avg.md). Drempel: A4. Consolidatie met de correcties op 0021 en 0022 uit
[0036](0036-achtergrondtaken-correcties.md) punt 4–5 (eigenaarbesluit 2026-10-21, [0038](0038-beslisroute.md) Gevolgen).

## Context

0021 en 0022 zijn op 2026-10-11 door de agent geaccepteerd onder mandaat van de eigenaar, ter herziening; de eigenaar koos
"zelfde besluiten, compact". 0036 punt 4 volgt uit een eigenaarbesluit van 2026-10-19, punt 5 uit wat PostgreSQL doet.

Admin-acties lopen langs twee wegen: via security definer-functies in de transactie van `withUser()`, en via Better Auth op een
eigen verbinding als `auth_service`. De request-log zegt niet wát er met wie gebeurde. `app_migrator` is eigenaar van elke tabel en
lid van `app_definer`; binnen één database zonder superuser is "onwijzigbaar" nooit absoluut. Persoonsgegevens staan in
`better_auth`, `public.user_roles`, de audit log en de mail-outbox. De template levert voor de AVG het mechanisme; de inhoud is
per app.

## Besluit

**Audit log**

1. **`app.audit_log`, append-only** (was 0021 punt 1–2). RLS aan en geforceerd; tijd, `actor_id` (null = script of taak),
   `db_role`, `action`, `target_type`, `target_id`, `request_id` en `details`. Geen foreign key naar `better_auth."user"`. Geen
   PII buiten ID's: `details` alleen ID's en enum-waarden (zod per actie, CHECK op object en hooguit 2 KB), patronen op actie,
   doeltype en `target_id` houden e-mail en vrije tekst eruit. Core gebruikt alleen doeltype `account`.
2. **Schrijven in dezelfde transactie als de actie** (was 0021 punt 3). Core-acties in de database schrijft de definer-functie
   zelf, ook voor scripts als `app_migrator`. Acties via Better Auth schrijft de route met `app.audit_account_action` (eist
   `app.is_mfa_admin()`, vaste allowlist, doeltype `account`). App-acties gaan via `app.audit`: dwingt actor, geen `core.`-voorvoegsel,
   geen doeltype `account`, patronen en omvang af, niet de waarheid van de inhoud; die bewaakt de route via `ctx.audit`.
3. **`requestId` van de server, ook in de database** (was 0021 punt 4). `withUser()` zet `app.request_id`; een `X-Request-Id` van
   de client wordt niet overgenomen.
4. **App-acties registreren zonder core te wijzigen** (was 0021 punt 5): `defineAuditActions` in `src/shared/audit.ts`, getypt
   `ctx.audit(action, targetId, details)`; een app-actie begint nooit met `core.`.
5. **Afgedwongen met triggers, policies en een invariant** (was 0021 punt 6, gecorrigeerd door 0036 punt 5). `update` en
   `truncate` falen altijd. Policies exact: insert, select en delete `to app_definer` (delete alleen voor rijen ouder dan de
   termijn) en select voor een admin met MFA; grants `insert, select, delete` aan `app_definer`, `select` aan
   `app_authenticated`. Onder FORCE RLS filtert de delete-policy een rij binnen de termijn weg: een `delete` door `app_definer` of
   `app_migrator` slaagt met 0 rijen; de trigger weigert alleen wie RLS omzeilt. Een rij binnen de termijn verdwijnt dus niet.
   Erkend: `app_migrator` kan rechtstreeks invoegen of als eigenaar triggers uitzetten; daartegen een pgTAP-invariant op
   triggers, policies en grants, review van migraties, en `db_role` in elke regel.
6. **Termijn minstens 1 jaar** (was 0021 punt 7): een app mag verlengen; verkorten wijzigt een test en vraagt review.
7. **Lezen** alleen voor een admin met MFA (was 0021 punt 8); namen bij het lezen, een verwijderd account toont "verwijderd
   account". Geen scherm in de template; een later `/admin/audit` krijgt een eigen spec (was 0021 OV-6).
8. **Buiten scope** (was 0021 punt 9): lees-acties, inloggen en mislukte pogingen, export naar externe onwijzigbare opslag.
9. **Aanvaard gat** (was 0021 OV-7): bij uitnodigen maakt `auth_service` het account vóór de commit van de route; faalt die
   commit, dan bestaat een account zonder rol en zonder regel.

**AVG**

10. **Inzage en overdraagbaarheid** (was 0022 punt 1). `GET /api/me/export` geeft de eigen gegevens uit core, via definer-functies
    die alleen rijen van `app.current_user_id()` geven, met het ID van een andere actor gemaskeerd. Een app registreert exporters
    via `createApp({ privacy })`; een exporter filtert expliciet op eigenaar, niet alleen via RLS.
11. **Verwijderen** (was 0022 punt 2). Een admin met MFA verwijdert een account met `app.delete_account(id)` in één
    `withUser()`-transactie: niet het eigen account (`CANNOT_DELETE_SELF`), laatste-admin-lock, auditregel, de links in
    `verification`, dan `better_auth."user"` met zijn cascades, dan de verwijderaars van de app (alleen voor data zonder foreign
    key). Daarvoor krijgt `app_definer` de benodigde rechten op `better_auth`. Echt verwijderen, geen anonimiseren in
    `better_auth` (was 0022 OV-3).
12. **Elke verwijzing kiest** (was 0022 punt 3): een invariant eist `on delete cascade` of `set null` (op een nullable kolom) voor
    elke foreign key naar `better_auth."user"`.
13. **Audit log na verwijderen** (was 0022 punt 4): regels blijven met het oude ID tot hun termijn; niet herschrijven.
14. **Bewaarcatalogus `app.retention`** (was 0022 punt 5, gecorrigeerd door 0036 punt 4). Per tabel tijdkolom, termijn (null =
    zolang het account bestaat), opruimer (`app` of `auth`) en reden. Een invariant eist een rij voor elke tabel in `public` en
    `app` (behalve `public.schema_migrations`). Alleen `app_definer` leest de tabel; `app_jobs` krijgt via
    `app.retention_targets()` (klasse `job`) de tabellen die hij moet opruimen. `app.retention_cutoff(regclass)` geeft de grens
    voor policies en triggers; `app.purge_expired` (klasse `job`) verwijdert alleen verlopen rijen van tabellen met opruimer
    `app`. `better_auth` staat erin met opruimer `auth` ([0050](0050-achtergrondtaken-en-mail-outbox.md)). Standaarden: audit
    log 1 jaar, mail-outbox 30 dagen, `user_roles` met het account.
15. **Register en documentatie per app** (was 0022 punt 6–8). De template levert een sjabloon voor het verwerkingsregister; de
    termijnen komen uit `app.retention`. Logging blijft zonder PII. Grondslag, privacyverklaring, DPIA, verwerkers, regio,
    back-up-termijn, eigen termijnen, inactieve accounts en wie een verzoek beantwoordt, zijn per app. Alleen de functionele
    sessiecookie; meer cookies vragen een eigen ADR.

## Alternatieven

- **Generieke triggers op de gewijzigde tabellen** (was 0021): logt PII, kent de bedoeling niet, mist acties via `auth_service`.
- **Alleen de request-log uitbreiden** of **op aanleiding houden** (was 0021): niet in de transactie, of elke app bouwt het opnieuw.
- **Core-acties via `app.audit` met een uitzondering** (was 0021): dan kan elke route een core-actie schrijven.
- **Alles per app** (was 0022): elke app vergeet een tabel; de catalogus vangt dat.
- **Soft delete** (was 0022): geen verwijdering in de zin van art. 17.
- **Termijn als commentaar of in docs** (was 0022): niet af te dwingen.
- **Verwijderen via de service als `auth_service`** (was 0022): deadlock op de laatste-admin-lock en niet atomair.
- **`select` op `app.retention` aan `app_jobs`** (was 0036): `app_jobs` houdt dan een tabelrecht.

## Gevolgen

- Het generator-template voegt een rij in `app.retention` toe; elke app-tabel krijgt er een (was 0022).
- De allowlist van `app_definer` op `better_auth` groeit met de rechten voor export en verwijderen; framework §6 noemt dat:
  beschermd, akkoord van de eigenaar in de PR die het bouwt (was 0022).
- Zonder de runner van 0050 bestaat de catalogus wel, maar ruimt niets op.
