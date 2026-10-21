# 0043 — Accounts: uitnodigen, MFA, dev-login, eigen account en blokkeren

Status: geaccepteerd

Vervangt [0013](0013-uitnodigen-en-mfa-in-better-auth.md), [0014](0014-dev-login-en-accounts-view.md),
[0024](0024-eigen-account-in-better-auth.md) en [0026](0026-account-blokkeren.md). Drempel: A4. Consolidatie zonder
inhoudelijke wijziging (eigenaarbesluit 2026-10-21, [0038](0038-beslisroute.md) Gevolgen).

## Context

Accounts staan in Better Auth, in het dichte schema `better_auth` (ADR 0003, 0010). De specs
[accountbeheer](../specs/accountbeheer.md), [accountbeheer-uitbreiding](../specs/accountbeheer-uitbreiding.md) en
[eigen-account](../specs/eigen-account.md) vragen: geen zelf registreren of "wachtwoord vergeten", een admin die uitnodigt
en blokkeert, admins altijd met TOTP, een accountlijst, een lokale rolwisselaar, en een gebruiker die zijn eigen naam,
wachtwoord, sessies en e-mailadres beheert. Veel endpoints van Better Auth passen daar niet bij: ze zijn anoniem, sturen
sessietokens naar de browser, kennen `limits.ts` niet of maken zelf sessies. De admin-plugin heeft een eigen rollenmodel naast
`user_roles`. De punten uit 0024 nam de agent onder mandaat aan; de eigenaar koos bij de consolidatie "zelfde besluiten,
compact" (0038).

## Besluit

**Uitnodigen**

1. **Aanmaken zonder credential** (was 0013 punt 1–2). `POST /api/accounts/invite` (admin met MFA) maakt de gebruiker
   server-side via `internalAdapter.createUser`, met naam (door de admin) en e-mail, `emailVerified: false`, zonder
   credential-account; de rol komt in dezelfde stap in `user_roles`. "Uitgenodigd" = geen credential-account. Daarna
   `requestPasswordReset` server-side; de mail linkt naar `${APP_ORIGIN}/uitnodiging?token=…`.
2. **Accepteren** (was 0013 punt 3–5). Via `POST /api/auth/reset-password`, dat het credential-account aanmaakt; de hook
   `databaseHooks.account.create.after` zet dan `emailVerified: true` (alleen binnen een request). Daarna `/login`, geen
   sessie uit de link. Token 7 dagen, wachtwoord minstens 12 tekens (beide uit `limits.ts`). Opnieuw
   uitnodigen verwijdert eerst de open reset-tokens, zodat alleen de nieuwste link werkt.

**Publiek dicht**

3. **`disabledPaths`, 404 met een test per pad** (was 0013, 0024 punt 1): `/sign-up/email`, `/request-password-reset`,
   `/two-factor/send-otp`, `/two-factor/verify-otp`, de drie backup-code-paden, `/update-user`, `/update-session`,
   `/list-sessions`, `/revoke-session`, `/revoke-sessions`, `/revoke-other-sessions`, `/send-verification-email` en
   `/verify-email` (plus `/delete-user`, ADR 0022). De GET-redirect `/reset-password/<token>` vangt `authHandler` op prefix af. `disableSignUp` blijft
   `false`, omdat het ook de interne aanroep raakt. Geen extra plugin.

**MFA en sessies**

4. **`session_strength`** (was 0013 punt 6–8, 0024 punt 5). Sessieveld, `input: false`, standaard `password`. De after-hook op
   `/two-factor/verify-totp` zet een nieuwe sessie op `mfa` (inloggen én inschrijven); na `/two-factor/disable` wordt het
   `password`.
5. **Geen `trustDevice`** (was 0013 punt 9). Een before-hook weigert `trustDevice: true`. Wie zijn TOTP kwijt is: `pnpm admin:create`.
6. **Client-IP** (was 0013). Alleen de header uit `CLIENT_IP_HEADER` telt, verplicht buiten `local`/`test`; zonder die
   variabele geen enkele header.

**Eigen account** (was 0024)

7. **Eigen routes** (was 0024 punt 2). Naam, sessies tonen en beëindigen, andere sessies intrekken en een e-mailwijziging
   bevestigen gaan via `defineRoute` (`me:read`/`me:update`), met `ctx.services` op `internalAdapter` of `auth.api.*` en
   altijd de gebruiker uit `ctx.actor`. Sessielijsten bevatten nooit token, IP of ruwe user-agent. Het bevestigen geeft de
   headers van het verzoek mee aan Better Auth, zodat de link aan de ingelogde gebruiker gebonden is (`INVALID_USER`).
8. **Wachtwoord wijzigen** (was 0024 punt 3). Alleen met `revokeOtherSessions: true` (anders `VALIDATION`); de nieuwe sessie
   erft sterkte én `createdAt` van de oude, en het antwoord bevat geen token. Met 2FA aan eisen wachtwoord en e-mail
   wijzigen een `mfa`-sessie (`MFA_REQUIRED`).
9. **E-mail wijzigen** (was 0024 punt 3–4). Alleen met een verse sessie (`SESSION_NOT_FRESH`). Mail naar het oude en het
   nieuwe adres, geldig `EMAIL_CHANGE_TTL_SECONDS`, link naar `/email-bevestigen` die met een POST bevestigt; alleen de twee
   change-email-tokentypes gelden (`EMAIL_LINK_INVALID`). Een bezet adres geeft een neutrale mail en hetzelfde antwoord.
   `/verify-email` eist een sessie. Na stap 2 trekt de service de andere sessies in en mailt het oude adres. Zonder
   `sendMail` staat wijzigen uit.

**Accountlijst en dev-login** (was 0014)

