# 0073 — Eén proefkopie per PR voor app:init en de generator

Status: geaccepteerd

Wijzigt [0047](0047-generator-new-resource.md) punt 9 ("als eigen job in CI") en in spec app-init-proef OV-4 (overslaan in
een app), OV-5 (eigen job `check:app-init`) en de stappen en AC's die daarop rusten (lijst in de spec, "Raakt ook"). Drempel: A4. Uitwerking: [spec](../specs/een-proefkopie.md). Aanleiding: bevinding P4 uit
de review van main op 3 november 2026.

## Context

Twee verplichte checks maken op elke PR een tijdelijke kopie van de repo en draaien daarin de volledige snelle suite:
`check:new-resource` (genereert een resource, 0047 punt 9) en `check:app-init` (draait `app:init`, leerpunt #334). Op de
laatste run van `main` (#460) duurden ze 5,0 en 4,8 minuten runnertijd, naast `gate:fast` (4,2 minuten) zelf. Per PR draait
de snelle suite dus drie keer. De wall-tijd hangt nu aan `gate:slow (ui:check)` (5,2 minuten), dus de PR wacht er niet
langer door. Maar elke volgende generator met een eigen proef voegt weer een volledige suite toe, en dat botst met R-DOC-09:
wat een check per PR kost, groeit niet mee.

De review stelde voor de proef over te slaan als geen invoerpad geraakt is. Dat wijzigt R-CI-08 ("volledige CI op elke PR").
Bovendien blijkt de voorgestelde padlijst te smal: ook `eslint.config.*`, `rails/**`, `tsconfig*.json`, `package.json`,
`scripts/kit/gates.mjs` en de tests bepalen of gegenereerde code `gate:fast` haalt, en `docs/**` bepaalt of `app:init`
slaagt. Een veilige lijst omvat bijna de hele repo, en dan levert overslaan bijna niets op.

## Besluit

1. **Eén kopie, één suite.** Eén check maakt één kopie. In de template draait die eerst `app:init` (met commit, zoals in
   een app na de init-PR), daarna de generator (`new:resource`) en dan één keer de snelle suite. In een app slaat de check
   `app:init` over en draait hij alleen de generator en de suite, zoals `check:new-resource` nu doet.
2. **De naam `check:new-resource` blijft.** De job en het script houden die naam, want hij is al verplicht in de template
   én in elke app. `check:app-init` verdwijnt uit `requiredChecks`, de ruleset, `ci.yml` en `package.json`. Een verplichte
   check schrappen blokkeert geen andere PR, een nieuwe naam toevoegen wel.
3. **Niets wordt overgeslagen.** De check draait op elke PR en elke push naar `main` volledig. R-CI-08 verandert niet.
4. **Een volgende generator schuift aan in dezelfde kopie.** Een nieuwe generator krijgt geen eigen job: hij genereert in
   de bestaande kopie vóór de suite. Zo groeit de prijs per PR met de generatietijd (seconden), niet met een suite
   (minuten).
5. **Een rode uitslag noemt de stappen.** Bij een rode gate meldt de check welke stappen in de kopie draaiden (`app:init`,
   `new:resource`). Met `--bewaar` blijft de kopie staan voor onderzoek.
6. **Overgang in twee stappen.** `pr:verify` en `pr:merge` lezen `requiredChecks` van `main`. De eerste bouw-PR schrapt
   `check:app-init` daarom alleen uit `requiredChecks` en de ruleset, en laat de job zelf nog ongewijzigd draaien. Na die
   merge en de rulesetronde haalt een tweede PR de job weg. Zo meldt nergens een lege job groen zonder te toetsen.

## Alternatieven

- **Overslaan als de invoer gelijk is** (reviewvoorstel). Dat wijzigt R-CI-08 en de padlijst moet bijna de hele repo
  omvatten. Een te smalle lijst mist een generatorbreuk via een lint- of railwijziging, en dat valt pas op in de app.
- **Twee jobs houden, de suite in de kopie in banen draaien** (zoals `gate:fast`). Dat scheelt wall-tijd, maar de
  runnertijd blijft drie suites per PR en groeit met elke generator. Banen kunnen later ook in de ene kopie.
- **Een nieuwe naam, zoals `check:proef`.** Duidelijker, maar dan moeten de ruleset van de template en van elke app
  eerst de nieuwe naam krijgen vóór de merge, met een overgangsjob. Dat is meer werk zonder extra bescherming.
- **Laten zoals het is.** Geen risico nu, maar de kosten groeien per generator.

## Gevolgen

- Per PR draait de snelle suite twee keer in plaats van drie: ongeveer 5 minuten runnertijd minder. De wall-tijd blijft
  vrijwel gelijk (de job duurt een paar seconden langer dan `check:new-resource` nu, onder `ui:check`).
- De generator wordt getoetst in de context waarin hij echt draait: een app na `app:init`. Dat is strenger dan nu.
- Een rode uitslag wijst minder precies één stap aan. De melding noemt de stappen en `--bewaar` laat de kopie staan.
- Dat de generator slaagt in de template zonder `app:init`, toetst niemand meer. Niemand draait `new:resource` in de
  template zelf, en `check:new-resource` in de app blijft dat pad dekken.
- Tijdens de overgang draaien beide proeven nog één PR lang. Daarna past de eigenaar de ruleset toe
  (`scripts/github-ruleset.sh`); in een app gebeurt dat bij de template-update die `check:app-init` schrapt.
- In een app faalt de check nu ook bij een ontbrekende `node_modules` of `.claude/gates.json`, zoals `check:app-init` al
  deed. Een verplichte check slaagt dan niet stil.
