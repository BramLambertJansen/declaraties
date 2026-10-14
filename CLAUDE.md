@AGENTS.md

Dit bestand bevat aanvullingen voor Claude Code. De platformneutrale werkstraat en projectregels staan in `AGENTS.md` en `docs/framework.md`; runtime-specifieke hooks, tools en agentconfiguratie gelden alleen in Claude Code.

Wat een gate kan afdwingen, staat hier niet. Groeit dit bestand of `AGENTS.md` over zijn budget (framework §9), dan ontbreekt er een gate.

## Werkstraat (verplicht)

Architect (spec) → contract → tester → developer → reviewer → eigenaar merget (jij nooit). Docs gaan mee in dezelfde PR als de code
(`check:docs-drift` waarschuwt); een aparte docs-stap na de merge bestaat niet. De volledige tekst, ook wanneer je een
bestaande test mag wijzigen en het lichte pad, staat op één plek: `docs/framework.md` §8.

## Stoppen en vragen

- Een beslissing ontbreekt, de spec spreekt zichzelf tegen, of een regel staat de opdracht in de weg.
- Een check faalt en de fix zou een regel, check, hook of test afzwakken.
- Na twee mislukte correctiepogingen: stop, vat samen wat je probeerde, vraag om richting. Uitzondering: de CI-lus van de skill `opleveren` (ADR 0030) loopt door tot groen; daar gelden alleen de stopgronden uit die skill.

## Zuinig met context

- Onderzoek via een subagent die alleen een conclusie teruggeeft.
- Lees `db/schema.snapshot.sql` in plaats van alle migraties.
- Externe diensten via hun CLI (`gh`); MCP alleen read-only. Geen `docker`.

Subagents (`.claude/agents/`), skills en hooks staan er (`docs/roadmap.md`, stuk 5; ADR 0011): gebruik voor de tester- en reviewerrol de bijbehorende agents. Ontbreekt een agent of werkt de hook niet, gebruik dan een ad-hoc subagent met dezelfde afgebakende opdracht. Een ad-hoc subagent telt alleen als onafhankelijk als de eisen uit `docs/framework.md` §8 worden afgedwongen (schone context; tester alleen in testpaden; reviewer read-only). Anders leg je die stap voor aan de eigenaar; je reviewt nooit je eigen werk.
