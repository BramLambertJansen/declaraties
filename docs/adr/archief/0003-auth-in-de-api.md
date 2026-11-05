# 0003 — Auth draait in de API, op de eigen Postgres

Status: vervangen door 0041
[ADR 0008](0008-grens-core-en-app.md) (`src/core/api/auth`), schema `auth` door [ADR 0010](0010-schema-better-auth.md) (`better_auth`).

## Context

Een app heeft alleen frontend-hosting en een Postgres-backend nodig (ADR 0002). Een externe identity provider
is een derde dienst. Supabase lost dit op met een aparte auth-server (GoTrue) naast de database; dat is ook een
extra dienst, alleen gebundeld. De eigenaar wil geen externe loginprovider.

## Besluit

**Library in de API.** Better Auth (≥ 1.6.13, exact gepind; nu 1.7.7) in `src/api/auth`, gemount op `/api/auth/*`.
Alleen de plugins two-factor en (optioneel) magic link; elke andere plugin vraagt een ADR (de meeste advisories zitten in plugins).

**Opslag.** Schema `auth` in dezelfde Postgres. Tabellen ontstaan via `auth generate` (gepinde versie) → SQL in een
dbmate-migratie, eigendom van `app_migrator`; nooit via `auth migrate`. `auth_service` heeft alleen DML op `auth`.
Gebruikers-ID's zijn `text` (Better Auth-standaard); `UserId` is een branded string; `public.user_roles.user_id`
verwijst naar `auth."user"(id)` met `on delete cascade`.

**Sessies.**
- Opgeslagen in de database; `session.cookieCache` uit, zodat elke request de sessie leest en intrekken direct werkt.
- Cookie `__Host-`-prefix, `httpOnly`, `Secure`, `SameSite=Lax`, same-origin; geen token in `localStorage`.
- Levensduur: absoluut 7 dagen, idle 12 uur, `freshAge` 10 minuten voor gevoelige acties (rollen, wachtwoord, 2FA).
- Bij wijziging van wachtwoord of 2FA: alle andere sessies intrekken. Blokkeren = gebruiker gemarkeerd + sessies weg.

**MFA.** De plugin markeert sessies niet. Eigen sessieveld `session_strength` (`password` | `mfa`), alleen gezet in
een after-hook op `/two-factor/verify-*`. `trustDevice` uit. Admins kunnen niet via magic link inloggen.
`withUser()` geeft `session_strength` door aan Postgres.

**Misbruik.** Rate limiting met `storage: "database"` (werkt over instanties), IP alleen uit een door de host gezette
header. Geen account-enumeratie bij aanmelden en reset; e-mailverificatie verplicht; gelekte wachtwoorden weigeren
(HIBP k-anonimity) zodra er netwerk is, lokaal uitgeschakeld. CAPTCHA alleen in staging/productie.

**CSRF.** Vervangen door [ADR 0007](0007-csrf-controle.md) (header-controle en testmatrix). Oorspronkelijke tekst, niet meer geldig: eigen middleware vóór alle routes; niet-GET eist `Sec-Fetch-Site: same-origin` of `Origin === APP_ORIGIN`
en `Content-Type: application/json`. Hono's `csrf()` dekt alleen formulieren. Geen `cors()`.

## Alternatieven

- Externe OIDC-provider (Keycloak, Zitadel, Auth0): sterker gescheiden, maar een derde dienst per app.
- Supabase Auth (GoTrue) los in Docker: zoals Supabase het doet, maar een extra container overal en bindt aan Supabase.
- Zelf bouwen: te veel securityrisico.

## Gevolgen

- Lokaal = productie voor auth, zonder extra container.
- Twee verbindingen per request (sessie als `auth_service`, data via `withUser`): meten in fase 0.
- `/api/auth/*` loopt niet via `defineRoute`; dat is de enige uitzondering, samen met de clientfouten-route.
- Seed via een script dat de auth-API aanroept (wachtwoordhashes), met een vast TOTP-geheim voor de lokale admin.
