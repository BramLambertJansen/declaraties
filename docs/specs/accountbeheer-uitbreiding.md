---
status: goedgekeurd # door de agent onder mandaat van de eigenaar (2026-10-11), open vragen volgens de aanbeveling; ter herziening
namespace: accounts
---

# Accountbeheer, uitbreiding: blokkeren, uitnodiging intrekken, resetlink en herstelcodes

> Goedgekeurd door de agent onder mandaat van de eigenaar (2026-10-11). Elke open vraag is besloten volgens de aanbeveling
> erbij; zie `docs/reviews/2026-10-11-keuzes-agent.md`. De eigenaar kan dit herzien.

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

Een admin met MFA blokkeert en deblokkeert accounts, trekt een openstaande uitnodiging in en stuurt een resetlink; een gebruiker met TOTP
heeft herstelcodes, zodat een verloren telefoon niet alleen via `pnpm admin:create` op te lossen is (roadmap stuk 3e). Bouwt op spec
[accountbeheer](accountbeheer.md); de AC-nummers lopen daarom door vanaf AC-11.

## Rollen en wie wat ziet

| Rol | Ziet | Mag |
|---|---|---|
| `user` | niets nieuws; met TOTP: sectie "Herstelcodes" op `/account` (spec [eigen-account](eigen-account.md)) | eigen herstelcodes maken en gebruiken |
| `admin` (MFA) | in `/admin/accounts` per rij het menu "Acties"; status "Geblokkeerd" | blokkeren, deblokkeren, uitnodiging intrekken, resetlink sturen; eigen herstelcodes |
| geblokkeerd account | `/login` met de gewone inlogfout "E-mailadres of wachtwoord klopt niet." (OV-5) | niets |

- Een admin kan zichzelf niet blokkeren; de laatste actieve, niet-geblokkeerde admin kan niet geblokkeerd of gedegradeerd worden (`LAST_ADMIN`, OV-7).
- Blokkeren werkt direct: `authGateway.getSession` weigert elke sessie van een geblokkeerd account, ook een sessie die tijdens het blokkeren ontstond.

## Datawijzigingen (met grants)

Volgens de aanbeveling bij OV-1 (één nieuwe migratie; beschermde-padwijzigingen onder "Raakt ook"):

- **`better_auth."user".blocked_at timestamptz null`** via Better Auth `user.additionalFields` (`input: false`, kolomnaam `blocked_at`),
  door `auth generate` in de migratie. Better Auth leest het veld mee bij elke sessie-opvraging; schrijven doet alleen de functie hieronder.
- **Grants aan `app_definer`** (allowlist in `db/tests/invarianten.sql` erbij): `select (blocked_at)` en `update (blocked_at)` op `better_auth."user"`.
  Geen grant op `better_auth.session`: sessies intrekken loopt via Better Auth (ADR 0014 sluit sessies voor `app_definer` uit).
- **`app.set_account_blocked(p_user_id text, p_blocked boolean) returns void`** — `security definer`, eigenaar `app_definer`, `search_path = ''`,
  execute aan `app_authenticated`, klasse `client` in de functiecatalogus. Eist `app.is_mfa_admin()` (anders 42501), weigert `p_user_id =
  app.current_user_id()` (`OWN_ACCOUNT`) en een account zonder credential (`ACCOUNT_INVITED`), neemt de advisory lock van de laatste-admin-regel,
  faalt met `LAST_ADMIN` als er geen actieve, niet-geblokkeerde admin overblijft, en zet `blocked_at`.
- **`app.user_roles_keep_one_admin()`** (nieuwe migratie, `create or replace`): telt alleen admins met een credential-account en `blocked_at is null`
  (nu telt een uitgenodigde admin mee, die niet kan inloggen; OV-7).
