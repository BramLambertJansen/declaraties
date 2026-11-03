---
status: goedgekeurd
namespace: inloggat-dichten
model: opus
---

# Inloggat dichten: eenmalige TOTP-codes en e-maillinks, geen sessietoken in JSON

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

De drie "Bekend gat"-punten van R-AUTH-06 dicht, elk met een integratietest die op de huidige code faalt
([ADR 0075](../adr/0075-eenmalige-codes-en-geen-sessietoken-in-json.md)).

## Rollen en wie wat ziet

| Rol | Ziet | Mag |
|---|---|---|
| anoniem | ongewijzigd | inloggen; een gebruikte TOTP-code werkt niet nog een keer |
| `user` | ongewijzigd | een link van de e-mailwijziging werkt één keer |
| `admin` (MFA) | ongewijzigd | idem; een gebruikte TOTP-code geeft geen tweede MFA-sessie |

- Niemand ziet of een code "al gebruikt" of "fout" is: beide geven hetzelfde antwoord (geen orakel).
- Geen API-rol krijgt rechten op de tabel; alleen `auth_service` mag de claimfunctie uitvoeren.

## Datawijzigingen (met grants)

Eén nieuwe migratie (expand, raakt geen bestaande rijen):

- Tabel `app.one_time_use (key text primary key, expires_at timestamptz not null)`; RLS aan en `force`; `grant select, insert,
  update, delete` alleen aan `app_definer`; policy `one_time_use_definer_all` voor `all to app_definer using (true) with check
  (true)` (vorm van `app.rate_limits`), plus de restrictieve policy `one_time_use_definer_delete_expired` (`as restrictive for
  delete to app_definer using (expires_at < (select app.retention_cutoff('app.one_time_use')))`, vorm van
  `rate_limits_definer_delete_expired`). Niet `unlogged`: een claim moet een crash of failover overleven, anders werkt een
  gebruikte code daarna weer.
- Functie `app.claim_one_time_use(p_key text, p_ttl_seconds integer) returns boolean`, `security definer`, `set search_path = ''`,
  volledig gekwalificeerde namen, eigenaar `app_definer` (R-DB-09). Doet in één statement
  `insert … values (p_key, pg_catalog.now() + ttl) on conflict (key) do update set expires_at = excluded.expires_at where
  one_time_use.expires_at <= pg_catalog.now() returning true`; geen rij terug → `false`. Een verlopen sleutel mag dus opnieuw.
  Weigert met `22023` bij een lege sleutel, een sleutel zonder prefix (`<prefix>:<rest>`), een sleutel langer dan 200 tekens of
  `p_ttl_seconds` niet in 1 … 3600. De tijd komt van de database. De bovengrens 3600 staat in de functie, want SQL kan
  `limits.ts` niet lezen; een integratietest roept de functie aan met `EMAIL_CHANGE_TTL_SECONDS` (lukt) en met één meer
  (`22023`), zodat beide grenzen in de pas blijven.
- `revoke all … from public`; `grant usage on schema app to auth_service`; `grant execute on function app.claim_one_time_use(text,
  integer) to auth_service`. Geen andere API-rol (`app_authenticated`, `api_user`) krijgt execute.
- Bewaarcatalogus (R-DB-17): dezelfde migratie zet `app.retention` `no force`, voegt alleen
  `('app.one_time_use', 'expires_at', interval '0 seconds', 'app', 'eenmalig gebruik: de geldigheid zit al in expires_at (ADR 0075)')`
  in en zet `app.retention` weer op `force`.
- Functiecatalogus (`db/tests/functies.sql`): nieuwe klasse `auth` = uitvoerbaar voor `auth_service` en voor geen andere API-rol;
  `app.claim_one_time_use(text, integer)` is de enige functie in die klasse. Dit is een gate-wijziging (ADR 0075 punt 1).
- Sleutels (in `src/core/api/auth`), nooit de code of het token zelf:
  - TOTP: `totp:` + sha256-hex van `<userId>:<code>`.
  - E-maillink: `email-link:` + sha256-hex van `<userId van de actor>:<header>.<payload>` van de JWT. Zonder de handtekening, want
    die heeft in base64url meer dan één geldige spelling (de laatste twee bits van het laatste teken tellen niet); zo geven alle
    spellingen van hetzelfde token dezelfde sleutel. Omdat de claim vóór de handtekeningcontrole valt, zit de actor in de sleutel:
    een vervalst token kan alleen een sleutel van de eigen gebruiker bezetten.
