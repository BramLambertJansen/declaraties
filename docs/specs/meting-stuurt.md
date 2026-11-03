---
status: goedgekeurd
namespace: meting-stuurt
---

# Meting die stuurt: verschil met de basis, echt leespad, herijken met trigger

## Doel

Meldingen van de meting gaan alleen af bij verandering en staan op de PR, het leespad telt wat een agent verplicht leest, en herijken gebeurt bij het sluiten van een fase ([ADR 0070](../adr/0070-meting-die-stuurt.md)). Aanleiding: bevindingen L5, L6 en L7 van de review van main op 2 november 2026.

## Rollen en wie wat ziet

n.v.t. — `pnpm leespad`, `pnpm meting --trend`, `feiten.mjs`, `check:roadmap`, `ratchet` en de CI-job `gate:fast`; geen app-gebruikers.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes.

## Kopieer de vorm van

- `scripts/kit/leespad.mjs` — `--ref` (meting uit een git-ref) voor de meting van de basis
- `scripts/kit/check-roadmap.mjs` — de basis als `git merge-base origin/main HEAD`, en de foutmelding met `::error::` in CI
- `scripts/kit/meting-trend.mjs` — `trend()` en `getal()` (afronden op twee decimalen)
- `scripts/kit/feiten.mjs` — `--alle` bij `adr` (standaard kort, volledig op verzoek)

## Hergebruik en UX

n.v.t. — geen UI. Meldingen zijn Nederlands en beginnen met "let op:" of noemen de check, zoals nu.

## Acceptatiecriteria