- **`app.accounts`** (`create or replace view`): status `blocked` als `blocked_at` gezet is, vóór `active`/`invited`.
- **Herstelcodes**: kolom `backupCodes` bestaat al (tabel `twoFactor`, plugin two-factor); 10 codes, versleuteld opgeslagen (standaard van de plugin).

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| POST | `/api/accounts/:id/block` → `null` | `accounts:manage` | `NOT_FOUND`, `OWN_ACCOUNT`, `ACCOUNT_INVITED`, `LAST_ADMIN`, `FORBIDDEN`, `MFA_REQUIRED` |
| POST | `/api/accounts/:id/unblock` → `null` | `accounts:manage` | `NOT_FOUND`, `FORBIDDEN`, `MFA_REQUIRED` |
| DELETE | `/api/accounts/:id/invitation` → `null` | `accounts:invite` | `NOT_FOUND`, `ALREADY_ACTIVE`, `FORBIDDEN`, `MFA_REQUIRED` |
| POST | `/api/accounts/:id/reset-link` → `null` | `accounts:manage` | `NOT_FOUND`, `ACCOUNT_INVITED`, `ACCOUNT_BLOCKED`, `FORBIDDEN`, `MFA_REQUIRED` |
| POST | `/api/auth/two-factor/generate-backup-codes` `{ password }` (Better Auth) | ingelogd met TOTP, sessie `mfa` | `WRONG_PASSWORD`, `MFA_REQUIRED`, `RATE_LIMITED` |
| POST | `/api/auth/two-factor/verify-backup-code` `{ code }` (Better Auth) | half ingelogd (geen sessie) | `INVALID_BACKUP_CODE`, `VALIDATION`, `RATE_LIMITED` |
| POST | `/api/auth/sign-in/email`, `/two-factor/verify-*` (bestaand) | — | erbij: `ACCOUNT_BLOCKED` (server; web toont `INVALID_CREDENTIALS`) |

- **Blokkeren zonder admin-plugin** (ADR 0013 verwierp die; OV-1): (1) `app.set_account_blocked` in de transactie van de route; (2) daarna
  `ctx.services.sessions.revokeAll` (`internalAdapter.deleteUserSessions`), opruimen; (3) de garantie: `authGateway.getSession` ziet
  `user.blockedAt` (additional field, komt mee met de sessie, geen extra query), verwijdert de sessie en geeft geen sessie, zoals bij de absolute
  7 dagen. Een login tussen (1) en (2) is zo ook dood. `databaseHooks.session.create.before` weigert nieuwe sessies (inloggen, TOTP, herstelcode,
  uitnodiging, dev-login) met `new APIError('FORBIDDEN', { code: 'ACCOUNT_BLOCKED' })`; een gewone `Error` in een database-hook wordt een 500.
- **Uitnodiging intrekken** via `ctx.services.invitations.revoke`, in één transactie op de pool van `auth_service` (`src/core/api/auth`, dezelfde
  uitzondering als Better Auth zelf): `select … for update` op de user-rij, open `reset-password:*`-tokens weg, credential aanwezig →
  `ALREADY_ACTIVE`, anders de user verwijderen (cascade op `user_roles`). Gelijktijdig accepteren: credential eerst → `ALREADY_ACTIVE`;
  intrekken eerst → `INVITATION_INVALID` (token weg, `USER_NOT_FOUND`, of de nieuwe `databaseHooks.account.create.before` vindt de user niet:
  `APIError` `INVALID_TOKEN`, ook tijdens het hashen). Alleen een commit precies tussen die hook en de insert geeft nog een 23503 (500).
- **Resetlink** via `ctx.services.invitations.sendResetLink`: oude `reset-password:*`-tokens weg (zoals `reinviteUser`), `auth.api.requestPasswordReset`
  server-side (`/request-password-reset` blijft dicht, ADR 0013), dan `expiresAt` van de nieuwe tokenrij op nu + `RESET_LINK_TTL_SECONDS` (OV-4).
  `sendResetPassword` kiest de mail: met credential de resetmail naar `/nieuw-wachtwoord?token=…` (scherm van `/uitnodiging`, andere teksten),
  zonder de uitnodiging. Bij gebruik trekt `revokeSessionsOnPasswordReset` de sessies in.
- **RLS-vangnet:** intrekken en resetlink draaien als `auth_service`, buiten RLS. De route leest eerst in zijn transactie de rij uit `app.accounts`
  (alleen voor een admin met MFA): geen rij → `NOT_FOUND`, de status geeft `ACCOUNT_INVITED`/`ACCOUNT_BLOCKED`/`ALREADY_ACTIVE`; dan de service.
