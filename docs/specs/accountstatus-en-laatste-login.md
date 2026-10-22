---
status: goedgekeurd # akkoord eigenaar in de sessie; taakuitzondering op voorafgaande merge (2026-10-21)
namespace: account-lifecycle
---

# Accountstatus en laatste login als standaardvoorziening

## Doel

Elke app uit de template registreert de laatste geslaagde login en laat beheerders accounts deactiveren,
activeren, blokkeren en deblokkeren met behoud van gegevens.

Dit voorstel volgt de eigenaarvraag van 2026-10-21. De eigenaar heeft op 2026-10-21 bevestigd dat deactiveren en
blokkeren afzonderlijke maatregelen zijn, en dat alleen een volledig geslaagde login telt, inclusief vereiste MFA.
Alleen beheerders zien de laatste login; ontbrekende historische gegevens tonen "Onbekend". Daarna gaf de eigenaar
op 2026-10-21 akkoord op de overige randgevallen, schermteksten en het technische ontwerp. Met "Dat gaan we veranderen,
bouw het" gaf de eigenaar vervolgens opdracht vóór de voorafgaande besluitmerge te bouwen. Die uitzondering geldt voor
deze taak en de bijbehorende beschermde bronbestanden; checks, review en de merge door de eigenaar blijven gelden.
Het inhoudelijke akkoord is geen bouwbewijs.
Blokkeren en deblokkeren bestaan al: [accountbeheer-uitbreiding](accountbeheer-uitbreiding.md) en
[ADR 0026](../adr/0026-account-blokkeren.md). Dit voorstel bouwt daarop voort.

## Rollen en wie wat ziet

- Alleen een beheerder met MFA ziet de laatste login in de accountlijst en beheert de accountstatus.
- Deactiveren betekent administratief buiten gebruik; blokkeren is een afzonderlijke beveiligingsmaatregel.
  Beide verhinderen toegang direct en kunnen tegelijk gelden. Activeren verwijdert uitsluitend de deactivatie;
  deblokkeren verwijdert uitsluitend de blokkade. Gegevens, rol en loginhistorie blijven bewaard.
- Eigen account deactiveren blijft verboden, zoals zichzelf blokkeren. De laatste bruikbare beheerder
  mag niet verdwijnen door deactiveren, blokkeren, rolwijziging of verwijdering, ook niet bij gelijktijdige acties.
- Uitgenodigde accounts blijven onder het bestaande uitnodigingsbeheer vallen.

## Datawijzigingen (met grants)

- Voeg nullable tijdstippen voor laatste geslaagde login en deactivatie toe aan de Better Auth-user,
  naast de bestaande blokkade. Tijdstippen zijn servergestuurde `timestamptz`-waarden en niet door de gebruiker
  instelbaar. Bestaande accounts krijgen geen verzonnen historische login: de waarde blijft onbekend tot de volgende login.
- Breid de beheerview en het gedeelde accountcontract uit met de laatste login en beide onafhankelijke maatregelen.
  Een enkele statuswaarde mag de tweede maatregel niet verbergen; de filters moeten beide kunnen vinden.
- Schrijven van de laatste login gebeurt binnen auth; deactiveren en activeren via een gecontroleerde
  databasefunctie, met dezelfde transactie, MFA-controle, advisory lock en auditgaranties als blokkeren.
- De bestaande laatste-admin-controle telt alleen accounts met credentials zonder blokkade én zonder deactivatie.
- De technische aanvulling op ADR 0026 staat in
  [ADR 0052](../adr/0052-accountstatus-en-laatste-login.md): exacte kolommen, functies, schrijvers, minimale
  kolomgrants en de allowlist in de database-invarianten. Geen brede toegang tot het auth-schema of sessietokens.
  Elke gewijzigde policy krijgt een pgTAP-test; bestaande migraties blijven ongewijzigd.

## Routes en foutcodes

De twee nieuwe mutaties gebruiken het bestaande recht voor accountbeheer.

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| GET | `/api/accounts` (bestaand) | `accounts:read` | bestaande foutcodes |
| POST | `/api/accounts/:id/deactivate` (nieuw) | `accounts:manage` | `NOT_FOUND`, `OWN_ACCOUNT`, `ACCOUNT_INVITED`, `LAST_ADMIN`, `FORBIDDEN`, `MFA_REQUIRED` |
| POST | `/api/accounts/:id/activate` (nieuw) | `accounts:manage` | `NOT_FOUND`, `ACCOUNT_INVITED`, `FORBIDDEN`, `MFA_REQUIRED` |

