---
status: gebouwd # door de agent onder mandaat van de eigenaar (2026-10-11), open vragen volgens de aanbeveling; ter herziening
namespace: eigen-account
---

# Eigen account: naam, wachtwoord, sessies en e-mailadres

> Goedgekeurd door de agent onder mandaat van de eigenaar (2026-10-11). Elke open vraag is besloten volgens de aanbeveling
> erbij; zie `docs/reviews/2026-10-11-keuzes-agent.md`. De eigenaar kan dit herzien.

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

Elke ingelogde gebruiker beheert op `/account` zijn eigen naam, wachtwoord en sessies, en wijzigt zijn e-mailadres met een
bevestiging via het oude én het nieuwe adres (roadmap stuk 3e).

## Rollen en wie wat ziet

| Rol | Ziet | Mag |
|---|---|---|
| anoniem | — (`/account` en `/email-bevestigen` sturen naar `/login`, daarna terug) | — |
| `user` | `/account` via het profielmenu | eigen naam, wachtwoord, sessies en e-mailadres |
| `admin` (MFA) | idem; zonder MFA-sessie stuurt de bestaande guard hem eerst naar de TOTP-stap | idem; sectie "Herstelcodes" volgt uit spec `accountbeheer-uitbreiding` |

- Alles werkt alleen op het eigen account: de routes nemen de gebruiker uit `ctx.actor`, nooit uit de invoer.
- Sessie-ID's van andere gebruikers bestaan voor de route niet: een vreemd ID geeft `NOT_FOUND`, geen `FORBIDDEN` (geen enumeratie).
- **Wat de API afdwingt:** `me:*` eist voor een admin MFA (`can()`). `/change-password` en `/change-email` kennen geen rol: een before-hook
  weigert ze als `twoFactorEnabled` en de sessie niet `mfa` is. Een admin zonder TOTP heeft geen sterkere factor; daar werkt alleen de UI-guard.

## Datawijzigingen (met grants)

- **Geen migratie.** Naam, e-mail, `emailVerified` en sessies staan al in `better_auth` (ADR 0010); alleen `auth_service` raakt ze.
- **Better Auth-configuratie** (`src/core/api/auth/options.ts`): `user.changeEmail.enabled: true` met `sendChangeEmailConfirmation` (mail naar
  het oude adres) en `emailVerification.sendVerificationEmail` (mail naar het nieuwe adres); geldigheid `EMAIL_CHANGE_TTL_SECONDS` (OV-5).
  Beide mails linken naar `${APP_ORIGIN}/email-bevestigen?token=…` (eigen URL uit het token); de `url` en `callbackURL` van Better Auth vallen weg.
- **Hooks** (`hooks.before`/`after`, test per regel):
  - before `/change-password`: `revokeOtherSessions !== true` → `VALIDATION` (het veld komt uit de body); leest de oude sessie (sterkte,
    `createdAt`) voor de after-hook, want daar is die al verwijderd. After: de nieuwe sessie (`ctx.context.newSession`) krijgt sterkte én
    `createdAt` van de oude (OV-8); het antwoord wordt `{ user }` zonder `token`.
  - before `/change-password` en `/change-email`: `twoFactorEnabled` en sterkte ≠ `mfa` → `MFA_REQUIRED`.
  - before `/change-email`: verse sessie eisen (Better Auth gebruikt hier `sensitiveSessionMiddleware`, geen `freshAge`; OV-4). Is het adres
    bezet, dan stuurt de hook een neutrale mail naar het oude adres en antwoordt zelf `{ status: true }` (OV-9).
  - before `/verify-email`: sessie verplicht (vangnet; Better Auth maakt anders bij stap 2 zelf een sessie).
- **`disabledPaths` erbij** (404, test per pad): `/update-user`, `/update-session`, `/list-sessions`, `/revoke-session`, `/revoke-sessions`,
  `/revoke-other-sessions`, `/send-verification-email` (anoniem: mailt zodra `sendVerificationEmail` bestaat elk account met `emailVerified =
  false`, dus elke uitnodiging) en `/verify-email` (GET; bevestigen via de eigen POST-route). Geen nieuwe plugin (kern van Better Auth 1.7.7).
