---
status: voorstel # voorstel | goedgekeurd | gebouwd | vervallen — alleen de eigenaar zet goedgekeurd; gebouwd: # #<PR>; gevalideerd: <sha> (pnpm docs:status)
namespace: outbox
model: opus
modelreden: nieuwe security definer-functies en een gewijzigde security definer-view app.accounts (ADR 0025 punt 3d), gelijktijdigheid met lease en for update skip locked (punt 3a), en de uitnodigingsflow in src/core/api/auth (punt 3c)
---

# Mail-outbox zonder token

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

Uitwerking van [ADR 0020](../adr/0020-achtergrondtaken.md) (leidend) punt 3, sectie Bouwvolgorde stap 9; roadmap ST-03. **Hangt af van
de spec [achtergrondtaken](achtergrondtaken.md)**: alle vier delen daarvan (A bewaarcatalogus, B rol `app_jobs` en klasse `job`, C runner en
`withJob` met de wachtende variant, D `app.purge_expired`) moeten gemerged zijn voordat deel A hieronder begint.

## Doel

Een uitnodiging zet in de transactie van de admin alleen `{kind, user_id}` in `app.mail_outbox`; een worker in de runner maakt de link pas
bij verzenden, verstuurt at-least-once met lease, begrensde pogingen en een definitieve foutstatus, en de admin ziet in de accountlijst of de
laatste uitnodiging in de rij staat, verstuurd is of mislukt.

## Deel-PR's

| Deel | Inhoud | Wacht op | AC's |
|---|---|---|---|
| **A — database** | migratie `app.mail_outbox`, `app.enqueue_mail` (client), claim/markeer-functies (klasse `job`), rij in `app.retention`, kolom `invitation` in `app.accounts`; pgTAP | achtergrondtaken A t/m D | AC-1 t/m AC-14 |
| **B — worker en uitnodigen omzetten** | mail-taak in het register, verzenden via `src/core/api/auth` met zichtbare SMTP-fout, `inviteUser`/`reinviteUser` en de routes enqueuen; bestaande mail-tests wachten op de worker; herstelrunbook | A | AC-15 t/m AC-28, AC-34 |
| **C — status voor de admin** | veld `uitnodiging` in het lijstcontract, tekst in de accountlijst, nieuwe meldingstekst | B | AC-29 t/m AC-33 |

## Rollen en wie wat ziet

| Rol | `app.mail_outbox` | `app.enqueue_mail` | claim/markeer |
|---|---|---|---|
| `user` | niets | 42501 (geen admin met MFA) voor core-soorten | — |
| admin zonder MFA | niets | 42501 | — |
| admin met MFA | niets rechtstreeks; status via `app.accounts` | ja, binnen de eigen `withUser`-transactie | — |
| `app_definer` | `select`, `insert` (kolommen), `update` (kolommen), `delete` met termijn, via policies `to app_definer` | eigenaar | eigenaar |
| `app_jobs` | niets rechtstreeks | nee (klasse `client`) | alleen `execute` (klasse `job`) |
| `api_user`, `auth_service` | niets | nee | nee |

Geen policy voor `app_authenticated` (ADR 0020 punt 3). `auth_service` schrijft niets in schema `app`.

## Datawijzigingen (met grants)

### Deel A — migratie `…_mail_outbox.sql`

**Tabel `app.mail_outbox`**, RLS `enable` én `force`:

| Kolom | Type | Regel |
|---|---|---|
| `id` | `bigint generated always as identity primary key` | in `db/ids.json` (brand of `null` met reden) |
| `kind` | `text not null` | CHECK `kind ~ '^[a-z]+(\.[a-z_]+)+$'` |
| `user_id` | `text not null` (OV-4) | `references better_auth."user"(id) on delete cascade` |
| `recipient` | `text` | alleen app-mails naar een adres dat geen account is; core-mails null |
| `send_after` | `timestamptz not null default now()` | |
| `attempts` | `integer not null default 0` | CHECK `attempts >= 0` |
| `locked_until` | `timestamptz` | lease |
| `sent_at`, `failed_at` | `timestamptz` | CHECK niet allebei gevuld |
| `last_error` | `text` | CHECK `last_error in ('SMTP_ERROR', 'ALREADY_ACTIVE', 'NOT_FOUND', 'INTERNAL_ERROR')` (OV-11; geen SMTP-tekst) |
| `created_at` | `timestamptz not null default now()` | |