- **meting-stuurt/AC-1** — `pnpm leespad` meet ook de basis: standaard `git merge-base origin/main <gemeten ref>` (zonder `--ref`: `HEAD`), met `--basis <ref>` een andere; `--ref` en `--basis` gaan samen. De basis wordt gemeten met de huidige code op de bestanden van de basis, gelezen met `git show`; `leespad` schrijft niets. Feiten-secties die uit code komen (`gates`, `routes`, `permissies`, `foutcodes`) en de regel `volgende` van `adr` komen aan beide kanten uit de werkmap en vallen dus weg in het verschil; alleen `specs`, `adr` en `fase` gaan via de lezer. Een scenario krijgt "let op" alleen bij minstens 1 KB groei tegenover de basis. Een soort krijgt "let op" alleen als een eenheid nieuw boven de streefwaarde komt, of erboven minstens 1 KB (regels: 5 regels) groeit; vergeleken per eenheid op naam. Streefdoel en drempel staan erbij zonder "let op" ("boven de drempel, gelijk aan de basis" of "was M"). `grensMeldingen` (85 % van een harde grens) blijft zoals nu. Is de basis niet te meten, dan meldt `leespad` dat in één regel en meet het zonder vergelijking. Exit 0, behalve bij een ongeldige `--ref` of `--basis`: exit 1, zoals nu bij `--ref`.
- **meting-stuurt/AC-2** — `pnpm meting --trend` meldt "let op: <maat> steeg" alleen als het gemiddelde over de laatste tien, op twee decimalen afgerond en in honderdsten vergeleken (`Math.round(x * 100)`), minstens 0,5 hoger ligt dan over de tien daarvoor en, bij een vorig gemiddelde boven 0, ook minstens 25 % hoger. Geen melding bij vorige 1,0 → laatste 1,2 en bij 0,0 → 0,1; wel bij 1,0 → 1,5, 0,0 → 0,5 en 0,7 → 1,2.
- **meting-stuurt/AC-3** — Is `$GITHUB_STEP_SUMMARY` gezet, dan schrijven `ratchet.mjs` (zijn meldingen) en `leespad.mjs` (zijn uitvoer tegen de basis) er zelf naartoe, ook als de gate rood is. De job `gate:fast` in `.github/workflows/ci.yml` draait `pnpm leespad` in een eigen stap met `if: always()`, zonder extra rechten. In `.claude/skills/opleveren/SKILL.md` zet de stap met de trend (sectie "CI-lus tot groen") ook de "let op"-regels van `pnpm leespad` in de PR-beschrijving; `allowed-tools` krijgt `Bash(pnpm leespad)` en `Bash(pnpm leespad *)`. Het rolhek laat de reviewer `--basis <ref>` lezen met dezelfde waardecontrole als `--ref` (`REVIEWER_READS` in `rails/hooks/lib/rolhek.mjs`).
- **meting-stuurt/AC-4** — `pnpm leespad` leidt de `feiten.mjs`-aanroepen per scenario af uit zijn bestanden: elke injectie ``!`node scripts/kit/feiten.mjs <secties>` `` en de eerste aanroep tussen backticks `` `node scripts/kit/feiten.mjs <secties> [--alle]` `` in een regel die begint met "1. Begin met de feiten" (agentbestanden) of "- Begin met taakrelevante feiten" (`AGENTS.md`). `hoofdstuk <n>` en een kale `feiten.mjs …` tellen niet. De secties van alle aanroepen samen tellen één keer; heeft één aanroep `--alle`, dan geldt `--alle` voor het geheel. Bij schrijven: `nieuwe-feature` `gates specs fase adr routes permissies foutcodes`, `lichte-fix` `gates specs fase routes permissies foutcodes`, `review` `gates specs fase`. `nieuwe-feature` telt ook `.claude/rules/api.md`, `web.md` en `database.md` (een app-feature). De uitvoer splitst per scenario in bestanden, feiten-uitvoer en padregels. Faalt `feiten.mjs`, dan is dat deel "onbekend" met reden, nooit 0 bytes, en vervalt de vergelijking voor dat scenario. Test: elke injectie en elke "Begin met de feiten"-regel in een scenariobestand levert minstens één herkende aanroep; een fixture met een aanroep buiten backticks faalt.
- **meting-stuurt/AC-5** — `feiten.mjs specs` toont alleen specs op `voorstel` en `goedgekeurd`, dan één regel met het aantal per andere status en de verwijzing naar `--alle` en `docs/specs/`. `feiten.mjs adr` toont de ADR's op `voorgesteld` en de tien geaccepteerde met het hoogste nummer, dan één regel met het aantal overige en `--alle`. `feiten.mjs fase` toont alle open items onder "Nu", de eerste vijf onder "Volgende" in bestandsvolgorde, en één regel met het aantal overige en `--alle`. Met `--alle` tonen alle drie de volledige lijst, zoals nu. `specs`, `adr` en `fase` worden pure functies over een lezer. `.claude/agents/architect.md` en `.claude/skills/spec/SKILL.md` zeggen dat een passende spec zoeken met `feiten.mjs specs --alle` of in `docs/specs/` gaat, op aanvraag, buiten stap 1. `CLAUDE.md`, R-WERK-01 en `architect.md` noemen `adr --alle` ook om een geldig ADR buiten de tien te vinden, niet alleen voor historie.
- **meting-stuurt/AC-6** — Een test meet met een lezer het leespad van elk scenario op de huidige bestanden en op dezelfde bestanden plus 200 extra specs (100 `gebouwd`, 100 `vervallen`), 50 extra geaccepteerde ADR's en 50 extra open items onder "Volgende". Het verschil is per scenario hoogstens 1 KB.
- **meting-stuurt/AC-7** — `pnpm check:roadmap` bepaalt per fasenummer de open items van de basis en van de werkmap. Open is een `- [ ]`-item onder `## Nu` of `## Volgende`; de fase komt uit de eerste regel via `faseVan` (geëxporteerd, ook gebruikt door `feiten.mjs fase`). `faseVan` verandert: "uit fase N" geeft geen fase, en `doorlopend` geeft geen fase en wint van een fasenummer; een kale `stuk X` blijft fase 1. Had een fase op de basis minstens één open item en in de werkmap geen (afvinken, parkeren of verhuizen), dan eist de check onder de kop `### Fase <n>` (gevolgd door een spatie of het einde van de regel; ontbreekt hij, dan mag de PR hem toevoegen) in `docs/roadmap-archief.md` een nieuwe regel die begint met `Herijking fase <n>:`, met een ISO-datum, `leespad` met minstens één getal in KB, en `trend`. Ontbreekt die, dan faalt de check met een melding die de fase en R-DOC-08 noemt. Items zonder fase tellen niet. Zonder basis faalt de check zoals nu, lokaal en in CI.
- **meting-stuurt/AC-8** — `docs/specs/leesbudget.md` AC-7 noemt de lijst via REST (één `gh api …/pulls?state=closed`, de twintig nieuwste op `merged_at`) in plaats van `gh pr list`, "meet nooit meer dan twintig PR's" in plaats van "leest", en verwijst voor de drempel naar meting-stuurt/AC-2.
- **meting-stuurt/AC-9** — R-DOC-08 noemt de trigger (`check:roadmap` bij het sluiten van een fase) en dat "let op" een verschil met de basis is. `docs/operations/agent-doorloop.md` beschrijft de vergelijking met de basis, de afgeleide feiten-aanroepen en de plafonds van `feiten.mjs`.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Basis niet te meten (geen `origin/main` of merge-base) | `leespad`: één regel, zonder vergelijking, exit 0; `check:roadmap`: faalt zoals nu | n.v.t. |
| `feiten.mjs` faalt bij het meten | Dat deel "onbekend" met reden; geen vergelijking voor dat scenario | n.v.t. |
| PR sluit twee fases tegelijk | Een herijkingsregel per fase | n.v.t. |
| Item heropend na een herijking | Geen nieuwe eis tot de fase weer sluit | n.v.t. |

