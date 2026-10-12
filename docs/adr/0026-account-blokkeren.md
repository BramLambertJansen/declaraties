# 0026 — Account blokkeren: `blocked_at` in `better_auth`, geschreven door `app_definer`

Status: voorgesteld — door de agent (architect), voor het deel blokkeren van de spec
[accountbeheer-uitbreiding](../specs/accountbeheer-uitbreiding.md) (OV-1, OV-5, OV-6, OV-7; AC-11 t/m AC-14 en AC-22 t/m AC-24).
Wijzigt een uitzondering uit [ADR 0010](0010-schema-better-auth.md) en [ADR 0014](0014-dev-login-en-accounts-view.md); vult
[ADR 0013](0013-uitnodigen-en-mfa-in-better-auth.md) aan. Nummer uit `node scripts/kit/feiten.mjs` (volgende vrije: 0026).

## Context

De spec laat een admin met MFA accounts blokkeren en deblokkeren. Wat de repo nu laat zien en het ontwerp bepaalt:

1. **Er is geen plek voor "geblokkeerd".** ADR 0013 verwierp de admin-plugin van Better Auth (eigen rollenmodel naast `user_roles`).
   `public.user_roles` kan Better Auth niet lezen, dus een sessie-opvraging weet daar niets van zonder extra verbinding.
2. **`better_auth` is dicht** (ADR 0010, framework §6): alleen `auth_service` heeft rechten, plus de lees-allowlist van `app_definer` voor
   de view `app.accounts` (ADR 0014: `"user"(id, name, email, "createdAt")`, `account("userId", "providerId")`). Schrijven in `better_auth`
   doet nu alleen Better Auth zelf.
3. **De laatste-admin-regel** zit in de trigger `app.user_roles_keep_one_admin()` op `public.user_roles`
   (`db/migrations/20261009194039_user_roles.sql:41`): advisory lock `public.user_roles:last_admin`, dan "bestaat er nog een rij met rol
   `admin`". Een uitgenodigde admin (geen credential-account, kan niet inloggen) telt mee, en blokkeren wijzigt `user_roles` niet, dus de
   trigger ziet het niet (OV-7).
4. **Elke request leest de sessie uit de database** (`cookieCache` uit, framework §6) via `authGateway.getSession`
   (`src/core/api/auth/auth.ts:70`), dat al een sessie weggooit na de absolute 7 dagen. Een veld op de user komt bij die opvraging mee.
5. **Database-hooks van Better Auth 1.7.7** (`db/with-hooks.mjs`): `create.before` krijgt `(data, context)`, waarbij `context` de
   endpoint-context is, of `null` buiten een request (seed, `admin:create`, `internalAdapter.createSession` in een test). Een gewone
   `Error` in de hook wordt een 500; een `APIError` geeft de bedoelde status.
6. **Audit log** (ADR 0021, geaccepteerd) noemt `app.set_account_blocked` al en wijst de acties `core.account.block` en
   `core.account.unblock` toe aan de functie zelf, in dezelfde body als de wijziging.

## Besluit

1. **Kolom.** `better_auth."user".blocked_at timestamptz null`, gedeclareerd als Better Auth `user.additionalFields.blockedAt`
   (`type: 'date'`, `required: false`, `input: false`, `fieldName: 'blocked_at'`). De SQL komt uit `node scripts/auth-schema.mjs` (gepinde
   versie) in een nieuwe migratie (`set local search_path = better_auth; … reset search_path;`), nooit `auth migrate`. `null` = niet
   geblokkeerd. Better Auth leest het veld mee bij elke sessie-opvraging; schrijven doet alleen de functie uit punt 3.
2. **Grants aan `app_definer`** in dezelfde migratie, als nieuwe regels in de allowlist van `db/tests/invarianten.sql`:
   `select (blocked_at)` en `update (blocked_at)` op `better_auth."user"`. Geen grant op `better_auth.session` of andere kolommen:
   sessies intrekken loopt via Better Auth (punt 7). Dit is de eerste schrijfrecht-uitzondering op `better_auth` naast `auth_service`.