- CHECK `(sent_at is null and failed_at is null) or recipient is null` (adres weg na verzenden of definitief mislukken).
- Indexen: `(send_after, id) where sent_at is null and failed_at is null` (claim); `(user_id, kind, created_at)` (status, dubbelcontrole, export).
- **Grants** (alleen deze): `app_definer` `select`, `insert (kind, user_id, recipient)`, `update (attempts, locked_until, send_after,
  sent_at, failed_at, last_error, recipient)`, `delete`. Niets aan `app_authenticated`, `api_user`, `auth_service`, `app_jobs`, `PUBLIC`.
- **Policies:** `mail_outbox_definer_select` (`for select to app_definer using (true)`), `mail_outbox_definer_insert`
  (`for insert … with check (true)`), `mail_outbox_definer_update` (`for update … using (true) with check (true)`),
  `mail_outbox_definer_delete` (`for delete … using (created_at < (select app.retention_cutoff('app.mail_outbox')))`).
- **Rij in `app.retention`**: `app.mail_outbox`, `created_at`, `30 days`, `app`, reden "mail-outbox (ADR 0022 punt 5)".

**`app.enqueue_mail(p_kind text, p_user_id text) returns void`** — security definer, eigenaar `app_definer`, `set search_path = ''`, geen
overload; `execute` alleen aan `app_authenticated`; klasse `client`. Volgorde:
1. `app.current_user_id()` null → 42501;
2. `p_kind` niet in (`core.invitation`, `core.password_reset`) → 22023 (OV-5);
3. core-soort en niet `app.is_mfa_admin()` → 42501;
4. `pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('app.mail_outbox:' || p_user_id))` (twee enqueues voor dezelfde gebruiker na elkaar);
5. **dubbel** (OV-6, agentvoorstel): staat er voor `(p_user_id, p_kind)` al een **wachtende** rij (`sent_at` en `failed_at` null,
   `locked_until` null of verstreken), dan voegt de functie geen rij toe maar zet ze `send_after = now()` op die rij (een rij in backoff
   gaat dan bij de volgende ronde; `attempts` blijft); een rij die nu geclaimd is (`locked_until > now()`) telt niet als wachtend, zie het
   randgeval "opnieuw uitnodigen tijdens verzenden";
6. insert met `recipient` null (onbekende `p_user_id` → 23503 → `NOT_FOUND`).

**Functies van klasse `job`** (security definer van `app_definer`, `set search_path = ''`, `execute` alleen aan `app_jobs`; parameters uit
`limits.ts`):
- `app.claim_mail(p_limit integer, p_lease_seconds integer) returns table (id bigint, kind text, user_id text, recipient text, attempts integer)`:
  rijen met `sent_at`/`failed_at` null, `send_after <= now()`, `locked_until` null of verstreken; `order by send_after, id`,
  `for update skip locked`, `limit p_limit`; zet `locked_until = now() + lease`, `attempts = attempts + 1`. Ongeldige parameters → 22023.
- `app.mark_mail_sent(p_id bigint) returns void`: `sent_at = now()`, `recipient = null`, `locked_until = null`, alleen als `sent_at` en
  `failed_at` null zijn (idempotent).
- `app.mark_mail_failed(p_id bigint, p_error text, p_max_attempts integer, p_backoff_seconds integer) returns void`: `last_error = p_error`;
  `attempts >= p_max_attempts` of `p_error in ('ALREADY_ACTIVE', 'NOT_FOUND')` → `failed_at = now()`, `recipient = null`; anders
  `send_after = now() + p_backoff_seconds`, `locked_until = null`.

**`app.accounts`** (`create or replace view`, zelfde opties, eigenaar en actorfilter; `db/migrations/20261009214212_accounts_view.sql`):
nieuwe laatste kolom `invitation` = van de nieuwste `core.invitation`-rij van de gebruiker (op `created_at`, `id`): `'failed'` als
`failed_at`, `'sent'` als `sent_at`, anders `'queued'`; null zonder rij of als `status <> 'invited'` (OV-9). De generator voegt de
kolom toe aan `src/api/db/schema.ts`.

### Deel B — geen migratie

- **`src/core/shared/limits.ts`** (OV-3, OV-10): `MAIL_MAX_ATTEMPTS = 5`, `MAIL_BACKOFF_SECONDS = [60, 300, 900, 3600]` (na poging 1 t/m 4),
  `MAIL_LEASE_SECONDS = 300`, `MAIL_CLAIM_BATCH = 10`, `MAIL_JOBS_INTERVAL_SECONDS = 5`.
- **SMTP-fout zichtbaar** (OV-1 a): Better Auth vangt een fout uit `sendResetPassword` en logt hem alleen
  (`better-auth/dist/api/routes/password.mjs:82`, `context/create-context.mjs:215`). `src/core/api/auth` zet daarom rond elke aanroep een
  `AsyncLocalStorage`-context (`node:async_hooks`, geen nieuwe dependency); de `sendResetPassword` uit `src/core/api/auth/options.ts:151`
  legt een fout van `sendInvitation` daarin vast, en `sendCoreMail` gooit na `requestPasswordReset` een `MailSendError` als er een fout ligt.