- `SessionInfo` in `src/core/api/auth/auth.ts` krijgt `sessionId`, zodat een route weet welke sessie "deze" is.

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| PATCH | `/api/me` `{ naam }` → `null` | `me:update` (`user`, `admin`) | `VALIDATION`, `UNAUTHENTICATED`, `MFA_REQUIRED` |
| POST | `/api/auth/change-password` `{ currentPassword, newPassword, revokeOtherSessions: true }` → `{ user }` | ingelogd; met TOTP `mfa` | `WRONG_PASSWORD`, `VALIDATION`, `MFA_REQUIRED`, `RATE_LIMITED` |
| GET | `/api/me/sessions` → `{ items: [{ id, apparaat, aangemaakt, laatstActief, huidig }] }` | `me:read` | `UNAUTHENTICATED`, `MFA_REQUIRED` |
| DELETE | `/api/me/sessions/:id` → `null` | `me:update` | `NOT_FOUND`, `VALIDATION` |
| POST | `/api/me/sessions/revoke-others` → `null` | `me:update` | — |
| POST | `/api/auth/change-email` `{ newEmail }` (Better Auth) | ingelogd, verse sessie; met TOTP `mfa` | `VALIDATION`, `SESSION_NOT_FRESH`, `MFA_REQUIRED`, `RATE_LIMITED` |
| POST | `/api/me/email/bevestigen` `{ token }` → `{ stap: 'oud' \| 'nieuw' }` | `me:update` | `EMAIL_LINK_INVALID`, `VALIDATION` |

- **Naam** via een eigen route (zod uit `src/shared/contracts/me.ts`, grens `MAX_NAME_LENGTH`) en `ctx.services.profile.rename`
  (`internalAdapter.updateUser`), niet via `/update-user`: dat accepteert ook `image` en kent onze grenzen niet (OV-2).
- **Wachtwoord** via `changePassword` (controleert het huidige; andere sessies intrekken is verplicht, framework §6); fouten via `authErrorCode`.
- **Sessies** via eigen routes en `ctx.services.sessions` (`internalAdapter.listSessions`/`deleteSession`; `/list-sessions` stuurt tokens naar
  de browser, OV-3). De lijst laat sessies ouder dan `SESSION_ABSOLUTE_SECONDS` weg (die weigert `authGateway.getSession` al). `apparaat`:
  korte omschrijving uit de user-agent ("Firefox op Windows"), parser zonder dependency.
- **E-mail**: flow "change-email-confirmation": mail 1 naar het oude adres, daarna mail 2 naar het nieuwe; na stap 2 is het adres gewijzigd en
  `emailVerified` waar. De knop op `/email-bevestigen` POST naar `/api/me/email/bevestigen` (framework §6: GET-links bevestigen met een POST);
  `ctx.services.profile.confirmEmail` roept server-side `auth.api.verifyEmail({ query: { token }, headers })` aan, zonder `callbackURL` (geen
  redirect). `TOKEN_EXPIRED`, `INVALID_TOKEN`, `USER_NOT_FOUND`, `INVALID_USER` en een 23505 uit `updateUserByEmail` worden expliciet
  `EMAIL_LINK_INVALID` (niet `ALREADY_EXISTS`). Na stap 2 trekt de service de andere sessies in en mailt het oude adres (OV-7).
- **Links zijn stateless JWT's** (HS256, geheim van Better Auth): binnen de geldigheid herbruikbaar en niet in te trekken. Link 1 opnieuw
  openen stuurt mail 2 opnieuw; link 2 werkt na gebruik niet meer (het oude adres bestaat dan niet). Daarom een korte TTL (OV-5).

## Hergebruik en UX

- **Bestaande componenten:** `PageHeader`, `Section`, `Card`, `Form`/`FormField`, `Input`, `Button`, `Notice`, `Table`, `AsyncView`, `ConfirmDialog`,
  `CenteredCard` (voor `/email-bevestigen`). Geen nieuw component.
