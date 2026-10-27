# ST-09 — Generiek protocol voor de praktijkproef

Dit protocol hoort bij [ST-09](../roadmap.md). Het bevat geen gekozen app, domeinschema, seeddata of ingevulde
testresultaten. De eigenaar kiest een kleine echte app; appnaam, beschrijving, scope, fixtures en resultaten horen
alleen in de aparte app-repo. Een werkende setup is het eerste checkpoint, niet het bewijs dat ST-09 klaar is.

## Voorbereiden

1. Begin met [de startinstructie](../../START-NIEUWE-APP.md) en het actuele [setup-playbook](../nieuwe-app.md).
   Lees de app-instructies en de bestaande [werkstraat](../framework.md#8-werkstraat), [DoD](../dod.md),
   [agentdoorloop](agent-doorloop.md), [ADR 0040](../adr/0040-template-app-en-grens-core-app.md) en
   [ADR 0046](../adr/0046-werkstraat-en-beslisroute.md). Controleer feiten, code en open PR's; beschreven is niet bewezen.
2. Vraag alleen ontbrekende appnaam en korte beschrijving. De gekozen app moet een kleine verticale flow met een
   owner-scoped resource en een adminactie kunnen bewijzen. Bespreek concrete velden, rechten en gedrag pas bij de
   featurespec in de app-repo; dit protocol is geen goedgekeurde app-featurespec of providerbesluit.
3. Begin vóór de eerste setupstap een voortgangs- en interventielog in de setupmap. Leg bron-SHA, omgeving, starttijd,
   meetdefinities en ontbrekende voorwaarden vast, zonder geheimen. Zet de blijvende rapportage na repo-creatie in de app.
4. Controleer template-instelling, GitHub-rechten, private branchbescherming en de beschikbaarheid van de lokale stack.
   Een onhaalbare bescherming is een expliciete beperking waarover de eigenaar beslist, geen werkende garantie.

## Bewijsmatrix

Gebruik deze IDs in de app-spec, testmatrix en checkpointverslagen. Vul ze met werkelijke scenario's en uitslagen in
de app-repo, niet met voorbeeldgegevens in de template. De bestaande eisen aan tests en onafhankelijke rollen blijven gelden.

| ID | Bewijsdoel | Controle |
| --- | --- | --- |
| ST09-01 | Nieuwe repo, bronhistorie, bescherming en gecontroleerde setup | Setup-log, template-SHA, doctor, database- en browser/logincontrole |
| ST09-02 | Een gebruiker doorloopt de gekozen verticale flow | Echte-stack e2e en API-/integratietests volgens app-spec |
| ST09-03 | Adminactie werkt alleen met vereiste rechten en MFA | Toegestane en verboden browser- en API-acties |
| ST09-04 | Gegevens van een andere gebruiker blijven afgeschermd | Horizontale autorisatietests via directe API en pgTAP per RLS-policy |
| ST09-05 | Ongeldige invoer en ontbrekende/verlopen authenticatie veranderen geen data | Negatieve integratietests met relevante foutcodes |
| ST09-06 | App en templatechecks blijven groen | Exacte SHA, vereiste gates, build en werkelijke CI-uitvoer |
| ST09-07 | Mobiel, desktop, toetsenbord en toegankelijkheid | Playwright/axe op 375 en 1280 px, handmatige focus-/toetsenbordcontrole en beperkingen |
| ST09-08 | Frictie is vanaf setup zichtbaar | Doorlopend log van eigenaarstaken, fouten, herstel en gemeten tijd; generieke frictie als issue met label `leerpunt` |
| ST09-09 | Een echte templateverbetering is teruggebracht en overgenomen | De keten leerpunt-issue → roadmap-item met dat issue als aanleiding → template-PR met merge-commit; vooraf verwachte en feitelijke conflicten |
| ST09-10 | De update behoudt appfunctionaliteit, gegevensafspraken en instellingen | Dezelfde regressiematrix vóór en na de update op twee exacte SHA's |
| ST09-11 | Bewijs en opvolging blijven terugvindbaar | Checkpointverslagen in de app-repo, CI-links en templatebevindingen als issues met label `leerpunt` |

Test minimaal twee onafhankelijke gebruikers en een beheerder, inclusief ontbrekende vereiste MFA. Test horizontale én
verticale autorisatie via de directe API en RLS, niet alleen verborgen knoppen. Gebruik geïsoleerde fixtures in de app,
stabiele role-/label-selectors en de bestaande teststack. E2E en integratie gebruiken de echte API en database, geen mocks
van de eigen backend. Voeg geen reporters of andere infrastructuur toe zonder aantoonbare behoefte en het vereiste akkoord.

## Doorlopende registratie in de app-repo

Maak daar `docs/validation/st-09/` met een leeswijzer, testmatrix, resultatenindex, bevindingenregister en checkpointverslagen.
Een checkpointverslag bevat uitvoerder/controleur, run-ID, doel, tijdstip en gemeten duur, volledige app- en template-SHA,
omgeving/toolversies, exacte opdrachten en CI-links, uitslagen per criterium, handmatige waarnemingen, interventies,
open bevindingen en conclusie met beperkingen. Registreer geen persoonsgegevens, tokens, wachtwoorden, sessiecookies of
lokale omgevingswaarden in Git of rapportages. Bewaar app-testdata uitsluitend waar de app-tests ze nodig hebben.

- Gebruik per meting een unieke run-ID en SHA; behoud oude checkpointverslagen en schrijf bij herhaling een nieuw verslag.
- Onderscheid geslaagd, mislukt, geblokkeerd en niet uitgevoerd. Een onmeetbare waarde is onbekend, geen geschatte uitslag.
- Leg vooraf vast hoe je setuptijd, eigenaarsoverdrachten, herstelpogingen, onverwachte core-aanpassingen en nieuwe
  templatebevindingen meet. Gebruik dezelfde definities vóór en na de update; bedenk geen grens zonder baseline.
- Neem testaantallen alleen over uit werkelijke machineleesbare uitvoer. Een verwachte weigering is een geslaagd negatief
  scenario, niet een rode test. Laat rapportage nooit de exitstatus van een falende check maskeren.
- Hergebruik Vitest, pgTAP, Playwright en GitHub Actions. Bewaar beschikbare machineleesbare resultaten, traces en
  screenshots als CI-artefacten; die zijn tijdelijk. De blijvende samenvatting en links naar de exacte runs staan in de app-repo.
  Alleen bij een bewezen tekort een kleine adapter, met tests op ontbrekende, gedeeltelijke en falende uitvoer.
- Houd één resultatenindex bij die naar de afzonderlijke runs verwijst, en één bevindingenregister met ID, ernst,
  reproductie, eerste run en issue/PR. GitHub blijft de bron voor actuele issueafhandeling; kopieer geen discussies.
- CI schrijft niet naar main. De agent verwerkt bewijs via een gewone app-PR. Geheimen en gevoelige testdata horen niet in logs.

## Uitvoering

### 1. Setup en overdracht

Volg het playbook voor de door de eigenaar gekozen app. Noteer handwerk en fouten tijdens de uitvoering, niet achteraf.
Controleer bron-tree en historie, werkelijke bescherming, stack, migraties en browser/login. Vermeld ontbrekende
runtimegrenzen; een agent met dezelfde rechten is geen afgedwongen onafhankelijke reviewer. De setup stopt met een
overdracht en een vraag naar de volgende opdracht, niet met stilzwijgend featurewerk.

### 2. Verticale flow

Na een vervolgopdracht leg je de eerste gebruikersflow en adminactie vast in de vereiste app-spec volgens ADR 0046.
Gebruik de bestaande generator en UI-componenten waar ze passen; bouw geen tweede auth-mechanisme. Scope-uitbreiding,
providers en dependencies vragen hun bestaande besluiten. Een ontbrekend corecomponent gaat terug naar de template;
wijzig `src/core` niet in de app. Verzamel per app-PR bewijs en bevindingen; bouw niet verborgen andere roadmap-items af.

### 3. Bevroren nulmeting

Kies een groene, reviewbare app-commit en leg alle criteria, bron-SHA en open risico's vast. Noteer vóór de update welke
werkelijk app-specifiek gewijzigde bestanden waarschijnlijk conflicteren (ADR 0040). Ga niet verder zonder een
reproduceerbare baseline. Een groen label zonder controle van de juiste SHA telt niet.

### 4. Echte template-update

Kies een daadwerkelijk gevonden herbruikbare tekortkoming. Breng de generieke verbetering met regressiebewijs via een
afzonderlijke template-PR terug, met de vereiste goedkeuringen, review en checks. Geen appcode, appdata of cosmetische
dummywijziging om een update af te vinken. Na de merge door de eigenaar neem je de wijziging in een app-branch over via
`git merge template/main`; behoud de merge-ouder, nooit squashen. De eigenaar merget de app-PR als merge-commit.

Leg verwachte en feitelijke conflicten, herstelstappen en de nieuwe SHA vast. Draai dezelfde baselinecontroles en gerichte
regressietests en controleer dat appcode, data-afspraken, instellingen en gebruikers-/adminflows behouden blijven.
Onverwachte conflicten of regressies blijven bevindingen totdat herstel en hertoetsing bewezen zijn.

### 5. Eindrapport

Bewaar het rapport in de app: kon de agent de app starten en een owner-scoped flow bouwen, welke eigenaarstappen waren
nodig, werkten autorisatie en RLS, bleef de app werken na de update en welke generieke verbetering leverde aantoonbaar
winst? Koppel templateproblemen aan een template-issue of PR met reproductie en bewijs. Appfouten blijven in de app.
Behoud ook bewust niet-uitgevoerde verbeteringen met reden.

In de template komt hoogstens een beknopte, niet-appspecifieke bewijsverwijzing naar app-commit, relevante runs en de
verbeter-PR, zonder appdata of een tweede resultatenregister. Vink ST-09 alleen af met het vereiste bewijs en eigenaarakkoord.
Alleen een werkende demo, setup of mocktest is onvoldoende. Ontbreekt een voorwaarde, noteer geblokkeerd met reden;
verlaag geen gate en claim geen groen voor controles die niet draaiden.

Templatebevindingen gaan alleen als issue met label `leerpunt` naar de template-repo ([ADR 0059](../adr/0059-leerlus-van-app-naar-template.md),
skill `opleveren`, Opruimen stap 8); geen tweede register in de app. Het eindrapport telt met
`gh issue list --label leerpunt --state all` op de template-repo het totaal, het aantal opgepakte leerpunten (met een
roadmap-item dat het issue als aanleiding heeft) en het aantal herhalingen (met `eerder:`), tegen de nulmeting 0.