- **Herstelcodes**: `/two-factor/verify-backup-code` en `/two-factor/generate-backup-codes` uit `disabledPaths`; `/view-backup-codes` blijft dicht.
  `/two-factor/enable` geeft al 10 codes terug: het inschrijfscherm toont ze. Hooks (test per regel): before `generate-backup-codes`: sessie niet
  `mfa` → `MFA_REQUIRED` (Better Auth eist alleen sessie en wachtwoord); before `verify-backup-code`: volledige sessie (dan telt de plugin geen
  pogingen), `disableSession` of `trustDevice` → `VALIDATION` (de `trustDevice`-hook geldt nu alleen `/verify-totp`); after: `mfa`, zoals `/verify-totp`.

## Hergebruik en UX

- **Bestaande componenten:** `Table`, `DropdownMenu` (menu "Acties" per rij), `ConfirmDialog` (blokkeren, uitnodiging intrekken, resetlink),
  `Notice`, `Form`/`FormField`, `Input`, `Button`, `Section`, `CenteredCard`; het scherm `/nieuw-wachtwoord` hergebruikt de uitnodigingspagina.
- **Staten per scherm:** acties: dialoog open, bezig (`busy`, sluiten geblokkeerd), gelukt (dialoog dicht, `Notice` boven de tabel), fout (`Notice` in de dialoog).
  Herstelcodes: tonen eenmalig na maken; bezig; fout per veld. Herstelcode bij inloggen: zoals het TOTP-scherm. Laden/leeg: ongewijzigd. Verouderd: n.v.t.
- **Alle zichtbare tekst letterlijk:**

| Plek | Tekst |
|---|---|
| Accounts | status "Geblokkeerd"; menuknop per rij met toegankelijke naam "Acties voor {naam}"; items: actief "Resetlink sturen", "Blokkeren"; geblokkeerd "Deblokkeren"; uitgenodigd "Opnieuw uitnodigen", "Uitnodiging intrekken" (eigen rij: geen "Blokkeren") |
| Blokkeren (ConfirmDialog) | titel "{naam} blokkeren?"; tekst "{naam} wordt direct overal uitgelogd en kan niet meer inloggen tot je het account deblokkeert."; knoppen "Blokkeren", "Annuleren"; gelukt "{naam} is geblokkeerd." |
| Deblokkeren (direct, geen dialoog) | gelukt "{naam} is gedeblokkeerd." |
| Uitnodiging intrekken (ConfirmDialog) | titel "Uitnodiging intrekken?"; tekst "De link aan {email} werkt niet meer en het account verdwijnt uit de lijst."; knoppen "Intrekken", "Annuleren"; gelukt "De uitnodiging aan {email} is ingetrokken." |
| Resetlink (ConfirmDialog, niet rood) | titel "Resetlink sturen?"; tekst "{naam} krijgt een mail met een link om een nieuw wachtwoord in te stellen. Het huidige wachtwoord blijft werken tot dan."; knoppen "Link sturen", "Annuleren"; gelukt "Resetlink verstuurd naar {email}." |
| Resetmail | onderwerp "Nieuw wachtwoord instellen voor {appnaam}"; tekst "Een beheerder heeft een link voor je aangevraagd om een nieuw wachtwoord in te stellen. De link is 1 uur geldig."; knop "Wachtwoord instellen" |
| `/nieuw-wachtwoord` | titel "Nieuw wachtwoord instellen"; velden en knop zoals `/uitnodiging`; gelukt "Je wachtwoord is gewijzigd. Log in om verder te gaan." |
| Herstelcodes tonen (na inschrijven of opnieuw maken) | kop "Herstelcodes"; uitleg "Bewaar deze codes op een veilige plek. Elke code werkt één keer, als je je authenticator-app niet bij de hand hebt. Je ziet ze maar één keer."; knop "Ik heb ze bewaard" |
| Herstelcodes op `/account` | sectiekop "Herstelcodes"; uitleg "Nieuwe codes maken maakt de oude ongeldig."; veld "Wachtwoord"; knop "Nieuwe herstelcodes maken" |
| TOTP-scherm | link "Gebruik een herstelcode"; titel "Herstelcode"; uitleg "Voer een van je herstelcodes in."; veld "Herstelcode"; knop "Bevestigen"; terug "Gebruik je authenticator-app" |
| Foutteksten | `OWN_ACCOUNT` "Dit kan niet bij je eigen account."; `ACCOUNT_INVITED` "Dit account is nog niet actief. Nodig opnieuw uit of trek de uitnodiging in."; `ACCOUNT_BLOCKED` (alleen in de beheerlijst) "Dit account is geblokkeerd. Deblokkeer het eerst."; `RESET_LINK_INVALID` "Deze link is verlopen of al gebruikt. Vraag een beheerder om een nieuwe."; `INVALID_BACKUP_CODE` "Deze herstelcode klopt niet of is al gebruikt."; `WRONG_PASSWORD` uit spec eigen-account |

