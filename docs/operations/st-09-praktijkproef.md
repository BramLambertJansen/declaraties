# ST-09 — Praktijkproef: Meldpunt

Dit is de uitvoeringsopdracht voor [ST-09](../roadmap.md) in de template. De proef vindt plaats in een **aparte app-repository**, niet als demo in deze repository. De afgesproken proefapp heet **Meldpunt**, een intern systeem voor servicemeldingen. Deze opdracht is geen goedgekeurde app-featurespec, geen toestemming voor dependencies of providerkeuzes en geen opdracht om beschermde regels te wijzigen. Voor nieuwe routes, permissies en migraties gelden de bestaande spec- en eigenaarbesluiten.

**Doel:** bewijs dat een code-agent met deze template een bruikbare applicatie kan maken, de beveiligings- en kwaliteitsregels overeind blijven en een echte template-update later zonder verlies van app-code wordt overgenomen. Maak de kosten van handwerk, onduidelijkheden en herstelwerk zichtbaar. Documenteer uitkomsten **vanaf het eerste setup-commando**; alleen achteraf een eindverslag schrijven voldoet niet.

## Startvoorwaarden en instructie voor de uitvoerende agent

1. Lees eerst `AGENTS.md`, `docs/roadmap.md` (ST-09), `docs/nieuwe-app.md`, `docs/framework.md` §8 en §10, `docs/gouden-pad.md`, `docs/dod.md`, `docs/operations/agent-doorloop.md`, ADR 0006 en ADR 0029. Begin in de template met `node scripts/kit/feiten.mjs`. Controleer actuele code, scripts, CI en open PR's; beschouw een beschreven capability niet automatisch als werkend.
2. Controleer of GitHub **Use this template** werkelijk mogelijk is, welke repo-instellingen beschikbaar zijn en of de eigenaar de vereiste Ubuntu/WSL-stack kan starten. Volg `docs/nieuwe-app.md`; maak geen alternatieve setupmethode om tekortkomingen te maskeren.
3. Gebruik bij voorkeur de aparte private repo `<owner>/meldpunt-st09`, mits naam en beschikbaarheid kloppen. De eigenaar voert de setup-pushes, vereiste lokale acties, goedkeuringen en merges zelf uit volgens het playbook. Een eventuele onhaalbare private-ruleset is een **vast te leggen beperking**, geen reden om een bescherming als actief te rapporteren.
4. Leg de exacte template-commit, app-commit, versies, poorten (zonder geheimen), omgeving, starttijd en openstaande blockers vast voordat je app-code wijzigt. Maak een eerste testmatrix en bespreek productkeuzes in een mini-spec. Volg de afgesproken feature-lane; een grotere architectuurwijziging krijgt de gewone beslisroute.
5. Werk in afgebakende PR's. Onafhankelijke tester/reviewer en de eigenaar houden hun rollen zoals beschreven in `docs/framework.md` §8. Een runtime die die scheiding niet afdwingt, mag geen onafhankelijke controle claimen. **Geen push naar main, eigenmachtige merge, stille testaanpassing of verzwakking van gates.**

De eigenaar heeft Meldpunt als proefapp gekozen. De precieze app-velden, routes, permissies, foutcodes en bewaarkwesties worden vóór implementatie in de app-repository gespecificeerd en langs de bestaande goedkeuringsroute geleid.

## Afgebakende testapp

Meldpunt is een kleine, echte webapp. De functionele kern is één owner-scoped resource `tickets`, aangemaakt via de bestaande `pnpm new:resource`-werkwijze, en één beheerdersflow. Hergebruik login, uitnodigingen, sessies en MFA van de template; bouw daarvoor geen tweede mechanisme.

**Gebruiker:** uitgenodigd worden en aanmelden; melding aanmaken met titel, omschrijving, categorie en prioriteit; eigen meldingen bekijken, zoeken, sorteren en filteren; detail met status en beheerdersreactie bekijken; een eigen nieuwe melding aanpassen. De spec bepaalt welke statusovergangen of bewerkingen daarna niet meer zijn toegestaan.