## Raakt ook

De bestanden uit de AC's, plus `docs/framework.md` (R-DOC-08, R-WERK-01). ADR 0064 en 0065 zelf blijven ongewijzigd; 0070 wijzigt ze. De bouw-PR stelt streefdoel en drempel in `DOELEN` van `scripts/kit/leespad.mjs` opnieuw voor op de eerlijke meting.

## Buiten scope

Nieuwe maten in de trend; een PR-comment door CI; padregels of feiten-uitvoer inkorten; een verplichte fase op nieuwe roadmap-items. `lichte-fix` telt geen padregels en de spec-review van de reviewer vraagt ook `routes permissies foutcodes`: bekende onderteldingen.

## Testplan

Naast `test/rails/leesbudget.test.ts` en `test/rails/meting-kerncijfers-leespad.test.ts`: AC-1 in een tijdelijke repo met en zonder basis (de basis geeft een getal), met per-eenheid-gevallen en de 1 KB-grens; AC-2 tabelgedreven met de vijf gevallen; AC-3 met een tijdelijk `GITHUB_STEP_SUMMARY`-bestand, als teksttest op workflow en skill, en een tabeltest in het rolhek (`--basis origin/main` en `--basis=<sha>` mag; een waarde met `$`, `;` of spatie niet); AC-4 tegen de echte scenariobestanden en een fixture; AC-5 tegen fixtures; AC-6 met pure functies en een lezer; AC-7 in een tijdelijke repo (afvinken, parkeren, verhuizen; "uit fase N"; doorlopend naast een fasenummer; kop ontbreekt; zonder basis); AC-8 en AC-9 als teksttests.

## Open vragen

- **OV-1 ✅ besloten** — Meldingen staan in de samenvatting van de CI-job en in de PR-beschrijving via `opleveren`, zonder PR-comment (ADR 0070 punt 3).
- **OV-2 ✅ besloten** — De trend vraagt 0,5 én 25 % (ADR 0070 punt 2).
- **OV-3 ✅ besloten** — Een scenario krijgt "let op" bij minstens 1 KB groei tegenover de basis (keuze eigenaar, 3 november 2026): het leespad ligt al ver boven het streefdoel en telt nu feiten-uitvoer, dus zonder minimale stap meldde elke nieuwe spec weer.
