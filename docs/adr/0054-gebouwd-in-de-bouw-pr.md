# 0054 — `gebouwd` in de bouw-PR, bewezen door de merge

Status: geaccepteerd

Wijzigt [0046](0046-werkstraat-en-beslisroute.md) punt 10, en punt 5 en 6 waar ze `gebouwd` noemen.
Drempel: A4 (een punt van een geaccepteerd ADR vervangen) en A3 (de guard aanvaardt `gebouwd` zonder eigen checkcontrole).

## Context

Nu gaat een spec pas naar `gebouwd` nadat alle verplichte checks groen zijn: `pnpm docs:status <spec> gebouwd --pr N` schrijft
PR en gevalideerde SHA, en dat is een extra commit, push en CI-ronde per spec (`docs/operations/agent-doorloop.md`, "PR en
statussen afronden"). De guard (`canRecordBuilt`, `statusOnlyDiff`) controleert dan zelf de check-runs op die SHA en eist dat de
latere diff alleen statusregels en het eigen roadmapvinkje raakt. Aanleiding (framework §1): gemeten wrijving, één ronde per
gebouwde spec, uit de eigenaarreview "template slanker en sneller".

Feiten (gelezen 2026-10-22 met `gh api repos/<repo>/rules/branches/main`): de ruleset op main is actief zonder bypass, eist een
PR en eist zeven checks uitsluitend van GitHub Actions (`integration_id` 15368) op de head-commit van de PR
(`strict` uit: de branch hoeft niet bij te zijn met main). `requiredChecks` in `.claude/decisions.json` noemt er negen; de
ruleset mist `document-status` en `codeql (javascript-typescript)`. `.github/settings/main-protection.json` en
`scripts/check-github.mjs` staan niet op main, al noemen framework §10 en 0046 punt 30 ze.

## Besluit

1. **De claim staat in de bouw-PR.** Zodra de PR open is, schrijft de hoofdsessie in dezelfde PR `status: gebouwd # #<PR>`
   (met `--roadmap` ook het vinkje van de eigen taak), vóór het wachten op groen. `pnpm docs:status <spec> gebouwd --pr N` schrijft
   die vorm zonder op checks te wachten; hij weigert als PR N niet open is op de huidige branch.
2. **De guard toetst de claim.** `check-document-status` (uit main) aanvaardt `gebouwd # #N` in een PR alleen als N het nummer
   van die PR is, de spec buiten de statusregel gelijk is aan de goedgekeurde versie op main (of, in de feature-lane, de enige
   nieuwe mini-spec van de PR is) en de PR geen besluit-PR is. Rood elders in de PR houdt de merge tegen; de AC-regel van
   `check-docs` voor gebouwde specs geldt daardoor al in de bouw-PR.
3. **Het bouwbewijs is de merge.** De ruleset laat een merge alleen toe als elke verplichte check van GitHub Actions groen is op
   de head-SHA, en die head bevat de claim. De gevalideerde SHA staat niet meer in de tekst; GitHub bewaart hem bij PR N
   (`headRefOid`). `gebouwd` op main betekent: PR N is gemerged met groene verplichte checks.
4. **Voorwaarde.** Dit geldt pas als de ruleset elke naam uit `requiredChecks` eist, alleen van GitHub Actions, zonder bypass,
   en een check dat aantoont tegen de instellingen als code. Tot dan blijft het huidige pad.
5. **Achteraf blijft mogelijk.** Voor een spec waarvan de bouw-PR al gemerged is, blijft de bestaande route met `--pr` en
   gevalideerde SHA; bestaande regels met `; gevalideerd: <sha>` blijven geldig. ADR's kennen geen `gebouwd`.

Vervangt uit 0046: punt 10 (moment en vorm; "daarna mogen alleen statusregels veranderen" geldt alleen nog voor de route
achteraf). Punt 5 krijgt de overgang uit besluit 2 erbij; punt 6 blijft (alleen via `docs:status`); in punt 14 telt `gebouwd`
op de eigen mini-spec niet als tweede document met eigenaarstatus.

## Alternatieven

- **Status quo, SHA na groen:** de guard bewijst zelf, maar elke spec kost een extra ronde.
- **Afleiden bij het lezen uit git of GitHub, zonder statusregel:** `feiten` en `check-docs` hebben dan netwerk nodig, en een
  squash-merge laat de head-SHA niet in git achter.
- **Een workflow schrijft `gebouwd` op main na de merge:** een push naar main buiten een PR; kan pas met een eigen App en
  verplaatst het bewijs naar een token.

## Gevolgen

- Eén ronde minder per gebouwde spec; meten volgens 0046 punt 36.
- De garantie verschuift van de eigen check-run-controle van de guard naar de ruleset. Dat is gelijkwaardig zolang besluit 4
  geldt; zonder die voorwaarde zou `document-status` rood kunnen zijn bij de merge.
- Op een branch is `gebouwd` een claim, geen bewijs; sluit de eigenaar de PR, dan komt de claim nooit op main.
- Werk: `docs:status`, `canRecordBuilt`/`builtReference`, `check-document-status`, `scripts/github-ruleset.sh` (de ontbrekende
  checknamen) en de werkinstructie; in een rail-PR met eigenaarreview, plus de ruleset zelf door de eigenaar.
