---
status: goedgekeurd # voorstel | goedgekeurd | gebouwd | vervallen — alleen de eigenaar zet goedgekeurd
namespace: accounts
---

# Accountbeheer: inloggen, layout, uitnodigen en dev-rol-switcher

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

Iedereen met een account kan inloggen (admin altijd met TOTP) en komt per rol op de juiste plek; een admin nodigt nieuwe accounts uit,
en er is altijd een weg naar binnen (lokaal seed-accounts en een dev-rol-switcher, elders `pnpm admin:create`).

## Rollen en wie wat ziet

| Rol | Na inloggen | Sidebar | Mag |
|---|---|---|---|
| anoniem (geen databaserol) | `/login` | — (geen sidebar of topbar) | inloggen, uitnodiging accepteren |
| `user` | `/` (lege homepage) | Home | eigen sessie, uitloggen |
| `admin` (altijd MFA) | `/admin` (dashboard) | Home, Dashboard | wat `user` mag + `accounts:read`, `accounts:invite` |

- Elk account heeft precies één rol (`user_roles`, primaire sleutel `user_id`). De rol komt per request uit de database, nooit uit de sessie.
- Elke admin-permissie eist een MFA-sessie (framework §6). Een admin zonder TOTP krijgt na het wachtwoord eerst het inschrijfscherm.
- **Altijd iemand binnen:** lokaal maakt `scripts/seed` vaste accounts (`admin@template.test`, `gebruiker@template.test`, demo-wachtwoord,
  vast TOTP-geheim voor de admin; de README geeft de otpauth-URI). De seed weigert buiten `APP_ENV=local` of tegen een niet-lokale database.
  Elders is `pnpm admin:create --email …` de eerste admin én de nooduitgang (runbook `docs/operations/eerste-admin.md`).
- **De laatste admin** kan niet gedegradeerd, geblokkeerd of verwijderd worden (database-regel; UI daarvoor is buiten scope).

## Datawijzigingen (met grants)

- **Better Auth-tabellen** in schema `better_auth` (ADR 0010) via `auth generate` → migratie; plugin two-factor. Sessieveld
  `session_strength` (`input: false`, standaard `password`). Grants alleen aan `auth_service`.
- **`public.user_roles`** (`user_id text primary key references better_auth."user"(id) on delete cascade`, `role text not null check (role in ('user','admin'))`,
  `created_at timestamptz not null default now()`). RLS aan en geforceerd. Grants: `select` aan `app_authenticated`.
  Policies: `user_roles_select_own` (eigen rij) en `user_roles_select_admin` (admin met MFA ziet alles).
  Schrijven alleen via `security definer`-functies van `app_definer` (`app.invite_account`, `app.assign_role`) met policy `to app_definer`.
- **Laatste-admin-regel:** constraint-trigger op `user_roles` (en op verwijderen van de gebruiker) die faalt met `LAST_ADMIN` als er geen admin overblijft;
  `pg_advisory_xact_lock` tegen races.
- **`app.accounts`:** `security definer`-view van `app_definer` over `better_auth."user"` + `user_roles` (id, naam, e-mail, rol, status, aangemaakt),
  alleen zichtbaar voor een admin met MFA. Status: `actief` (wachtwoord ingesteld) of `uitgenodigd`.
- Rollen (`app_definer`, `auth_service`) bestaan al (`db/init`); geen nieuwe rollen.

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| POST | `/api/auth/sign-in/email` (Better Auth) | publiek (§3) | `INVALID_CREDENTIALS`, `RATE_LIMITED` |
| POST | `/api/auth/two-factor/verify-totp` (Better Auth) | half ingelogd | `INVALID_TOTP`, `RATE_LIMITED` |
| POST | `/api/auth/two-factor/enable`, `/get-totp-uri` (Better Auth) | ingelogd | `INVALID_TOTP` |
| POST | `/api/auth/reset-password` (Better Auth; uitnodiging accepteren) | publiek (§3), token | `INVITATION_INVALID`, `VALIDATION` |
| POST | `/api/auth/sign-out` (Better Auth) | ingelogd | — |
| GET | `/api/me` → `{ id, naam, email, rol }` | `me:read` (`user`, `admin`) | `UNAUTHENTICATED`, `MFA_REQUIRED` |
| GET | `/api/accounts?cursor=` → `{ items, nextCursor }` | `accounts:read` | `FORBIDDEN`, `MFA_REQUIRED` |
| POST | `/api/accounts/invite` `{ naam, email, rol }` | `accounts:invite` | `ALREADY_EXISTS`, `VALIDATION`, `FORBIDDEN`, `MFA_REQUIRED` |
| POST | `/api/accounts/:id/reinvite` | `accounts:invite` | `NOT_FOUND`, `ALREADY_ACTIVE`, `FORBIDDEN`, `MFA_REQUIRED` |
| POST | `/api/dev/login-as` `{ rol }` | alleen `APP_ENV=local`, anders 404 | `NOT_FOUND` |