De bestaande block/unblock-routes blijven beide maatregelen afzonderlijk behandelen. Mutaties zijn idempotent;
alleen een werkelijke wijziging schrijft een auditregel. Nieuwe routes volgen het bestaande strikte routecontract.
Een geweigerde login blijft de bestaande algemene inlogfout tonen.
Auth gebruikt intern `ACCOUNT_DEACTIVATED` bij een gedeactiveerd account; de zichtbare fout blijft
"E-mailadres of wachtwoord klopt niet." zoals bij blokkeren.

## Hergebruik en UX

- Bestaande componenten: `Table`, `ListToolbar`, `DropdownMenu`, `ConfirmDialog`, `AsyncView`, `Notice` en `Button`;
  datums via de bestaande formatter in Europe/Amsterdam. Geen nieuwe componenten voorzien.
- Staten per scherm: bestaande laad-, leeg- en foutweergave; tijdens muteren zijn acties geblokkeerd;
  succes ververst de accountlijst, een fout verschijnt in de dialoog of melding. Verouderde gegevens worden
  serverzijdig opnieuw getoetst; een mislukte mutatie toont geen successtatus.
- Teksten: kolom "Laatst ingelogd"; ontbrekende registratie "Onbekend"; afzonderlijke aanduidingen
  "Gedeactiveerd" en "Geblokkeerd"; menuacties "Deactiveren", "Activeren", "Blokkeren" en "Deblokkeren".
- Deactivatiedialoog: "{naam} deactiveren?", "Dit account krijgt direct geen toegang meer. De gegevens blijven
  bewaard. Activeren heft een eventuele blokkade niet op."; knoppen "Deactiveren" en "Annuleren".
  Succes: "{naam} is gedeactiveerd." of "{naam} is geactiveerd. Een eventuele blokkade blijft gelden."
- Focusvolgorde en toetsenbord: bestaand rijmenu en dialooggedrag; focus begint op Annuleren en keert terug
  naar de menuknop. Activeren direct, zoals deblokkeren.

## Acceptatiecriteria

- **account-lifecycle/AC-1** — Een geslaagde login zonder vereiste MFA registreert een servertijdstip dat een
  beheerder met MFA in de accountlijst ziet. Gewone gebruikers krijgen deze beheerdata niet via de API.
- **account-lifecycle/AC-2** — Bij vereiste MFA verandert het tijdstip pas na de volledige geslaagde login;
  een mislukt wachtwoord, onvoltooide of mislukte MFA, sessieverversing en wachtwoordwijziging tellen niet.
- **account-lifecycle/AC-3** — Een onbekende historische login blijft null en toont "Onbekend".
  Uitloggen, deactiveren en blokkeren wissen het laatst geregistreerde tijdstip niet.
- **account-lifecycle/AC-4** — Een beheerder met MFA kan een ander actief account deactiveren. Vanaf de commit
  worden nieuwe logins en bestaande sessies geweigerd, ook bij rechtstreekse auth-aanroepen en een loginrace.
- **account-lifecycle/AC-5** — Activeren laat opnieuw inloggen toe als het account niet geblokkeerd is.
  Oude ingetrokken sessies worden door geen van beide herstelacties opnieuw bruikbaar.
- **account-lifecycle/AC-6** — De vier combinaties van blokkade en deactivatie werken onafhankelijk;
  beide zijn zichtbaar en vindbaar. Toegang bestaat uitsluitend als beide maatregelen ontbreken.
- **account-lifecycle/AC-7** — Eigen deactivatie, de laatste bruikbare beheerder uitschakelen en statusmutaties
  door een gewone gebruiker of beheerder zonder MFA worden geweigerd, ook rechtstreeks op databaseniveau.
- **account-lifecycle/AC-8** — Twee beheerders die elkaar gelijktijdig uitschakelen laten minstens één bruikbare
  beheerder over; dit geldt ook voor combinaties van deactiveren, blokkeren en degraderen.
- **account-lifecycle/AC-9** — Herhaalde identieke mutaties wijzigen het oorspronkelijke tijdstip niet en voegen
  geen auditregels toe. Een echte wijziging registreert actor, doel, actie en request in dezelfde transactie.
- **account-lifecycle/AC-10** — Gelijktijdige geslaagde logins laten de laatste login nooit achteruit gaan.
  Zelfbewerkbare profielvelden kunnen geen van deze tijdstippen veranderen.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Geblokkeerd én gedeactiveerd | Beide zichtbaar; beide afzonderlijk opheffen vóór toegang | algemene inlogfout |
| Dezelfde maatregel opnieuw toepassen of opheffen | Geen wijziging, geen extra auditregel | geen |
| Uitgenodigd account | Bestaand uitnodigingsbeheer gebruiken | `ACCOUNT_INVITED` |
| Eigen account deactiveren | Weigeren | `OWN_ACCOUNT` |
| Laatste bruikbare beheerder | Weigeren; transactie terugdraaien | `LAST_ADMIN` |
| Sessie-intrekking faalt of overlapt met login | Statuscontrole blijft toegang weigeren; herstel mag oude sessies niet herstellen | algemene inlogfout |