- Grens in `src/core/shared/limits.ts`: `TOTP_REUSE_BLOCK_SECONDS = 120` (venster ±1 stap van 30 s plus marge).

## Routes en foutcodes

n.v.t. — geen nieuwe route en geen nieuwe foutcode. Gedrag dat verandert op bestaande paden:

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| POST | `/api/auth/two-factor/verify-totp` | Better Auth (two_factor-cookie of sessie) | gebruikte code: 401 `INVALID_CODE`, gelijk aan een foute code (web: `INVALID_TOTP`) |
| POST | `/api/me/email/bevestigen` | `me:update` | tweede keer hetzelfde token: 409 `EMAIL_LINK_INVALID` |
| * | `/api/auth/*` | ongewijzigd | geen; elk JSON-antwoord zonder eigenschap `token` |

Foutvolgorde op `verify-totp`: de bestaande before-stappen (afgewezen sessie, lifecycle, `trustDevice`) eerst, dan de claim, dan
de controle van Better Auth. Geen claim, en dus door naar Better Auth dat zelf weigert, als: `code` geen string van precies zes
cijfers is; er geen gebruikers-ID is (geen geldige two_factor-challenge en geen sessie); of de aanroep intern is (`auth.api.*`
zonder HTTP-verzoek, zie OV-3). Gebruikers-ID: bij inloggen de waarde van de two_factor-challenge (via de ondertekende cookie,
zoals `account-lifecycle.ts`), met een sessie de gebruiker van die sessie.

Op `/api/me/email/bevestigen`, elke stap zonder claim bij falen (`EMAIL_LINK_INVALID`):

1. vorm: precies drie segmenten en een handtekening van precies 43 tekens uit `[A-Za-z0-9_-]` (de lengte van HS256 in
   base64url, te controleren zonder geheim); zo verbrandt een afgekapte link de volledige niet;
2. `readToken` leest header, payload, `requestType` en `exp` (`exp` erbij in `tokenPayload`);
3. `exp` is een geheel getal in (nu, nu + `EMAIL_CHANGE_TTL_SECONDS`];
4. het e-mailveld van het token is gelijk aan het adres van de actor, met dezelfde vergelijking als Better Auth (anders weigert die
   met `INVALID_USER` en zou een link in het verkeerde account verbranden);
5. de claim met geldigheid `exp` min nu; al geclaimd → `EMAIL_LINK_INVALID`;
6. `verifyEmail` (handtekening en de rest, zoals nu).

## Kopieer de vorm van

- `db/migrations/20261011120000_rate_limits.sql` — tabel alleen voor `app_definer`, security definer-functie met één upsert, tijd uit de database
- `db/migrations/20261019120000_retention.sql` — regel in `app.retention`
- `db/tests/rate_limits.sql` — pgTAP op policy-naam en grants
- `src/core/api/auth/hooks.ts` — before-hook op een pad van Better Auth met `APIError`
- `src/core/api/auth/account-lifecycle.ts` — gebruiker uit de two_factor-challenge via de ondertekende cookie
- `test/api/eigen-account-deel2.int.test.ts` — links uit Mailpit en tweede bevestiging

## Hergebruik en UX

- Bestaande componenten: geen wijziging in de UI.
- Staten per scherm: ongewijzigd. TOTP-scherm: een gebruikte code toont de bestaande foutmelding van `INVALID_TOTP`;
  `/email-bevestigen`: een tweede keer toont de bestaande melding van `EMAIL_LINK_INVALID`.
- Alle zichtbare tekst letterlijk: geen nieuwe tekst.
- Focusvolgorde en toetsenbord: ongewijzigd.

## Acceptatiecriteria

- **inloggat-dichten/AC-1** — Gegeven een admin met TOTP die met code C is ingelogd, wanneer binnen 90 s een tweede inlogpoging
  (wachtwoord goed) dezelfde code C stuurt, dan 401 `INVALID_CODE`, geen sessiecookie en geen nieuwe rij in `better_auth.session`.
- **inloggat-dichten/AC-2** — Gegeven twee inlogpogingen tot de TOTP-stap, wanneer beide tegelijk dezelfde juiste code sturen, dan
  krijgt precies één een sessie en de andere 401 `INVALID_CODE`.
- **inloggat-dichten/AC-3** — Gegeven een sessie met sterkte `password` en TOTP aan, wanneer `verify-totp` met een code die al voor
  inloggen is gebruikt, dan 401 en blijft de sterkte `password`.
