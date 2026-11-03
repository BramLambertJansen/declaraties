# 0069 — De hoofdsessie merget niet-kritiek werk zelf

Status: geaccepteerd

Wijzigt [0046](0046-werkstraat-en-beslisroute.md) punt 30, 31, 33, 34 en 35, de zin "automatische agent-merges vallen af" uit
[0057](0057-risicogestuurde-werkstraat.md), in [0064](0064-leesbudget-per-laag.md) "zodra de GitHub App er is" (R-DOC-09) en in
[0068](0068-samenhang-checks-en-rollen.md) punt 3 de eigenaarmerge als grens (voor agent-merges is de grens het vangnet van punt
3 en 4 hieronder); vult [0062](0062-spec-en-bouw-in-een-pr.md) aan. Drempel: A3 (rechten verruimen). Uitwerking:
[spec](../specs/agent-merge-niet-kritiek.md).

## Context

De eigenaar wil dat een agent werk zelf merget als het niet kritiek is en de agent het niet kan slopen (opdracht 3 november
2026). Nu merget alleen de eigenaar (R-REPO-01, R-REPO-05, `AGENTS.md`), ook een kleine fix met groene CI en een schone review.
Dat kost een wachtmoment per PR en schaalt met de tijd van de eigenaar, niet met de uitvoer (zelfde argument als 0068 punt 5).

Het eerdere ontwerp (0046 punt 30, spec `agent-merge`) werd nooit actief: het hing aan een feature-lane die 0062 verving, aan
`scripts/check-github.mjs` dat niet bestaat, en 0057 schrapte het. Wat sindsdien wel bestaat: de diff-guard
(`pull_request_target`, scripts van `main`) die gate-paden, bestaande tests en een risico-overzicht per PR bepaalt; één lijst
verplichte checks (`requiredChecks`, 0068); `pnpm pr:verify`; de ruleset op `main`.

De agent werkt onder het account van de eigenaar. GitHub ziet niet wie merget, dus de ruleset kan een agent-merge niet anders
behandelen dan een eigenaarmerge. Een check die kritiek werk blokkeert, blokkeert ook de eigenaar. Daarom ligt de grens tussen
kritiek en niet-kritiek in dit besluit níet bij GitHub, maar bij het mergescript en het rolhek, en dat is een vangnet
(R-ROL-10). Dit besluit zegt dat eerlijk in plaats van een harde grens te claimen (0068 punt 3).

## Besluit

1. **Wat de agent mag mergen: een toegestane lijst, de rest dicht.** Een PR naar `main` uit dezelfde repository is alleen
   agent-mergebaar als elk geraakt pad op de lijst `agentMerge.toegestaan` in `.claude/gates.json` staat en geen pad op
   `gates`, `agentMerge.kritiek` of `kritiekPad()` (`scripts/kit/lane.mjs`) staat. Een nieuw testbestand is alleen toegestaan
   onder `src/`, `test/`, `e2e/` of `db/tests/` met een code-extensie. Overal dicht, ook onder `src/` en `docs/`: een bestand
dat een tool of agent vanzelf laadt (instructies zoals `CLAUDE.md` en `AGENTS.md`, een pad met een map of naam die met een
punt begint, `*.config.*`, `package.json`, `tsconfig*.json`). Daarnaast: geen bestaande test gewijzigd of verwijderd,
   een leeg risico-overzicht (migratie, permissiesleutel, dependency, `defineRoute`, contract), en geen toegevoegde of
   verwijderde regel met `permission` in `src/`. Een goedkeuring van de eigenaar verandert de uitslag niet. Een onbekend pad is
   dicht.
   In de template is `toegestaan`: `src/**`, `docs/**` en `CHANGELOG.md` (de gates eruit vallen al dicht); `kritiek`:
   `src/api/app.ts`, `src/api/login-policy.ts`, `src/shared/permissions.ts`, `src/shared/limits.ts`,
   `src/shared/contracts/**`, en de docs die agents of de review sturen: `docs/operations/**`, `docs/reviews/**`, `docs/gouden-pad.md`,
   `docs/ontwerp/**`. Een app breidt `kritiek` uit met zijn eigen gevoelige paden.
   *Waarom:* "kan het niet slopen" laat zich niet als verbodslijst sluiten: elk nieuw configbestand dat een tool automatisch
   laadt, zou erdoor glippen. Een toegestane lijst faalt dicht en groeit niet mee met de repo. Specs en ADR's zijn gates, dus
   elke PR met een besluit of eigenaarstatus merget de eigenaar: daar is de merge het besluit (R-WERK-08). In de praktijk is
   agent-merge licht werk (R-WERK-03) in app-code en gewone docs. Bij twijfel kritiek.
