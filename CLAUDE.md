@AGENTS.md

Dit bestand bevat aanvullingen voor Claude Code. De platformneutrale werkstraat en projectregels staan in `AGENTS.md` en `docs/framework.md`; runtime-specifieke hooks, tools en agentconfiguratie gelden alleen in Claude Code.

Wat een gate kan afdwingen, staat hier niet. Groeit dit bestand of `AGENTS.md` over zijn budget (framework §9), dan ontbreekt er een gate.

## Werkstraat (verplicht)

Intake op risico → bouwer met tests → onafhankelijke reviewer → eigenaar merget (jij nooit). Bij A2/A3/A4,
auth, het RLS-/rollenmodel, migraties op bestaande data of buiten de generator, dependencies, de vertrouwensgrens
of moeilijk herstel: eerst architect en aparte tester. Twijfel volgt dat zwaardere pad. De specplicht blijft.
Docs gaan mee in dezelfde PR als de code
(`check:docs-drift` waarschuwt); een aparte docs-stap na de merge bestaat niet. De volledige tekst, ook wanneer je een
bestaande test mag wijzigen en het lichte pad, staat op één plek: `docs/framework.md` §8.

## Stoppen en vragen

- Een beslissing ontbreekt, de spec spreekt zichzelf tegen, of een regel staat de opdracht in de weg.
- Een check faalt en de fix zou een regel, check, hook of test afzwakken.
- Na twee mislukte correctiepogingen: stop, vat samen wat je probeerde, vraag om richting. Uitzondering: de CI-lus van de skill `opleveren` (ADR 0046) loopt door tot groen; daar gelden alleen de stopgronden uit die skill.

## Zuinig met context

- Vraag alleen taakrelevante secties van `feiten.mjs`; `componenten` alleen bij UI-werk, `adr --alle` alleen voor historie.
- Besteed onderzoek uit als dat zelfstandig nuttig werk oplevert; geef alleen de benodigde broncontext mee en vraag een compacte conclusie.
- Lees `db/schema.snapshot.sql` in plaats van alle migraties.
- Externe diensten via hun CLI (`gh`); MCP alleen read-only. Geen `docker`.

Subagents (`.claude/agents/`), skills en hooks staan er (ADR 0045/0057): gebruik voor een vereiste tester- en reviewerrol de bijbehorende agents. Ontbreekt een agent of werkt de hook niet, gebruik dan een ad-hoc subagent met dezelfde afgebakende opdracht. Een ad-hoc subagent telt alleen als onafhankelijk als de eisen uit `docs/framework.md` §8 worden afgedwongen (schone context; tester alleen in testpaden; reviewer read-only). Anders leg je die stap voor aan de eigenaar; je reviewt nooit je eigen werk.