**Beheerder:** bestaande admin-login met MFA; alle meldingen in een overzicht bekijken; melding openen, status veranderen (`nieuw`, `in behandeling`, `opgelost`, `gesloten`) en een korte reactie voor de indiener opslaan. Gebruik de bestaande accountbeheerfunctionaliteit zonder ST-02 als verborgen afhankelijkheid af te bouwen.

**Schermen:** dashboard met echte tellers of een zinvolle lege toestand, lijst met zoek/filter/sorteerfuncties, aanmaakformulier, detailpagina en adminoverzicht. Gebruik bestaande UI-componenten (waar toepasselijk `DataTable`, `ListToolbar`, formuliercomponenten, `Dialog`, `Toast` en `AsyncView`), Nederlandse teksten en alle relevante laden/leeg/fout/bezig/gelukt-staten. Toets mobiel (375 px) en desktop (1280 px), focus, toetsenbord en begrijpelijkheid.

**Niet in scope:** attachments/storage, externe API's, mail-outbox, achtergrondtaken, PWA, notificaties, complexe SLA's, geavanceerde analytics, extra rollen, productiehosting en ST-10-releasewerk. Breid de scope alleen uit als een aantoonbare testvraag dat rechtvaardigt en de eigenaar de wijziging goedkeurt. Maak het product niet kunstmatig groot om alle componenten te demonstreren.

## Acceptatiecriteria en bewijsmatrix

Gebruik deze stabiele IDs in de app-spec, testmatrix en resultaten. Maak de concrete app-tests tijdens de implementatie; de bestandsnamen hieronder zijn **voorbeelden**, geen claim dat ze bestaan. Koppel elk gewijzigd gedrag aan een inhoudelijke test. Voor RLS/policies zijn negatieve pgTAP-tests verplicht, niet alleen een UI-check.

| ID | Bewijsdoel | Vereiste controle |
| --- | --- | --- |
| ST09-01 | Nieuwe repo, templategeschiedenis, ruleset, start en migratie volgens playbook | Setup-log met handmatige handelingen, template-SHA, `scripts/doctor.sh` en werkelijke DB-/auth-controle |
| ST09-02 | Uitgenodigde gebruiker kan aanmelden en een melding maken, terugvinden en bewerken volgens spec | Echte-stack e2e + API-/integratietests |
| ST09-03 | Admin met MFA kan meldingen van gebruikers zien, status en reactie wijzigen; gewone gebruiker niet | Echte-stack e2e + toegestane/verboden API-verzoeken |
| ST09-04 | Gebruiker A kan `tickets` van gebruiker B niet lezen, wijzigen of verwijderen, ook niet via gewijzigde IDs of een gespoofte owner | API-/integratietests én pgTAP per RLS-policy; twee onafhankelijke gebruikers |
| ST09-05 | Onaangemelde/verlopen sessies, gewone rol op adminroute, admin zonder MFA en ongeldige payloads worden geweigerd zonder dat data verandert | Negatieve integratietests, inclusief relevante foutcodes |
| ST09-06 | Geen regressies in app- of bestaande templatechecks; nieuwe features zijn gedekt door tests | Werkelijke resultaten van `pnpm gate:fast`, `pnpm gate:slow` en `pnpm build` op de vermelde SHA, plus relevante CI-jobs |
| ST09-07 | UI werkt mobiel en desktop, ook met toetsenbord; automatische a11y-controles en handmatige beperkingen zijn zichtbaar | Playwright/axe op 375 en 1280 px, handmatige focus-/toetsenbordronde met bevindingen |
| ST09-08 | Ontwikkelfrictie en onderbrekingen zijn vanaf setup gedocumenteerd | Doorlopend log met oorzaak, exacte stap, aantal menselijke interventies en herstel |
| ST09-09 | Een échte, door de proef gemotiveerde templatewijziging is via de template-PR verwerkt en in Meldpunt overgenomen | Template-PR, merge-commit van `git merge template/main`, vooraf voorspelde conflicten, oplossingslog |
| ST09-10 | De app behoudt na de update haar code, data-afspraken, configuratie en werkende flows | Voor/na-matrix op twee exacte SHA's; regressietests en handmatige rooktest |
| ST09-11 | Historie, conclusie en opvolgacties zijn terugvindbaar zonder tijdelijke CI-artefacten | Verslagen in Git, verwijzingen naar CI-runs, bevindingen en template-issues/PR's |

