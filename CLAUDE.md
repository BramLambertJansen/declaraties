@AGENTS.md

Dit bestand bevat aanvullingen voor Claude Code. De platformneutrale werkstraat en projectregels staan in `AGENTS.md` en `docs/framework.md`; runtime-specifieke hooks, tools en agentconfiguratie gelden alleen in Claude Code.

Wat een gate kan afdwingen, staat hier niet. Groeit dit bestand of `AGENTS.md` over zijn budget (framework §9), dan ontbreekt er een gate.

## Werkstraat (verplicht)

Licht alleen voor beperkte fixes binnen bestaand gedrag; anders volledig, met eigenaarmerge; zelf mergen alleen via `pnpm pr:merge` bij oordeel `agent-merge: ja` (ADR 0069) — framework §8.
Docs gaan mee in dezelfde PR als de code
(`check:docs-drift` waarschuwt); een aparte docs-stap na de merge bestaat niet.
Ook wanneer je een bestaande test mag wijzigen: framework §8.

## Stoppen en vragen

- Een beslissing ontbreekt, de spec spreekt zichzelf tegen, of een regel staat de opdracht in de weg.
- Een check faalt en de fix zou een regel, check, hook of test afzwakken.
- Na twee mislukte correctiepogingen: stop, vat samen wat je probeerde, vraag om richting. Uitzondering: de CI-lus van de skill `opleveren` (R-WERK-12) loopt door tot groen; daar gelden alleen de stopgronden uit die skill.

## Zuinig met context

- Vraag alleen taakrelevante secties van `feiten.mjs`; `componenten` alleen bij UI-werk, `adr --alle` alleen voor historie; van het regelboek alleen de geraakte hoofdstukken (`feiten.mjs hoofdstuk <n>`, R-DOC-05).
- Lees en zoek met de Read-, Grep- en Glob-tools, niet met Bash; het rolhek weigert veel shellvormen (R-WERK-21).
- Besteed onderzoek uit als dat zelfstandig nuttig werk oplevert; overdracht volgens R-WERK-14, vraag een compacte conclusie.
- Lees `db/schema.snapshot.sql` in plaats van alle migraties.
- Externe diensten via hun CLI (`gh`); MCP alleen read-only. Geen `docker`.

Subagents (`.claude/agents/`), skills en hooks staan er (R-WERK-17, R-ROL-01): gebruik voor vereiste rollen de bijbehorende
agents, of een ad-hoc subagent met dezelfde schone, afgebakende context (die mag alleen lezen, R-ROL-02). Wanneer die als onafhankelijk telt en wanneer
de eigenaar reviewt, staat in framework §8 (eisen aan de rollen); je reviewt nooit je eigen werk.