- **inloggat-dichten/AC-4** — Gegeven een gebruikte code C, wanneer de volgende code van de authenticator wordt gestuurd, dan lukt het
  (de claim blokkeert alleen C).
- **inloggat-dichten/AC-5** — Gegeven een reeks verschillende foute codes, wanneer die worden gestuurd, dan blijven foutteller,
  lockout en rate limit van Better Auth werken zoals nu (bestaande tests groen). Dezelfde foute code nog eens telt niet opnieuw
  mee (zie Randgevallen).
- **inloggat-dichten/AC-6** — Gegeven link 1 van een e-mailwijziging die één keer is bevestigd, wanneer dezelfde link opnieuw wordt
  bevestigd, dan 409 `EMAIL_LINK_INVALID` en staat er na beide pogingen precies één mail 2 bij het nieuwe adres. Hetzelfde geldt
  voor een andere spelling van de handtekening van dat token (laatste teken met andere ongebruikte bits).
- **inloggat-dichten/AC-7** — Gegeven link 1, wanneer twee bevestigingen tegelijk binnenkomen, dan antwoordt één `{ stap: 'oud' }`,
  de andere 409, en gaat mail 2 één keer weg.
- **inloggat-dichten/AC-8** — Gegeven de flows inloggen zonder TOTP, inloggen met TOTP, `GET /api/auth/get-session` en
  `/change-password`, wanneer ze slagen, dan bevat geen JSON-antwoord op enige diepte een eigenschap `token`, en werkt de
  sessiecookie daarna voor `GET /api/me`.
- **inloggat-dichten/AC-9** — Gegeven een JSON-antwoord met `token` op het hoogste niveau, in een genest object en in een array, en
  een antwoord dat geen JSON is, wanneer de gateway het doorgeeft, dan is elke `token` weg, blijven status, overige velden en
  `Set-Cookie` gelijk en klopt `Content-Length`; niet-JSON blijft byte voor byte gelijk (unit).
- **inloggat-dichten/AC-10** — Gegeven de database, dan per rol: `app_authenticated`, `api_user` en `PUBLIC` mogen de functie niet
  uitvoeren en hebben geen recht op de tabel; `auth_service` mag de functie uitvoeren, heeft geen recht op de tabel en op schema
  `app` alleen `usage`; `app_definer` is eigenaar van de functie en heeft select, insert, update, delete op de tabel.
- **inloggat-dichten/AC-11** — Gegeven een sleutel, wanneer die twee keer wordt geclaimd, dan `true` en `false`; na het verlopen
  weer `true`; ongeldige sleutel of geldigheid → `22023` (pgTAP).
- **inloggat-dichten/AC-12** — Gegeven link 1 van gebruiker A, wanneer gebruiker B hem in zijn eigen sessie bevestigt, dan
  `EMAIL_LINK_INVALID` voor B, en werkt de link daarna voor A nog wel (geen claim).
- **inloggat-dichten/AC-13** — Gegeven een token met een `exp` buiten (nu, nu + `EMAIL_CHANGE_TTL_SECONDS`] of zonder `exp`, wanneer
  het wordt bevestigd, dan 409 `EMAIL_LINK_INVALID` (geen 500) en geen rij in `app.one_time_use`.
- **inloggat-dichten/AC-14** — Gegeven de dev-login (lokaal), wanneer hij tien keer achter elkaar naar admin wisselt, dan lukt elke
  wissel (bestaande test "tien wissels achter elkaar" ongewijzigd groen).
- **inloggat-dichten/AC-15** — Gegeven link 1 waarvan het einde is afgekapt (handtekening korter dan 43 tekens), wanneer die eerst
  wordt bevestigd, dan `EMAIL_LINK_INVALID` zonder rij in `app.one_time_use`, en lukt daarna de volledige link.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Juiste code, maar het verzoek faalt na de claim (bijv. 5xx) | code werkt niet meer; volgende code (≤ 30 s) wel | — |