- **Staten per scherm:** naam/wachtwoord/e-mail: leeg, bezig (knop uit, "Bezig…"), fout per veld of melding, gelukt (`Notice`). Sessies: laden, fout
  via `AsyncView` (leeg kan niet: de huidige sessie staat er altijd), bezig per rij. `/email-bevestigen`: klaar, bezig, gelukt, fout. Verouderd: n.v.t.
- **Alle zichtbare tekst letterlijk:**

| Plek | Tekst |
|---|---|
| Profielmenu | menu-item "Mijn account" (boven "Uitloggen") |
| Pagina | titel "Mijn account" |
| Naam | sectiekop "Naam"; veld "Naam"; knop "Naam opslaan"; gelukt "Je naam is opgeslagen." |
| Wachtwoord | sectiekop "Wachtwoord"; velden "Huidig wachtwoord", "Nieuw wachtwoord", "Nieuw wachtwoord herhalen"; hulptekst "Minstens 12 tekens. Je wordt op je andere apparaten uitgelogd."; knop "Wachtwoord wijzigen"; gelukt "Je wachtwoord is gewijzigd. Je andere sessies zijn beëindigd."; mismatch "De wachtwoorden zijn niet gelijk." |
| Sessies | sectiekop "Sessies"; kolommen "Apparaat", "Ingelogd op", "Laatst actief"; label "Dit apparaat"; actie "Beëindigen"; knop "Alle andere sessies beëindigen"; onbekend apparaat "Onbekend apparaat"; verborgen kolomkop "Acties" |
| Sessie beëindigen (ConfirmDialog) | titel "Sessie beëindigen?"; tekst "Het apparaat {apparaat} wordt uitgelogd."; knoppen "Beëindigen", "Annuleren"; gelukt "De sessie is beëindigd." |
| Andere sessies (ConfirmDialog) | titel "Alle andere sessies beëindigen?"; tekst "Je blijft alleen op dit apparaat ingelogd."; knoppen "Beëindigen", "Annuleren"; gelukt "Je andere sessies zijn beëindigd." |
| E-mailadres | sectiekop "E-mailadres"; huidig "Huidig e-mailadres: {email}"; veld "Nieuw e-mailadres"; knop "E-mailadres wijzigen"; gelukt "We hebben een bevestigingslink gestuurd naar {huidig e-mailadres}. Daarna volgt een link naar het nieuwe adres."; zelfde adres (client-side, hoofdletterongevoelig, geen request) "Dit is al je e-mailadres." |
| Mail oud adres | onderwerp "Bevestig de wijziging van je e-mailadres"; tekst "Iemand wil het e-mailadres van je account bij {appnaam} wijzigen in {nieuw e-mailadres}. Was jij dat? Bevestig dan met de knop. Was jij het niet? Wijzig direct je wachtwoord."; knop "Wijziging bevestigen" |
| Mail oud adres, adres bezet (OV-9) | onderwerp "Je e-mailadres is niet gewijzigd"; tekst "Iemand wilde het e-mailadres van je account bij {appnaam} wijzigen in {nieuw e-mailadres}, maar dat adres hoort al bij een ander account. Er is niets gewijzigd. Was jij het niet? Wijzig direct je wachtwoord." |
| Mail nieuw adres | onderwerp "Bevestig je nieuwe e-mailadres"; tekst "Bevestig dat dit je nieuwe e-mailadres is voor {appnaam}."; knop "E-mailadres bevestigen" |
| Mail oud adres, na wijziging (OV-7) | onderwerp "Je e-mailadres is gewijzigd"; tekst "Het e-mailadres van je account bij {appnaam} is nu {nieuw e-mailadres}. Je andere sessies zijn beëindigd. Was jij het niet? Neem direct contact op met een beheerder." |
| `/email-bevestigen` | titel "E-mailadres bevestigen"; knop "Bevestigen"; na stap 1 "Gelukt. Open nu de link die we naar je nieuwe e-mailadres hebben gestuurd."; na stap 2 "Je e-mailadres is gewijzigd." met link "Naar Mijn account" |
| Foutteksten | `WRONG_PASSWORD` "Je huidige wachtwoord klopt niet."; `SESSION_NOT_FRESH` "Log opnieuw in om dit te wijzigen."; `EMAIL_LINK_INVALID` "Deze link is verlopen of al gebruikt. Vraag de wijziging opnieuw aan." |

