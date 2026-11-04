# 0079 — Eén padtabel voor schrijfniveau en besluit

Status: geaccepteerd

Wijzigt [0045](0045-railwerk.md) punt 1, 7 en 9 (de lijsten worden kolommen, de terugval bij een ontbrekende lijst
vervalt), [0046](0046-werkstraat-en-beslisroute.md) punt 27 en 28 (`voorReview` en de bron van CODEOWNERS komen uit de
padtabel), [0062](0062-spec-en-bouw-in-een-pr.md) punt 2 (de kritieke paden komen uit de padtabel) en
[0069](0069-agent-merge-niet-kritiek.md) punt 1 (`agentMerge.toegestaan` en `agentMerge.kritiek` worden de kolom `besluit`).
Drempel: A4. Uitwerking: [spec](../specs/padtabel.md). Aanleiding: vraag van de eigenaar op 4 november 2026 ("Staan er zaken
in het framework die te complex zijn opgezet?"), bevinding A en B.

## Context

Hoe zwaar een pad beschermd is, staat op zes plekken: in `.claude/gates.json` `gates`, `voorReview`, `altijdVragen`,
`agentMerge.toegestaan` en `agentMerge.kritiek`, en in code de lijst `KRITIEK` in `scripts/kit/lane.mjs`. Een agent moet zes
lijsten afwegen voor één pad; `check-docs` houdt ze met spiegelregels bij elkaar. Er zijn drie definities van "kritiek":
R-WERK-05 en `lane.mjs` (besluit-PR) en `agentMerge.kritiek` (alleen: de eigenaar merget).

Bevinding B: `.claude/decisions.json` bevat naast `requiredChecks` 26 records die sinds ADR 0063 punt 5 niets geven (R-WERK-24).

## Besluit

1. **Eén tabel.** `.claude/gates.json` krijgt `paden`: per glob `schrijven` (`gate`, `voorReview`, `altijdVragen`;
   ontbrekend = vrij) en `besluit` (`agent`, `eigenaar`, `besluit-pr`; ontbrekend = eigenaar). Per kolom wint de strengste
   waarde over alle passende globs; de volgorde doet er niet toe. Een pad zonder passende glob is vrij en eigenaar.
2. **Alles wordt afgeleid**, door één functie in `rails/hooks/lib/`, voor rolhek, diff-guard, lane, agent-merge, `pr:merge`
   en `check-docs`. Kritiek is `besluit-pr` of `schrijven: altijdVragen`; agent-mergebaar (padgedeelte) is alleen strengste
   besluit `agent` met schrijven vrij. `KRITIEK` verdwijnt uit `lane.mjs`. In de nieuwe vorm bestaat geen terugval bij een
   ontbrekende lijst meer: een lege lijst is leeg. De structurele vangnetten in code blijven.
3. **Samenhang in plaats van spiegeling.** `check-docs` eist: `altijdVragen` ⇒ `besluit-pr`; schrijven ≥ `gate` ⇒ besluit niet
   `agent`; een vaste vloer (onder meer `.claude/gates.json` zelf is `altijdVragen` en `besluit-pr`); geen dubbele of onbekende
   sleutel en geen onbekende waarde. De spiegels naar CODEOWNERS en de Edit-`ask` blijven, en het schrijfrecht van de rollen
   wordt tegen de afgeleide gates getoetst. Bij het lezen telt een onleesbare rij als strengste niveau.
4. **Eén definitie van kritiek.** R-WERK-05 verwijst naar de padtabel plus de inhoudsregels uit 0062 punt 2 die geen pad zijn
   (migraties). "Alleen de eigenaar merget" heet `besluit: eigenaar`. Elk ADR is `besluit-pr`. De modus
   `merge: "niet-kritiek"` blijft bestaan en betekent: de hoofdsessie mag mergen wat volgens de padtabel `agent` is.
5. **Niets wordt losser.** Een blijvende test eist per pad dat de tabel minstens zo streng is als de vastgelegde lijsten van
   main 30cc352 met de oude `KRITIEK`.
6. **Overgang.** Lezers in hooks en scripts accepteren de oude vorm (zonder `paden`) en de nieuwe; beide tegelijk faalt dicht.
   `check-docs` meldt de oude vorm als rood, met een migratiemelding.
7. **Het niveau lezen, niet afwegen:** `node scripts/kit/feiten.mjs pad <pad>`.
8. **Register zonder dode records (B).** `.claude/decisions.json` houdt alleen `version` en `requiredChecks`; de lezer
   accepteert ook een oud register met records.
9. **Terugval.** Blijkt één pad losser beoordeeld dan vóór de bouw-PR, dan gaat de bouw-PR terug. De eigenaar beslist.

## Alternatieven

- **Spiegelregels aanscherpen.** Houdt zes plekken en drie betekenissen van kritiek.
- **Geordende regels, eerste treffer wint.** Een verschoven regel maakt een pad stil losser; strengste-wint niet.
- **`KRITIEK` in code houden.** Een tweede bron die een app niet ziet of aanvult.
- **Oude lijsten als gegenereerde kopie laten staan.** Brengt de dubbele bron terug.

## Gevolgen

- Eén plek per pad; een nieuw beschermd pad is één rij. De spiegelregels tussen de lijsten vervallen.
- Oude code die na de merge `gates.json` of `decisions.json` uit main leest, faalt dicht (oude lezers gooien zonder `gates` of
  `decisions`) tot de branch op main is gebaseerd.
- Bestaande tests die de ruwe vorm lezen of samenstellen, of een vervallen regel toetsen, veranderen; de lijst staat in de
  spec. De merge van deze besluit-PR is het eigenaarakkoord daarvoor (R-TEST-02).
- `docs/adr/**` wordt ook voor lane en agent-merge expliciet `besluit-pr`; ADR's waren daar al dicht.
