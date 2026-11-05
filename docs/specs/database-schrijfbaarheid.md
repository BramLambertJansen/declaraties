---
status: gebouwd # #381
namespace: database-checks
---

# Cataloguschecks voor uitvoerbare databasehandelingen

## Doel

De twee lessen uit leerticket #328 automatisch vangen: een verplicht insertveld zonder beschikbare waarde, en een
`app_definer`-delete die door ontbrekende leeszichtbaarheid niets verwijdert. De regressieprobes bewijzen daarnaast de
sleutelafleiding en statusovergang die een cataloguscheck niet uit domeinproza kan afleiden.

Dit is nieuwe checkfunctionaliteit: volledige werkstraat volgens ADR 0058. Een strengere check vraagt volgens ADR 0046
punt 4 geen nieuw ADR. Deze besluit-PR bevat alleen deze spec; implementatie volgt pas na eigenaarmerge op main.

## Rollen en wie wat ziet

- Tester: nieuwe cataloguschecks, registraties en probes in één nieuw pgTAP-bestand `db/tests/schrijfbaarheid.sql`.
  Alles draait tegen de echte gemigreerde database binnen een teruggedraaide testtransactie.
- `app_authenticated`, `api_user`, `auth_service`, `app_definer`: de insertcheck gebruikt hun **effectieve** rechten.
  Alleen `app_definer` valt onder de nieuwe deletecheck. De checks veranderen geen rollen of productierechten.
- Architect en reviewer: beoordelen domeinbetekenis en probe-inhoud; een policynaam, testnaam of reden bewijst geen gedrag.

## Datawijzigingen (met grants)

Geen migratie, productietabel, gewijzigde grant of gewijzigde policy. Alleen tijdelijke testobjecten en testdata in de
testtransactie. Bestaande migraties, tests, `scripts/kit/check-policies.mjs` en zijn naamcontrole blijven ongewijzigd.

### I — Een bron voor elk verplicht insertveld

Ontdek tabellen (`pg_class.relkind` `r`/`p`) in `public` en `app` via de gemigreerde catalogus. Voor elke genoemde rol met
enig effectief tabel- of kolomrecht `INSERT` controleert de invariant elke niet-verwijderde gebruikerskolom met
`pg_attribute.attnotnull`. Er is structureel een bron als minstens één van deze zaken geldt:

- de rol heeft effectief `INSERT` op die kolom;
- de kolom heeft een default in `pg_attrdef`;
- `attidentity` is gevuld;
- `attgenerated` is gevuld.

Gebruik `has_any_column_privilege`/`has_column_privilege`, zodat tabelgrants, kolomgrants, `PUBLIC` en daadwerkelijk
geërfde rechten meetellen; een lidmaatschap waarvoor alleen `SET ROLE` is toegestaan telt niet als geërfd recht.
Een tabel zonder effectief insertrecht voor deze rollen geeft geen insertverplichting. Nullable kolommen vallen buiten I.
Deze check kijkt niet naar `UPDATE` om een ontbrekende insertbron te vergeven: een latere wijziging kan een mislukte insert
niet herstellen. Een default, identity of generated expression is een bron, geen bewijs dat de waarde geldig of niet-null is.

Een ontbrekende bron is rood, behalve wanneer de catalogus een ingeschakelde `BEFORE INSERT FOR EACH ROW`-trigger toont
en een **uitgevoerde insertprobe** de ontbrekende bron bewijst. Een trigger op zichzelf geeft nooit vrijstelling.
De testregistratie bindt tabel, rol en ontbrekende kolom aan invoerwaarden en reden; geen vrije SQL om de invariant over te slaan.
Een testhelper bouwt uit de geregistreerde kolommen een echte `INSERT`, voert die onder de geregistreerde rol uit en eist
precies één ingevoegde rij. De aanwezige `NOT NULL`-constraint bewijst daarbij dat de ontbrekende kolom een waarde kreeg.
Een trigger die de insert overslaat, een uitgeschakelde trigger, een trigger voor een ander event, een fout of nul rijen
is rood. Alleen een pad/testnaam/reden registreren is rood. Een ongeldige, dubbele of niet meer nodige bronregistratie is rood.
Er is geen poging om triggerbodies te interpreteren.

De executor wisselt uitsluitend transactiegebonden van rol volgens het bestaande pgTAP-testpatroon; geen nieuwe
databaseverbinding, sessiebrede rolwissel of actorinstelling buiten de bestaande testvoorzieningen.

