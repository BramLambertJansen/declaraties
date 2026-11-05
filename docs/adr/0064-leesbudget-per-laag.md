# 0064 — Leesbudget per laag en minder wrijving

Status: geaccepteerd

Herzien: 2026-11-02 (#418): punt 1 en 3 volgen [0065](0065-grenzen-als-meting.md)
Herzien: 2026-11-03 (#469): gewijzigd door [0069](0069-agent-merge-niet-kritiek.md) ("zodra de GitHub App er is");
[0070](0070-meting-die-stuurt.md) punt 1

Herziet [0063](0063-compacte-kennisbasis-en-lichtere-werkstraat.md) punt 3 en 7. Uitwerking: specs
[leesbudget](../specs/leesbudget.md) en [rolhek-lezen](../specs/rolhek-lezen.md).

## Context

0063 zette grenzen per bestand die alleen omlaag mogen; `framework.md` zit op zijn plafond van 40 KB. Die grenzen meten wat er
bestaat, niet wat een agent leest: per taak leest een agent §8 van het regelboek plus de regels per pad. Een vol plafond dwingt
tot inkorten, en bij inkorten verdwenen eerder normen ongemerkt. Daarnaast kost de werkstraat meer dan nodig: reviewers mogen
`gh issue view` en `git ls-files` niet, en acht testbestanden pinnen met ruim 100 asserties zinnen uit docs en instructies vast.

## Besluit

1. **Harde grenzen alleen waar elke sessie ervoor betaalt of één eenheid in één keer gelezen wordt.** `AGENTS.md` ≤ 9 KB en
   100 regels; een hoofdstuk van het regelboek ≤ 12 KB (het totaal van `framework.md` is een meting, geen grens); een nieuwe spec
   ≤ 10 KB; een nieuw ADR ≤ 6 KB. `CLAUDE.md` ≤ 50, rules ≤ 60 en skills ≤ 200 regels blijven normen uit R-DOC-01 en worden
   gemeten, niet rood. Het leespad per scenario (`pnpm leespad`, van het regelboek telt §8 en zijn letter-subhoofdstukken) is een
   meting: streefdoel ≤ 25 KB voor een nieuwe feature, waarschuwing vanaf 56 KB (review 28 KB, lichte fix 16 KB).
2. **Lezen.** Een agent leest van het regelboek alleen de hoofdstukken die de taak raakt, via
   `node scripts/kit/feiten.mjs hoofdstuk <n>` (met de openingszin van het boek), en een document op aanvraag alleen als de taak het raakt.
3. **Groeien zonder wildgroei.**
   - Groei door eenheden toe te voegen (hoofdstuk §13 en verder of letter-subhoofdstuk zoals §8a, rule, doc), niet door ze op te
     blazen; een eenheid over haar grens wordt gesplitst. De ankers §1–§12 blijven.
   - Eén plek per norm: één R-id in het regelboek, `.claude/rules/*` letterlijk, elders een verwijzing. Laagste laag eerst
     (type, check, gouden pad, rules, `AGENTS.md`); wat in `AGENTS.md` bijkomt, gaat er netto uit.
   - Tot 85 % van de grens van `AGENTS.md` en van een hoofdstuk is groei vrij; vanaf 85 % waarschuwt `check-docs` (zichtbaar in `pnpm ratchet` en `pnpm leespad`)
     zonder rode check; boven 100 % is het rood.
   - Over de grens: eerst splitsen of verplaatsen; lukt dat niet zonder verlies, dan verhogen als gate-wijziging met reden in de
     PR en eigenaarakkoord. Bij elke release herijkt de hoofdsessie de streefwaarden met `pnpm leespad` en de kwaliteitscijfers.
   - Kwaliteit is de tegenmaat: stijgen Codex-bevindingen, CI-rood of reviewrondes (`pnpm meting --pr-tabel`), dan versoepelen we.
4. **Ratchet alleen op overschrijdingen.** Bestaande overschrijdingen staan in `.kit/baseline.json` en mogen alleen dalen.
5. **Rolhek: lezen wordt ruimer voor de reviewer, schrijven blijft streng, het oppervlak blijft klein.** Alleen wat de Read-, Grep- en
   Glob-tools niet kunnen komt erbij: `git ls-files`, `gh issue view|list`, `gh run view|list` en `pnpm leespad|meting`, elk met
   een vaste lijst opties en zonder variabelen vóór het commando; een onbekende optie wordt geweigerd. Voor elke rol worden
   schrijfopties geweigerd (`git diff|log|show --output`, `git grep -O`). Dit herziet de zin "het rolhek wordt verder niet
   verruimd" uit 0063 punt 7 en het verworpen alternatief "leescommando's in Bash", alleen voor deze lijst; pipes en `git grep` komen er niet bij.
6. **Teksttests.** Nieuwe tests op docs en instructies toetsen structuur (koppen, R-id's, links, paden), geen hele zinnen;
   een bestaande zinstest wordt bij aanraking omgezet, met reden in de PR (R-TEST-02). Bestaande bytegrenzen in tests blijven staan.
7. **Schaalbaarheid is een ontwerpeis.** Elk mechanisme blijft werken als de repo, de geschiedenis en het aantal PR's groeien:
   - Wat een agent verplicht leest, groeit niet mee met de omvang van de repo (punt 1 en 2).
   - Wat een check of meting per PR kost, groeit niet mee met de geschiedenis: gemeten data krijgt een bewaartermijn en een
     lees-actie leest alleen wat de vraag nodig heeft (een roadmap-item, nog niet gebouwd).
   - Afdwingen gebeurt zoveel mogelijk in de sandbox, de CI en de ruleset; het rolhek is een vangnet en krijgt geen nieuwe
     uitzondering zonder leerpunt en tabeltest (punt 5).
   - De eigenaarmerge blijft het besluit; zo ingericht dat risicoloos werk later gebundeld of automatisch kan, zodra de GitHub App er is.

## Alternatieven

- Totaalplafond verhogen: lost het volgende volle plafond niet op en meet niet wat gelezen wordt.
- Alles harde checks per laag en scenario: meer beperking zonder dat de kwaliteit stijgt.
- Het regelboek in losse bestanden splitsen: breekt de 400 verwijzingen "framework §N" en de R-sync.
- Een lichtere route voor docs: de bestaande routes (R-WERK-03, -04, -05) regelen dat al; geen tweede regel.

## Gevolgen

- `check-docs` toetst hoofdstukken (met waarschuwingszone) en laat hoofdstukken §13 en verder en letter-subhoofdstukken toe;
  het totaal van `framework.md` is een meting. `scripts/kit/leespad.mjs` telt §8 en zijn subhoofdstukken.
- `feiten.mjs` krijgt `hoofdstuk <n>`; het rolhek krijgt de leeslijst van punt 5; de instructies en framework §9 volgen.
