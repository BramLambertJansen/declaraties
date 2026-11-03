# 0075 — Eenmalige TOTP-codes en e-maillinks, geen sessietoken in JSON

Status: geaccepteerd

Herziet in [0043](0043-accounts-uitnodigen-mfa-en-beheer.md) drie punten onder Gevolgen: "TOTP-codes zijn binnen het venster
herbruikbaar", "Een e-maillink is stateless en binnen zijn geldigheid herbruikbaar" en "Inloggen geeft het sessietoken nog in de
JSON terug". Herziet ook R-LAAG-05 ("Better Auth als `auth_service`, alleen schema `better_auth`") en de functiecatalogus
(`client` of `intern`) voor één functie. Drempels: A2 (auth, grants), A3 (rechten van `auth_service` verruimen), A4 (0043
wijzigen). Uitwerking: [spec](../specs/inloggat-dichten.md). Aanleiding: review van
3 november 2026 (bevinding P7); de drie punten staan als "Bekend gat" in R-AUTH-06, maar op geen roadmap-item.

## Context

Better Auth (gepind op 1.7.7; 1.7.15 is niet anders) laat drie dingen open die het framework zelf als gat benoemt.

1. **TOTP-code herbruikbaar.** De two-factor-plugin accepteert een code in een venster van één stap ervoor en erna (stap
   30 seconden), dus ongeveer 90 seconden, en onthoudt niet dat een code al gebruikt is. Rate limit en lockout tellen alleen
   foute codes; een juiste code komt er altijd door. RFC 6238 (paragraaf 5.2) en de OWASP MFA Cheat Sheet eisen dat een
   verifier dezelfde code na een geslaagde controle niet opnieuw accepteert. Wie het wachtwoord kent en een gebruikte code
   ziet of onderschept (meekijken, schermdelen, een keylogger of browserextensie, een proxy die formulieren logt), logt binnen
   die anderhalve minuut als die gebruiker in, met een MFA-sessie. Bij een admin is dat de zwaarste rol.
2. **E-maillink herbruikbaar.** Het gaat alleen om de twee links van de e-mailwijziging: stateless JWT's die een uur geldig
   zijn en die de server niet kan intrekken. Link 1 (naar het oude adres) nogmaals bevestigen stuurt mail 2 opnieuw. Link 2
   werkt na gebruik meestal niet meer omdat het oude adres weg is, maar na A→B en daarna B→A binnen het uur werkt de oude link 2
   weer. Een JWT-handtekening heeft in base64url bovendien meer dan één geldige spelling. De uitnodigingslink is al eenmalig: Better Auth verwijdert zijn rij bij gebruik. De ernst is
   laag (een herhaalde mail, een link die niet te stoppen is), maar "elke link werkt één keer" is de verwachting van een
   gebruiker en de regel die alle andere links al volgen.
3. **Sessietoken in JSON.** `/sign-in/email` en `/two-factor/verify-totp` geven het sessietoken in de body, `/get-session`
   als `session.token`. De ernst is vandaag laag: de cookie is ondertekend met het geheim en de bearer-plugin staat uit, dus het
   ruwe token alleen is geen inlogsleutel. Toch hoort het niet in de browser: het is de sleutel waarmee de server de sessie
   opzoekt; één latere stap (bearer-plugin aan, een gelogde response-body, een gelekt geheim) maakt er een credential van; en
   `httpOnly` is juist bedoeld om script in de pagina geen sessiesleutel te laten lezen (R-AUTH-02). `/change-password` strippen
   we al per pad (spec eigen-account); dat is een lijst die achterloopt zodra Better Auth een endpoint toevoegt.

## Besluit

1. **Eén mechanisme voor eenmaligheid: claimen in de database.** Een nieuwe tabel `app.one_time_use` (sleutel, vervaltijd),
   alleen te schrijven via één security definer-functie `app.claim_one_time_use`. Die zet een sleutel in één upsert die alleen
   een verlopen sleutel overschrijft, en zegt of de claim nieuw is. Waarom de database: de primaire sleutel maakt de claim
   atomair, ook bij twee gelijktijdige verzoeken of meer API-processen; een geheugenlijst in het proces kan dat niet. Waarom
   een eigen tabel in `app`: in `better_auth` horen alleen tabellen van Better Auth (R-DB-13), en `app` geeft RLS, grants en
   een plek in `app.retention` volgens hetzelfde patroon als `app.rate_limits`. Alleen `auth_service` mag de functie
   uitvoeren; dat is de enige rol buiten `app_definer` die erbij kan, en de enige nieuwe grant over de schemagrens. Daarvoor
   krijgt de functiecatalogus een derde klasse `auth` (alleen `auth_service`), en een nieuwe invariant bewaakt dat
   `auth_service` buiten `better_auth` niets anders krijgt.
