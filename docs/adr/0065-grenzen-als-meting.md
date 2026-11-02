# 0065 — Harde grenzen alleen op wat elke sessie laadt

Status: geaccepteerd

Herziet [0064](0064-leesbudget-per-laag.md) punt 1 en 3 en [0063](0063-compacte-kennisbasis-en-lichtere-werkstraat.md) punt 3.
Uitwerking: spec [leesbudget](../specs/leesbudget.md).

## Context

0064 hield harde grenzen op een hoofdstuk van het regelboek (12 KB), een nieuwe spec (10 KB) en een nieuw ADR (6 KB). Op de dag
van de merge waren ze al vol: 26 van de 28 specs zijn groter dan 10 KB (echte features 30 tot 52 KB), §8 zat op 90 % en na het
herstel van verloren normen (#417) erboven. Een harde grens op zulke eenheden dwingt tot kunstmatig knippen. Dat bespaart geen
lezen: `pnpm leespad` en `feiten.mjs hoofdstuk 8` lezen §8a gewoon mee, en een spec in vier delen kost vier reviews. Bij
eerder inkorten op een plafond vielen bovendien 27 normen ongemerkt weg (#417). Herijken "bij elke release" vuurt nooit: de
template heeft geen releases. Eigenaarbesluit 2026-11-02: alleen `AGENTS.md` en `CLAUDE.md` blijven hard.

## Besluit

1. **Hard en rood alleen wat elke sessie volledig laadt:** `AGENTS.md` ≤ 9 KB en 100 regels, `CLAUDE.md` ≤ 50 regels. Over de
   grens: eerst verplaatsen naar een lagere laag (type, check, gouden pad, rules); lukt dat niet zonder verlies, dan ophogen als
   gate-wijziging met reden in de PR en eigenaarakkoord. Vanaf 85 % meldt `check-docs` het, zonder rode check.
2. **Al het andere is een meting, nooit rood:** een hoofdstuk van het regelboek, het totaal van het regelboek, een spec, een ADR,
   rules, skills en operations-docs. `pnpm leespad` toont ze tegenover hun streefwaarde, met "let op" erboven. De
   budget-ingangen voor deze eenheden verdwijnen uit `.kit/baseline.json`.
3. **Splitsen alleen op inhoud.** Een eenheid wordt gesplitst als een deel los gelezen kan worden, met de reden in de PR; nooit
   om onder een getal te komen. Groeien door eenheden toe te voegen (§13, §8a, een rule) blijft mogelijk; de ankers §1–§12
   blijven. Eén plek per norm en laagste laag eerst (0064 punt 3) blijven gelden.
4. **Sturen op wat gelezen wordt en op kwaliteit.** Het leespad per scenario (0064 punt 1, streefdoel nieuwe feature ≤ 25 KB) is
   de maat voor leeskosten. `pnpm meting --trend` meldt "let op" als reviewrondes, CI-rood of Codex-bevindingen over de
   laatste tien gemergde PR's hoger liggen dan over de tien daarvoor; de hoofdsessie noemt dat in `opleveren` en de eigenaar beslist.
5. **Herijken per roadmap-fase.** Bij het afsluiten van een fase in `docs/roadmap.md` draait de hoofdsessie `pnpm leespad` en
   `pnpm meting --trend` en stelt nieuwe streefwaarden voor in de PR die de fase afsluit.
6. **Krimp vraagt een inventaris.** Een PR die een bindend document (regelboek, `AGENTS.md`, `CLAUDE.md`, `.claude/rules/*`,
   `docs/dod.md`) meer dan 20 % laat krimpen, bevat in een bestand in de diff een lijst oude norm → nieuwe R-id of reden van schrappen; de
   reviewer toetst die lijst (0063 punt 2 met een check).

Ongewijzigd: 0064 punt 2 (lezen per hoofdstuk), 4 (ratchet op bestaande overschrijdingen van `AGENTS.md`), 5 (rolhek), 6
(teksttests) en 7 (schaalbaarheid).

## Alternatieven

- **0064 houden:** de volgende grote feature moet in delen, en §8 moet direct gesplitst zonder leeswinst.
- **Ook de hoofdstukgrens hard:** §8 groeit het snelst en wordt na elke nieuwe werkafspraak gesplitst; de lezer leest evenveel.
- **Grenzen ophogen:** lost het volgende volle plafond niet op.

## Gevolgen

- `check-docs` geeft voor hoofdstuk, regelboek, spec en ADR geen overtreding meer maar een melding; alle spec- en ADR-ingangen
  verdwijnen uit de baseline. `pnpm leespad` wordt de plek waar de metingen staan.
- Krimp boven 20 % zonder inventaris wordt rood in `check-docs` (bouw-PR).
- Framework §9 (R-DOC-01) en de agentinstructies volgen in de instructie-PR.