- **`src/core/api/auth`**: `inviteUser(auth, input, inTransaction)` maakt het account en roept `inTransaction(userId)` aan (rol, auditregel,
  enqueue); bij een fout verwijdert hij het account weer (bestaand gedrag, `src/core/api/auth/invitations.ts:43`); **geen**
  `requestPasswordReset` meer (`:46`). `reinviteUser(auth, userId)` controleert bestaan en niet-actief en verwijdert de oude reset-tokens
  (`:56`–`:62`), zonder mail (`:63`). Nieuw `sendCoreMail(auth, { kind, userId })` (nieuw `mail.ts`) voor de worker: account opzoeken (weg →
  `NOT_FOUND`; actief bij `core.invitation` → `ALREADY_ACTIVE`, OV-7; in beide gevallen geen mail), oude reset-tokens weg,
  `auth.api.requestPasswordReset`, `MailSendError` → `SMTP_ERROR`.
- **`src/api/routes/accounts.ts`**: `inviteRoute` (`:114`) roept in de callback ook `select app.enqueue_mail('core.invitation', id)` aan;
  `reinviteRoute` (`:123`) roept na de service `app.enqueue_mail('core.invitation', id)` aan. `src/api/services.ts` volgt de nieuwe vorm.
- **Mail-taak** `core.mail` in het register (`src/core/api/jobs/`), interval `MAIL_JOBS_INTERVAL_SECONDS`: (1) claimen met
  `withJob({ name: 'core.mail', key }, …)` (try-variant: een andere instantie die net claimt, laat deze ronde overslaan); (2) per rij
  `sendCoreMail` buiten elke transactie; (3) markeren met `withJob(…, { wait: true })` (wachtende variant uit achtergrondtaken deel C,
  OV-2 a), zodat markeren nooit wordt overgeslagen; faalt markeren toch (timeout, database weg), dan verloopt de lease en gaat de mail opnieuw
  (at-least-once). Uitkomsten als foutcode uit de vaste lijst (OV-11).
- **`src/api/server.ts`**: geeft `sendCoreMail` met de `auth` aan de runner; `sendInvitation`/SMTP blijven in `createAuth` (`:22`).
- **Runbook** `docs/operations/mail-outbox.md` (nieuw): mislukte uitnodigingen vinden (accountlijst), herstellen ("Opnieuw uitnodigen"),
  SMTP-storing, at-least-once (een mail kan twee keer gaan; alleen de nieuwste link werkt).

### Deel C — geen migratie

- `accountItem` (`src/shared/contracts/accounts.ts:21`) krijgt `uitnodiging: z.enum(['wachtrij', 'verstuurd', 'mislukt']).nullable()`
  (OV-9); `accountsListRoute` leest `invitation`.
- Statuskolom (`src/web/features/accounts/accounts-page.tsx:99`) en meldingstekst (`copy.inviteDialog.sent`, `src/web/copy/ui.ts:94`,
  gebruikt na uitnodigen `:225` en opnieuw uitnodigen `:69`) volgens "Hergebruik en UX".

## Routes en foutcodes

Geen nieuwe routes, permissies of foutcodes.

| Methode | Pad | Permissie | Foutcodes | Wijziging |
|---|---|---|---|---|
| POST | `/api/accounts/invite` | `accounts:invite` | ongewijzigd | mail via de outbox; succes = rij staat erin (B) |
| POST | `/api/accounts/:id/reinvite` | `accounts:invite` | ongewijzigd (`NOT_FOUND`, `ALREADY_ACTIVE`) | oude links direct ongeldig, mail via de outbox (B) |
| GET | `/api/accounts` | `accounts:read` | ongewijzigd | veld `uitnodiging` per item (C) |

Een SMTP-fout bereikt de route niet meer: de route faalt alleen als de transactie faalt.

## Hergebruik en UX

- **Bestaande componenten:** `Table`/`TableCell` en `AsyncView` (accountlijst, `src/web/features/accounts/accounts-page.tsx:99`), `Button`
  "Opnieuw uitnodigen" als herstel (`:101`), `Notice` voor de melding na (opnieuw) uitnodigen (`:159`, zoals nu). Geen badge, geen nieuw component.
- **Hergebruik API/database:** `withUser`-transactie van de route, `withJob` (beide varianten) en het register (spec achtergrondtaken),
  `reinviteUser`-logica voor tokens, het policy-patroon `to app_definer` van `app.rate_limits`, de view `app.accounts`, de testharnassen met
  Mailpit (`test/api/account-harness.ts:135`, `e2e/support/accounts.ts:76`).