- **Focusvolgorde en toetsenbord:** menu "Acties" met pijltjes, Esc sluit (focus terug op de knop); `ConfirmDialog` start op "Annuleren", na sluiten
  terug op de menuknop van de rij (of op de tabel als de rij weg is); herstelcodes als lijst, de knop "Ik heb ze bewaard" krijgt de focus pas na de lijst.

## Acceptatiecriteria

- **accounts/AC-11** — Gegeven een admin met MFA en een actieve `user` met twee sessies, wanneer de admin "Blokkeren" bevestigt, dan geven beide sessies
  bij de volgende request 401, staat de status op "Geblokkeerd" en ziet de `user` bij inloggen "E-mailadres of wachtwoord klopt niet.".
- **accounts/AC-12** — Gegeven dat geblokkeerde account, wanneer de admin "Deblokkeren" kiest, dan kan de `user` weer inloggen en is de status "Actief".
- **accounts/AC-13** — Gegeven twee admins waarvan één geblokkeerd, wanneer iets de ander blokkeert of degradeert, dan faalt dat met `LAST_ADMIN`.
- **accounts/AC-14** — Gegeven een admin, wanneer hij zijn eigen rij bekijkt, dan staat "Blokkeren" niet in het menu, en de API weigert met `OWN_ACCOUNT`.
- **accounts/AC-15** — Gegeven een uitnodiging, wanneer de admin "Intrekken" bevestigt, dan verdwijnt het account uit de lijst, geeft de link
  `INVITATION_INVALID` en kan hetzelfde adres opnieuw uitgenodigd worden.
- **accounts/AC-16** — Gegeven een actieve `user`, wanneer de admin een resetlink stuurt, dan staat de resetmail in Mailpit (een eerdere link werkt
  niet meer); na het instellen van een nieuw wachtwoord zijn de oude sessies weg en werkt alleen het nieuwe wachtwoord.
- **accounts/AC-17** — Gegeven een admin die TOTP instelt, wanneer de code klopt, dan ziet hij 10 herstelcodes; met één daarvan (in plaats van TOTP)
  krijgt hij een MFA-sessie, en dezelfde code werkt daarna niet meer (`INVALID_BACKUP_CODE`).
- **accounts/AC-18** — Gegeven een gebruiker met TOTP op `/account`, wanneer hij met zijn wachtwoord nieuwe herstelcodes maakt, dan werken de oude niet meer.
- **accounts/AC-19** — Gegeven een `user` of een admin zonder MFA, wanneer hij een van de vier nieuwe accountroutes aanroept, dan `FORBIDDEN` / `MFA_REQUIRED`.
- **accounts/AC-20** — Gegeven een half ingelogde gebruiker, wanneer hij een herstelcode stuurt met `trustDevice: true` of `disableSession: true`,
  dan `VALIDATION`, geen sessie en geen trust-device-cookie; met een volledige sessie wordt `verify-backup-code` ook geweigerd.
- **accounts/AC-21** — Gegeven een TOTP-gebruiker met een sessie van sterkte `password`, wanneer hij `generate-backup-codes` aanroept, dan
  `MFA_REQUIRED` en blijven de oude codes geldig.
- **accounts/AC-22** — Gegeven een geblokkeerd account met een sessie die na het blokkeren is ontstaan (in de test rechtstreeks via
  `internalAdapter.createSession`), wanneer die sessie een request doet, dan 401 en is de sessierij weg.