2. **TOTP: claim vóór verificatie.** Een before-hook op `/two-factor/verify-totp` claimt een hash van gebruiker en code, geldig
   langer dan het venster. Is de code al geclaimd, dan hetzelfde antwoord als bij een foute code (geen orakel "deze code is al
   gebruikt"). Waarom vóór de controle en ook bij een foute code: alleen zo wint bij twee gelijktijdige verzoeken met dezelfde
   code precies één; een geclaimde foute code kost niemand iets. Interne aanroepen zonder HTTP-verzoek (alleen de lokale
   dev-login, die TOTP met een vast geheim al omzeilt) claimen niet; een test bewaakt dat er geen andere bijkomt (spec OV-3).
3. **E-maillink: claim vóór bevestigen.** De eigen bevestigroute controleert eerst wat zonder geheim te controleren is
   (vorm, geldigheid, en dat het token bij het account van de actor hoort), claimt dan een hash van actor plus de ondertekende inhoud
   van het token (zonder de handtekening, zodat elke spelling dezelfde sleutel geeft) tot het token verloopt, en bevestigt alleen
   bij een nieuwe claim. Een tweede keer geeft de bestaande melding `EMAIL_LINK_INVALID`. Waarom de actor in de sleutel: de
   claim valt vóór de handtekeningcontrole, dus een vervalst token mag alleen de eigen sleutel kunnen bezetten. Het token zelf
   wordt nooit opgeslagen, alleen de hash.
4. **Geen `token` in een JSON-antwoord van `/api/auth/*`.** De gateway voor Better Auth haalt elke eigenschap `token` uit elk
   JSON-antwoord, op elke diepte, voordat het de browser bereikt; status en cookies blijven gelijk. Waarom in de gateway en
   niet per pad: één plek, fail-closed, ook voor endpoints die een update van Better Auth toevoegt.
5. **Bewijs per gat** met een integratietest tegen de echte stack die op de huidige code faalt, zodat elke update van
   `better-auth` ze opnieuw bewijst (R-AUTH-09). Na de bouw verdwijnt "Bekend gat" uit R-AUTH-06.

## Alternatieven

- **Laatst gebruikte tijdstap per gebruiker** (strenger: weigert ook een oudere code uit het venster na een nieuwere). Vraagt
  om het TOTP-geheim zelf te ontsleutelen en de code zelf te berekenen, met interne functies van Better Auth of eigen
  cryptocode. Meer risico dan het oplevert; de claim per code voldoet aan RFC 6238.
- **De `verification`-tabel van Better Auth met een gedeeltelijke unieke index.** Geen nieuwe tabel, maar eigen rijen in een
  tabel waarvan Better Auth de eigenaar is (R-DB-13) en afhankelijk van zijn naamgeving van identifiers.
- **Claim in het geheugen van het API-proces.** Niet atomair over meer processen en weg na een herstart.
- **Na de controle claimen.** Twee gelijktijdige verzoeken met dezelfde code komen dan allebei door.
- **Token per pad strippen in after-hooks.** Elk nieuw endpoint is een nieuw gat tot iemand het ziet.
- **Wachten op Better Auth.** Geen van de drie staat in een uitgebrachte versie; we houden de gaten dan onbepaald open.

## Gevolgen

- Mislukt een verzoek na de claim om een andere reden, dan werkt die code niet meer: de gebruiker wacht op de volgende
  (hooguit 30 seconden). Is mail 2 van een e-mailwijziging kwijt, dan start de gebruiker de wijziging opnieuw.
- `auth_service` krijgt `usage` op schema `app` en `execute` op één functie; R-LAAG-05, de functiecatalogus en een nieuwe
  invariant leggen dat vast.
- Een gebruikte code wordt sneller geweigerd dan een foute (geen controle nodig). Geaccepteerd: wie dat meet, weet alleen dat
  een code die hij zag kort tevoren goed was.
- Tests die binnen dezelfde 30 seconden twee keer met hetzelfde geheim inloggen, falen voortaan. De testhulpen voor TOTP geven
  daarom per tijdstap hooguit één code. De integratietest "link 1 nogmaals geopend: mail 2 gaat opnieuw weg" en de
  functiecatalogus veranderen, omdat dit besluit dat gedrag wijzigt (R-TEST-02).
- `app.one_time_use` krijgt één kleine rij per geprobeerde code en per bevestigde link. Een verlopen sleutel mag opnieuw
  geclaimd worden; verlopen rijen verdwijnen via `app.retention` zodra de opruimtaak er is (ST-03), net als bij
  `better_auth.verification` nu.
- Een volgende eenmalige actie (herstelcodes uit ST-02, een admin-resetlink) gebruikt dezelfde functie met een eigen prefix.