| Foute code geprobeerd, daarna dezelfde foute code | beide fout; de tweede telt niet als nieuwe poging bij Better Auth, maar wel voor de rate limit | `INVALID_CODE` |
| TOTP inschakelen (`/two-factor/enable` + `verify-totp` met sessie) | dezelfde claim: de inschrijfcode werkt daarna niet om in te loggen | `INVALID_CODE` |
| Code geen zes cijfers (leeg, letters, te lang) | geen claim; Better Auth weigert zoals nu | zoals nu |
| Gebruikte code: antwoord sneller dan bij een foute code (geen decrypt en controle) | geaccepteerd: een aanvaller leert alleen dat de code kort tevoren goed was, wat hij al wist als hij hem zag; geen toegang | — |
| Dev-login (lokaal, `auth.api.verifyTOTP` zonder HTTP-verzoek) | geen claim (OV-3) | — |
| Link 1 in de sessie van een ander account | geen claim; de link blijft bruikbaar voor de eigenaar | `EMAIL_LINK_INVALID` |
| Andere spelling van de handtekening na gebruik | zelfde sleutel, geweigerd | `EMAIL_LINK_INVALID` |
| Afgekapte link (mailclient of kopiëren) | geen claim; de volledige link werkt daarna nog | `EMAIL_LINK_INVALID` |
| Twee gebruikers toevallig dezelfde code | geen conflict: de gebruikers-ID zit in de sleutel | — |
| Link 1 opnieuw nodig omdat mail 2 kwijt is | gebruiker vraagt de wijziging opnieuw aan | `EMAIL_LINK_INVALID` |
| Link 2 tweede keer | ongewijzigd: al ongeldig | `EMAIL_LINK_INVALID` |
| Verlopen link | ongewijzigd, zonder claim | `EMAIL_LINK_INVALID` |
| Uitnodigingslink tweede keer | ongewijzigd: Better Auth verwijdert de rij al bij gebruik | `INVITATION_INVALID` |
| Database niet bereikbaar bij de claim | het verzoek faalt (500), het laat de code niet ongecontroleerd door (fail-closed) | `INTERNAL_ERROR` |

## Raakt ook

- Kritieke paden (eigenaarmerge): `src/core/api/auth/` (hooks, `auth.ts`-gateway, `profile.ts` `confirmEmail`, opties of injectie
  van de claim via de bestaande `auth_service`-pool), `db/migrations/` (nieuw), `src/core/shared/limits.ts`. De claim is verplicht in
  `createAuthOptions` (geen productiepad zonder claim); `createHooks` krijgt hem als parameter zodat unittests een nep kunnen geven.
  Het strippen van `token` in `afterChangePassword` blijft als tweede laag.
- Gegenereerd: `db/schema.snapshot.sql` en `src/api/db/schema.ts` opnieuw (`pnpm check:snapshot`), niet met de hand.
- Checks: `check:migrations`, `check:secdef`, `check:snapshot`, `test:db` met pgTAP `db/tests/one_time_use.sql` (nieuw) en een
  nieuwe invariant in `db/tests/functies.sql` (daar staan de klassen): "`auth_service` heeft op `public` en `app` alleen `usage` op
  `app` en execute op de functies van klasse `auth`, verder niets", met een opzettelijke fout die bewijst dat de query hem vangt (die invariant bestaat
  nog niet). `test/security/resources.ts`: n.v.t. (geen resource per eigenaar). Geen nieuwe permissie.
- Bestaande tests en testhulpen die wijzigen (R-TEST-02, reden: dit besluit maakt een TOTP-code eenmalig):
  - `test/api/eigen-account-deel2.int.test.ts` "link 1 nogmaals geopend binnen de geldigheid: mail 2 gaat opnieuw weg" wordt AC-6;
  - `db/tests/functies.sql`: klasse `auth` erbij en de regel voor de nieuwe functie;
  - testhulpen: `totp()` in `test/auth/harness.ts` en `totpFor()` in `e2e/support/accounts.ts` blijven pure berekeningen
    (ongewijzigd). Erbij komt per hulp een verbruikende variant (`freshTotp()`, `freshTotpFor()`) die per geheim elke tijdstap
    hooguit één keer geeft: eerst de huidige, dan de volgende (valt binnen het venster). Is ook die op, dan gooit hij een fout met
    de reden, in plaats van te wachten (integratietests breken na 15 s af, `vitest.config.ts`). Alleen aanroepen die echt
    verifiëren (inschrijven, inloggen, step-up) gaan naar de verbruikende variant, o.a. in `test/auth/auth.int.test.ts`
    "inloggen met TOTP", `test/api/account-harness.ts`, `login-tracking`, `roles`, `me.int` en e2e met TOTP; elke gewijzigde
    test staat met reden in de bouw-PR. Een test die binnen één stap drie codes van hetzelfde geheim nodig heeft, splitst zijn
    accounts, of wacht expliciet op de volgende tijdstap met een ruimere timeout, met reden in de bouw-PR.
