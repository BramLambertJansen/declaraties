# 0013 — Uitnodigen en MFA in Better Auth

Status: geaccepteerd (2026-10-09) — voorgesteld door de agent bij roadmap stuk 2 (PR 4b); keuzes voor de reset-flow, de naam bij
uitnodigen en de wachtwoordlengte door de eigenaar (spec `docs/specs/accountbeheer.md`); geaccepteerd door de eigenaar ("alles akkoord").

## Context

De spec accountbeheer wil: geen zelf registreren en geen "wachtwoord vergeten", een admin die accounts uitnodigt, en admins altijd met TOTP.
ADR 0003 kiest Better Auth (1.7.7) met alleen de plugin two-factor. Gecontroleerd in de broncode van 1.7.7:

- `disabledPaths` werkt in de HTTP-router (`onRequest`) en geeft daar 404; een server-side aanroep via `auth.api.*` gaat er buiten om.
- `emailAndPassword.disableSignUp` blokkeert óók de server-side `signUpEmail`.
- `POST /reset-password` verbruikt het token (`consumeVerificationValue`, eenmalig) en maakt een credential-account aan als de gebruiker
  er nog geen heeft; de body bevat alleen `newPassword` en `token`.
- `requestPasswordReset` maakt een token `reset-password:<token>` (geldigheid `resetPasswordTokenExpiresIn`, voor alle tokens gelijk)
  en roept `sendResetPassword({ user, url, token })` aan.
- Zowel inloggen met TOTP als het bevestigen van een nieuwe TOTP-inschrijving loopt via `POST /two-factor/verify-totp`, dat een nieuwe sessie
  maakt (`ctx.context.newSession`). `/two-factor/disable` maakt een nieuwe sessie als kopie van de oude.

## Besluit

**Uitnodigen**
1. `POST /api/accounts/invite` (admin met MFA) maakt de gebruiker server-side aan via `(await auth.$context).internalAdapter.createUser`
   met naam en e-mail (de admin vult de naam in; besluit eigenaar), `emailVerified: false` en **zonder** credential-account. Status `uitgenodigd`
   betekent: geen credential-account. De rol komt in dezelfde stap in `user_roles` (functie van `app_definer`).
2. Daarna `auth.api.requestPasswordReset({ body: { email } })` server-side. `sendResetPassword` mailt een link naar het scherm
   `${APP_ORIGIN}/uitnodiging?token=<token>` (niet de GET-redirect van Better Auth), met de tekst uit de spec.
3. Accepteren is `POST /api/auth/reset-password` (bestaande uitzondering `/api/auth/*`, framework §3). `onPasswordReset` zet
   `emailVerified: true`. Daarna naar `/login`; er ontstaat geen sessie uit de link.
4. `resetPasswordTokenExpiresIn` = 7 dagen (uit `limits.ts`). Opnieuw uitnodigen verwijdert eerst de open `reset-password:*`-tokens van die
   gebruiker (verbinding als `auth_service`, alleen schema `better_auth`), zodat alleen de nieuwste link werkt.
5. Wachtwoord minstens 12 tekens (`minPasswordLength`, uit `limits.ts`; besluit eigenaar).

**Publiek dicht** via `disabledPaths` (404, met een test per pad): `/sign-up/email`, `/request-password-reset`,
`/two-factor/send-otp`, `/two-factor/verify-otp`, `/two-factor/verify-backup-code`, `/two-factor/generate-backup-codes`, `/two-factor/view-backup-codes`.
`disabledPaths` vergelijkt letterlijk; de GET-redirect `/reset-password/<token>` vangt daarom `authHandler` in `src/core/api/auth` af op prefix (404, test).
`emailAndPassword.disableSignUp` blijft `false`, omdat het ook de interne route raakt; de 404 komt van `disabledPaths`.

**MFA**
6. Sessieveld `session_strength` (`additionalFields`, `input: false`, standaard `password`).
7. After-hook op `/two-factor/verify-totp`: is er een `newSession`, dan krijgt die `session_strength = 'mfa'`. Dat dekt inloggen én inschrijven.
8. After-hook op `/two-factor/disable`: de nieuwe sessie krijgt `password` (framework §6: 2FA uitzetten zet de sessie terug).
9. `trustDevice` kan niet: een before-hook op `/two-factor/verify-totp` weigert `trustDevice: true` (test). Een trust-cookie zou de
   TOTP-vraag overslaan en een `password`-sessie opleveren. Backupcodes en e-mail-OTP staan dicht (hierboven).
   Wie zijn TOTP kwijt is, gebruikt `pnpm admin:create` (runbook).

**Rate limit en IP** (gevonden bij het bouwen): zonder instelling leest Better Auth het IP uit `x-forwarded-for`, die elke client zelf kan
zetten. De app vertrouwt alleen de header uit `CLIENT_IP_HEADER` (door de host gezet; framework §6), verplicht buiten `local`/`test`.
Zonder die variabele vertrouwt hij geen enkele header (lokaal valt Better Auth terug op 127.0.0.1).

**Overig** volgens ADR 0003: `cookieCache` uit, `__Host-`-cookie, absoluut 7 dagen en idle 12 uur, rate limit in de database,
schema `better_auth` (ADR 0010), eigen verbinding als `auth_service`.

## Alternatieven

- **Admin-plugin van Better Auth** (`createUser`, `setRole`): eigen rollenmodel in de sessie botst met `user_roles` uit de database
  (framework §6), en elke extra plugin vraagt een ADR om zijn advisories.
- **Eigen uitnodigingstabel en accept-route**: meer controle, maar een nieuwe publieke route buiten `defineRoute`. Verworpen door de eigenaar.
- **`signUpEmail` met een willekeurig wachtwoord**: kan niet met `disableSignUp`, en dan is "uitgenodigd" niet af te leiden.

## Gevolgen

- `internalAdapter` is geen gedocumenteerde publieke API: bij elke update van `better-auth` bewijzen de integratietests (uitnodigen, opnieuw
  uitnodigen, accepteren, dichte paden, `session_strength`) dat het nog werkt. Renovate groepeert `better-auth` daarom niet met andere updates.
- TOTP-codes zijn in Better Auth 1.7.7 herbruikbaar binnen het venster (±1 periode, geen replay-bescherming). Afgedekt door de
  rate limit per IP en de lockout na 5 fouten; eigen replay-bescherming is een mogelijke uitbreiding.
- Een "wachtwoord vergeten"-functie later is één pad uit `disabledPaths` halen plus een scherm; de token-geldigheid moet dan apart (nu 7 dagen voor alles).
- ADR 0026: blokkeren werkt zonder admin-plugin, via `blocked_at` en `app.set_account_blocked`; de verwerping van de plugin blijft staan.