- **accounts/AC-23** — Gegeven een geblokkeerd account, wanneer het met het juiste wachtwoord inlogt, dan antwoordt Better Auth met een 4xx en
  code `ACCOUNT_BLOCKED` (geen 500), en toont de web de gewone inlogfout.
- **accounts/AC-24** — Gegeven één actieve admin en een uitgenodigde admin, wanneer iets de actieve admin degradeert of blokkeert, dan `LAST_ADMIN`.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Blokkeren van een al geblokkeerd account, deblokkeren van een actief | geen fout, niets verandert (idempotent) | — |
| Blokkeren of resetlink voor een uitgenodigd account | geweigerd; intrekken of opnieuw uitnodigen | `ACCOUNT_INVITED` |
| Resetlink voor een geblokkeerd account | geweigerd | `ACCOUNT_BLOCKED` |
| Laatste twee niet-geblokkeerde admins blokkeren elkaar tegelijk | precies één slaagt | `LAST_ADMIN` |
| Inloggen tijdens het blokkeren | de sessie ontstaat misschien, maar de volgende request geeft 401 | `UNAUTHENTICATED` |
| Intrekken terwijl de genodigde tegelijk accepteert | precies één slaagt (zie Routes; rest-venster: 500) | `ALREADY_ACTIVE` of `INVITATION_INVALID` |
| Intrekken van een account dat inmiddels actief is | geweigerd | `ALREADY_ACTIVE` |
| Onbekend of al verwijderd account | geweigerd | `NOT_FOUND` |
| Geblokkeerd account met een open uitnodigings- of resetlink | wachtwoord instellen lukt, inloggen niet | `ACCOUNT_BLOCKED` |
| Resetlink ouder dan `RESET_LINK_TTL_SECONDS` of al gebruikt | melding op `/nieuw-wachtwoord` | `RESET_LINK_INVALID` |
| Herstelcode met spaties of kleine letters | spaties weg; hoofdlettergevoelig zoals de plugin | `INVALID_BACKUP_CODE` |
| Alle herstelcodes op en telefoon kwijt | `pnpm admin:create` (runbook) | — |
| Te veel pogingen met herstelcodes | plugin: 5 per uitdaging; Better Auth: 3 per 10 s per IP op `/two-factor/*` | `RATE_LIMITED` |

## Raakt ook

- `src/shared/permissions.ts`: `accounts:manage` (OV-2); foutcodes `OWN_ACCOUNT`, `ACCOUNT_INVITED`, `ACCOUNT_BLOCKED`, `RESET_LINK_INVALID`,
  `INVALID_BACKUP_CODE` met teksten; `RESET_LINK_TTL_SECONDS` in `src/core/shared/limits.ts`; contract `accountItem.status` krijgt `geblokkeerd`
  (raakt spec [lijstpagina](lijstpagina.md), filter "Status").
- `src/core/api/auth` (options, `auth.ts`: `getSession` controleert `blockedAt`; `invitations.ts`: `revoke`, `sendResetLink`), `src/api/services.ts`
  (vertaling van de nieuwe fouten), mail-layout (resetmail), route `/nieuw-wachtwoord`. `src/core/web/lib/auth.ts`: `authErrorCode` zet bij inloggen
  nu elke 4xx om in `INVALID_CREDENTIALS`; dat blijft (OV-5), erbij komen herstelcode en `RESET_LINK_INVALID`. Mutaties invalideren `accounts`.
- **Beschermde paden** (nieuwe ADR via `feiten.mjs`): ADR 0013 (backupcodes dicht, admin-plugin verworpen); ADR 0014 (allowlist; "geen sessies"
  blijft); framework §6 en ADR 0010 (`better_auth` dicht behalve `auth_service`, nu `update (blocked_at)` voor `app_definer`); `db/tests/invarianten.sql`.
- **Audit log:** besloten in [ADR 0021](../adr/0021-audit-log.md), uitgewerkt in spec [audit-log](audit-log.md): blokkeren, deblokkeren, rol, invite en
  reinvite schrijven een regel. Intrekken (`core.account.revoke`) en resetlink (`core.account.reset_link`) krijgen hun regel bij de bouw van die routes (audit-log OV-C1).

## Buiten scope