- **Staten per scherm:** accountlijst ongewijzigd (laden, leeg, fout via `AsyncView`); per uitgenodigd account: wachtrij, verstuurd, mislukt;
  verouderd: de lijst ververst niet vanzelf (zoals nu).
- **Alle zichtbare tekst letterlijk** (agentvoorstel, zie het besluitblok onder "Open vragen"), platte tekst in de statuskolom:

| Toestand | Tekst |
|---|---|
| uitgenodigd, geen rij (`null`) of `verstuurd` | Uitgenodigd |
| uitgenodigd, `wachtrij` | Uitgenodigd · mail in de wachtrij |
| uitgenodigd, `mislukt` | Uitgenodigd · mail mislukt |
| melding (`Notice`) na uitnodigen en opnieuw uitnodigen; vervangt "Uitnodiging verstuurd naar {email}." | Uitnodiging voor {email} staat klaar om te versturen. |

- **Focusvolgorde en toetsenbord:** ongewijzigd; geen nieuw bedienbaar element.

## Acceptatiecriteria

### Deel A — database

- **outbox/AC-1** — `app.mail_outbox` heeft RLS aan en geforceerd, de kolommen, CHECKs en indexen uit deel A en precies de grants en vier policies;
  `app_authenticated`, `api_user`, `auth_service` en `app_jobs` hebben geen recht.
- **outbox/AC-2** — `mail_outbox_definer_select: …`, `mail_outbox_definer_insert: …`, `mail_outbox_definer_update: …` — als `app_definer` slagen
  ze; als `app_authenticated` faalt elk met 42501.
- **outbox/AC-3** — `mail_outbox_definer_delete: …` — als `app_jobs` verwijdert `app.purge_expired('app.mail_outbox', 1000)` een rij van 31 dagen
  en laat een rij van 29 dagen staan; `app.retention_targets()` bevat `app.mail_outbox`.
- **outbox/AC-4** — `app.enqueue_mail('core.invitation', id)` door een admin met MFA zet één rij met `recipient` null, `attempts` 0 en `send_after` ≈ now.
- **outbox/AC-5** — `app.enqueue_mail` weigert: lege actor (42501), `user` en admin zonder MFA bij een core-soort (42501), soort `app.onbekend`
  (22023), onbekende gebruiker (23503).
- **outbox/AC-6** — Een enqueue in een transactie die daarna terugdraait (bijv. door een fout na de auditregel) laat geen rij achter.
- **outbox/AC-7** — Dubbel: een tweede `app.enqueue_mail` voor dezelfde gebruiker en soort terwijl de eerste rij wacht, voegt geen rij toe;
  staat die rij in backoff (`send_after` 60 min vooruit, `locked_until` null), dan is `send_after` daarna ≈ now en `attempts` ongewijzigd; is de
  eerste rij geclaimd (`locked_until > now()`), dan komt er een tweede rij; is de lease verstreken, dan niet. Twee gelijktijdige enqueues
  (twee verbindingen) geven één rij.
- **outbox/AC-8** — `app.claim_mail` met twee gelijktijdige verbindingen claimt een rij nooit twee keer (racetest); `attempts` stijgt met 1;
  een geclaimde rij wordt pas na `locked_until` opnieuw geclaimd; een rij met `send_after` in de toekomst niet.
- **outbox/AC-9** — `app.mark_mail_sent` zet `sent_at` en maakt `recipient` leeg; twee keer aanroepen verandert niets meer.
- **outbox/AC-10** — `app.mark_mail_failed` met `SMTP_ERROR` onder `p_max_attempts` zet `send_after` vooruit met `p_backoff_seconds`; op
  `p_max_attempts`, of met `ALREADY_ACTIVE`/`NOT_FOUND`, zet hij `failed_at` en maakt `recipient` leeg; `last_error` buiten de lijst faalt (23514).
- **outbox/AC-11** — Claim/markeer-functies: klasse `job`, alleen uitvoerbaar voor `app_jobs`; `app.enqueue_mail` klasse `client`.
- **outbox/AC-12** — Verwijderen van `better_auth."user"` neemt de outbox-rijen van die gebruiker mee (cascade).
- **outbox/AC-13** — `app.accounts.invitation` is `queued`, `sent` of `failed` volgens de nieuwste `core.invitation`-rij, null voor een actief
  account en zonder rij; de view toont niets aan een `user` of admin zonder MFA (bestaande asserts blijven groen).
- **outbox/AC-14** — `pnpm check:secdef`, `pnpm check:snapshot` groen; `check-policies` vindt elke policy op naam; de invariant
  bewaarcatalogus en jobs/AC-3 kennen de nieuwe rij.