2. **Het oordeel komt uit CI.** De diff-guard-workflow krijgt een job `agent-merge` die alleen slaagt als punt 1 geldt,
   berekend door `scripts/kit/diff-guard.mjs` uit de scripts van `main` (`pull_request_target`, de PR alleen als git-data).
   Anders wordt hij overgeslagen, niet rood. Hij is geen verplichte check, want dan blokkeerde hij ook de eigenaar.
   *Waarom:* de sessie kan zich vergissen of een aangepast script draaien; de workflow draait vertrouwde code op de echte head.
   Een check-run van GitHub Actions is niet na te maken met het token van de eigenaar, en een workflow uit de PR-branch telt
   niet (punt 3).
3. **Mergen alleen via `pnpm pr:merge <nr>`.** Het script merget (squash, REST, met de head-SHA als voorwaarde) pas als:
   - de modus `merge` in `.claude/gates.json` op de kop van `main`, via de API gelezen, `"niet-kritiek"` is (ontbreekt of
     onleesbaar: `"eigenaar"`);
   - de PR open is, geen draft, basis `main`, head in dezelfde repository en gelijk aan de lokale `HEAD`;
   - de kop van `main`, via de API gelezen, voorouder is van de head (twee groene PR's maken samen `main` niet rood);
   - elke check uit `requiredChecks` `success` is op de head-SHA;
   - de job `agent-merge` uit de run van `.github/workflows/guard.yml` met event `pull_request_target` `success` is op de
     head-SHA;
   - de laatste uitslag van `requiredChecks` op de kop van `main` groen is;
   - er een PR-commentaar `Review <head-SHA>: geen blokkerende bevindingen` staat (verse reviewer volgens 0068 punt 5);
   - Codex (`chatgpt-codex-connector[bot]`) de head-SHA beoordeelde (review op die SHA, of een uitslag na de push van die SHA)
     en er geen onopgeloste review-thread is; uit te zetten per repo met `agentMerge.codex: false` voor een app zonder Codex.
   *Waarom:* elke voorwaarde dekt een eigen faalwijze: verkeerde PR of SHA, verouderde basis, verouderde lokale `origin/main`,
   rode CI, kritieke inhoud, doorbouwen op rode `main`, review van een oudere versie, genegeerde Codex-punten. De
   review-regel en het oplossen van threads zijn afspraken, geen harde voorwaarden: de sessie zet ze onder het account van de
   eigenaar. Tussen de controle en de merge kan `main` nog doorschuiven (ruleset zonder `strict`); dat restrisico is aanvaard,
   en de agent volgt na de merge de CI op `main`.
4. **Alle andere merge-routes blijven dicht, en alleen in Claude Code.** `gh pr merge`, `gh api …/merge`, auto-merge,
   MCP-merge en mergen door een subagent blijven voor elke rol geweigerd (rolhek en deny-regels in `.claude/settings.json`).
   Het rolhek staat de hoofdsessie `pnpm pr:merge <nr>` toe zonder prompt (`allow`), alleen als op schijf het script, zijn
   imports en de bestanden die bepalen wat `pnpm` draait (precies de lijst `HOST_FILES` van de runner, met onder meer `package.json`,
   `.npmrc`, `.pnpmfile.cjs` en `mise.toml`) gelijk zijn aan het anker op `main`. Valt het rolhek open, dan krijgt de
   hoofdsessie een prompt: `pr:merge` krijgt een `ask`-regel in `.claude/settings.json` en valt buiten de automatische
   goedkeuring van de sandbox. Een andere runtime (zonder rolhek) merget niet. `pr-merge.mjs` wordt een kritiek pad.
   *Waarom:* één smalle route is te toetsen; een prompt per merge maakt de wens ongedaan; een aangepast script op de eigen
   branch mag zichzelf geen recht geven; buiten Claude Code is er geen enkel vangnet.
5. **De eigenaar houdt de schakelaar.** De modus staat standaard op `"eigenaar"`; de bouw-PR zet hem op `"niet-kritiek"` en de
   eigenaar activeert met die merge. Terugzetten is één regel. Na elke agent-merge meldt de agent PR en SHA in de thread; een
   fout herstelt hij met een revert-PR, die zelf ook punt 1 moet halen.
6. **Tot de bouw-PR gemerged is, merget geen agent.** R-REPO-01, R-REPO-05, R-ROL-08, R-WERK-23, R-ROL-10 en `AGENTS.md`
   veranderen pas in de bouw-PR, met het mechanisme, zodat geen tekst een recht geeft dat nog niet bestaat.

## Alternatieven

- **Alleen tekst ("merge als het niet kritiek is"):** de agent kiest dan zelf. Verworpen.
- **Verbodslijst (gates plus risico-overzicht):** een nieuw configbestand of een nieuw `.test.md` onder `docs/adr/` glipt
  erdoor. Verworpen voor de toegestane lijst.
- **Auto-merge na groen, of een label of comment als akkoord:** zet de agent zelf, en kijkt niet naar inhoud. Verworpen.
- **Een workflow die zelf merget:** geeft het Actions-token schrijfrecht (tegen R-REPO-02) en vraagt toch een trigger van de
  agent. Verworpen.
- **`agent-merge` als verplichte check:** blokkeert dan elke kritieke PR ook voor de eigenaar. Verworpen.
- **Eerst de GitHub App (ST-01):** dan heeft de agent een eigen identiteit en kan de grens naar GitHub. Dat is de weg naar
  een harde grens, met een eigen besluit; tot dan geldt dit besluit binnen Claude Code.
- **Ruimer (gate-paden buiten `voorReview`, zoals `src/core` buiten auth):** dan merget een agent template-code die elke app
  erft. Niet nu.

## Gevolgen

- Licht werk in app-code en gewone docs gaat zonder wachtmoment naar `main`. In de template valt het meeste werk onder gates
  en blijft het bij de eigenaar; in een app is het grootste deel van de lichte fixes agent-mergebaar.
- Restrisico, bewust aanvaard: binnen Claude Code is het rolhek het vangnet tegen een merge buiten `pr:merge` om; de ruleset
  dwingt alleen groene verplichte checks en opgeloste gesprekken af, niet de inhoudstoets. Een agent die het script bewust
  omzeilt, houdt GitHub niet tegen.
- De bouw-PR is kritiek (`.github/**`, `.claude/**`, besluitscripts); de eigenaar merget hem en pusht de workflowwijziging.
  `docs/specs/agent-merge.md` gaat daarin naar `vervallen`, met de roadmap-items voor ADR 0029 stap 7 en ADR 0030 PR 2.
- Meten (0046 punt 36): aantal agent-merges, reverts daarvan en rode `main` na een agent-merge. Eén rode `main` door een
  agent-merge of één agent-merge van iets dat achteraf kritiek blijkt: modus terug naar `"eigenaar"` en dit besluit herzien.