## Raakt ook

Auth-hooks en sessiecontrole, laatste-admin-regel, beheerview, accountcontracten en routes, lijstfilters,
rijacties, query-invalidatie, Nederlandse teksten, auditacties en database-invarianten.
De eigenaar heeft voor deze taak de voorafgaande mandaatmerge uit
[ADR 0027](../adr/0027-taakmandaat-voor-frameworkwerk.md) uitgezonderd, zoals hierboven vastgelegd.
Nieuw roadmap-item bij fase 1, stuk 3e, inhoudelijk akkoord op 2026-10-21: "Laatste geslaagde login en afzonderlijke
deactivatie met herstel, naast blokkeren (spec `accountstatus-en-laatste-login`)". Het item blijft open tot bouwbewijs;
bestaande items voor blokkeren zijn geen bouwbewijs voor deze uitbreiding.

## Buiten scope

Automatische deactivatie wegens inactiviteit, verwijderen van accounts, volledige inloghistorie,
tijdelijke blokkades, redenen vastleggen, nieuwe authproviders en extra dependencies.

## Testplan

Unit-tests voor contracten, statuscombinaties en rijacties; integratietests tegen de echte lokale stack voor
geslaagde/onvoltooide logins, authenticatiecontrole, idempotentie, audit, racetests en ongeldige profielupdates;
pgTAP voor grants, functies, policies en laatste-admin-regel. E2E voor beheeracties, filters, datumweergave en
opnieuw inloggen na herstel, op 375 en 1280 px met axe via de bestaande UI-check.
Bij implementatie gelden de bestaande vereiste gates uit [Definition of Done](../dod.md).

## Besluit en vervolg

De inhoudelijke beslissingen zijn bevestigd door de eigenaar op 2026-10-21. De bouw volgt op diens expliciete
taakuitzondering. De gewone registratie naar gebouwd vraagt nog de bestaande PR- en CI-bewijzen; een lokale
implementatie of chatakkoord vervangt die niet.

Gewijzigde bestaande tests: de accountfixture in het contracttestbestand krijgt de drie verplichte responsevelden;
de auth-testharness registreert dezelfde verplichte-MFA-policy als de echte server. De pgTAP-functiecatalogus en
grant-allowlist krijgen uitsluitend de nieuw overeengekomen functie en kolomrechten. Testgedrag wordt niet afgezwakt.
De bestaande security-definer-test krijgt de nieuwe migratie in zijn verwachte functie- en view-inventaris;
zijn negatieve controle blijft alle verwijderde eigenaars detecteren.
Bij overname op actuele main blijven de bestaande sessiepolicy-tests en fixes voor idle-verval en na-commit-effecten
behouden. De generieke securitysuite krijgt uitsluitend de twee nieuwe admin-routes in haar classificatieregister
(`test/security/resources.ts`). De oorspronkelijke tests en hun asserties blijven intact.
De fixture in `session-expiry.test.ts` biedt de vereiste gebruikerslookup en een oude sessiegeneratie;
de oorspronkelijke assertions voor idle- en absoluut verval blijven intact. Een mislukte na-commit-opruiming
blijft zoals op main een foutantwoord geven zonder de blokkade terug te draaien.

## Lokale verificatie (2026-10-22)

- Typecheck, lint, opmaak, productiebuild, ratchet (inclusief `check-docs`), catalogus, migratie-, security-definer-
  en roadmapcontrole slagen. De snapshotcontrole bevestigt beide gegenereerde schemabestanden.
- Alle 2.006 unit/componenttests, 264 integratietests en 266 pgTAP-asserties slagen, inclusief login- en statusraces.
  Na time-outs op de Windows-mount zijn de volledige unit- en databaseruns ongewijzigd herhaald vanuit een
  Linux-kopie; alle 760 repositorybestanden zijn vooraf bytegelijk gecontroleerd.
- De volledige browsercheck is niet groen: 40 geslaagd, 20 mislukt met time-outs, ook de nieuwe lifecycle-test
  tijdens het laden van de accountlijst. Tijdens deze run raakte de lokale swap vrijwel vol. Dit is geen bewijs
  dat de volledige browserflow of toegankelijkheid van deze uitbreiding slaagt; tests en tijdslimieten blijven intact.
- Definitief bouwbewijs, CI (inclusief CodeQL en OSV) en eigenaarreview ontbreken nog. De spec blijft daarom
  goedgekeurd, niet gebouwd; het roadmap-item blijft open.