### Deel B — worker en uitnodigen

- **outbox/AC-15** — `POST /api/accounts/invite` geeft 200 zonder dat er een mail weg is; daarna staat er één `core.invitation`-rij en de
  auditregel uit dezelfde commit; na één ronde van `core.mail` staat er één uitnodiging in Mailpit en is de link geldig.
- **outbox/AC-16** — Met SMTP onbereikbaar slaagt uitnodigen (200); na een ronde heeft de rij `last_error = 'SMTP_ERROR'`, `sent_at` null en
  `send_after` 60 s later (de SMTP-fout komt dus door Better Auth heen); na herstel van SMTP wordt hij verstuurd (ST-03: SMTP-uitval).
- **outbox/AC-17** — Na 5 mislukte pogingen staat `failed_at`, is `recipient` leeg en toont `app.accounts` `failed`; "Opnieuw uitnodigen" zet
  een nieuwe rij die wel verstuurd wordt (herstelbaar).
- **outbox/AC-18** — Crash na claimen (worker stopt tussen claim en markeren): na het verlopen van de lease claimt een volgende ronde de rij
  opnieuw en verstuurt hem; de mail kan dan twee keer zijn gegaan, nooit nul keer (at-least-once).
- **outbox/AC-19** — Bij een dubbele verzending werkt alleen de link uit de nieuwste mail; de oudere geeft `INVITATION_INVALID`.
- **outbox/AC-20** — Twee runners tegelijk (twee `startJobs` op dezelfde database): elke rij wordt één keer geclaimd per lease, en elke
  geclaimde rij wordt gemarkeerd (ook als de andere runner op dat moment claimt: wachtende variant).
- **outbox/AC-21** — `POST /api/accounts/:id/reinvite` maakt de vorige link direct ongeldig en zet een rij (of hergebruikt een wachtende,
  AC-7); `NOT_FOUND` en `ALREADY_ACTIVE` laten geen rij en geen auditregel achter.
- **outbox/AC-22** — Opnieuw uitnodigen tijdens verzenden: de worker heeft rij R geclaimd en de link gemaakt; een reinvite verwijdert die link
  en zet een nieuwe rij R2 (R is geclaimd); R wordt `sent`, R2 wordt daarna verstuurd, de lijst toont eerst `wachtrij` en daarna `verstuurd`,
  en de link uit de mail van R2 werkt.
- **outbox/AC-34** — Opnieuw uitnodigen tijdens backoff (eerste poging faalde met `SMTP_ERROR`, SMTP weer bereikbaar): er komt geen tweede
  rij, de bestaande rij wordt bij de eerstvolgende ronde verstuurd (niet pas na de backoff), en de link uit die mail werkt.
- **outbox/AC-23** — Faalt de transactie van de route na het aanmaken van het account (bijv. de auditregel), dan is er geen rij, geen mail en
  geen account (bestaand: `inviteUser` verwijdert het).
- **outbox/AC-24** — Een rij voor een account dat intussen actief is of niet meer bestaat: geen mail, `failed_at` met `ALREADY_ACTIVE` resp.
  `NOT_FOUND`, geen nieuwe poging.
- **outbox/AC-25** — Geen enkele rij of logregel van de worker bevat een e-mailadres, link of token (controle op tabel en log na AC-15 t/m AC-17).
- **outbox/AC-26** — `user` en admin zonder MFA op invite en reinvite: `FORBIDDEN` resp. `MFA_REQUIRED`, geen rij.
- **outbox/AC-27** — E2E: uitnodigen → mail komt binnen enkele seconden (interval 5 s) → wachtwoord instellen werkt (bestaande flow in
  `e2e/accounts.spec.ts`).
- **outbox/AC-28** — `docs/operations/mail-outbox.md` beschrijft vinden, herstellen en at-least-once.

### Deel C — status voor de admin

- **outbox/AC-29** — `GET /api/accounts` geeft `uitnodiging` `wachtrij`, `verstuurd` of `mislukt` voor een uitgenodigd account en `null` voor
  een actief of geblokkeerd account; de response is strict (contracttest).
- **outbox/AC-30** — De accountlijst toont bij een uitgenodigd account letterlijk de tekst uit de teksttabel per toestand; bij "mislukt" staat
  "Opnieuw uitnodigen" erbij (zoals bij elk uitgenodigd account).
- **outbox/AC-31** — Na uitnodigen en opnieuw uitnodigen toont de `Notice` "Uitnodiging voor {email} staat klaar om te versturen."; de tekst
  "Uitnodiging verstuurd naar" komt niet meer voor.