10. **`app.accounts`** (was 0014 punt 2, 0026 punt 5). View van `app_definer`, `security_barrier`, alleen rijen bij
    `app.is_mfa_admin()`; status `blocked`, `active` of `invited`. `app_definer` leest uit `better_auth` alleen
    `"user"(id, name, email, "createdAt", blocked_at)` en `account("userId", "providerId")`: geen wachtwoord, sessies of
    TOTP-geheimen, en geen grant op `better_auth.session`. De allowlist staat in `db/tests/invarianten.sql`; elke andere
    grant, ook een extra kolom, faalt. Een nieuwe kolom vraagt een ADR.
11. **Querybouwer** (was 0014 punt 3). `src/api` mag `drizzle-orm` en `drizzle-orm/pg-core` importeren, nooit een driver.
12. **Services** (was 0014 punt 4). `createRouteKit<Permission, Services>` en `createApp({ services })` geven `ctx.services`.
13. **Dev-login** (was 0014 punt 1). `POST /api/dev/login-as` bestaat alleen bij `APP_ENV=local` (anders 404), loopt door de
    CSRF-controle, accepteert alleen `{ rol: 'user' | 'admin' }` en logt echt in als het seed-account; voor de admin vult de
    server de TOTP in, zodat de sessie `mfa` is. Uitzondering in framework §3.

**Blokkeren** (was 0026)

14. **Kolom en recht** (was 0026 punt 1–2). `better_auth."user".blocked_at` (Better Auth-veld, `input: false`), via de
    gegenereerde auth-schema-SQL in een nieuwe migratie, nooit `auth migrate`. `app_definer` krijgt `select` en `update` op alleen die kolom; de enige schrijfuitzondering op
    `better_auth` naast `auth_service`.
15. **`app.set_account_blocked(id, blocked)`** (was 0026 punt 3). `security definer` van `app_definer`, alleen voor
    `app_authenticated`. Volgorde: geen MFA-admin → `FORBIDDEN`; onbekend → `NOT_FOUND`; deblokkeren is idempotent zonder verdere
    controles; blokkeren weigert het eigen account (`OWN_ACCOUNT`) en een uitnodiging (`ACCOUNT_INVITED`), is idempotent
    (`blocked_at` blijft het eerste tijdstip), neemt de last-admin-lock en faalt met `LAST_ADMIN` als er geen telbare admin
    overblijft. Een auditregel in dezelfde body, alleen bij een echte wijziging; een idempotente aanroep schrijft niets.
16. **Telbare admin** (was 0026 punt 4). Rol `admin`, met credential-account en zonder `blocked_at`. De trigger op `user_roles`
    gebruikt dezelfde definitie en dezelfde lock.
17. **Sessie weigeren** (was 0026 punt 6). De garantie zit in `authGateway.getSession`: bij `blockedAt` verwijdert hij de
    sessies en geeft geen sessie. `session.create.before` geeft bij inloggen via een endpoint `ACCOUNT_BLOCKED`. De web toont
    bij inloggen de gewone inlogfout (geen orakel); de tekst over blokkeren staat alleen in de beheerlijst.
18. **Route** (was 0026 punt 7). `POST /api/accounts/:id/block`: eerst de functie in `withUser()`, na de commit de sessies
    intrekken; faalt dat, dan houdt punt 17 ze tegen. Deblokkeren roept alleen de functie aan.

## Alternatieven

- **Admin-plugin van Better Auth** (was 0013, 0026): rollen in de sessie botsen met `user_roles`; `banUser` kan niet atomair
  met de last-admin-regel.
- **Eigen uitnodigingstabel en accept-route** (was 0013): publieke route buiten `defineRoute`; verworpen door de eigenaar.
- **Dev-login als `defineRoute` met een publieke permissie** (was 0014): een permissie "iedereen", ook buiten lokaal.
- **Accountlijst via Better Auth samenvoegen** of de view als `app_migrator` (was 0014): buiten RLS, of draait met alle rechten.
- **Endpoints van Better Auth openlaten** (was 0024): tokens in de browser, geen grenzen uit `limits.ts`.
- **Na een wachtwoordwijziging opnieuw TOTP** (was 0024): elke wijziging verlengt dan de MFA-sessie.
- **Blokkade in `app` of `user_roles`** (was 0026): Better Auth kan hem niet lezen; extra verbinding per sessie.
- **Schrijven via `internalAdapter`** of **alleen de create-hook** (was 0026): niet atomair met de last-admin-controle, of een
  sessie tussen blokkeren en intrekken blijft geldig.

## Gevolgen

- `internalAdapter` en de databaseHooks zijn geen publieke API: de integratietests bewijzen bij elke update van `better-auth`
  dat uitnodigen, dichte paden, hooks, `session_strength` en blokkeren nog werken; Renovate groepeert `better-auth` niet.
- TOTP-codes zijn binnen het venster herbruikbaar; afgedekt door rate limit en lockout (was 0013).
- Een e-maillink is stateless en binnen zijn geldigheid herbruikbaar (was 0024).
- Een uitgenodigde of geblokkeerde admin telt niet als laatste admin. De serialisatie steunt op `read committed`; een
  strengere isolatie in `withUser()` vraagt een nieuwe racetest (was 0026).
- Inloggen (`/sign-in/email`, `/two-factor/verify-totp`) geeft het sessietoken nog in de JSON terug; strippen is een aparte
  core-taak (was 0024, spec eigen-account).
- De seed-accounts en het vaste TOTP-geheim zijn ook de toegang van de dev-login; ze bestaan alleen lokaal (was 0014).
- "Wachtwoord vergeten" later is een pad uit `disabledPaths` plus een scherm, met een eigen tokengeldigheid (was 0013).
