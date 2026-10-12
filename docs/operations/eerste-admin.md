# Eerste admin en nooduitgang

Er is altijd een weg naar binnen, maar alleen voor wie de database beheert (spec accountbeheer). Er staat geen vast
wachtwoord in de code; lokaal zijn er de seed-accounts (README).

## Wanneer

- Een nieuwe omgeving (staging, productie) heeft nog geen admin.
- Een admin is zijn wachtwoord of zijn TOTP-telefoon kwijt en er is geen andere admin die kan helpen.
- Alle admins zijn onbruikbaar geraakt (bijvoorbeeld geblokkeerd via de database, of zonder werkend wachtwoord). De app laat de laatste telbare admin niet blokkeren, degraderen of verwijderen (LAST_ADMIN); `admin:create` haalt een blokkade niet weg, dus deblokkeer zo'n account eerst via de accountlijst of de database (`blocked_at` leegmaken).

## Voorwaarden

- Toegang tot de omgevingsvariabelen van die omgeving: `APP_ORIGIN`, `AUTH_SECRET`, `AUTH_DATABASE_URL`, `SMTP_URL` en
  `MIGRATOR_DATABASE_URL` (alleen voor beheerders; nooit in de app).
- Een checkout van exact de versie die in die omgeving draait.

## Stappen

| Situatie | Commando | Daarna |
|---|---|---|
| Nieuwe admin | `pnpm admin:create --email jij@bedrijf.nl --name "Je Naam"` | Mail openen, wachtwoord instellen (≥ 12 tekens), inloggen, TOTP instellen |
| Wachtwoord kwijt | `pnpm admin:create --email jij@bedrijf.nl --reset-password` | Nieuwe link in de mail; alle sessies vervallen na het instellen |
| TOTP-telefoon kwijt | `pnpm admin:create --email jij@bedrijf.nl --reset-mfa` | Inloggen met wachtwoord, TOTP opnieuw instellen |
| Beide kwijt | `pnpm admin:create --email jij@bedrijf.nl --reset-mfa --reset-password` | Eerst wachtwoord, dan TOTP |

Lokaal leest het commando `.env.local`; in een echte omgeving zet je de variabelen in de shell (niet in een bestand in de repo).

## Controle

- De uitvoer eindigt met `✓ <adres>: rol admin` (of `nieuw admin-account`).
- Na inloggen met TOTP opent `/admin`. Zonder TOTP vraagt de app eerst "Tweestapsverificatie instellen".

## Wat het commando niet doet

- Het verstuurt geen wachtwoord en toont geen link in de terminal: de link gaat alleen naar het e-mailadres.
- Het maakt geen admin zonder e-mail; zonder werkende `SMTP_URL` faalt het.