- **outbox/AC-32** — Een `user` ziet de lijst niet (bestaand); de nieuwe kolom lekt niets via de view.
- **outbox/AC-33** — Axe zonder fouten op de accountlijst met de drie toestanden (e2e met CSP aan).

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| SMTP onbereikbaar bij uitnodigen | route slaagt; worker probeert opnieuw na 1, 5, 15, 60 min; na 5 pogingen `failed` | — (200) |
| Worker crasht tussen versturen en markeren | lease (5 min) verloopt, opnieuw verstuurd; alleen de nieuwste link werkt | — |
| Twee keer opnieuw uitnodigen terwijl de rij wacht | tweede enqueue voegt geen rij toe; één mail | — |
| Opnieuw uitnodigen terwijl de rij in backoff staat (`send_after` tot 60 min vooruit) | geen nieuwe rij; `send_after` wordt now, de mail gaat bij de volgende ronde (≤ 5 s), zodat "staat klaar om te versturen" klopt (AC-34) | — |
| Opnieuw uitnodigen terwijl de worker die rij verstuurt | de lopende link wordt ongeldig, er komt een nieuwe rij (de geclaimde rij telt niet als wachtend); de admin ziet `wachtrij` tot die verstuurd is (AC-22) | — |
| Markeren faalt (database even weg) | lease verloopt, mail gaat opnieuw (at-least-once) | — |
| Account verwijderd terwijl een rij in de rij staat | cascade verwijdert de rij (ADR 0022 punt 2) | — |
| Account intussen actief (eerdere link gebruikt) | geen mail, `failed_at` met `ALREADY_ACTIVE`; lijst toont geen uitnodigingsstatus (actief) | — |
| Commit van de route faalt na `createUser` | account zonder rol; geen rij (bestaand gat, ADR 0021 OV-7) | `INTERNAL_ERROR` |
| Better Auth vangt de SMTP-fout zelf af | de `AsyncLocalStorage`-context legt hem vast; worker markeert `SMTP_ERROR` (AC-16) | — |
| Rij ouder dan 30 dagen | opgeruimd; status in de lijst wordt null ("Uitgenodigd") | — |
| Uitnodigingslink na 7 dagen verlopen | ongewijzigd: `INVITATION_INVALID`; herstel via opnieuw uitnodigen | `INVITATION_INVALID` |
| Host die naar nul schaalt | mail gaat pas bij de volgende `runJobsOnce()` (adapter, buiten scope) | — |