**Beveiligingsmatrix:** test minimaal drie identiteiten: gebruiker A, gebruiker B en beheerder (met en zonder vereiste MFA indien van toepassing). Voor de owner-scoped resource moeten horizontale autorisatie (A tegen B) en verticale autorisatie (gebruiker tegen admin) aantoonbaar zijn getest. Controleer naast browsernavigatie de directe API; een verborgen knop is geen beveiligingsbewijs. Gebruik de OWASP WSTG-patronen voor autorisatie en object-level access.

**Testopbouw:** snelle unit/componenttests voor pure logica en UI-states, integratie en pgTAP voor het echte systeem, en een kleine set kritieke end-to-endflows. E2E draait tegen de echte database en API, zonder mocks van de eigen backend. Tests krijgen geïsoleerde fixtures, stabiele role/label-selectors en geen harde wachttijden. Gebruik de bestaande teststack en CI voordat je nieuwe reporters of infrastructuur toevoegt.

## Verplichte registratie in de app-repository

Maak **in Meldpunt**, niet in de template, de map `docs/validation/st-09/` met:

- `README.md`: doel, testomgeving, herhaalprocedure, meetdefinities, locatie van bewijs en omgang met gevoelige testdata.
- `test-matrix.md`: per ST09-ID scenario, precondities, verwacht resultaat, testbestand/commando, automatiseringsniveau, status en laatst geverifieerde SHA.
- `results.md`: actueel indexoverzicht met checkpoint, overall status, open blokkerende bevindingen en links naar alle checkpoint-runs. Geen losse handmatig aangepaste pass-cijfers.
- `runs/<run-id>.md`: **onveranderbaar checkpointverslag** met de echte uitkomsten en verwijzingen naar onderliggende checks. Vervolgmeting = nieuw verslag; geen oude resultaten herschrijven.
- `findings.md`: register met stabiele ID, type, ernst, impact, reproductiestappen, eerste run, voorstel, GitHub Issue/PR en actuele status. Een GitHub Issue is de bron voor de actuele afhandeling; kopieer de discussie niet in dit bestand.

Gebruik als run-ID bijvoorbeeld `2026-10-19-setup`, `2026-10-19-baseline` of `<datum>-template-update`; bij meerdere runs op een dag een oplopende suffix. Geef iedere meting een unieke combinatie van commit-SHA en run-ID.

### Inhoud per checkpoint-run

Een run bevat minimaal:

```text
Run-ID:
Doel: setup | feature | baseline | template-update | regressie | eindcontrole
Uitvoerder / controleur:
Tijdstip en duur (start/einde, tijdzone):
App-repo + volledige commit-SHA:
Template-repo + volledige commit-SHA:
Omgeving / toolversies / databasebasis:
Exacte commando's en CI-run-URL's:
Per check: geslaagd | mislukt | overgeslagen | niet uitgevoerd
Testaantallen (alleen indien uit machineleesbare uitvoer): passed / failed / skipped / flaky
Geautomatiseerde bewijzen: artifact-URL's, logs, trace of screenshots (waar beschikbaar)
Handmatige scenario's: uitvoerder, stappen en waargenomen resultaat
Interventies: stap, aanleiding, actie, hersteltijd (indien gemeten)
Nieuwe en open bevindingen:
Beperkingen en interpretatie:
Conclusie: geslaagd | geblokkeerd | mislukt (met reden)
```

Registreer **niet uitgevoerd** als een check niet draaide, **geblokkeerd** als de omgeving faalt en **onbekend** als een waarde niet werkelijk meetbaar is. Verzin geen tijd, testresultaat, dekking of CI-status. Markeer verwachte negatieve tests duidelijk: het geblokkeerde verzoek is het gewenste resultaat, niet een rode testrun.

Leg vóór elke nieuwe fase vast hoe je meet: verstreken tijd voor setup (van de eerste uitvoeringsstap tot een werkende stack), aantal handmatige overdrachten, aantal noodzakelijke agent-herstelpogingen, aantal onverwachte core-aanpassingen en aantallen nieuwe templatebevindingen. Gebruik diezelfde definities bij de updatevergelijking. Leg geen willekeurige prestatiegrenzen op zonder baseline.