- **Uitnodiging (besluit eigenaar):** `invite` maakt het account direct aan (status `uitgenodigd`, `emailVerified` pas na instellen) en verstuurt
  via Better Auth een link om het wachtwoord in te stellen (geldig 7 dagen). Het publieke `/api/auth/request-password-reset` staat dicht
  (geen "wachtwoord vergeten" in deze reeks). Exacte Better Auth-configuratie: [ADR 0013](../adr/0013-uitnodigen-en-mfa-in-better-auth.md).
  De admin vult de naam in bij het uitnodigen; het uitnodigingsscherm vraagt alleen het wachtwoord (besluit eigenaar, 2026-10-09).
- **Rollen (besluit eigenaar, 2026-10-10):** één account heeft één rol. De rolwisselaar toont elke rol uit `ROLES`
  (`src/core/shared/can.ts`); elke rol heeft een seed-account en een naam (`Record<Role, …>`, dus een nieuwe rol zonder die twee is
  een typefout). Een nieuwe rol vraagt ook een migratie (CHECK op `user_roles.role`).
- **Dev-route (besluit eigenaar):** limitatieve uitzondering in framework §3 (ADR in PR 7). Logt echt in als het seed-account van de rol;
  voor de admin vult de server de TOTP-code in met het vaste lokale geheim. Wordt buiten `local` niet geregistreerd.
- `/api/auth/sign-up/email`, magic link en `trustDevice` staan uit.

## Hergebruik en UX

- **Bestaande componenten:** nog geen (stuk 3c levert Button, Input, Field, Card, Dialog). Nieuw in de kit: `DropdownMenu`, `Table`, `Select`;
  layoutblokken `AppShell`, `Sidebar` (items per rol via registratie), `Topbar`, `CenteredCard`.
- **Staten per scherm:** login/TOTP/uitnodiging: leeg formulier, bezig (knop uit, "Bezig…"), fout (melding boven het formulier), gelukt (doorsturen).
  Accounts: laden, leeg, fout via `<AsyncView>`; uitnodigen: bezig, gelukt (melding), fout per veld. Verouderd: n.v.t. (geen cache-indicatie).
- **Alle zichtbare tekst letterlijk:**