Alternatieven voor het randgeval "opnieuw uitnodigen tijdens verzenden", niet gekozen: (b) een unieke partiële index op wachtende rijen (de
letter van OV-6 a): dan doet de enqueue niets terwijl de link van de geclaimde rij al weg is, en ziet de admin "verstuurd" bij een dode link;
(c) `reinviteUser` verwijdert geen tokens meer (de worker doet het bij verzenden): wijkt af van ADR 0020 Gevolgen ("oude tokens weg en
enqueue"); (d) markeren alleen als het token nog bestaat: vraagt tokenkennis in de outbox, wat ADR 0020 punt 3 uitsluit.

## Raakt ook

Beschermde paden (eigenaarakkoord):
- **Deel A:** `db/tests/functies.sql` (`app.enqueue_mail` `client`; `app.claim_mail`, `app.mark_mail_sent`, `app.mark_mail_failed` `job`), nieuw
  `db/tests/mail_outbox.sql`, `db/tests/accounts.sql` (kolom erbij: bestaande test met reden in de PR), `db/tests/retention.sql` en de
  invariant bewaarcatalogus in `db/tests/invarianten.sql` (jobs/AC-3 "precies de rijen" krijgt `app.mail_outbox`; bestaande test, met reden),
  en de test van `app.retention_targets()` (jobs/AC-30) die `app.mail_outbox` erbij krijgt.
- **Deel B:** `src/core/api/auth/{invitations,options,index}.ts` en nieuw `mail.ts`, `src/core/api/jobs/`, `src/core/shared/limits.ts`, `src/api/server.ts`.
  De wachtende variant van `withJob` komt uit achtergrondtaken deel C; de exportlijst van `src/core/api/db` (`AGENTS.md` Lagen,
  `docs/framework.md` §1 `:11` en §2 `:42`, `.claude/rules/database.md:44`) wordt daar bijgewerkt; controleer in dit deel dat hij de variant noemt.
  Bestaande tests die direct na uitnodigen een mail verwachten (`test/api/accounts.int.test.ts`, `test/api/accounts-audit.int.test.ts`,
  `test/auth/auth.int.test.ts`, harnassen `test/api/account-harness.ts`, `test/auth/harness.ts`, `e2e/support/accounts.ts`, `e2e/accounts.spec.ts`):
  ze draaien eerst een ronde van de worker of wachten op hem — gewijzigd gedrag, met reden in de PR; `docs/framework.md` §6 (outbox,
  at-least-once, geen token); `.claude/rules/api.md` (uitnodigen via de outbox).
- **Deel C:** `e2e/` (nieuwe of gewijzigde spec).

Niet beschermd, wel mee: `src/api/routes/accounts.ts`, `src/api/services.ts`, `src/shared/contracts/accounts.ts`, `src/web/features/accounts/`,
`src/web/copy/ui.ts`, `db/ids.json`, gegenereerde `db/schema.snapshot.sql` en `src/api/db/schema.ts`, `docs/operations/mail-outbox.md`,
`docs/specs/audit-log.md` (randgevallen over de mail, `:236`–`:237`, vervallen), `CHANGELOG.md`, `docs/roadmap.md` ST-03.

## Buiten scope

- App-soorten met `recipient` en een eigen definer-functie (ADR 0020 punt 3): mechanisme staat klaar, geen voorbeeld in de template.
- De routes intrekken en resetlink (`core.password_reset` gebruiken): spec accountbeheer-uitbreiding.
- E-mailwijziging via de outbox (`src/core/api/auth/mailing.ts`): blijft synchroon; eigen besluit.
- Filteren op uitnodigingsstatus in de lijst (OV-9).
- Adapter voor hosts die naar nul schalen; dashboards en alarmering (ST-10).

## Open vragen voor de eigenaar

**Besluit van de eigenaar, 2026-10-19 (in de sessie, herkomst: opdracht "neem aanbevelingen over"):** alle vragen hieronder zijn beantwoord
met de aanbeveling of, waar een vraag alleen een voorstel noemt (OV-3, OV-7, OV-9), met dat voorstel, **behalve OV-6 en OV-8** (zie
hieronder). Voor OV-7 is dat `failed_at` met een foutcode (geen aparte eindstatus). De alternatieven blijven staan als herkomst van de keuze.
Dit besluit geeft geen akkoord op de beschermde paden uit "Raakt ook"; dat volgt apart.

**Agentvoorstellen, door de eigenaar te beslissen bij de merge van deze spec:**
- **OV-8:** de teksttabel in "Hergebruik en UX" (platte tekst in de statuskolom, geen badge, nieuwe tekst in de `Notice`).
- **OV-6:** wijkt af van OV-6 (a) (unieke partiële index). Voorstel: geen unieke index maar een controle in `app.enqueue_mail` (stap 5): een
  tweede enqueue voegt geen rij toe zolang er een rij wacht en zet dan `send_after = now()`; een geclaimde rij telt niet als wachtend, zodat een
  herinvite tijdens verzenden een nieuwe rij geeft (randgeval "opnieuw uitnodigen tijdens verzenden", AC-22; alternatieven onder Randgevallen).
  Reden: met de index ziet de admin "verstuurd" bij een dode link. Kiest de eigenaar toch (a), dan vervallen AC-22 en het tweede deel van AC-7.

- **OV-1 — Better Auth slikt een SMTP-fout.** `requestPasswordReset` roept `sendResetPassword` aan via `runInBackgroundOrAwait`, dat elke fout
  vangt en alleen logt (`better-auth/dist/api/routes/password.mjs:82`, `context/create-context.mjs:215`). De worker ziet een SMTP-fout dus niet,
  en ADR 0020 punt 3 (opnieuw proberen, `failed_at`) werkt dan niet; ook het huidige synchrone pad faalt niet bij een SMTP-fout. (a) de mailfunctie
  legt per aanroep de uitkomst vast (bijv. `AsyncLocalStorage` in `src/core/api/auth`), `sendCoreMail` gooit als die een fout bevat; (b) de worker
  maakt het token zelf (`internalAdapter.createVerificationValue` met `reset-password:`-prefix en `INVITATION_TTL_SECONDS`) en mailt zelf, zonder
  `requestPasswordReset`. Aanbeveling: (a), blijft het pad van de ADR. (b) wijkt af van ADR 0020 punt 3 en vraagt een correctie.
- **OV-2 — Markeren achter een try-lock.** Loopt markeren via `withJob` met `pg_try_advisory_xact_lock`, dan kan het overgeslagen worden terwijl
  een andere instantie claimt; de rij wordt dan na de lease opnieuw verstuurd. (a) `withJob` krijgt een wachtende variant (`pg_advisory_xact_lock`,
  begrensd door `statement_timeout`) voor markeren; (b) markeren onder een eigen taaknummer met try-lock en opnieuw proberen. Aanbeveling: (a);
  wijzigt `withJob` uit de spec achtergrondtaken.
- **OV-3 — Getallen.** Voorstel: `MAIL_MAX_ATTEMPTS = 5`, backoff 1, 5, 15 en 60 minuten, lease 5 minuten, 10 rijen per claim. Akkoord of andere waarden?
- **OV-4 — `user_id` verplicht.** ADR 0020 laat `not null` open. Aanbeveling: `not null`; ook een app-mail naar een nieuw adres hoort bij een account.
- **OV-5 — `core.password_reset` nu al in de allowlist.** Geen route gebruikt het nog. Aanbeveling: ja (ADR noemt het), met dezelfde verzendweg.
- **OV-6 — Dubbel in de rij.** Opnieuw uitnodigen terwijl er nog een rij wacht: (a) unieke partiële index, de tweede enqueue doet niets (de
  auditregel blijft); (b) twee rijen, twee mails. Aanbeveling: (a).
- **OV-7 — Uitnodiging voor een account dat intussen actief is of weg.** Aanbeveling: niet versturen; markeren als `failed_at` met
  `ALREADY_ACTIVE` resp. `NOT_FOUND` (de lijst toont de status alleen bij uitgenodigde accounts). Of liever een eigen eindstatus "overgeslagen"?
- **OV-8 — Teksten.** De statusteksten en de nieuwe meldingstekst na uitnodigen en opnieuw uitnodigen (voorstel in "Hergebruik en UX"); en badge
  (`StatusBadge` `destructive`) of platte tekst voor "mislukt"?
- **OV-9 — Vorm van de status.** Veld `uitnodiging` (`wachtrij` | `verstuurd` | `mislukt` | null) alleen voor uitgenodigde accounts. Akkoord?
  En moet de admin op deze status kunnen filteren (spec lijstpagina)? Aanbeveling: nee, niet nu.
- **OV-10 — Interval van de mail-taak.** Bij 60 s (OV-C1 van achtergrondtaken) wacht een uitnodiging tot een minuut, en wachten e2e en
  integratietests mee. Aanbeveling: eigen interval van 5 s voor `core.mail` in `limits.ts`; integratietests roepen `runJobsOnce()` aan.
- **OV-11 — Foutcodes in `last_error`.** Aanbeveling: een vaste lijst in core (`SMTP_ERROR`, `ALREADY_ACTIVE`, `NOT_FOUND`, `INTERNAL_ERROR`),
  geen tekst van de SMTP-server.

## Testplan

| Bewijs | Soort | Plaats | AC |
|---|---|---|---|
| tabel, grants, policies op naam, cascade, retention en purge | pgTAP + `check-policies` | `db/tests/mail_outbox.sql` | AC-1 t/m AC-3, AC-12 |
| `app.enqueue_mail`: allowlist, actor, MFA, rollback, dubbel (ook gelijktijdig) | pgTAP + integratie (twee verbindingen) | idem, `test/jobs/mail-enqueue.int.test.ts` | AC-4 t/m AC-7 |
| claim-race, lease, backoff, failed, idempotent markeren | pgTAP + integratie (twee verbindingen) | idem, `test/jobs/mail-claim.int.test.ts` | AC-8 t/m AC-10 |
| functiecatalogus | pgTAP | `db/tests/functies.sql` | AC-11 |
| view-kolom en filter | pgTAP | `db/tests/accounts.sql` | AC-13 |
| secdef, snapshot, catalogus | `pnpm check:secdef`, `pnpm check:snapshot`, `pnpm test:db` | — | AC-14 |
| invite/reinvite via outbox, Mailpit, link geldig/ongeldig | integratie (echte stack) | `test/api/mail-outbox.int.test.ts` | AC-15, AC-19, AC-21, AC-23, AC-26 |
| SMTP-uitval (onbereikbare SMTP-URL), 5 pogingen, herstel | integratie | idem | AC-16, AC-17 |
| crash na claim, twee runners, herinvite tijdens verzenden | integratie | idem | AC-18, AC-20, AC-22, AC-34 |
| actief/verwijderd account, geen PII in rij of log | integratie | idem | AC-24, AC-25 |
| e2e uitnodigen tot wachtwoord | e2e | `e2e/accounts.spec.ts` | AC-27 |
| runbook | review | `docs/operations/mail-outbox.md` | AC-28 |
| contract, scherm met drie toestanden, melding, axe | integratie + e2e | `test/api/accounts.int.test.ts`, `e2e/mail-outbox.spec.ts` | AC-29 t/m AC-33 |

Gates per deel: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm ratchet`, `pnpm test:unit`, `pnpm check:migrations` en
`pnpm check:secdef` (A), `pnpm test:db` en `pnpm check:snapshot` (alle delen), `pnpm ui:check` (B, C).