### D — Leeszichtbaarheid bij deletes door app_definer

Ontdek via `pg_class` en `pg_policy` elke tabel in `public`/`app` met RLS aan én geforceerd, effectief `DELETE` voor
`app_definer`, en minstens één toepasselijke permissieve `DELETE`- of `ALL`-policy. De voorgestelde projectconventie is:
zo'n tabel heeft ook minstens één toepasselijke **permissieve `SELECT`- of `ALL`-policy**. Dit is een conservatieve rail,
geen universele PostgreSQL-regel; zie OV-2.

Een policy is toepasselijk bij `PUBLIC` (`polroles` bevat nul), de rol zelf of een rol waarvan `app_definer` de rechten
daadwerkelijk erft (`pg_has_role(..., 'USAGE')`). `ALL` telt aan beide kanten; alleen restrictieve policies geven geen
toegang en voldoen dus niet. Restrictieve policies blijven in de echte uitvoering gelden. Vergelijk geen policynamen of
SQL-strings en probeer geen logische implicatie tussen predicaten te bewijzen.

De interne catalogushelpers voor effectieve rechten en policytoepasselijkheid accepteren een doelrolparameter voor
tests; de echte D-gate gebruikt altijd de vaste doelrol `app_definer` (I gebruikt de vier rollen hierboven). De probes
gebruiken bestaande lidmaatschappen: `app_migrator` erft `app_definer` (`INHERIT`), maar heeft `app_authenticated` alleen
beschikbaar via `SET`; ook `api_user` heeft `app_authenticated` alleen via `SET`. Geen nieuwe clusterrollen of
lidmaatschapsmutaties. Deze helperparameter verandert niet de rol van de daadwerkelijke insert-/delete-executor.

Aanwezigheid van een SELECT-policy bewijst geen rijzichtbaarheid. Daarom heeft **iedere ontdekte D-tabel** een
uitgevoerde deleteprobe in hetzelfde testbestand. De registratie bevat tabel, exacte filterkolommen en testwaarden voor
proefrijen, met **per rij** de verwachte uitkomst: verwijderd of beschermd. Minstens één rij moet naar verwachting
worden verwijderd. De helper bouwt **één** echte `DELETE ... WHERE` die alle proefrijen selecteert, bijvoorbeeld
`id IN (:eersteId, :tweedeId)`. Bij beschermd verklaarde rijen moet de RLS-policy ze uitsluiten, niet het WHERE-filter.
Uitvoering gebeurt als `app_definer`, met RLS aan en geforceerd. Effectieve `SELECT`-rechten op alle gelezen filterkolommen
worden afzonderlijk gecontroleerd. De gezamenlijke rowcount is gelijk aan het aantal verwacht verwijderde rijen en is
minstens één. Observatie bewijst per rij: verwacht verwijderd betekent afwezig, verwacht beschermd betekent ongewijzigd
aanwezig. Alleen een geslaagde SQL-aanroep of een rowcount van nul voldoet niet. Ontbrekende registratie, ontbrekende
rij of een niet-uitgevoerde probe is rood.

Bij domeinbeleid dat rijen beschermt is minstens één beschermde grenscasus verplicht, naast de positieve rij;
`app.audit_log` en de specifieke RLS-regressieprobe hebben altijd beide. Bij bewust volledige verwijdertoegang, zoals
een geldige permissieve `ALL using (true)` voor een wachtrij, mogen alle geregistreerde rijen naar verwachting worden
verwijderd. Ook die casus moet echt worden uitgevoerd en op alle verwachte verwijderingen worden gecontroleerd;
structurele aanwezigheid van een ALL-policy alleen volstaat niet. De tester ontleent de verwachte uitkomsten aan de
goedgekeurde resourcespec; de eigenaarreview beoordeelt dit oracle en de proefrijen. De helper leidt domeinbeleid of
predicaatimplicaties niet zelf af.

Inspecteer alle proefrijen vóór en na de delete als eigenaar `app_migrator` met de bestaande testtransactievorm uit
`db/tests/audit_log.sql:635`: alleen in een observatie-savepoint tijdelijk `NO FORCE`, dan `ROLLBACK TO SAVEPOINT`
vóór enige volgende handeling. Het savepoint na de delete begint pas na die delete, zodat de observatie haar resultaat
niet terugdraait. De observatie leest de bekende identifiers en opgeslagen waarden zonder de te testen verbergende
policies; een SELECT onder dezelfde beperkte rol is geen onafhankelijk bewijs dat een rij verwijderd is. Assert vóór
de delete en na iedere observatie dat FORCE hersteld is. Reset de rol naar eigenaar `app_migrator` vóór iedere
observatie; het afzonderlijke observatie-savepoint vóór de delete is ook teruggedraaid voordat de executor naar
`app_definer` wisselt. Geen mutatie of andere check uitvoeren terwijl FORCE voor observatie uit staat. Geen
productierecht, policy of blijvende RLS-instelling wijzigen om de geteste handeling te laten slagen.

