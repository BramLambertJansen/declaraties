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
pnpm docs:status docs/specs/voorbeeld.md gebouwd --pr 123
```

Schrijft alleen de statusregel met PR en gevalideerde bron-SHA. Commit en push de administratie, controleer CI opnieuw.
De guard mag de groene broncommit gebruiken als de latere diff uitsluitend statusregels wijzigt. Inhoud, code, tests
of configuratie wijzigen vraagt nieuw bouwbewijs. Gebouwd vereist geen merge. ADR's hebben geen gebouwd-status:
implementatiebewijs hoort bij hun gekoppelde spec.

Voor vervallen of vervangen door NNNN bereidt de agent ook een eigenaarbesluit voor en registreert daarna de bewezen
status. Een vervanging zonder inhoudelijk akkoord activeert zichzelf niet.

## Invoering en runtime

Het lege register geeft geen taakmandaten. De eerste invoering heeft nog geen nieuwe guard op main en vereist
eigenaarreview vóór merge. Daarna worden helpers en taakrechten vanuit main actief; werkbranchconfig activeert geen
automatische runner of ruimere labelscope.

Claude Code gebruikt de geteste hooks. Codex en andere runtimes draaien ze niet automatisch: volg dezelfde procedure
en meld ontbrekende lokale rolgrenzen. Een subagent met dezelfde rechten als de hoofdsessie is geen afgedwongen
onafhankelijke reviewer. De eigenaar verzorgt de ontbrekende review vóór samenvoegen. De agent merget nooit.
