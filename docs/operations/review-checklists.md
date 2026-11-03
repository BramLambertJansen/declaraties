# Review-checklists per risicoklasse

De reviewer bepaalt de klasse(n) van de diff en loopt alleen die lijsten af. Elke regel is een patroon dat eerder doorgleed; een nummer verwijst naar het leerpunt, zonder nummer naar de PR- of Codex-review. Een nieuw patroon komt hier als regel, via een leerpunt.

## Werkwijze

- Doe één volledige review met alle klassen van de diff; daarna alleen `git diff <vorige-sha>..HEAD` op de fixes. De hoofdsessie geeft de vorige `## Bevindingen` mee; de delta toetst elke bevinding en loopt ook de lijsten van de klassen die de fixes openen.
- Raakt een fix een nieuw bestand, een beschermd pad of een rail (`rails/**`, `scripts/kit/**`, `test/rails/**`), dan volgt opnieuw een volledige review van dat deel, evenals als de vorige sha geen voorouder van HEAD is (rebase, merge van main). Lees de aanroepers van een gewijzigde export.
- Kritiek werk (R-WERK-05): spec eerst in een besluit-PR; een statusovergang naast een kritiek pad (`KRITIEK` in `scripts/kit/lane.mjs`, `altijdVragen`) geeft `document-status` rood.

## Rolhek en hooks

- gh lees je met `ghCommandWords`, niet op positie van groep en actie (#399).
- Opties per programma: afkortingen, `--optie=waarde` en schrijfopties zoals `git diff --output`, `sort -o`, `find -delete` (#395, #409).
- Elke schrijfvorm van elk toegelaten programma telt als schrijfdoel; de aanvalstests blijven ongewijzigd groen.
- Een weigering moet een echte aanval stoppen én een vals-positieve test hebben.

## Tests

- Een negatieve test bewijst alleen iets als de basis eerst waar is; draai hem tegen de oude code (#401).
- `testChangeRisk` telt via een lexer (`rails/hooks/lib/testteller.mjs`, #424): `skipIf`, `runIf`, `only` en `fails` tellen als skip; een `if` rond een test of een `test.extend`-alias valt erbuiten (#410): zie die als skip.
- Tests ruimen hun tmp-mappen op (#396); geen absolute milliseconden, wel een verhouding of ruime marge.

## Tekstchecks

- Een regex op woorden toets je met beide spellingen: de Engelse stam mist het Nederlandse woord ("mandaat", #402).
- Elke geschrapte norm houdt een R-id of een reden; "Hoe (geen norm)" bevat geen `nooit`, `alleen` of `moet`.

## Schaal en scripts

- Geen `[...lijst, x]` in een lus en geen `Math.max(...lijst)` over onbegrensde invoer (#412).
- Een lege optiewaarde aan een externe CLI schakelt diens filter uit: weiger haar (`--branch=`).
- Opslag bevat alleen tellingen en sleutels, nooit prompts, commando-argumenten of bestandsinhoud.

## API en data

- Waar een route een waarde teruggeeft die zij zelf als invoer accepteert (cursor), moet de uitvoer door het eigen invoerschema (#411).
- Voor RLS, secdef, CSRF en foutuitvoer: skill `security-review`.

## Docs en instructies

- Gedrag, API of conventies gewijzigd: doc in dezelfde PR (R-WERK-15); Codex vraagt hier steeds naar.
- Een omgezette test noemt reden en regel in de PR; verwijderen of skippen vraagt eigenaarakkoord.
- Wijzigt of verdwijnt een definitie `- **R-…**`: is de norm niet uitgehold, staat een verplaatste norm inhoudelijk bij de nieuwe R-id, is de schrapreden aanvaardbaar (`docs/normen-vervallen.md`, ADR 0067)? Mist er een norm zonder R-id? Die vangt geen check.
