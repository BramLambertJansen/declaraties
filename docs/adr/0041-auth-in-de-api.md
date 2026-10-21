# 0041 — Auth: Better Auth in de API, sessies, CSRF en schema `better_auth`

Status: geaccepteerd

Vervangt [0003](0003-auth-in-de-api.md), [0007](0007-csrf-controle.md) en [0010](0010-schema-better-auth.md). Drempel: A4.
Consolidatie zonder inhoudelijke wijziging (eigenaarbesluit 2026-10-21, [0038](0038-beslisroute.md) Gevolgen). Uitgewerkt in
[0013](0013-uitnodigen-en-mfa-in-better-auth.md), [0014](0014-dev-login-en-accounts-view.md),
[0024](0024-eigen-account-in-better-auth.md) en [0026](0026-account-blokkeren.md).

## Context

Een app heeft alleen frontend-hosting en een Postgres-backend nodig ([0039](0039-stack-provider-neutraal-en-toolchain.md)).
Een externe identity provider is een derde dienst; de eigenaar wil geen externe loginprovider. Supabase, de standaardvoorkeur
voor beheerde Postgres, heeft al een schema `auth` dat een app niet kan gebruiken of hernoemen. Hono's `csrf()` dekt alleen
formulier-content-types; een JSON-POST glipt erdoor.

## Besluit

1. **Library in de API** (was 0003; plaats was 0008). Better Auth, exact gepind en minstens 1.6.13, in `src/core/api/auth`,
   gemount op `/api/auth/*`. Alleen de plugins two-factor en (optioneel) magic link; elke andere plugin vraagt een ADR.
2. **Opslag** (was 0003; schema was 0010). Schema `better_auth` in dezelfde Postgres. Tabellen ontstaan via `auth generate`
   (gepinde versie) als SQL in een dbmate-migratie, eigendom van `app_migrator`; nooit via `auth migrate`. `auth_service` heeft
   `search_path = better_auth` en alleen DML op dat schema. Gebruikers-ID's zijn `text`, `UserId` is een branded string;
   `public.user_roles.user_id` verwijst naar `better_auth."user"(id)` met `on delete cascade`.
3. **Schema dicht** (was 0010 Gevolgen). Niemand behalve `auth_service` heeft rechten op `better_auth`; de enige uitzonderingen
   zijn de kolom-allowlist van `app_definer` (0014) en `blocked_at` (0026).
4. **Sessies** (was 0003). In de database; `session.cookieCache` uit, zodat intrekken direct werkt. Cookie met
   `__Host-`-prefix, `httpOnly`, `Secure`, `SameSite=Lax`, same-origin; geen token in `localStorage`. Absoluut 7 dagen, idle
   12 uur, `freshAge` 10 minuten voor gevoelige acties. Bij wijziging van wachtwoord of 2FA: alle andere sessies intrekken.
   Blokkeren is: gebruiker gemarkeerd en sessies weg.
5. **MFA** (was 0003). Eigen sessieveld `session_strength` (`password` | `mfa`), alleen gezet in een after-hook op de
   2FA-verificatie. `trustDevice` uit; admins loggen niet in via magic link. `withUser()` geeft `session_strength` door aan
   Postgres.
6. **Misbruik** (was 0003). Rate limiting met opslag in de database; het IP alleen uit een door de host gezette header. Geen
   account-enumeratie bij aanmelden en reset; e-mailverificatie verplicht; gelekte wachtwoorden weigeren (HIBP
   k-anonimiteit) buiten lokaal. CAPTCHA alleen in staging en productie.
7. **CSRF** (was 0007 punt 1–5). Eigen middleware vóór alle routes. Voor elk request behalve GET, HEAD en OPTIONS:
   het mediatype van `Content-Type` is `application/json` (hoofdletterongevoelig, parameters toegestaan), ook zonder body;
   minstens een van `Sec-Fetch-Site` en `Origin` is aanwezig; elke aanwezige header klopt (`same-origin`, of `Origin` exact
   gelijk aan `APP_ORIGIN`); een van die drie headers dubbel of als lijst telt als niet kloppend. Anders 403 met
   `CSRF_REJECTED`. Clients sturen `Content-Type` bij elk niet-GET-request, ook de Better Auth-client. Geen `cors()`.
8. **GET wijzigt geen state** (was 0007). Uitzondering uit de library: GET-links die een sessie maken (e-mailverificatie,
   magic link) openen een scherm dat de actie met een POST bevestigt, tegen login-CSRF.
9. **Buiten `defineRoute`** (was 0003 Gevolgen). `/api/auth/*` loopt niet via `defineRoute`; de volledige lijst
   uitzonderingen staat in `docs/framework.md` §3.

## Alternatieven

- **Externe OIDC-provider** (Keycloak, Zitadel, Auth0; was 0003): sterker gescheiden, maar een derde dienst per app.
- **Supabase Auth (GoTrue) los in een container** (was 0003): een extra container overal, en gebonden aan Supabase.
- **Zelf bouwen** (was 0003): te veel securityrisico.
- **Hono's `csrf()`** (was 0007): dekt JSON niet.
- **CSRF-token (double submit)** (was 0007): extra clientlogica; `SameSite=Lax` plus deze controle dekt de bekende vectoren
  voor een same-origin JSON-API.
- **Alleen `Origin` of alleen `Sec-Fetch-Site`** (was 0007): weigert clients waarvan die ene header ontbreekt. "Minstens één
  aanwezig, alle aanwezige kloppen" accepteert beide en weigert een aanwezige foute header.

## Gevolgen

- Lokaal is gelijk aan productie voor auth, zonder extra container (was 0003).
- Twee verbindingen per request: de sessie als `auth_service`, data via `withUser()` (was 0003; gemeten in
  [0012](0012-datapad.md)).
- De seed gaat via de auth-API (wachtwoordhashes), met een vast TOTP-geheim voor de lokale admin (was 0003).
- Clients zonder beide headers (curl, server-naar-server) worden geweigerd; zulke clients bestaan niet voor deze API (was 0007).
- De testmatrix van de CSRF-middleware staat rij voor rij in `src/core/api/http/csrf.test.ts` (was 0007).