- Dev-login (`src/core/api/dev/login-as.ts`): ongewijzigd; valt onder de interne aanroep zonder claim (OV-3, AC-14).
- Docs in de bouw-PR: R-AUTH-06 zonder "Bekend gat" en met de nieuwe regel (eenmalig, geen token in JSON) in `docs/framework.md`;
  R-LAAG-05 (`auth_service` ook execute op de functies van klasse `auth`) en de functiecatalogus in framework §6; ST-02 in
  `docs/roadmap.md` met dit deel en bewijs.
- Spec `eigen-account` (gebouwd) beschrijft nog het oude gedrag: link 1 opnieuw stuurt mail 2 opnieuw, en het token-lek bij
  inloggen als aparte core-taak. Waar ze verschillen, gaat deze spec voor. Inhoud van een gebouwde spec wijzigen kan alleen met
  `gebouwd # #<PR>` en code in dezelfde PR (`check-document-status`, ADR 0062). Daarom gaat die tekst mee in de bouw-PR, of, als
  `check-document-status` dat naast kritieke paden weigert, in een eigen PR direct daarna (zoals #464).
- Fase: fase 1 stuk 3e (ST-02); `docs/dod.md` Fase 1 en Features.

## Buiten scope

Herstelcodes (eigen spec in ST-02, gebruiken later dezelfde claimfunctie), strengere TOTP-controle op tijdstap (ADR 0075,
Alternatieven), intrekken van een lopende e-mailwijziging, de bearer-plugin, opruimen van verlopen rijen (ST-03).

## Testplan

Tester schrijft de tests eerst; ze falen op de huidige code op een assertie (R-PRINC-04), niet op een ontbrekend bestand.

- **Unit:** de strip-functie van de gateway (AC-9); sleutelvorm (prefix, hash, nooit de code of het token).
- **pgTAP (`db/tests/one_time_use.sql`):** RLS aan en `force`, policies `one_time_use_definer_all` en
  `one_time_use_definer_delete_expired` op naam, grants per rol (AC-10), claim twee keer, verlopen claim, ongeldige invoer (AC-11).
- **Integratie (`pnpm test:db`, echte stack, nooit gemockt):** AC-1 t/m AC-8 en AC-12 t/m AC-14; codes uit het vaste seed-geheim van
  de testharness; gelijktijdigheid (AC-2, AC-7) met `Promise.all`; de grens van 3600 tegen `EMAIL_CHANGE_TTL_SECONDS`. AC-5: de
  bestaande lockout- en rate-limittests blijven ongewijzigd groen.
- **E2E:** n.v.t. — geen UI-wijziging; het TOTP-scherm en `/email-bevestigen` tonen bestaande meldingen.
- **Vangnet** (review 3 november 2026, P7): (1) overname door integratietests in `pnpm test:db` die bij elke `better-auth`-update
  draaien (R-AUTH-09); (2) bewijs: elke nieuwe test faalt op `origin/main` vóór de bouw, de uitslag staat in de PR; (3) meting: geen
  bestaande test, fixture of check verdwijnt of wordt versoepeld; alleen de genoemde tests en testhulpen wijzigen; (4) terugval: faalt na een
  update van Better Auth een van deze tests, dan gaat de update niet door tot de eigenaar beslist.

## Open vragen

- **OV-1** — Blokkeert de claim alleen dezelfde code, of ook oudere codes uit het venster na een nieuwere (tijdstap bijhouden)?
  Aanbeveling: alleen dezelfde code; voldoet aan RFC 6238 en vraagt geen eigen cryptocode of interne Better Auth-functies (ADR 0075).
- **OV-2** — Link 1 een tweede keer: weigeren, of mail 2 opnieuw sturen zoals nu? Aanbeveling: weigeren; elke link werkt één keer,
  en wie mail 2 mist, start opnieuw.
- **OV-3** — Geldt de TOTP-claim ook voor interne aanroepen (`auth.api.verifyTOTP` zonder HTTP-verzoek)? De enige is de dev-login,
  die lokaal met het vaste seed-geheim snel na elkaar wisselt en met claim na twee wissels per 30 s faalt. Aanbeveling: nee; de
  dev-login is al een volledige omweg om TOTP heen en bestaat alleen lokaal (R-AUTH-09), dus de claim voegt daar niets toe. Een
  unittest bewaakt dat `auth.api.verifyTOTP` alleen in `src/core/api/dev/` wordt aangeroepen, zodat een nieuwe interne aanroeper
  niet ongemerkt zonder claim draait.