### Automatische rapportage: klein houden, wel verplicht

Hergebruik de bestaande `gate:fast`, `gate:slow`, Playwright, Vitest, pgTAP en GitHub Actions. Laat CI per relevante run waar mogelijk:

1. De machineleesbare testresultaten verzamelen, zonder ze uit consoleproza te gokken.
2. Een korte job summary publiceren met SHA, checks, uitslagen en artefactlinks.
3. Bij falen traces en screenshots bewaren; bij belangrijke checkpoints ook het machineleesbare rapport. Controleer eerst de bestaande runner-outputpaden en beperkingen.
4. Een herbruikbare JSON-/Markdown-samenvatting leveren die een agent in het nieuwe `runs/`-checkpoint kan opnemen.

Schrijf hoogstens een kleine adapter/rapportagescript als de bestaande reporters niet voldoende zijn, en test deze op ontbrekende, gedeeltelijke en falende uitvoer. Een falende check blijft falen: het rapportagescript mag de exitstatus niet maskeren.

**CI schrijft niet naar `main`.** De agent verwerkt checkpoints via een normale PR, met verwijzingen naar de daadwerkelijke CI-uitvoer van de exacte SHA. Een GitHub Actions-artifact is tijdelijk; de blijvende samenvatting, testmatrix en bevindingen staan in de repo. Exporteer nooit wachtwoorden, tokens, sessiecookies, lokale `.env`-waarden of persoonsgegevens naar Git of rapportages.

## Uitvoering in checkpoints

### 0. Voorbereiding

- Leg bewijsbare nulstand van de template vast: werkelijke commando's/controles, open blockers, SHA en bestaande app-startprocedure.
- Maak een eerste risico- en acceptatiematrix en bepaal wie elke check uitvoert.
- Verifieer template-instelling, rechten, omgeving en vereiste eigenaaracties. Noteer wat niet te toetsen is.
- Maak geen nieuwe template-capability vóór er proefbewijs is.

### 1. Setup en overdracht

- Voer `docs/nieuwe-app.md` uit voor Meldpunt, inclusief de echte template-koppeling en benodigde eigenaarstappen.
- Schrijf **tijdens** de setup het log en de eerste checkpoint-run. Leg fouten en afwijkingen van het playbook vast.
- Verifieer auth, database/migraties, lokale stack en CI-instellingen daadwerkelijk; documenteer handmatige beslissingen.

### 2. Verticale feature

- Maak eerst de vereiste mini-spec(s) voor app-routes, permissies en de nieuwe resource; volg ADR 0029 voor goedkeuring en bouw-PR's.
- Gebruik `pnpm new:resource` en de bestaande werkstraat; voeg contracten, negatieve tests, handlers, queries en schermen gefaseerd toe.
- Verzamel per app-PR testmatrixdekking, echte checkuitvoer en nieuwe bevindingen. Niet wachten tot het eindrapport.
- Een ontbrekend corecomponent is een terugkoppelingspunt, geen vrijbrief om `src/core` in Meldpunt aan te passen.

### 3. Bevroren nulmeting

- Kies een groene, reviewbare app-commit en schrijf een `baseline`-checkpoint met alle ST09-criteria en open risico's.
- Documenteer expliciet welke bestanden waarschijnlijk conflicteren bij de latere template-update: volgens ADR 0006 in ieder geval de app-eigen `README.md`, `CHANGELOG.md`, `package.json` en eventueel `CODEOWNERS` bij andere eigenaar; vermeld alleen werkelijk geraakte bestanden als verwacht conflict.
- Bewaar de template-SHA waar Meldpunt vanaf komt; ga niet verder zonder een reproduceerbare baseline.

### 4. Echte template-update en regressie

