# Agentdoorloop met bewijs

De eigenaar beslist inhoudelijk en merget. De agent bereidt administratie voor, bouwt, verzamelt bewijs en zet
statussen zodra het bewijs bestaat ([ADR 0027](../adr/0027-taakmandaat-voor-frameworkwerk.md)).

## Besluit en taakscope voorbereiden

Begin met `node scripts/kit/feiten.mjs`. Architect schrijft spec of ADR als voorstel. De hoofdsessie bereidt het
besluitrecord voor. Voorbeeld met een document dat eerst moet bestaan:

```sh
pnpm docs:decision docs/specs/voorbeeld.md goedgekeurd --branch feat/voorbeeld --path src/api/app.ts
```

Herhaal `--path` voor exacte bronbestanden; laat het weg voor statusadministratie zonder broncodemandaat. Voor ADR's
geldt dezelfde procedure met hun eigen statuswoorden. Het record bindt de inhoudsdigest aan repository en bouwbranch.
De agent legt document en record in één reviewbare PR voor. Het register in de werkbranch geeft nog geen rechten.

Na eigenaarreview en merge haalt de hoofdsessie `origin/main` op. De bouwbranch neemt het document ongewijzigd over
en registreert de status:

```sh
pnpm docs:status docs/specs/voorbeeld.md goedgekeurd
```

Werkmap en HEAD moeten overeenkomen. Commit de status voordat je een volgende registreert. De eigenaar hoeft geen
YAML-regel te typen. Inhoud wijzigen vraagt een nieuw voorstel en passend eigenaarbesluit. Intrekking: eigenaar
verwijdert of vervangt het record op main; lokaal verversen, CI gebruikt de actuele basis. Een verouderde lokale
basis kan nog oud akkoord zien.

## Ontwikkelen en runnerchecks

Een geldig broncodemandaat geeft alleen de bekende developer toegang tot genoemde beschermde bronbestanden.
Core kan uitsluitend in de template zelf worden ontwikkeld. App-uitbreidingen blijven via registratie en app-code
lopen. Tests en bewaking houden hun bestaande bescherming.

Bij een weigering meldt de developer commando/bestand en werkelijke rolhekreden als onvoltooid. De hoofdsessie
verwerkt de grens of vraagt een concrete scope-uitbreiding. Een blokkadetekst schakelt de groen-eis niet uit.

De bestaande runner start zijn eigen verse teststack; hiervoor hoeft de eigenaar geen dev-stack te starten.
`pnpm test:db`, `pnpm ui:check` en `pnpm gate:slow` mogen automatisch bij `autoRunner` op main en onveranderde
hostbestanden. Start ze vanuit de repositoryroot; een package in een submap krijgt geen automatische hosttoestemming.
Alleen de exacte opdrachten krijgen expliciete toestemming, zonder extra argumenten, environment-
overrides of samengestelde shellopdracht.

`pnpm pr:verify` weigert een vuile werkmap, behalve ongetrackte bestanden onder `werkmapNegeer` in `.claude/gates.json`
(uit `origin/main`, nooit uit de werkmap; `scripts/kit/pr-verify.mjs`, ADR 0031 besluit 5). Een getrackte wijziging onder zo'n
pad weigert wel. `check-docs` eist dat de paden onder `.claude/` vallen en niet getrackt zijn. Bekende beperking: `.mcp.json` en
`.claude/commands/` staan er niet in; een app commit ze, zet ze in `.gitignore` of (alleen `.claude/commands/`, want het ligt onder
`.claude/`) in `werkmapNegeer`. `.mcp.json` kan alleen gecommit of genegeerd worden.

Bij gewijzigde scripts, compose-, package- of andere hostconfiguratie gebruikt de hoofdsessie de bestaande GitHub CI
op een wegwerp-runner. Geen `--sta-wijzigingen-toe`, lokaal `CI=true`, Docker-aanroep of afgezwakte hostcontrole.
`gate:slow` voert database-, UI- en snapshotchecks op iedere PR uit. Meld infrastructuurstoringen met uitvoer; vraag
de eigenaar niet standaard om veilig uitvoerbare tests alsnog zelf te draaien.

## PR en statussen afronden

Na de vereiste review opent de hoofdsessie de PR en wacht op werkelijke CI:

```sh
pnpm pr:verify 123 --watch
```

Controleert huidige commit, PR-branch, repository en verplichte checks uit main. Alleen Actions-uitslagen op de juiste
SHA tellen; een mislukte rerun maakt eerder groen ongeldig. Zonder `--watch` volgt direct de huidige toestand.
Met `--watch` maximaal 30 minuten wachten; een deadline is onvoltooid, daarna controleert de agent opnieuw.
Een veranderende PR of werkmap vraagt nieuwe verificatie.

