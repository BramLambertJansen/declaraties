# 0078 — Leerlus met bewijs: sluitbewijs, issue-check en het kanaal zoals het werkt

Status: geaccepteerd

Herzien: 2026-11-05 (#543): gewijzigd door [0081](0081-leerlus-schrappen-en-vereenvoudigen.md) punt 1, 2, 3 en 8 (trede Schrappen of vereenvoudigen met meting als sluitbewijs, onderbouwing in de issue-check, eigen bak in de voorsortering)

Wijzigt [0059](0059-leerlus-van-app-naar-template.md) punt 1, 3, 4 en 7; vult R-SEC-09 aan met één uitzondering voor MCP.
Drempel: A3 (een nieuwe workflow met schrijfrecht op issues; een uitzondering op "MCP alleen lezend") en A4 (een
geaccepteerd ADR wijzigt). Uitwerking: [spec leerlus-bewijs](../specs/leerlus-bewijs.md). Aanleiding: de herbeoordeling van de
leerlus van 4 november 2026 (thread "Zelflerend systeem opnieuw beoordelen"), met de keuzes V1, V2, V5 en "openbaar is prima" van
de eigenaar.

## Context

De leerlus loopt snel: 40 leerpunten sinds 27 oktober, 34 dicht, mediaan 0,9 dag tot sluiten. Toch bewijst hij niet dat een les
blijft hangen. ADR 0059 punt 4 eist dat een check begint met een fixture die op de oude code faalt, maar niets toetst dat bij het
sluiten; fixes van leerpunten leverden zelf nieuwe leerpunten op (#424 en daarna #432, #411 en daarna #444).

Ook het kanaal is een afspraak. Het rolhek beperkt `gh issue create`, maar 12 leerpunten kwamen via de Claude GitHub-app (MCP)
en 4 via Codex, waar geen rolhek draait. In een cloudsessie is MCP de enige schrijfweg. Vier issues missen het sjabloon, en de
keuzelijsten bevatten vrije tekst. De praktijk wijkt verder af van 0059: 29 van de 40 leerpunten komen uit de template zelf,
agents sluiten opgeloste leerpunten (akkoord eigenaar 3 november 2026), en "opgepakt" via een roadmap-item telt er 6 van 34.

## Besluit

1. **Sluitbewijs.** Een PR die een leerpunt sluit (elk sluitwoord of elke koppeling die GitHub kent, naar een issue
   met label `leerpunt`) heeft in de beschrijving een sectie `## Leerpunt` met per issue de trede op de ladder en het bewijs:
   een testbestand dat de PR toevoegt of wijzigt. Een verplichte CI-job draait dat testbestand tegen de code van de basis
   (alleen het testbestand komt uit de PR) en eist een gefaalde assertie, en tegen de head en eist groen; een laadfout op de
   basis telt niet als bewijs. Bij trede Type is het bewijs een typetest die op de basis niet compileert. Zo is "de check
   begint met een fixture die op de oude code faalt" toetsbaar. De job staat in een eigen workflow onder `pull_request`, niet onder
   `pull_request_target`: code uit de PR draait nooit met het token of de geheimen van de basis. Het script komt van main.
   `pnpm pr:merge` leest de beschrijving zelf bij het mergen, zodat een later gewijzigd bewijs niet langs de eigenaar glipt.
2. **Uitzonderingen op het sluitbewijs.** Voor de treden Skill, Padregel en `AGENTS.md`, en voor een integratie- of e2e-test die
   de job niet kan draaien, mag het bewijs `geen test: <reden>` zijn. Dan is de PR niet agent-mergebaar (ADR 0069): de
   eigenaar merget en toetst de reden. Een leerpunt dat zonder code achterhaald is, sluit met een comment
   `achterhaald: <reden>` van iemand met schrijfrecht op de repo, niet via een PR.
3. **Issue-check.** Een workflow op `issues` (opened, edited, labeled, closed, reopened) en `issue_comment` toetst elk issue met label `leerpunt`:
   de koppen en volgorde van `.github/ISSUE_TEMPLATE/leerpunt.yml`, verplichte velden niet leeg, en de keuzelijsten `Soort` en
   `Voorstel voor de plek` met een waarde uit het sjabloon. Bij een fout zet hij het label `leerpunt-onvolledig` met één comment
   die de fouten noemt, en haalt hij het weg zodra het issue klopt. Bij sluiten zonder gemergde PR met sluitbewijs en zonder
   comment `achterhaald: <reden>` zet hij het label `leerpunt-zonder-bewijs`. De workflow krijgt alleen `issues: write`; hij
   sluit, heropent of bewerkt geen issues.
4. **Wie indient, en hoe.** Leerpunten komen uit elke sessie, in een app of in de template zelf. De hoofdsessie dient in via
   `gh issue create` (rolhek R-ROL-07 ongewijzigd) of, waar `gh` niet kan schrijven (cloud), via de MCP-tool voor issues, alleen
   om een issue aan te maken, alleen naar de template-repo en met label `leerpunt`. Dat is de enige uitzondering op "MCP
   alleen lezend" (R-SEC-09, R-ROL-12); elke andere MCP-schrijfactie blijft verboden. De issue-check uit punt 3 toetst de
   inhoud van leerpunt-issues, niet wat de tool verder doet: in de cloud draait geen rolhek, dus daar is de beperking een
   afspraak. In Claude Code blijft het rolhek op de MCP-issuetool vragen (ask); een doorlaat vraagt een eigen besluit met
   tabeltest. Subagents dienen niets in (ongewijzigd).
5. **Wie verwerkt.** De eigenaar triageert en bepaalt de volgorde, ook via de wekelijkse voorsortering. Een agent mag een
   leerpunt oppakken waartoe de eigenaar opdracht gaf, en mag het sluiten met sluitbewijs (punt 1) of als achterhaald (punt 2).
   Een roadmap-item met `aanleiding: #nnn` is alleen nodig voor werk dat de roadmap toch al vraagt; het is niet langer de maat
   voor "opgepakt".
6. **Meten.** "Opgepakt" is: gesloten met sluitbewijs of als achterhaald. Herhalingen blijven `eerder: #nnn`.
7. **Openbaar.** De template-repo is openbaar, en leerpunten zijn dat ook, ook over gaten in het rolhek. Het rolhek is een
   vangnet tegen agentfouten, geen geheim; een tweede, privé kanaal maakt de lus zwaarder zonder echte winst.
8. **De voorsortering staat in de repo.** De prompt van de wekelijkse routine wordt een bestand in `docs/operations/`; de
   routine verwijst ernaar. Wat niet in de repo staat, bestaat niet (AGENTS.md).

## Alternatieven

- **Alleen de reviewer laat bewijzen dat de test op oude code faalt.** Afgewezen: hangt van één oog af; precies dat liet #432
  en #444 door.
- **Het rolhek uitbreiden naar MCP en Codex.** Afgewezen: werkt per runtime en niet in de cloud; een check op GitHub geldt voor
  elke maker (R-DOC-09: afdwingen in CI, niet in de hook).
- **De workflow sluit of heropent zelf.** Afgewezen: dat is triage, en die blijft bij de eigenaar.
- **Leerpunten over railgaten via een privé security advisory.** Afgewezen door de eigenaar (4 november 2026), zie punt 7.

## Gevolgen

- Een fix voor een leerpunt kost één extra korte CI-job (één testbestand, twee keer). Een PR zonder leerpunt merkt niets.
- De workflow komt in `.github/workflows/`; de GitHub App heeft geen `workflows`-recht (R-SEC-09), dus de eigenaar zet of
  keurt dat bestand in de bouw-PR. Het label `leerpunt-onvolledig` en `leerpunt-zonder-bewijs` maakt de eigenaar aan.
- Bestaande gesloten leerpunten worden niet opnieuw beoordeeld; de check geldt vanaf de bouw.
- Spec [leerlus](../specs/leerlus.md) krijgt de status `gebouwd` in de bouw-PR; de punten die dit ADR wijzigt, staan daar als
  verwijzing naar deze spec.