Rol wijzigen en accounts verwijderen via de UI, blokkeren met einddatum of reden, de admin-plugin van Better Auth, "wachtwoord vergeten",
aantal resterende herstelcodes tonen (`/view-backup-codes` is alleen server-side), herstelcodes downloaden of afdrukken.

## Testplan

- **Unit:** `can()` voor `accounts:manage` × rol × sessiesterkte; contractschema's; keuze resetmail of uitnodiging in `sendResetPassword`;
  `authErrorCode` (ook `ACCOUNT_BLOCKED` → `INVALID_CREDENTIALS`); `getSession` met `blockedAt`; copy.
- **pgTAP:** `app.set_account_blocked`: admin met MFA ja, `user` en admin zonder MFA 42501, eigen account, uitgenodigd account, `LAST_ADMIN`;
  `user_roles_keep_one_admin` met een geblokkeerde en met een uitgenodigde admin (AC-24); `app.accounts` status `blocked`; functiecatalogus
  (klasse `client`); allowlist-invariant met de nieuwe kolommen en zonder grant op `better_auth.session`.
- **Integratie (`pnpm test:db`):** per nieuwe route een test per verboden rol (`user` → `FORBIDDEN`, admin zonder MFA → `MFA_REQUIRED`) en ongeldige
  input; racetest "laatste twee admins"; intrekken tegen accepteren in beide volgordes (credential eerst → `ALREADY_ACTIVE`; user weg vóór
  `createAccount` → `INVITATION_INVALID`, geen 500); AC-20 t/m AC-23; `session.create.before` bij inloggen, TOTP, herstelcode en dev-login;
  resetlink: oude token ongeldig, nieuwe verloopt na de TTL; `/view-backup-codes` 404; `verify-backup-code` geeft `mfa`.
- **E2E (`pnpm ui:check`, echte stack, CSP aan):** AC-11 t/m AC-18, mails uit Mailpit; axe op 375 en 1280 px voor accounts (met open menu en elke
  `ConfirmDialog`), herstelcodes tonen, `/account` sectie Herstelcodes, `/nieuw-wachtwoord` en het herstelcodescherm bij inloggen.

## Open vragen voor de eigenaar

- **OV-1** — Waar staat "geblokkeerd"? Aanbeveling: `better_auth."user".blocked_at`, geschreven door een functie van `app_definer` (atomair met de
  laatste-admin-regel), gelezen door Better Auth bij elke sessie. Vraagt een grant buiten ADR 0014 en schrijven in `better_auth` (ADR 0010), dus een
  ADR. Alternatieven: kolom in `public.user_roles` (Better Auth kan hem niet lezen) of de admin-plugin (ADR 0013 verwierp hem; ADR nodig).
- **OV-2** — Eén permissie `accounts:manage` voor blokkeren en resetlink, intrekken onder `accounts:invite`? Aanbeveling: ja; aparte permissies pas als een app rollen anders verdeelt.
- **OV-3** — Herstelcodes ook voor `user` (zodra die TOTP kan instellen) of alleen voor admins? Aanbeveling: voor iedereen met TOTP; het kost niets extra.
- **OV-4** — Geldigheid resetlink? Aanbeveling: 1 uur (`RESET_LINK_TTL_SECONDS`, `expiresAt` na aanmaken verkort), uitnodiging blijft 7 dagen:
  een resetlink geeft een actief account over (gevolg in ADR 0013).
- **OV-5** — Ziet een geblokkeerd account (na een juist wachtwoord) "Dit account is geblokkeerd." of de gewone inlogfout? Aanbeveling: de gewone
  inlogfout (OWASP). Een eigen melding bevestigt een aanvaller dat het wachtwoord klopt (orakel voor gelekte wachtwoorden); de prijs: de
  gebruiker hoort het van de beheerder.
- **OV-6** — Deblokkeren zonder bevestiging? Aanbeveling: ja, het is niet destructief en direct terug te draaien.
- **OV-7** — Telt de laatste-admin-regel alleen actieve, niet-geblokkeerde admins, of laten we uitgenodigde admins meetellen (buiten scope)?
  Aanbeveling: alleen actieve en niet-geblokkeerde; een uitgenodigde admin kan niet inloggen, dus anders kan de laatste bruikbare admin weg.