| Plek | Tekst |
|---|---|
| Login | titel "Inloggen"; velden "E-mailadres", "Wachtwoord"; knop "Inloggen"; fout "E-mailadres of wachtwoord klopt niet." |
| TOTP | titel "Verificatiecode"; uitleg "Voer de 6-cijferige code uit je authenticator-app in."; veld "Code"; knop "Bevestigen"; fout "Deze code klopt niet. Probeer het opnieuw." |
| TOTP instellen | titel "Tweestapsverificatie instellen"; uitleg "Scan de QR-code met je authenticator-app en voer daarna de code in."; link "Kan je niet scannen? Toon de sleutel"; veld "Code"; knop "Activeren" |
| Uitnodiging | titel "Wachtwoord instellen"; velden "Wachtwoord", "Wachtwoord herhalen"; hulptekst "Minstens 12 tekens."; knop "Wachtwoord instellen"; fout "Deze uitnodiging is verlopen of al gebruikt. Vraag een nieuwe aan."; mismatch "De wachtwoorden zijn niet gelijk." |
| Na instellen | op `/login`: "Je wachtwoord is ingesteld. Log in om verder te gaan." |
| Sidebar | "Home", "Dashboard" |
| Topbar | themaschakelaar (toggle, toegankelijke naam "Donker thema"; keuze blijft bewaard in de browser; besluit eigenaar 2026-10-10); profielknop met initialen (toegankelijke naam "Profielmenu"); menu-item "Uitloggen" |
| Home | titel "Home" (verder leeg) |
| Dashboard | titel "Dashboard"; link "Accounts"; link "Design system" naar `/design-system`, alleen zichtbaar voor wie `design-system:read` heeft (admin); geen sidebar-item (sinds #51; eerder alleen lokaal, besluit eigenaar 2026-10-10) |
| Accounts | titel "Accounts"; kolommen "Naam", "E-mailadres", "Rol", "Status"; rollen "Gebruiker", "Beheerder"; status "Actief", "Uitgenodigd"; actie "Opnieuw uitnodigen"; knop "Account uitnodigen"; leeg "Nog geen accounts."; meer "Meer laden" |
| Uitnodigen (dialoog) | titel "Account uitnodigen"; velden "Naam", "E-mailadres", "Rol"; knoppen "Uitnodiging versturen", "Annuleren"; gelukt "Uitnodiging verstuurd naar {email}."; bestaat "Er bestaat al een account met dit e-mailadres." |
| Dev-switcher (alleen lokaal) | op elk scherm (ook `/login` en ingelogd) een tabje rechts (toegankelijke naam "Rol wisselen (alleen lokaal)"); een klik schuift een paneel in met kop "Lokaal inloggen als", een knop per rol ("Gebruiker", "Beheerder"; de huidige gemarkeerd) en "Sluiten"; Esc sluit. Niet meer op het inlogscherm of in het profielmenu (besluit eigenaar, 2026-10-10) |
| Algemeen | sessie verlopen: naar `/login` met "Je sessie is verlopen. Log opnieuw in."; geen rechten: "Je hebt geen toegang tot deze pagina."; mail-onderwerp "Uitnodiging voor {appnaam}" |
| Aanvullend (teksten door de agent, akkoord eigenaar 2026-10-10) | toegankelijke namen "QR-code voor je authenticator-app", "Acties" (verborgen kolomkop), "Hoofdmenu", "Menu openen", "Sluiten"; label "Sleutel"; validatie "Vul een geldig e-mailadres in.", "Vul je wachtwoord in.", "Vul de 6 cijfers in.", "Vul een naam in."; na opnieuw uitnodigen "Uitnodiging verstuurd naar {email}."; `ALREADY_ACTIVE` "Dit account is al actief. Een nieuwe uitnodiging is niet nodig."; `LAST_ADMIN` "Er moet minstens één beheerder overblijven." |

- **Focusvolgorde en toetsenbord:** focus start op het eerste veld; Enter verzendt; na een fout gaat de focus naar de melding (`role="alert"`).
  Sidebar en profielmenu volledig met toetsenbord (Esc sluit het menu, focus terug op de knop); dialoog vangt de focus en Esc annuleert.

## Acceptatiecriteria

- **accounts/AC-1** — Gegeven een anonieme bezoeker, wanneer hij een andere route opent, dan komt hij op `/login` zonder sidebar of topbar.
- **accounts/AC-2** — Gegeven een `user`, wanneer hij inlogt, dan ziet hij `/` met sidebar "Home" en het profielmenu rechts in de topbar.
- **accounts/AC-3** — Gegeven een admin met TOTP, wanneer hij wachtwoord en code invoert, dan ziet hij `/admin` met de link "Accounts".
- **accounts/AC-4** — Gegeven een admin zonder TOTP, wanneer hij met zijn wachtwoord inlogt, dan krijgt hij eerst "Tweestapsverificatie instellen"
  en zijn admin-routes geven `MFA_REQUIRED` tot de code klopt.
- **accounts/AC-5** — Gegeven een admin met MFA, wanneer hij "Nieuwe Gebruiker" met `nieuw@template.test` als "Gebruiker" uitnodigt, dan staat er een mail in Mailpit en
  het account met status "Uitgenodigd" in de lijst.
- **accounts/AC-6** — Gegeven die uitnodiging, wanneer de genodigde zijn wachtwoord instelt, dan komt hij op `/login` met de bevestiging, kan hij
  inloggen en is de status "Actief".
- **accounts/AC-7** — Gegeven een `user`, wanneer hij `/admin` of `/api/accounts` opent, dan ziet hij "Je hebt geen toegang tot deze pagina." / krijgt hij `FORBIDDEN`.
- **accounts/AC-8** — Gegeven `APP_ENV=local`, wanneer iemand op "Beheerder" in de dev-switcher klikt, dan is hij ingelogd als `admin@template.test`
  met een MFA-sessie; gegeven een andere `APP_ENV` geeft `/api/dev/login-as` 404 en bevat de productiebundel de switcher niet.
- **accounts/AC-9** — Gegeven één admin, wanneer iets zijn rol wijzigt of het account verwijdert, dan faalt dat met `LAST_ADMIN`.
- **accounts/AC-10** — Gegeven een ingelogde gebruiker, wanneer hij "Uitloggen" kiest, dan is de sessie in de database weg en geeft de volgende request 401.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Onbekend e-mailadres of fout wachtwoord | dezelfde melding, dezelfde responstijd | `INVALID_CREDENTIALS` |
| Te veel pogingen (inloggen, TOTP) | "Te veel pogingen. Probeer het over een paar minuten opnieuw." | `RATE_LIMITED` |
| Uitnodiging verlopen, al gebruikt of onbekend token | één melding, geen onderscheid | `INVITATION_INVALID` |
| Uitnodigen van een bestaand account (ook `uitgenodigd`) | foutmelding; voor `uitgenodigd` is er "Opnieuw uitnodigen" | `ALREADY_EXISTS` |
| Opnieuw uitnodigen van een actief account | geweigerd | `ALREADY_ACTIVE` |
| Opnieuw uitnodigen | oude link vervalt, nieuwe 7 dagen geldig | — |
| Twee admins nodigen tegelijk hetzelfde adres uit | precies één slaagt | `ALREADY_EXISTS` |
| Laatste twee admins degraderen elkaar tegelijk | precies één slaagt | `LAST_ADMIN` |
| Wachtwoord korter dan 12 tekens | veldfout "Minstens 12 tekens." | `VALIDATION` |
| Sessie verlopen (idle 12 u, absoluut 7 d) | naar `/login` met melding | `UNAUTHENTICATED` |
| Admin verliest zijn TOTP-telefoon | `pnpm admin:create --email …` (runbook); geen UI | — |
| Seed of `admin:create` tegen een niet-lokale database / buiten `local` | seed weigert; `admin:create` werkt elders wél | — |

## Raakt ook

- Mutaties `invite` en `reinvite` invalideren de query `accounts`. Na uitloggen wordt de hele querycache geleegd.
- Framework §3 krijgt de uitzondering voor `/api/dev/login-as` (met ADR); `src/shared/permissions.ts` krijgt `me:read`, `accounts:read`, `accounts:invite`.
- Foutcodes `INVALID_CREDENTIALS`, `INVALID_TOTP`, `INVITATION_INVALID`, `ALREADY_ACTIVE`, `LAST_ADMIN`, `MFA_REQUIRED`, `RATE_LIMITED` in het register;
  teksten in `src/web/copy/errors.ts`. Grenzen in `src/shared/limits.ts`: wachtwoord ≥ 12, paginagrootte 25, uitnodiging 7 dagen.

## Buiten scope

Zelf registreren, magic link, "wachtwoord vergeten", backupcodes voor TOTP, rol wijzigen of account blokkeren/verwijderen via de UI,
profiel bewerken, sessiebeheer per apparaat, zoeken en filteren in de accountlijst, e-mail wijzigen.

## Testplan

- **Unit:** `can()` per permissie × rol × sessiesterkte; zod-schema's (e-mail, rol, wachtwoordlengte gelijk aan `limits.ts`); copy-woordenlijst.
- **pgTAP:** elke policy op naam (`user_roles_select_own`, `user_roles_select_admin`, policy `to app_definer`); `app.accounts` alleen voor admin met MFA;
  laatste-admin-trigger; functiecatalogus en RLS-invarianten.
- **Integratie (`pnpm test:db`):** per route een test per verboden rol (`FORBIDDEN`) en voor admin zonder MFA (`MFA_REQUIRED`); ongeldige input;
  racetests "twee keer hetzelfde adres uitnodigen" en "laatste twee admins"; `/api/dev/login-as` 404 buiten `local`; seed-guard.
- **E2E (`pnpm ui:check`, echte stack, CSP aan):** AC-1 t/m AC-8 en AC-10, met de uitnodigingsmail uit Mailpit; axe op 375 en 1280 px voor
  login, TOTP, uitnodiging, home, dashboard en accounts; een test dat de productiebundel geen dev-switcher bevat.