- **Focusvolgorde en toetsenbord:** secties in de volgorde van de tabel; Enter verzendt het formulier van de sectie waarin de focus staat; na een
  fout gaat de focus naar de melding (`role="alert"`); `ConfirmDialog` zet de focus op "Annuleren" en geeft hem bij sluiten terug aan de knop.

## Acceptatiecriteria

- **eigen-account/AC-1** — Gegeven een ingelogde `user`, wanneer hij in het profielmenu "Mijn account" kiest, dan ziet hij `/account` met de vier secties.
- **eigen-account/AC-2** — Gegeven `/account`, wanneer hij zijn naam wijzigt in "Nieuwe Naam", dan toont de melding "Je naam is opgeslagen." en tonen
  het profielmenu (initialen) en `/api/me` de nieuwe naam.
- **eigen-account/AC-3** — Gegeven twee sessies van dezelfde gebruiker, wanneer hij met het juiste huidige wachtwoord een nieuw wachtwoord instelt,
  dan is de andere sessie weg (volgende request 401), blijft hij zelf ingelogd, bevat het antwoord geen `token` en werkt alleen het nieuwe wachtwoord.
- **eigen-account/AC-4** — Gegeven een admin met MFA-sessie, wanneer hij zijn wachtwoord wijzigt, dan heeft zijn nieuwe sessie sterkte `mfa` en
  dezelfde `createdAt` als de oude, en werkt `/admin/accounts` zonder nieuwe TOTP-code.
- **eigen-account/AC-5** — Gegeven een fout huidig wachtwoord, wanneer hij verzendt, dan ziet hij "Je huidige wachtwoord klopt niet." en is er niets gewijzigd.
- **eigen-account/AC-6** — Gegeven twee sessies, wanneer hij de andere sessie beëindigt via de dialoog, dan verdwijnt die uit de lijst en geeft een
  request met die sessie 401; de eigen sessie heeft geen knop "Beëindigen" maar het label "Dit apparaat".
- **eigen-account/AC-7** — Gegeven drie sessies, wanneer hij "Alle andere sessies beëindigen" bevestigt, dan staat alleen "Dit apparaat" nog in de lijst.
- **eigen-account/AC-8** — Gegeven `gebruiker@template.test` met twee sessies, wanneer hij `nieuw@template.test` aanvraagt, beide links (Mailpit)
  opent en telkens op "Bevestigen" klikt, dan is zijn adres `nieuw@template.test`, logt hij daarmee in en met het oude niet meer, is de andere
  sessie weg en staat de mail "Je e-mailadres is gewijzigd" bij het oude adres.
- **eigen-account/AC-9** — Gegeven een e-mailadres van een ander account, wanneer hij dat aanvraagt, dan ziet hij dezelfde melding als bij een vrij
  adres, krijgt het nieuwe adres niets en krijgt het oude adres "Je e-mailadres is niet gewijzigd".
- **eigen-account/AC-10** — Gegeven een sessie ouder dan 10 minuten, wanneer hij een e-mailwijziging aanvraagt, dan ziet hij "Log opnieuw in om dit te wijzigen."
- **eigen-account/AC-11** — Gegeven een anonieme bezoeker of een andere ingelogde gebruiker, wanneer hij een bevestigingslink opent en op "Bevestigen"
  klikt, dan verandert er niets (anoniem: eerst `/login`; andere gebruiker: `EMAIL_LINK_INVALID`).
