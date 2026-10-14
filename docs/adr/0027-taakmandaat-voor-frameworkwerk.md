# 0027 — Taakmandaat en bewijs voor de agentdoorloop

Status: geaccepteerd (2026-10-13) — eigenaarakkoord in de opdracht; statusadministratie op basis van bewijs, geen autonome inhoudelijke goedkeuring.

## Context

De eigenaar wil de template ontwikkelen met behoud van de rails. Het bestaande rolhek weigert een developer altijd
toegang tot core en beschermde app-broncode, ook bij een goedgekeurde taak. Statusregels, gate-label en runnerchecks
worden steeds teruggelegd bij de eigenaar. [ADR 0008](0008-grens-core-en-app.md) onderscheidt templateonderhoud en
app-ontwikkeling; [ADR 0025](0025-werkstraat-tot-de-merge.md) geeft de hoofdsessie al de CI-lus.

## Besluit

1. **De eigenaar beslist; de agent registreert.** Alle bestaande ADR- en spec-statussen mogen administratief worden
   bijgewerkt wanneer passend bewijs bestaat. Een status geeft zichzelf geen goedkeuring. Inhoud, scope, intrekking
   en vervanging blijven inhoudelijke eigenaarbesluiten.
2. **Beschermd register op main.** De agent bereidt met `pnpm docs:decision` een record voor in
   `.claude/decisions.json`: document, inhoudsdigest zonder statusregel, repository, exacte featurebranch,
   gewenste status en exacte bronbestanden. Alleen de door de eigenaar naar main gebrachte versie geeft rechten.
   Een besluit kan bij een nog voorgesteld document horen; de agent registreert de status met `pnpm docs:status`.
   Bestaande besluiten op main kunnen met identieke inhoud worden overgenomen. Prompt, label, commit-auteur of
   werkversie van het register vervangt dit bewijs niet. Inhoud wijzigen maakt eerder akkoord ongeldig.
3. **Taakgebonden broncode.** Alleen de bekende developer mag genoemde bronbestanden wijzigen: core uitsluitend in
   de template, de bestaande beschermde compositie-roots en permissietabel ook in een app. Hooks, CI, scripts,
   dependencies, tests, fixtures, gegenereerde bestanden en het register krijgen daardoor geen extra rechten.
   Andere branch, repository, inhoud, symlink of intrekking geeft geen mandaat. Lokaal wordt vastgelegde Git-data
   uit opgehaalde `origin/main` gelezen; de CI-guard gebruikt de actuele default branch en de volledige diff.
4. **Gebouwd bij de PR, met bouwbewijs.** Een spec kan naar `gebouwd` zodra de implementatie is vastgelegd, de juiste
   PR open is en alle verplichte GitHub Actions-checks groen zijn op de broncommit. De statusregel vermeldt PR en
   gevalideerde SHA. Daarna mogen uitsluitend statusregels en het vinkje van het roadmap-item van de eigen spec veranderen (spec taakmandaat-vervolg); code, tests of configuratie vraagt nieuw bewijs.
   Gebouwd betekent aangeboden en gecontroleerd, geen merge of release. ADR's behouden hun eigen woordenlijst;
   implementatiebewijs hoort bij de gekoppelde spec.
5. **Label als markering.** De hoofdsessie mag met `pnpm pr:label-gate` het label zetten op uitsluitend documentatie-PR's,
   overeenkomstig de toestemming van de eigenaar. `gateMarker: docs` staat op main. Verruiming naar alle gate-PR's
   vraagt een expliciet eigenaarbesluit. Diff-guard behoudt zijn eigenaarreview op de uiteindelijke head-SHA;
   een label, taakmandaat of administratieve status vervangt die review niet.
6. **Runnerwerk bij de agent.** De exacte opdrachten `pnpm test:db`, `pnpm ui:check` en `pnpm gate:slow` mogen zonder
   herhaalde runprompt wanneer main `autoRunner` toestaat en alle hostbestanden ongewijzigd zijn. De isolatie van
   [ADR 0009](0009-tests-buiten-de-sandbox.md) blijft gelden. Gewijzigde hostcode draait in de bestaande wegwerp-CI;
   de agent gebruikt nooit `--sta-wijzigingen-toe`, lokaal `CI=true` of een rechtstreeks Docker-commando.
   De hoofdsessie wacht met `pnpm pr:verify <nummer> --watch`, leest werkelijke uitslagen en herstelt rode checks.
   Ontbrekend runnerbewijs wordt niet als routineklus teruggelegd bij de eigenaar.
7. **Onvoltooid blijft onvoltooid.** De developer meldt een weigering met de werkelijke rolhekuitvoer aan de hoofdsessie.
   De groen-eis van de stop-hook krijgt geen tekstuele uitzondering. De hoofdsessie verwerkt de blokkade of legt een
   concrete scope-uitbreiding voor; een rode of ontbrekende check geeft geen voltooide taak.

**Vertrouwensgrens:** main berust op de afspraak dat alleen de eigenaar merget. De agent werkt nog met de identiteit
van de eigenaar (overgang ADR 0017); dit besluit vervangt de ontbrekende GitHub App niet. Een rolnaam geeft geen
onafhankelijk reviewbewijs. De Claude-hooks zijn runtime-specifiek; CI en GitHub blijven nodig voor andere runtimes
en voor omzeilingen die een shell-parser niet kan vangen.

## Alternatieven

- Core of checks uit de gate-lijst halen: verworpen; frameworkwijzigingen moeten controleerbaar blijven.
- Iedere developer blijvende toegang geven: verworpen; toegang hoort bij een afgebakend besluit.
- Status, label of agentreview als inhoudelijk akkoord gebruiken: verworpen; de agent kan dat bewijs zelf maken.
- Iedere veilige runner door de eigenaar laten starten: vervangen door vaste gecontroleerde opdrachten en CI.

## Gevolgen

Wijzigt de administratieve beperkingen van ADR 0025 en de herhaalde runprompt van ADR 0009. Procedures en resterende
grenzen staan in [agentdoorloop](../operations/agent-doorloop.md); criteria in [de spec](../specs/taakmandaat-frameworkwerk.md).
Het lege register verleent geen taakrechten. De eerste invoering krijgt eigenaarreview vóór merge; de nieuwe guard
kan zijn eigen bootstrap-PR nog niet vanuit main controleren. Geen nieuwe dependency, applicatieroute of databaserecht.
