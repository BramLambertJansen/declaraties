# 0037 — check-core: correctie op 0008 "Afdwingen"

Status: voorgesteld

Wijzigt [0008](0008-grens-core-en-app.md), sectie "Afdwingen" (r. 78–82). De tekst en statusregel van 0008 blijven. Normatieve
wijziging, dus een nieuw ADR (`docs/operations/agent-doorloop.md:141`). ADR-drempel ([0029](0029-snellere-beslisroute.md)
punt 4): A4. Op verzoek van de eigenaar in de sessie; de implementatie staat in #236 (branch `feat/check-core`).

## Context

0008 zegt: een app-PR die `src/core/` wijzigt faalt, tenzij het een template-merge is: (1) P2 is voorouder van `template/main`,
opgehaald van de vaste template-URL; (2) `git diff P2 <merge> -- src/core` is leeg; (3) geen ander commit in de PR raakt
`src/core/`. In de template zelf staat de check uit.

Bij het bouwen bleek die tekst op drie punten te smal of te vaag. Punt 3 telt ook de template-commits die met de merge meekomen.
Een `git merge origin/main` in de PR-branch (zoals de skill `opleveren` doet) brengt na een template-update een core-wijziging mee
waarvan P2 niet in `template/main` maar op main staat. En "in de template zelf" heeft geen toets.

## Besluit

1. **Bereik** (wijzigt punt 3).
   - Was: geen ander commit in de PR raakt `src/core/`.
   - Wordt: alleen de commits die de app toevoegt worden beoordeeld: `rev-list head ^base ^template/main`
     (`scripts/kit/check-core.mjs:103`). Commits uit `template/main` tellen niet mee; ook juist bij meerdere merge-bases.
2. **Merge van main telt als vertrouwd** (wijzigt punt 1).
   - Was: P2 is een voorouder van `template/main`.
   - Wordt: P2 is een voorouder van `template/main` **of van main** (`check-core.mjs:82`). Punt 2 (core in de merge gelijk aan
     P2) blijft (`:85`). Zonder dit faalt elke app-PR die main binnenhaalt na een template-update.
3. **Orphan en octopus falen.** Een commit zonder ouder faalt altijd (`:79`); een merge met meer dan twee ouders die `src/core/`
   wijzigt faalt (`:81`).
4. **Faalt dicht.** Onleesbare base, head of `template/main` faalt (`:96`–`:100`); een niet op te halen template-URL ook
   (`:129`–`:138`). Gevolg: de template moet zonder credentials op te halen zijn (`TEMPLATE_URL`, `:14`).
5. **"In de template zelf uit"** = `onderhoud.repository` in `.claude/gates.json` van main is gelijk aan de repository
   (ADR 0033; `check-core.mjs:57`, `:124`–`:128`). `pnpm app:init` haalt die regel in een app weg (`scripts/kit/app-init.mjs:122`).
6. **Plaats.** Job `check-core` in `.github/workflows/guard.yml` (`pull_request_target`, scripts uit `BASE_SHA` van main), naast
   `diff-guard` en `document-status`. Verplichte check in de app-ruleset (`scripts/github-ruleset.sh`, #236; eigenaarbesluit
   2026-10-21): in de template is hij altijd groen, dus hij blokkeert daar niets.
7. **Downgrade-gat aanvaard** (eigenaarbesluit 2026-10-21). Het gat uit Gevolgen blijft voorlopig open; de aanscherping uit
   Alternatieven is een vervolgitem op de roadmap (#236).

Ongewijzigd: punt 2 van 0008, de vaste template-URL, en dat een core-fout in de template wordt opgelost.

## Alternatieven

- **Tekst van 0008 letterlijk volgen**: punt 3 laat elke template-merge falen op de meegekomen template-commits; zonder besluit 2
  faalt elke `git merge origin/main` na een template-update. Niet bruikbaar.
- **Downgrade-aanscherping** (zie Bekende gaten): core van head moet gelijk zijn aan die van base of van een `template/main`-commit
  die niet ouder is dan de core op main. Niet nu (besluit 7); vervolgitem op de roadmap.

## Gevolgen

- **Bewijs**: `test/rails/check-core.test.ts` (o.a. zuivere merge `:75`, eigen wijziging in de merge `:84`, losse core-commit `:96`,
  merge van main met eerdere template-merge `:122`, dicht falen `:135`, template-modus `:152`, orphan `:158`, octopus `:171`).
- **Bekende gaten** (uit de review, niet opgelost):
  - *Downgrade.* Een merge met een oudere vertrouwde commit (oude template-commit, of een handgemaakte merge met een oude
    main-commit) kan een oudere core terugbrengen; dat kon ook onder de tekst van 0008. Een heel oude template-commit zonder
    `src/core/` kan core zelfs verwijderen.
  - *Vals alarm.* Merget een zijbranch zelf `template/main` en wordt die zijbranch daarna in de PR-branch gemerged, dan staat P2
    niet in template of main en faalt de check. Zeldzaam; omweg: merge `template/main` direct in de PR-branch.

## Besluit van de eigenaar

In de sessie van 2026-10-21: besluit 2 en 4 akkoord (merge van main telt; de template-URL moet zonder credentials op te halen
zijn, dus een privé-template laat `check-core` altijd falen), check verplicht (besluit 6), downgrade-gat aanvaard met vervolg
(besluit 7), ADR akkoord.