3. **`app.set_account_blocked(p_user_id text, p_blocked boolean) returns void`** — `security definer`, `set search_path = ''`, alles
   volledig gekwalificeerd, eigenaar `app_definer`, geen overload; `execute` alleen aan `app_authenticated`, klasse `client` in de
   functiecatalogus (`db/tests/functies.sql`). In deze volgorde:
   1. niet `app.is_mfa_admin()` → 42501 (`FORBIDDEN`; `can()` geeft eerder al `MFA_REQUIRED` bij een admin zonder MFA);
   2. geen rij in `better_auth."user"` met dat ID → `raise exception 'NOT_FOUND'` (P0001);
   3. `p_blocked = false`: `blocked_at = null`, klaar (idempotent, geen verdere controles; OV-6: deblokkeren zonder bevestiging is een
      UI-keuze, de functie verandert er niets door);
   4. `p_blocked = true`: `p_user_id = app.current_user_id()` → `OWN_ACCOUNT`; geen credential-account → `ACCOUNT_INVITED`; al
      geblokkeerd → niets doen (idempotent, `blocked_at` blijft het eerste tijdstip);
   5. `pg_advisory_xact_lock(hashtext('public.user_roles:last_admin'))` — dezelfde lock als de trigger, zodat blokkeren en degraderen
      elkaar serialiseren; dan `blocked_at = pg_catalog.now()` en daarna de controle uit punt 4 → `LAST_ADMIN` als er geen telbare
      admin overblijft (de transactie draait terug);
   6. zodra `app.audit_log` (ADR 0021) bestaat: een regel `core.account.block`/`core.account.unblock` in dezelfde body, alleen bij een
      echte wijziging.
   De codes gaan als P0001 naar buiten via de bestaande vertaling (`src/core/api/errors.ts:67`); `OWN_ACCOUNT` en `ACCOUNT_INVITED`
   komen als foutcode in `src/shared/errors.ts` met tekst uit de spec.
4. **"Telbare admin"** = rij in `public.user_roles` met rol `admin`, waarvan de user een credential-account heeft en `blocked_at is null`.
   `app.user_roles_keep_one_admin()` krijgt die definitie via `create or replace function` in een nieuwe migratie (eigenaar, `search_path`
   en trigger blijven). De trigger blijft "na de wijziging moet er een telbare admin zijn" toetsen bij elke `update`/`delete` van een
   admin-rij, ook via de cascade vanuit `better_auth."user"`; hij kijkt niet of de weggehaalde rij zelf telbaar was, want bij een cascade
   is de user-rij dan al weg. `app_definer` leest daarvoor `account("userId", "providerId")` (al in de allowlist) en `blocked_at` (punt 2).
5. **`app.accounts`** via `create or replace view` (zelfde kolommen in dezelfde volgorde, `security_barrier`, eigenaar `app_definer`,
   actorfilter `app.is_mfa_admin()`): `status` wordt `'blocked'` als `blocked_at is not null`, vóór `'active'`/`'invited'`. Het contract
   (`accountItem.status`, label "Geblokkeerd") en het filter "Status" van de lijstpagina volgen in de bouw-PR.
6. **Sessie weigeren.** Twee lagen in `src/core/api/auth`:
   - **De garantie: `authGateway.getSession`.** Is `user.blockedAt` gezet, dan verwijdert hij de sessies van die user
     (`internalAdapter.deleteUserSessions(user.id)`) en geeft `{ session: null }`, zoals bij de absolute 7 dagen. Geen extra query:
     het veld komt mee met de sessie-opvraging. Zo is ook een sessie dood die ontstond tussen het blokkeren en het intrekken (AC-22).
   - **Een nette 4xx bij inloggen: `databaseHooks.session.create.before`.** Met een endpoint-context zoekt de hook de user op
     (`context.context.internalAdapter.findUserById`) en gooit bij `blockedAt` een `APIError('FORBIDDEN', { code: 'ACCOUNT_BLOCKED' })`.
     Dat dekt elke weg die een sessie maakt via een endpoint: wachtwoord (ook bij TOTP-gebruikers, want `/sign-in/email` maakt eerst een
     sessie), `/two-factor/verify-totp`, later herstelcodes, en de dev-login (die via de handler inlogt, ADR 0014). Zonder context
     (`null`) laat de hook de sessie door: scripts maken geen sessies voor gebruikers, en de garantie zit in `getSession`.
   - **De web toont de gewone inlogfout** (OV-5, OWASP: geen orakel voor een juist wachtwoord). `authErrorCode`
   (`src/core/web/lib/auth.ts`) zet bij inloggen elke 4xx al om in `INVALID_CREDENTIALS`; dat blijft. `ACCOUNT_BLOCKED` is wel een
     servercode (logs, tests) en de tekst "Dit account is geblokkeerd. Deblokkeer het eerst." verschijnt alleen in de beheerlijst.
7. **Volgorde in de route** `POST /api/accounts/:id/block`: (1) `app.set_account_blocked(id, true)` in de transactie van `withUser()`;
   (2) na de commit `ctx.services.sessions.revokeAll(id)` (`internalAdapter.deleteUserSessions`, verbinding als `auth_service`). Stap 2 is
   opruimen; faalt hij, dan houdt punt 6 de sessies toch tegen. `POST /api/accounts/:id/unblock` roept alleen de functie aan met `false`.
   Permissie en foutcodes volgen de spec (`accounts:manage`, OV-2); dat valt onder de spec, niet onder deze ADR.