- **eigen-account/AC-12** — Gegeven een ingelogde gebruiker, wanneer hij `/api/auth/change-password` aanroept zonder `revokeOtherSessions` of met
  `false`, dan `VALIDATION` en blijven wachtwoord en andere sessies ongewijzigd.
- **eigen-account/AC-13** — Gegeven een anonieme bezoeker, wanneer hij `/api/auth/send-verification-email` aanroept met het adres van een
  uitgenodigd account, dan 404 en geen mail; `/api/auth/verify-email` en `/api/auth/update-session` geven ook 404.
- **eigen-account/AC-14** — Gegeven een gebruiker met TOTP en een sessie met sterkte `password`, wanneer hij `/change-password` of `/change-email`
  aanroept, dan `MFA_REQUIRED` en verandert er niets.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Naam leeg of > `MAX_NAME_LENGTH` | veldfout "Vul een naam in." / "Hooguit 100 tekens." | `VALIDATION` |
| Nieuw wachtwoord < 12 of > 128 tekens | veldfout "Minstens 12 tekens." / "Hooguit 128 tekens." | `VALIDATION` |
| Nieuw wachtwoord gelijk aan het huidige | toegestaan (Better Auth controleert het niet; OV-6) | — |
| Te veel pogingen met een fout huidig wachtwoord | melding van `RATE_LIMITED` (regel Better Auth: 3 per 10 s per IP en pad) | `RATE_LIMITED` |
| Sessie-ID van een andere gebruiker of onbekend | geweigerd, zelfde antwoord | `NOT_FOUND` |
| De eigen huidige sessie beëindigen via `DELETE` | geweigerd: daarvoor is "Uitloggen" | `VALIDATION` |
| Nieuw adres gelijk aan het huidige (ook met andere hoofdletters) | client-side "Dit is al je e-mailadres."; de server weigert het ook | `VALIDATION` |
| Bevestigingslink verlopen, vervalst of van een ander account; link 2 al gebruikt | één melding | `EMAIL_LINK_INVALID` |
| Link 1 nogmaals geopend binnen de geldigheid | mail 2 gaat opnieuw weg (stateless token, niet in te trekken) | — |
| Nieuw adres wordt tussen aanvraag en bevestiging door een ander account bezet | 23505 bij bijwerken; niets gewijzigd | `EMAIL_LINK_INVALID` |
| Mail versturen mislukt (aanvraag of stap 1) | niets gewijzigd; melding, opnieuw aanvragen kan | `INTERNAL_ERROR` |
| Uitgenodigd account (nog geen wachtwoord) | kan niet inloggen, dus n.v.t. | — |
| Sessie verlopen tijdens het invullen | naar `/login` met melding, daarna terug naar `/account` | `UNAUTHENTICATED` |

## Raakt ook

- `src/shared/permissions.ts`: `me:update`; contracten in `src/shared/contracts/me.ts`; foutcodes `WRONG_PASSWORD`, `SESSION_NOT_FRESH`,
  `EMAIL_LINK_INVALID` met teksten in `src/web/copy/errors.ts`; grens `EMAIL_CHANGE_TTL_SECONDS` in `src/core/shared/limits.ts`.
- `src/core/api/auth` (options, hooks, `SessionInfo.sessionId`, services `profile` en `sessions`), `src/core/web/lib/auth.ts` (nieuwe stappen in
  `authErrorCode`), mail-layout (vier nieuwe mails), `AuthConfig` krijgt een algemene `sendMail` naast `sendInvitation`.
- Mutaties invalideren `me` en `me/sessions`; na een e-mailwijziging ook `accounts`.
- **Beschermde paden:** nieuwe ADR (nummer via `feiten.mjs`) als aanvulling op ADR 0013 voor `changeEmail`, `disabledPaths` en hooks; framework §6:
  `session_strength` wordt niet meer "alleen in de after-hook op 2FA-verificatie" gezet, maar ook overgenomen bij `/change-password`.
- **Aparte core-taak (buiten deze spec):** `/sign-in/email` en `/two-factor/verify-totp` geven ook `token` in de JSON terug; strippen in een
  after-hook of in `authGateway.handler` voor alle paden.

