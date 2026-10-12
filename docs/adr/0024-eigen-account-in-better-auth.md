# 0024 — Eigen account in Better Auth: wachtwoord, sessies en e-mailadres

Status: geaccepteerd (agent, onder mandaat van de eigenaar; ter herziening). Volgt uit de goedgekeurde spec
`docs/specs/eigen-account.md` (open vragen volgens de aanbeveling, 2026-10-11). Aanvulling op ADR 0013. Nummer 0024: 0021 en 0022
zijn bezet door PR #80 (audit log, AVG), 0023 door PR #88 (tokenzuinige werkstraat).

## Context

De spec `eigen-account` laat een ingelogde gebruiker zijn naam, wachtwoord, sessies en e-mailadres beheren (roadmap stuk 3e).
Better Auth 1.7.7 heeft daar eigen endpoints voor, met eigenschappen die niet bij de template passen. Gecontroleerd in de broncode:

- `/update-user` accepteert ook `image` en kent de grenzen uit `limits.ts` niet.
- `/list-sessions` stuurt de sessietokens naar de browser; `/revoke-session` werkt op een token.
- `/change-password` maakt bij `revokeOtherSessions` een nieuwe sessie met `session_strength = 'password'` en een nieuwe `createdAt`,
  en geeft het nieuwe token in de JSON terug. Het veld `revokeOtherSessions` is optioneel.
- `/change-email` gebruikt `sensitiveSessionMiddleware` (geen `freshAge`) en antwoordt bij een bezet adres zonder mail
  (meetbaar sneller: enumeratie).
- `/send-verification-email` is anoniem: met `sendVerificationEmail` ingesteld mailt het elk account met `emailVerified = false`,
  dus elke openstaande uitnodiging.
- `/verify-email` is een GET die bij stap 2 van een e-mailwijziging zelf een sessie maakt als er geen is.
- De links zijn stateless JWT's (HS256, geheim van Better Auth): binnen de geldigheid herbruikbaar en niet in te trekken.

## Besluit

1. **Dicht** via `disabledPaths` (404, test per pad): `/update-user`, `/update-session`, `/list-sessions`, `/revoke-session`,
   `/revoke-sessions`, `/revoke-other-sessions`, `/send-verification-email` en `/verify-email`. Geen nieuwe plugin.
2. **Eigen routes** (`defineRoute`, permissie `me:update`/`me:read`) voor naam (`PATCH /api/me`), sessies (`GET /api/me/sessions`,
   `DELETE /api/me/sessions/:id`, `POST /api/me/sessions/revoke-others`) en het bevestigen van een e-mailwijziging
   (`POST /api/me/email/bevestigen`). Ze werken via `ctx.services` op `internalAdapter` of server-side `auth.api.*`, altijd met de
   gebruiker uit `ctx.actor`. `SessionInfo` krijgt `sessionId`, zodat een route weet welke sessie "deze" is.
3. **Hooks** (`src/core/api/auth/hooks.ts`, test per regel):
   - before `/change-password`: `revokeOtherSessions !== true` → `VALIDATION`; de oude sessie (sterkte, `createdAt`) wordt bewaard.
     After: de nieuwe sessie krijgt sterkte én `createdAt` van de oude (geen nieuwe TOTP-stap, geen verlenging van de absolute duur of
     `freshAge`); het antwoord wordt `{ user }` zonder `token`.
   - before `/change-password` en `/change-email`: `twoFactorEnabled` en sterkte ≠ `mfa` → `MFA_REQUIRED`.
   - before `/change-email`: sessie ouder dan `SESSION_FRESH_SECONDS` → `SESSION_NOT_FRESH`; bezet adres → neutrale mail naar het oude
     adres en zelf `{ status: true }` (geen tijdsverschil met een vrij adres).
   - before `/verify-email`: sessie verplicht (vangnet naast `disabledPaths`).
4. **E-mail wijzigen** met `user.changeEmail.enabled`, `sendChangeEmailConfirmation` (mail naar het oude adres) en
   `emailVerification.sendVerificationEmail` (mail naar het nieuwe adres), geldigheid `EMAIL_CHANGE_TTL_SECONDS` (1 uur). Beide mails
   linken naar `${APP_ORIGIN}/email-bevestigen?token=…`; het scherm bevestigt met een POST (framework §6). Na stap 2 trekt de service de
   andere sessies in en mailt het oude adres. `AuthConfig` krijgt een algemene `sendMail` naast `sendInvitation`.
5. **Framework §6**: `session_strength` wordt gezet in de after-hook op 2FA-verificatie, én overgenomen van de oude sessie bij
   `/change-password`.

## Uitwerking van deel 2 (afwijkingen en keuzes tijdens het bouwen)

- `AuthConfig` krijgt `sendMail` (optioneel: zonder staat `changeEmail` uit) en `appName` (optioneel, standaard de hostnaam van de origin):
  core kent `APP_NAME` niet, `server.ts` geeft hem mee. De vier mails staan in `src/core/api/mail/email-change.ts`; `layout.ts` kreeg
  `action.labelInText` (het label van de knop ook in de tekstversie, vóór de link).
- `RouteContext` krijgt `headers: Headers` en `RouteActor` een `sessionId`. `confirmEmail` roept `auth.api.verifyEmail` aan met de
  headers van het verzoek, zodat Better Auth controleert dat de link bij de ingelogde gebruiker hoort (`INVALID_USER`).
- De route bevestigt alleen tokens met `requestType` `change-email-confirmation` en `change-email-verification`; een gewone
  verificatielink wordt `EMAIL_LINK_INVALID`.
- Sessies tonen en beëindigen via `internalAdapter.listSessions` en `deleteSession(s)`; de lijst bevat nooit tokens, IP of de ruwe user-agent.
- Web: de auth-client wordt per aanroep gemaakt (hij legt `fetch` vast bij het aanmaken; zo stubt een test `fetch` per test).
  `Section` kreeg `landmark={false}` voor een sectie waarvan de inhoud (een `Table` met label) al een region met dezelfde naam is.

## Alternatieven

- **De endpoints van Better Auth openlaten** (`/update-user`, `/list-sessions`): minder code, maar tokens in de browser, geen grenzen uit
  `limits.ts` en een open `image`-veld.
- **Huidig wachtwoord in plaats van een verse sessie** bij e-mail wijzigen (OV-4): het oude adres is al een tweede drempel.
- **Na een wachtwoordwijziging opnieuw TOTP** (OV-8): veilig, maar met een nieuwe `createdAt` verlengt elke wijziging de MFA-sessie.

## Gevolgen

- Meer `internalAdapter`-gebruik: de integratietests (`test/api/eigen-account*.int.test.ts`) bewijzen bij elke update van `better-auth`
  dat de hooks en dichte paden nog werken.
- Een link uit een e-mailwijziging blijft binnen het uur herbruikbaar (stateless): link 1 opnieuw openen stuurt mail 2 opnieuw.
- Inloggen (`/sign-in/email`, `/two-factor/verify-totp`) geeft het token nog in de JSON: aparte core-taak, buiten deze ADR.