## Alternatieven

- **Kolom in `public.user_roles` of een eigen tabel in `app`.** Geen grant in `better_auth` nodig en RLS zoals elke tabel, maar Better
  Auth kan hem niet lezen: `getSession` en de hook hebben dan een tweede verbinding nodig (als `api_user` of via een functie), en een login
  geeft geen nette 4xx zonder die extra query per sessie-aanmaak.
- **Admin-plugin van Better Auth** (`banUser`, `banned`): kant-en-klaar, maar ADR 0013 verwierp de plugin om het eigen rollenmodel; een
  extra plugin vraagt een ADR om zijn advisories, en de laatste-admin-regel kan niet atomair met `user_roles` mee.
- **Schrijven via Better Auth** (`internalAdapter.updateUser(id, { blockedAt })` als `auth_service`) in plaats van een functie van
  `app_definer`. Geen schrijfrecht voor `app_definer`, maar het blokkeren loopt dan buiten de transactie van de route: de laatste-admin-
  controle en de auditregel zijn niet atomair met de wijziging, en twee admins die elkaar tegelijk blokkeren kunnen allebei slagen.
- **Alleen `session.create.before`, geen controle in `getSession`.** Minder code per request, maar een login tussen blokkeren en intrekken
  houdt een geldige sessie; AC-22 faalt.
- **Uitgenodigde admins laten meetellen** (huidige regel, OV-7): de laatste bruikbare admin kan dan weg zolang er een openstaande
  uitnodiging voor een admin is.

## Gevolgen

- **Beschermde paden** (framework §10), in de bouw-PR met het label `gate-wijziging` en review van de eigenaar:
  - ADR 0010, Gevolgen: de uitzondering op "`better_auth` dicht behalve `auth_service`" wordt "plus de kolom-allowlist van `app_definer`
    (ADR 0014), waarvan `blocked_at` ook schrijfbaar (ADR 0026)".
  - ADR 0014, Gevolgen: de allowlist krijgt `"user".blocked_at` (select en update); "geen sessies" blijft staan.
  - ADR 0013: aanvulling dat blokkeren zonder admin-plugin werkt via deze ADR; de verwerping van de plugin blijft.
  - Framework §6, punt Grants: "schema `better_auth` heeft geen grants behalve aan `auth_service`, plus de kolom-allowlist van
    `app_definer` voor `app.accounts` (ADR 0014) en `update (blocked_at)` voor `app.set_account_blocked` (ADR 0026)". Het punt "Rollen uit
    de database" ("uitloggen en blokkeren tellen direct") klopt dan ook echt.
  - `db/tests/invarianten.sql`: twee regels erbij (`app_definer SELECT better_auth.user.blocked_at`, `app_definer UPDATE
    better_auth.user.blocked_at`); de test "geen verouderde regels" en de controle per kolom blijven. `db/tests/functies.sql`: regel voor
    `app.set_account_blocked` (klasse `client`).
  - `.claude/rules/database.md` noemt "app_definer leest uit `better_auth` alleen de allowlist"; dat wordt "leest, en schrijft alleen `blocked_at`".
- **Elke request** draagt het veld `blockedAt` mee in de sessie-opvraging; geen extra query. Een geblokkeerde gebruiker kost één delete bij
  zijn eerste request daarna.
- **`internalAdapter` en databaseHooks** zijn geen gedocumenteerde publieke API (ADR 0013): de integratietests (AC-22, AC-23, de hook bij
  inloggen, TOTP en dev-login) bewijzen bij elke update van `better-auth` dat ze nog werken.
- **De trigger telt strenger**: een `delete` of degradatie van een admin-rij faalt nu ook als alleen nog geblokkeerde of uitgenodigde admins
  overblijven (AC-24). Ook het verwijderen van een uitgenodigde admin faalt als er geen telbare admin is; dat komt in de praktijk niet
  voor, want intrekken vraagt zelf een admin met MFA.
- **Serialisatie** steunt, net als de bestaande trigger, op `read committed` (een nieuwe snapshot na het nemen van de lock). Een
  strengere isolatie in `withUser()` vraagt een nieuwe racetest.
- **Bewust buiten deze ADR** (eigen ADR of PR, zelfde spec): uitnodiging intrekken (`invitations.revoke`, `databaseHooks.account.create.before`),
  resetlink (`sendResetLink`, `RESET_LINK_TTL_SECONDS`, `/nieuw-wachtwoord`) en herstelcodes (`disabledPaths` van ADR 0013, hooks op
  `/two-factor/*-backup-code*`). Ook buiten scope volgens de spec: blokkeren met einddatum of reden.
