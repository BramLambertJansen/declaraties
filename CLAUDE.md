@AGENTS.md

Dit bestand bevat aanvullingen voor Claude Code. De platformneutrale werkstraat en projectregels staan in `AGENTS.md` en `docs/framework.md`; runtime-specifieke hooks, tools en agentconfiguratie gelden alleen in Claude Code.

Wat een gate kan afdwingen, staat hier niet. Groeit dit bestand of `AGENTS.md` over zijn budget (framework §9), dan ontbreekt er een gate.

## Werkstraat (verplicht)

Licht alleen voor beperkte fixes binnen bestaand gedrag; anders volledig, met eigenaarmerge (jij nooit) — framework §8.
Docs gaan mee in dezelfde PR als de code
(`check:docs-drift` waarschuwt); een aparte docs-stap na de merge bestaat niet.
Ook wanneer je een bestaande test mag wijzigen: framework §8.

## Stoppen en vragen

- Een beslissing ontbreekt, de spec spreekt zichzelf tegen, of een regel staat de opdracht in de weg.
- Een check faalt en de fix zou een regel, check, hook of test afzwakken.
- Na twee mislukte correctiepogingen: stop, vat samen wat je probeerde, vraag om richting. Uitzondering: de CI-lus van de skill `opleveren` (ADR 0046) loopt door tot groen; daar gelden alleen de stopgronden uit die skill.

## Zuinig met context

- Vraag alleen taakrelevante secties van `feiten.mjs`; `componenten` alleen bij UI-werk, `adr --alle` alleen voor historie.
- Besteed onderzoek uit als dat zelfstandig nuttig werk oplevert; geef alleen de benodigde broncontext mee en vraag een compacte conclusie.
- Lees `db/schema.snapshot.sql` in plaats van alle migraties.
- Externe diensten via hun CLI (`gh`); MCP alleen read-only. Geen `docker`.

Subagents (`.claude/agents/`), skills en hooks staan er (ADR 0045/0058): gebruik voor vereiste rollen de bijbehorende
agents, of een ad-hoc subagent met dezelfde schone, afgebakende context. Wanneer die als onafhankelijk telt en wanneer
de eigenaar reviewt, staat in framework §8 (eisen aan de rollen); je reviewt nooit je eigen werk.
