# Start een nieuwe app — opdracht voor de coding agent

Je start een nieuwe applicatie vanuit [BramLambertJansen/template](https://github.com/BramLambertJansen/template).
Werk niet in de template en maak geen fork: maak een nieuwe GitHub-repository vanuit de template, kloon die naar de
ontwikkelmachine, koppel de templatehistorie en draag de gecontroleerde app-repo over voor featureontwikkeling.

Dit is de korte ingang voordat de app-repo bestaat. Het [setup-playbook](docs/nieuwe-app.md) is de enige gedetailleerde
uitvoerbron. Gebruik de actuele versie op `template/main`; meld tegenstrijdigheden en verzin geen tweede setuppad.

## Intake: alleen vragen wat ontbreekt

Lees eerst de opdracht en eventuele voortgang. Neem een al gegeven naam, beschrijving of repo-naam over. Ontbreekt iets,
vraag dat in één bericht en wacht:

> Hoe moet de app heten? Geef ook een korte beschrijving: wat doet de app en voor wie?
> Ik leid de repo-naam af van de appnaam. Standaard wordt de repo privé.
> Wil je een andere repo-naam, eigenaar of zichtbaarheid, zeg het erbij.

Bevestig naam, repo-naam, beschrijving en doelmap kort. Vraag alleen bij een ongeldige, onduidelijke of bezette keuze om
verduidelijking. Sla de intake en actuele fase op in `SETUP-PROGRESS.md` in de setupmap. Beschrijving en herkomst komen
later in de README van de app; de beschrijving komt ook bij de GitHub-repo. `app:init` verwerkt alleen de bestaande
hernoemstap, niet de beschrijving. Vraag nog geen volledige backlog, hostingprovider of productiegeheimen.

Deze template bevat geen gekozen proefapp of appdata. Alleen wanneer de eigenaar ST-09 opdraagt, volg je daarnaast het
[generieke praktijkprotocol](docs/operations/st-09-praktijkproef.md). Kies geen app of datamodel namens de eigenaar.

## Volgorde en overdrachten

| Stap | Uitvoering | Wanneer door? |
| --- | --- | --- |
| Intake en preflight | Agent controleert antwoorden, omgeving, bestaande tools, GitHub-login, template-instelling en alle vijf lokale poorten | Ontbrekende keuzes zijn beantwoord; bestaande installatie hoeft niet opnieuw |
| Machine en toegang | Volgens het playbook; eigenaar doet noodzakelijke installatie, login en goedkeuring | Resultaat per eigenaarstap gecontroleerd |
| App-repo | GitHub-eerst via de templatefunctie, dan klonen naar `~/code/<slug>` | Juiste nieuwe repo, origin en bronversie vastgesteld |
| Historie en naam | Bron-tree vergelijken, eenmalig koppelen, `app:init`, beschrijving toevoegen | Tree gelijk, merge met twee ouders, eigen appnaam en beschrijving |
| Push en bescherming | Eerst CodeQL-beschikbaarheid vaststellen; eigenaar doet eerste main-push en aangewezen beveiligingsstappen | Bij ontbrekende of onbekende CodeQL stoppen; werkelijke push en instellingen gecontroleerd |
| Bootstrap en stack | Eigenaar installeert eerst met machinecontrole en start daarna de app | Machinecontrole groen; vervolgens volledige doctor, migraties en databasebewijs groen |
| Agent en browser | Runtimegrenzen controleren; browser-, login- en MFA-controle volgens playbook | Uitvoerder en uitslag vastgelegd; niet-uitgevoerde controles blijven open |
| Overdracht | Locatie, URL's, bewijs, beperkingen en volgende actie samenvatten | Stoppen; featurewerk vraagt een vervolgopdracht |

**Eén eigenaarstaak tegelijk:** noem de terminal of plek, geef genummerde stappen en het verwachte resultaat. Eindig met
"Typ klaar als dit gelukt is; plak bij een fout de melding, zonder geheimen." Stop en wacht. Na de reactie verifieer je de
uitkomst, of vraag je de ontbrekende uitvoer. "Klaar" is een hervatsignaal, geen bewijs en geen opdracht voor nieuwe features.

Bij fouten blijf je bij de huidige stap en volg je de herstelregels van het playbook. Na een herstart lees je eerst de
voortgang en controleer je de laatste afgeronde stap. Een bestaande repo of map overschrijf je niet; verifieer herkomst
en staat voordat je hervat. Installeer werkende onderdelen niet opnieuw.

## Grenzen

- Eerst de omgeving controleren, niet eerst de template clonen en ombouwen. De nieuwe app ontstaat via GitHub met de templatefunctie.
- Vergelijk vóór de eenmalige `-s ours`-merge de tree van de nieuwe repo met `template/main`, zoals het playbook voorschrijft.
  Bij verschil stoppen en een herstelkeuze voorleggen: die merge neemt inhoudsverschillen niet mee.
- De eigenaar doet de eerste setup-push naar main en latere merges. Geen force-push, checkomzeiling of stilzwijgend public maken.
- GitHub-instellingen worden niet meegekopieerd. Rapporteer alleen daadwerkelijk gecontroleerde bescherming.
- Geen appfunctionaliteit, gekozen proefapp, appseeds of appdata in de template. Appspecificaties en appresultaten horen in de nieuwe app-repo.
- Maak onderscheid tussen werkinstructie en afdwinging: `.claude/`-hooks bewijzen niets over de sandbox van een andere agent.

## Eerste agentsessie

Er moet eerst een werkende coding agent in een Ubuntu-/WSL2-omgeving beschikbaar zijn. Een agent kan zichzelf niet
installeren voordat hij gestart is. De eigenaar verzorgt die minimale bootstrap; de Claude Code-stappen staan in het
playbook. Voor een andere runtime bevestigt de eigenaar de start- en veiligheidsstappen, zonder stilzwijgend te wisselen.

De eigenaar kan de publieke instructies klaarzetten:

```bash
mkdir -p ~/setup
curl -fsSL https://raw.githubusercontent.com/BramLambertJansen/template/main/START-NIEUWE-APP.md -o ~/setup/START-NIEUWE-APP.md
curl -fsSL https://raw.githubusercontent.com/BramLambertJansen/template/main/docs/nieuwe-app.md -o ~/setup/nieuwe-app.md
cd ~/setup
```

Start daar de gekozen agent en geef deze opdracht:

> Start een nieuwe app vanuit BramLambertJansen/template. Volg START-NIEUWE-APP.md en daarna nieuwe-app.md.
> Vraag alleen de ontbrekende appnaam en korte beschrijving. Voer de setup stap voor stap uit, wacht bij eigenaarstaken
> op mijn reactie en controleer het resultaat voordat je doorgaat. Begin nog niet aan features.

Vul naam en beschrijving gerust al in de opdracht in; de agent vraagt die dan niet opnieuw. Ga niet ontwikkelen in de
setupmap. Na de gecontroleerde setup vraagt de agent of je de eerste gebruikersflow wilt specificeren.