De hoofdsessie kan een documentatie-PR markeren:

```sh
pnpm pr:label-gate 123
```

Dit is administratie. `gateMarker: docs` op main beperkt het tot documentatie; `all` kan uitsluitend na een nieuw
eigenaarbesluit worden ingesteld. De helper zet geen review of check-status. Directe labelschrijfacties blijven
verboden. Diff-guard behoudt label én eigenaarreview op de uiteindelijke head-SHA, met de overgang uit ADR 0017.

Bij afgeronde implementatie en groene verplichte checks registreert de agent:

```sh
pnpm docs:status docs/specs/voorbeeld.md gebouwd --pr 123 --roadmap
```

Schrijft alleen de statusregel met PR en gevalideerde bron-SHA, en met `--roadmap` het vinkje van het item dat de spec noemt. Commit en push de administratie, controleer CI opnieuw.
De guard mag de groene broncommit gebruiken als de latere diff uitsluitend statusregels en het vinkje van de eigen taak wijzigt. Inhoud, code, tests
of configuratie wijzigen vraagt nieuw bouwbewijs. Gebouwd vereist geen merge. ADR's hebben geen gebouwd-status:
implementatiebewijs hoort bij hun gekoppelde spec.

Voor vervallen of vervangen door NNNN bereidt de agent ook een eigenaarbesluit voor en registreert daarna de bewezen
status. Een vervanging zonder inhoudelijk akkoord activeert zichzelf niet.

## Invoering en runtime

Zonder record op main geeft het register geen taakmandaat. De invoering is gebeurd (#130, #144): de guard staat op main en
helpers en taakrechten worden vanuit main actief; werkbranchconfig activeert geen automatische runner of ruimere labelscope.
Een wijziging aan die guard zelf vraagt, zolang hij nog niet op main staat, eigenaarreview vóór merge.

Claude Code gebruikt de geteste hooks. Codex en andere runtimes draaien ze niet automatisch: volg dezelfde procedure
en meld ontbrekende lokale rolgrenzen. Een subagent met dezelfde rechten als de hoofdsessie is geen afgedwongen
onafhankelijke reviewer. De eigenaar verzorgt de ontbrekende review vóór samenvoegen. De agent merget nooit.

## Bekende beperkingen

- De automatische runner draait ook door de agent geschreven tests buiten de sandbox, zonder prompt (het gat uit ADR 0009).
  De hostbestanden in `.claude/hooks/lib/runner-authority.mjs` en `scripts/runner.sh` zijn de enige controle vooraf: scripts,
  packagebestanden, compose en de configs van vite, vitest en playwright. De testbestanden zelf horen daar niet bij; die vraagt
  de agent juist te mogen toevoegen en draaien.
- De hooks lezen de vertrouwde basis uit de lokale ref `origin/main` en doen geen netwerkwerk. Het rolhek weigert elke andere
  manier om die ref of de remote `origin` te veranderen dan `git fetch origin` (`movesTrustedBase` in `.claude/hooks/lib/rolhek.mjs`).
  Een commando buiten de hooks, of een andere runtime, valt daar niet onder; de CI-guard leest `main` bij GitHub en is de echte grens
  (`scripts/kit/check-document-status.mjs`).

## Gate-PR in de overgang

Is de auteur van een PR zelf goedkeurder, dan geeft `diff-guard` de uitslag `overgang` (groen met waarschuwing; ADR 0017,
OV-2, [ADR 0031](../adr/0031-guard-en-pr-verify-bruikbaarder.md) besluit 2). Dan:

1. Lees de samenvatting van `diff-guard` (de geraakte gate-paden, bewaakte sleutels, gewijzigde tests en het Risico-overzicht: nieuwe, gewijzigde of hernoemde migraties, permissiesleutels, elke tekstwijziging in een contractbestand onder `src/shared/contracts/**` (elk bestandstype, ook alleen commentaar of witruimte; `permission:` oud → nieuw waar eenduidig, anders "controleer permissie met de hand"; buiten het overzicht vallen verwijderde bestanden, hernoeming uit `contracts/` (een hernoeming naar `contracts/` telt als nieuw), `*.spec.*`-bestanden en permissiewaarden uit een bestand buiten `src/shared/contracts/**`), nieuwe dependencies en nieuwe routes (op method en path of contract)) en de uitslag van
   `document-status` (tot ADR 0031 PR 2: de stap "Documentstatus en taakmandaat" in de job `diff-guard`).
2. Een label `gate-wijziging` of een review is niet nodig; een review is ook niet mogelijk, want GitHub laat de auteur zijn
   eigen PR niet goedkeuren. De eigenaar merget zelf.
3. Is `document-status` rood, merge dan niet: laat de oorzaak herstellen.