## Buiten scope

Profielfoto (`image`), account zelf verwijderen (`/delete-user` blijft dicht), TOTP zelf aan- of uitzetten voor `user`, "wachtwoord vergeten",
IP per sessie (OV-3), mail bij een nieuwe login, het token-lek bij inloggen (core-taak hierboven).

## Testplan

- **Unit:** zod-schema's van `me.ts` (grenzen uit `limits.ts`); user-agent-parser (tabeltest); `authErrorCode`; `confirmEmail` (elke Better
  Auth-code en 23505 → `EMAIL_LINK_INVALID`); `can()` voor `me:update` × rol × sessiesterkte; copy-woordenlijst.
- **pgTAP:** n.v.t. (geen migratie); de bestaande invariant "`better_auth` dicht" blijft groen.
- **Integratie (`pnpm test:db`):** eigen routes: per verboden situatie (anoniem, admin zonder MFA) en ongeldige input; sessie van een ander →
  `NOT_FOUND`; eigen sessie via `DELETE` → `VALIDATION`; sessie ouder dan 7 dagen niet in de lijst; AC-12, AC-13 (elk nieuw dicht pad 404) en
  AC-14; na `change-password` sterkte en `createdAt` gelijk aan de oude, geen `token`; bezet adres: alleen de neutrale mail; adres tussendoor
  bezet → `EMAIL_LINK_INVALID`.
- **E2E (`pnpm ui:check`, echte stack, CSP aan):** AC-1 t/m AC-11 (mails uit Mailpit); axe op 375 en 1280 px voor `/account` (ook met open
  `ConfirmDialog`) en `/email-bevestigen`. Better Auth telt per IP en pad (lokaal één IP): `/sign-in/*`, `/change-password` en `/change-email`
  hebben 3 per 10 s; tests op die paden draaien serieel, de rest logt in via de dev-login (server-side, geen limiet), anders flakken ze.

## Open vragen voor de eigenaar

- **OV-1** — Pad en naam van het scherm: `/account` met titel "Mijn account"? Aanbeveling: ja, kort en in lijn met het profielmenu.
- **OV-2** — Naam via `PATCH /api/me` (`/update-user` dicht) of via `/update-user`? Aanbeveling: eigen route (zod, `limits.ts`, geen `image`).
- **OV-3** — Sessies via eigen routes (geen tokens naar de browser) of via `/list-sessions`? IP-adres tonen? Aanbeveling: eigen routes, geen IP.
- **OV-4** — E-mailwijziging: verse sessie (`freshAge` 10 min) of huidig wachtwoord? Aanbeveling: verse sessie; het oude adres is de tweede drempel.
- **OV-5** — Geldigheid van de links? Aanbeveling: 1 uur (standaard Better Auth, niet in te trekken), als `EMAIL_CHANGE_TTL_SECONDS`.
- **OV-6** — Weigeren we een nieuw wachtwoord dat gelijk is aan het huidige? Aanbeveling: nee in deze spec (geen eis in framework §6).
- **OV-7** — Trekt een e-mailwijziging de andere sessies in, en krijgt het oude adres een melding? Aanbeveling: beide ja (anders is
  een overgenomen adres een overgenomen account, en merkt de eigenaar het nergens).
- **OV-8** — Krijgt de nieuwe sessie na een wachtwoordwijziging sterkte én `createdAt` van de oude, of alleen sterkte `password` (opnieuw TOTP)?
  Aanbeveling: beide overnemen; met een nieuwe `createdAt` verlengt elke wachtwoordwijziging een MFA-sessie (absoluut 7 dagen, `freshAge`).
- **OV-9** — Bezet adres: tijd gelijktrekken door ook dan een (neutrale) mail naar het oude adres te sturen, of geen mail (zoals Better Auth)?
  Aanbeveling: neutrale mail; zonder mail is een bezet adres meetbaar sneller (enumeratie), en zo ziet de eigenaar ook de poging.