`app.audit_log` is de bestaande positieve casus: maak een verlopen en een nog te bewaren rij met bekende identifiers
en tijdstippen, respectievelijk vóór en na de cutoff. Bouw `WHERE id IN (:oudId, :nieuwId) AND at IN (:oudAt, :nieuwAt)`;
**beide** rijen voldoen daaraan. Controleer SELECT-rechten op zowel `id` als `at`. De verlopen rij verdwijnt, de nieuwe
blijft ongewijzigd; het bewaren van die nieuwe rij kan zo niet door het WHERE-filter worden verklaard.

Ook een toepasselijke `SELECT using (false)` of een restrictieve policy die de positieve rij verbergt moet door de
gedragsprobe rood worden, hoewel de structurele check terecht een aanwezige SELECT-policy vindt. De zichtbaarheid van
alle mogelijke rijen blijft resource-specifiek; de probe bewijst zijn concrete grensgevallen.

PostgreSQL vereist bij een delete die doelkolommen leest, bijvoorbeeld in `WHERE`, de bijbehorende SELECT-rechten en
SELECT/ALL-policies. Een zuivere delete zonder zulke kolomlezing kan zonder SELECT-policy geldig zijn. De documentatie
beschrijft ook de combinatie van permissieve en restrictieve policies:
[CREATE POLICY, PostgreSQL 17](https://www.postgresql.org/docs/17/sql-createpolicy.html),
[DELETE, PostgreSQL 17](https://www.postgresql.org/docs/17/sql-delete.html).

### Domeinregressie van de bestandsles

Een geïsoleerde filevormige probetabel bewijst onder `app_authenticated` de hele handeling: database kiest `id`,
`storage_key` is generated uit dat id, `status` krijgt `pending` zonder insertgrant, en een toegestane update maakt de rij
`ready`. Assert op de werkelijk opgeslagen sleutel, beginstatus, eindstatus en precies één gewijzigde rij.
Geen writegrant op `id` of `storage_key` toevoegen om de probe groen te krijgen. Deze tijdelijke casus bouwt geen
bestandsfeature en verandert de goedgekeurde spec `bestandsopslag` niet.

Een default kan geen andere kolom uit dezelfde rij lezen; een generated column kan dat wel en wordt na BEFORE-triggers
berekend. Dit onderbouwt het onderscheid tussen beide bronnen, zonder willekeurige expressies te analyseren:
[Generated Columns, PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-generated-columns.html).

## Routes en foutcodes

N.v.t. — alleen tests; geen route, permissie, publiek contract of foutcode. Diagnostiek noemt minimaal check (`I`/`D`),
`schema.tabel`, rol en ontbrekende kolom of policysoort. Fouten bij probe-uitvoering noemen ook de handeling.

## Kopieer de vorm van

- `db/tests/user_roles.sql` — pgTAP tegen echte rollen en policies, genoemd in `docs/gouden-pad.md:102`.
- `db/tests/accounts.sql` — effectieve kolomrechten en rijzichtbaarheid, genoemd in `docs/gouden-pad.md:102`.

## Hergebruik en UX

- Bestaande componenten: n.v.t. — geen UI; Button, Form en de overige kitcomponenten worden niet geraakt.
- Staten per scherm, zichtbare UI-tekst, focus en toetsenbord: n.v.t. — geen scherm of interactie.
- Hergebruik het catalogus-plus-probepatroon uit `db/tests/security.sql` en de daadwerkelijke roluitvoering uit
  `db/tests/audit_log.sql`; de bestaande C1–C3-tests en hun goedgekeurde criteria blijven gelijk.
- Eén bronregistratie in het nieuwe testbestand; alleen voor uitvoerbare probes, niet als algemene uitzonderingenlijst.

## Acceptatiecriteria

- **database-checks/AC-1** — Een tabel waarop een betrokken rol INSERT heeft, met een NOT NULL-kolom zonder insertrecht,
  default, identity of generated bron, maakt I rood met tabel, rol en kolom; een nullable kolom en een tabel zonder
  insertrecht leveren deze fout niet op. UPDATE-recht op die kolom herstelt de fout niet.
- **database-checks/AC-2** — Dezelfde casus met respectievelijk effectief kolomrecht, tabelrecht, default, identity en
  generated bron passeert I. Probes bewijzen `PUBLIC` en geërfde rechten; een alleen met SET beschikbaar lidmaatschap
  levert geen vals positief recht op. Gebruik daarvoor de helpers met de bestaande lidmaatschappen van app_migrator
  en api_user; geen nieuwe clusterrollen of lidmaatschappen.
- **database-checks/AC-3** — Een BEFORE INSERT ROW-trigger zonder registratie maakt de ontbrekende bron niet groen;
  een geregistreerde insert die precies één rij met de verplichte waarde maakt wel. Verwijder de toekenning uit de
  trigger, zet de trigger uit of laat hem de rij overslaan: de bijbehorende controle wordt rood. Alleen een reden of
  verwijzing toevoegen kan de fout niet opheffen.
- **database-checks/AC-4** — De filevormige probe slaagt als de database id en sleutel maakt, status standaard pending
  is en de bevoegde statusupdate één ready-rij oplevert. Zonder statusdefault faalt I én de echte insert; met
  ontbrekend updategrant faalt de statusupdate; een verkeerde sleutelafleiding faalt op de opgeslagen sleutel.
  Een default die NULL oplevert wordt niet als geldige uitvoering gepresenteerd: de echte insert faalt.
- **database-checks/AC-5** — Een FORCE-RLS-tabel met toepasselijke permissieve DELETE-policy en effectief deletegrant
  voor app_definer maar zonder toepasselijke permissieve SELECT/ALL-policy maakt D rood. Een SELECT-grant alleen of
  alleen een restrictieve SELECT-policy verandert die uitkomst niet. Goede SELECT- en ALL-varianten passeren de structuurcheck.
- **database-checks/AC-6** — D herkent policies voor PUBLIC en werkelijk geërfde rollen; een policy alleen voor een
  niet-toepasselijke rol telt niet. Alle proefrijen voldoen aan dezelfde door de helper gemaakte WHERE; de echte
  delete onder app_definer met FORCE raakt precies het geregistreerde positieve aantal. Observatie als eigenaar
  bewijst per rij de verwachte afwezigheid of ongewijzigde aanwezigheid, ook als een SELECT-policy ze voor
  app_definer verbergt. FORCE is vóór de delete en na iedere observatie hersteld. SELECT-grant op een gelezen
  filterkolom ontbreekt: rood op het recht.
- **database-checks/AC-7** — Met aanwezige SELECT-policy die de positieve rij verbergt, of een restrictieve policy die
  dit doet, blijft de structurele check groen maar wordt de verplichte gedragsprobe rood op nul verwijderde rijen.
  De bestaande app.audit_log-casus en de specifieke regressieprobe bevatten altijd een verlopen en een beschermde
  rij die beide de WHERE matchen: rowcount één, verlopen rij weg, beschermde rij ongewijzigd. Ontbrekende probe is rood.
- **database-checks/AC-8** — Elke nieuwe catalogusquery heeft in hetzelfde bestand een opzettelijk foute en een goede
  probe, plus bewijs dat opruimen de beginsituatie herstelt. Alle nieuwe tests draaien via het bestaande pnpm test:db;
  geen gemockte database/API, skip, todo, wijziging van bestaande tests of nieuwe dependency.
- **database-checks/AC-9** — Een geldige permissieve ALL-policy met `using (true)` voor app_definer passeert D met een
  echte probe: twee proefrijen matchen de WHERE en zijn beide als te verwijderen geregistreerd; rowcount twee en
  observatie bevestigt dat beide weg zijn. Er wordt geen beschermde rij geëist die het goedgekeurde domeinbeleid niet
  kent. Een aanvullende restrictieve SELECT-policy met `using (false)` blokkeert deze uitvoering en maakt de probe rood.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| BEFORE-trigger aanwezig maar vult alleen een ander veld | Geen automatische bron; echte insertprobe faalt | n.v.t. |
| Default of generated expressie faalt of levert NULL | Structurele bron aanwezig; echte probe bewijst mislukking | n.v.t. |
| INSERT ... RETURNING heeft aanvullende leesrechten nodig | Alleen gebruiken waar de bestaande grants die toestaan; geen rechten verruimen voor de test | n.v.t. |
| Alleen restrictieve DELETE-policy | Geen D-kandidaat die toegang verleent; geen algemene claim dat delete uitvoerbaar is | n.v.t. |
| Bewust volledige deletebevoegdheid via permissieve ALL-policy | Echte probe mag alle rijen verwijderen; verwachte uitkomst per rij, geen kunstmatige beschermde rij | n.v.t. |
| Geldige blind DELETE zonder kolomlezing | PostgreSQL kan dit toelaten; de voorgestelde conservatieve projectrail keurt het af (OV-2) | n.v.t. |
| Partitionering of overerving | Catalogus controleert gewone en gepartitioneerde tabellen; bewijs alleen voor de concreet aangesproken relatie, geen claim over alle childexpressies | n.v.t. |
| Trigger kan gegevens afhankelijk van de actor veranderen | Concrete actor/probe bewijst alleen die casus; resource-tests dekken overige domeingrenzen | n.v.t. |

## Raakt ook

- Bouw-PR: nieuw `db/tests/schrijfbaarheid.sql`, relevante gebruiksdoc en `CHANGELOG.md`; geen aanpassing aan bestaande
  tests/helpers, migraties, hooks, envbestanden, package scripts of gegenereerde bestanden.
- `pnpm test:db` en volledige verplichte CI blijven gelden. `check:migrations` en `check:secdef` blijven ongewijzigd;
  geen nieuwe migratie, productiefunctie of permissie, dus geen nieuwe permissietest per verboden rol.
- `test/security/resources.ts` blijft ongewijzigd: de tijdelijke probetabel is geen app-resource of geregistreerde route.
- De hoofdsessie koppelt in de bouw-PR de aanleiding #328 aan de bestaande roadmap-werkafspraken, met eigenaarakkoord;
  deze besluit-PR wijzigt geen roadmap of status van een andere spec.

## Buiten scope

- SQL of proza in ongebouwde specs parsen; de catalogus kan een nog niet gebouwde migratie niet controleren.
- De bestaande policy-naamcheck veranderen, alle positieve resourcehandelingen generiek bewijzen, willekeurige
  SQL/triggerbodies begrijpen of policy-predicaten op logische gelijkwaardigheid toetsen.
- RLS-/rollenmodel, productiegrants of bestandsopslag bouwen of herstellen; geen nieuwe ADR of dependency.

## Testplan

1. Na eigenaarmerge schrijft een aparte tester het nieuwe bestand met de AC-verwijzingen en echte probes; rood moet
   uit de inhoudelijke asserties komen. De bouwer vult daarna binnen dezelfde nieuwe testcode de catalogusfuncties aan.
2. Voer I- en D-varianten geïsoleerd uit binnen de teruggedraaide transactie, inclusief de kapotte statusupdate,
   sleutelafleiding, trigger en niet-overlappende SELECT-policy. Geen foute probe mag de rest van de suite vervuilen.
3. Voer `pnpm test:db` via de bestaande runner of `pnpm pr:verify <nr> --watch` voor CI-bewijs uit; verzamel volledige
   verplichte CI op de juiste commit en laat een aparte reviewer route, catalogussemantiek en probe-inhoud toetsen.
4. Voor deze spec-PR zijn documentatiechecks en onafhankelijke specreview nodig. Er is nog geen uitvoering van de
   voorgestelde databasechecks; de huidige analyse berust op bronlezing en de bestaande feitenuitvoer.

## Open vragen

- **OV-1** — Hoe om te gaan met door BEFORE-triggers gevulde verplichte kolommen? Aanbeveling: uitsluitend de beperkte
  bronregistratie met een daadwerkelijk uitgevoerde, door de helper gemaakte insert en precies één ingevoegde rij;
  geen triggerdetectie als automatische vrijstelling. De eigenaarmerge accepteert of verwerpt deze aanpak.
- **OV-2** — De D-conventie ook toepassen op een legitieme blind DELETE? Aanbeveling: ja, binnen deze afgebakende
  app_definer-rail zonder uitzonderingsbypass, zodat een latere WHERE/RETURNING-toevoeging niet stil nul rijen raakt.
  Dit is een voorgestelde strengere projectconventie en geen reeds genomen besluit of PostgreSQL-eis. Wil de eigenaar
  zulke deletes toestaan, dan moet de scope vóór implementatie expliciet worden herzien; geen automatische rechtenverruiming.
