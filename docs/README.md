# Documentatie

Deze template is bedoeld om webapps met code-agents te bouwen. De documentatie helpt jou en de agents een app te starten, wijzigingen te bouwen en de gedeelde basis te onderhouden.

## Waar begin je?

| Je wilt… | Lees |
|---|---|
| Begrijpen wat de template bevat | [README](../README.md) |
| De lokale omgeving starten | [Lokaal draaien](../README.md#lokaal-draaien) |
| Een nieuwe app laten aanmaken | [Setup-playbook](nieuwe-app.md); dit is een uitvoerinstructie voor Claude Code |
| Een feature bouwen | [Gouden pad](gouden-pad.md), daarna de bijbehorende featurespec |
| De architectuur of regels begrijpen | [Framework](framework.md) |
| Een PR beoordelen | [Definition of Done](dod.md) |
| Weten wat nog ontbreekt | [Roadmap](roadmap.md) |
| Een beheerder aanmaken of herstellen | [Beheerdersrunbook](operations/eerste-admin.md) |

## Afspraken en achtergrond

Het framework bevat de geldende ontwikkelafspraken. Architectuurbesluiten staan in `adr/`; featurespecs staan in `specs/`. Een voorstel beschrijft voorgenomen werk en is nog geen toestemming om te bouwen. De status staat bovenaan elk document.

[Agentdoorloop](operations/agent-doorloop.md) beschrijft hoe de agent bewezen besluiten en bouwstatussen registreert, afgebakend core-werk doet en runner/CI-resultaten verzamelt.

Reviews in `reviews/` leggen bevindingen en de afhandeling daarvan vast. Ze kunnen agents helpen een ontwerpkeuze, veiligheidsrisico of eerdere fout te begrijpen. De actuele afspraak hoort in het framework, een besluit of een spec te staan. Staat daar iets anders dan in een oude review, controleer dan de wijzigingsgeschiedenis.

## Werken met agents

[AGENTS.md](../AGENTS.md) bevat instructies voor code-agents. [CLAUDE.md](../CLAUDE.md) en de bestanden onder `.claude/` vullen die aan voor Claude Code. Andere runtimes voeren die hooks niet automatisch uit.

Agentprocedures horen bij de ontwikkelinstructies. Houd ze kort en precies: welke regel geldt, welk commando hoort erbij en wanneer is een stap klaar? De eigenaar beoordeelt wijzigingen en keurt voorstellen goed.

Behoud ook de context die een agent nodig heeft: voorbeelden, randgevallen, bekende valkuilen, herstelstappen, overdrachtsinformatie en de reden achter een beperking. Natuurlijk schrijven betekent dat deze informatie duidelijker wordt, niet dat ze verdwijnt. Bij twijfel blijft de informatie staan.

## Documentatie onderhouden

Beschrijf de huidige werking en zet gepland werk op de roadmap. Bewaar in besluiten de keuze, reden en gevolgen. De changelog vermeldt wat een appbouwer bij een update moet weten. Geef herbruikbare lessen uit overleg en reviews een duidelijke plek voordat je de oorspronkelijke tekst inkort. Agentinformatie blijft vindbaar vanuit de leeswijzer en de agentinstructies.

Schrijf concreet Nederlands. Noem wat een onderdeel doet en wat de lezer moet doen. Schrap reclamewoorden en lege formuleringen. Behoud waarschuwingen en uitleg die mensen of agents helpen fouten te voorkomen. Herhaling mag nodig zijn als agentinstructies afzonderlijk worden geladen. Een technische term mag blijven als hij nodig is om de code te begrijpen.
