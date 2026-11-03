# 0070 — Meting die stuurt: verschil met de basis, echt leespad, herijken met trigger

Status: geaccepteerd

Wijzigt [0064](0064-leesbudget-per-laag.md) punt 1 (de drempel staat erbij, "let op" komt alleen uit het verschil met
de basis) en [0065](0065-grenzen-als-meting.md) punt 2 en 4 (wanneer "let op" komt); de rest van beide blijft gelden.

## Context

De review van main op 2 november 2026 vond drie zwaktes in de meting (L5–L7). Een meting stuurt alleen als ze afgaat
wanneer er iets verandert, meet wat een agent echt leest, en op het afgesproken moment draait.

- **L5, meldingen die altijd afgaan.** `pnpm leespad` meldt bij elke run "let op: N erboven", ook waar 0065 de
  streefwaarde zelf onhaalbaar noemt. In `pnpm meting --trend` volstaat elke stijging, ook van 0,1. De meldingen van de
  ratchet staan niet eens in een groene CI-log: `gate:fast` toont alleen de uitvoer van rode gates.
- **L6, leespad meet een vaste lijst.** Verplichte leesacties tellen niet mee: de `feiten.mjs`-aanroepen die agents en
  skills voorschrijven (de skill `spec` injecteert ze zelfs in de context) en de padregels in `.claude/rules/`, die
  Claude Code laadt zodra een agent in dat pad leest. De uitvoer van `feiten.mjs specs`, `adr` en `fase` groeit met elke
  spec, ADR en open roadmap-item. Dat botst met R-DOC-09.
- **L7, herijken heeft geen trigger.** R-DOC-08 legt het herijken bij het afsluiten van een roadmap-fase, maar niets
  roept het daar aan. 0065 noemde dezelfde zwakte bij "per release".

## Besluit

1. **"Let op" alleen bij verschil met de basis.** De basis is de merge-base met `origin/main`, zoals bij
   `check:roadmap`, gemeten met de huidige scripts op de bestanden van de basis (`git show`, zonder worktree);
   feiten-secties die uit code komen, meten aan beide kanten de werkmap en vallen weg in het verschil. Een
   scenario meldt alleen bij minstens 1 KB groei; een soort alleen als een eenheid nieuw boven de streefwaarde komt of
   erboven minstens 1 KB groeit. Streefdoel en drempel staan erbij, zonder "let op". *Waarom:* een melding die bij elke run afgaat,
   wordt genegeerd; een verschil met de basis zegt iets over deze PR. Het leespad ligt al ver boven het streefdoel en
   telt nu feiten-uitvoer, dus zonder minimale stap meldde elke nieuwe spec weer. Dezelfde code op beide bomen
   vergelijkt appels met appels; een worktree zou zonder `node_modules` niets meten.
2. **De trend meldt alleen een echte stap.** Minstens 0,5 en, bij een vorig gemiddelde boven 0, minstens 25 % hoger,
   op afgeronde waarden. *Waarom:* één extra bevinding over tien PR's is 0,1; absoluut en relatief samen negeren ruis bij
   kleine én grote gemiddelden.
3. **Meldingen staan op de PR.** `ratchet` en `leespad` schrijven zelf naar de samenvatting van de CI-job, ook als die
   rood is; `opleveren` zet de "let op"-regels in de PR-beschrijving. Geen PR-comment. *Waarom:* de eigenaar leest de PR,
   niet de log; een comment zou de workflow schrijfrecht op PR's geven.
4. **Het leespad telt wat een agent verplicht leest.** De `feiten.mjs`-aanroepen komen uit de bestanden van het scenario
   zelf (injecties en de stap "Begin met de feiten"), zodat een nieuwe aanroep vanzelf meetelt; voor `nieuwe-feature`
   tellen de padregels van een app-feature mee. Wat met de repo groeit, krijgt een plafond: `specs` toont open specs,
   `adr` de voorgestelde en de tien geaccepteerde met het hoogste nummer, `fase` alles onder "Nu" en vijf onder "Volgende", elk met
   een telling en `--alle` (voor `adr` dus niet langer alleen voor historie). Een groeitest bewijst het plafond. De streefwaarden van 0064 punt 1 stelt de bouw-PR opnieuw
   voor op de eerlijke meting; de eigenaarmerge beslist. *Waarom:* de meting onderschatte juist het deel dat groeit; een
   plafond maakt R-DOC-09 waar in plaats van een wens.
5. **Herijken krijgt een trigger.** `check:roadmap` ziet dat een PR een fase sluit (op de basis een open item onder "Nu"
   of "Volgende" met die fase, daarna geen) en eist dan een regel `Herijking fase <n>:` met datum, leespad in KB en trend
   in `docs/roadmap-archief.md`. *Waarom:* proza in de DoD werd overgeslagen (0065); een check maakt het herijken
   onvermijdelijk. Een verplichte fase op elk nieuw item zou vaker triggeren, maar weegt niet op tegen een trigger die
   een paar keer per levensduur afgaat. Bestaande items zonder fase, en `doorlopend`, tellen niet; dat accepteren we tot ze worden herschreven.

## Alternatieven

- **Streefwaarden verhogen tot er niets meer boven zit:** het alarm zwijgt, ook bij echte groei. Verworpen.
- **Vergelijken met de kop van `main`:** wat intussen op main landde, telt dan als groei van deze PR. Verworpen.
- **Een PR-comment door CI:** het zichtbaarst, maar de workflow krijgt schrijfrecht. Verworpen.
- **Feiten-aanroepen per scenario met de hand opsommen:** raakt uit de pas met de agentbestanden. Verworpen.
- **Padregels niet meetellen omdat de runtime ze laadt:** precies het deel dat een agent niet kan overslaan. Verworpen.
- **Herijken via een stap in `docs/dod.md`:** proza zonder check werd al overgeslagen (0065). Verworpen.

## Gevolgen

- Een melding betekent weer iets en staat op de PR.
- Het gemeten leespad voor `nieuwe-feature` stijgt fors (feiten-uitvoer en padregels tellen mee); de bouw-PR stelt
  nieuwe streefwaarden voor. `lichte-fix` telt geen padregels; dat is een bekende ondertelling.
- Wie een gebouwde spec, een oudere ADR of een later roadmap-item zoekt, gebruikt `--alle` of de map.
- Een PR die de laatste open taak van een fase afvinkt of parkeert, bevat ook de herijking.