- Selecteer een **daadwerkelijke** herbruikbare tekortkoming uit het bevindingenregister en koppel die aan een concrete test/regressiebewijs. Geen cosmetische dummywijziging om een merge uit te lokken.
- Maak voor de verbetering een eigen template-PR, met de vereiste spec/ADR, eigenaarakkoord, gates en review. Houd de app-domeincode buiten de template.
- Na de daadwerkelijke merge in `template/main`: voer in een app-featurebranch `git merge template/main` uit. Behoud de merge-ouder conform ADR 0006; **niet squashen**.
- Log vóór de merge de voorspelde conflictscope en ná de merge de feitelijke conflicten, oplossingsstappen en eventuele onverwachte aanpassingen.
- Voer dezelfde baseline-tests op de nieuwe app-SHA uit, naast gerichte tests voor de herbruikbare verbetering. Controleer expliciet dat appfunctionaliteit, configuratie en data-afspraken behouden zijn.
- Ontstaan onverwachte conflicten of regressies, rapporteer die als bevinding en verklaar ST-09 niet geslaagd totdat ze opgelost en opnieuw getest zijn.

### 5. Eindrapport en terugkoppeling

Schrijf in Meldpunt een eindrapport met vergelijking van setup, baseline en update. Beantwoord met bewijs:

1. Kon de agent het setup-playbook zelfstandig uitvoeren, en welke menselijke handelingen waren noodzakelijk?
2. Kon een echte owner-scoped feature zonder onbedoelde core-wijziging gebouwd worden?
3. Zijn beveiligingsgrenzen op API- en RLS-niveau aangetoond?
4. Bleven kritieke flows na de template-update werken?
5. Welke concrete templateveranderingen leveren aantoonbaar winst op voor volgende apps?

Zet structurele problemen om in een issue of een afzonderlijk voorstel/PR in de **template-repo**, met links naar de relevante run, reproductiestappen en test. Een app-fout blijft in Meldpunt. Laat ook een bewust niet-uitgevoerde verbetering met reden zichtbaar.

Het blijvende eindoverzicht en de runhistorie horen in Meldpunt. Zet in deze template hoogstens een beknopt ST-09-bewijsverslag met links naar app-commit, templateverbeter-PR en relevante checkpoint-runs; houd niet twee concurrerende statusregisters bij. Vink ST-09 alleen volgens de bestaande DoD en met eigenaarakkoord af.

## Stopvoorwaarden

De proef is **niet klaar** als alleen een werkende demo, een mocktest, een groen CI-label zonder juiste SHA of een update zonder regressietest is getoond.

Klaar betekent: volledige gebruikers- en adminflow op echte stack; object- en rolisolatie negatief getest; vereiste gates uitgevoerd en groen voor de gerapporteerde commits; mobiele, desktop- en toegankelijkheidscontrole met beperkingen geregistreerd; uitvoerlogs/checkpoints vanaf setup; echte templateverbetering via PR teruggebracht; update via merge-commit overgenomen; app-code en instellingen behouden; vóór/na-vergelijking en herleidbare templatebevindingen aanwezig.

Als voorwaarden niet haalbaar zijn: noteer **geblokkeerd** met ontbrekend bewijs, eigenaarbesluit of infrastructuurvoorwaarde. Verlaag geen gate om een vinkje te krijgen.

## Externe testmethodiek (achtergrond, geen extra toolingverplichting)

- [Playwright Best Practices](https://playwright.dev/docs/best-practices): gebruikersgedrag, geïsoleerde tests en stabiele locators.
- [Playwright Reporters](https://playwright.dev/docs/test-reporters) en [Trace Viewer](https://playwright.dev/docs/trace-viewer): JSON/HTML-bewijs, reproduceerbare foutanalyse.
- [Playwright Accessibility Testing](https://playwright.dev/docs/accessibility-testing): axe plus noodzakelijke handmatige controles.
- [OWASP WSTG — Bypassing Authorization Schema](https://wstg.owasp.org/latest/4-Web_Application_Security_Testing/05-Authorization/02-Bypassing_Authorization_Schema/) en [API Broken Object Level Authorization](https://wstg.owasp.org/latest/4-Web_Application_Security_Testing/12-API_Testing/02-API_Broken_Object_Level_Authorization/): horizontale en verticale autorisatie.
- [GitHub Actions workflow artifacts](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts): bewaren van testuitvoer (niet gelijk aan een permanent dossier).
