# Agentdoorloop met bewijs

De eigenaar beslist inhoudelijk met zijn merge ([ADR 0046](../adr/0046-werkstraat-en-beslisroute.md)). De agent schrijft de bedoelde status in
het voorstel, bouwt, verzamelt bewijs en zet `gebouwd` zodra het bouwbewijs bestaat ([ADR 0046](../adr/0046-werkstraat-en-beslisroute.md) punt 10).

## Besluit en taakscope voorbereiden

`pnpm gate:fast` meldt het wanneer minder dan 6 GiB geheugen beschikbaar is: lint en tests wachten dan op elkaar,
terwijl de overige snelle gates hun bestaande baan houden. Alle controles draaien precies eenmaal, ook na rood.
Aanleiding: op de gedeelde 8-GiB-host liep een ESLint-proces van 1,8 GiB naast de tests; de swap was vol en de gate
duurde 486 s met time-outs. Dit is een lokale waarneming, geen vaste looptijd. De CLI-regressies in
`test/rails/gate-fast-memory.test.ts` bewaken beide planningen en het behoud van alle gates en exitcodes.

Dezelfde geheugengrens begrenst Playwright: één worker onder de grens, anders hooguit vier en nooit meer dan beschikbare
CPU's. Alle e2e-tests, CSP, axe en time-outs blijven behouden. Aanleiding: de lokale run met acht workers op de gedeelde
8-GiB-host eindigde na 10,3 minuten met 67 time-outs/fouten en zeven geslaagde tests; de gewone pre-commitcontrole duurde
tegelijk 422 s. De nieuwe planning is op de echte configuratie getest; uitvoering in de runner vraagt CI-bewijs, omdat
`playwright.config.ts` hostcode is (ADR 0044). Een nieuwe planning maakt de oude rode run niet groen.

Vraag bij `node scripts/kit/feiten.mjs` alleen de secties die de taak nodig heeft. De UI-catalogus en TypeScript-compiler
worden pas geladen bij `componenten` of bij een aanroep zonder secties; tekst- en JSON-uitvoer blijven gelijk.

Lokale vergelijking op 25 oktober 2026 (Node 26.11.1, vijf losse processen per versie, `gates --json`): mediaan 426 ms
vóór en 32 ms na uitgesteld laden. Dit is een momentopname. `test/scripts/feiten-lazy.test.ts` bewaakt de vermeden import;
de bestaande feiten- en toolchaintests bewaken de uitvoer en foutafhandeling.

`docs/roadmap-archief.md` bevat historisch bouwbewijs en is net als de actieve roadmap een beschermd gate-pad.
De diff-guard beoordeelt ook verwijderen en weg-hernoemen; CODEOWNERS volgt dezelfde lijst in `.claude/gates.json`.

ADR-nummers worden samen gecontroleerd voor de actieve map en het archief. Verwijderde nummers blijven gereserveerd via
de Git-geschiedenis van de vertrouwde basis. Heeft main een nummer inmiddels gebruikt, werk de branch dan eerst bij.
Alleen het bestaande paar 0039-bestanden blijft een ratchet-afwijking; nieuwe dubbelen worden geweigerd.
Een vervangingsverwijzing eindigt bij een bestaand ADR, zonder zelfverwijzing of cyclus. De besluit-lane accepteert
uitsluitend records die ook door de bestaande registervalidator komen.

De ADR-sectie van `feiten.mjs` gebruikt dezelfde nummerherkenning en reserveert nummers uit het werkmaparchief en de
bekende Git-geschiedenis van HEAD en origin/main. Die nummerreservering voegt geen fictieve documenten toe aan de lijst.
Onleesbare geschiedenis is een fout; haal bij een verse of onvolledige checkout de geschiedenis eerst op.

De app-initialisatie heeft naast geïsoleerde fixtures ook een compatibiliteitsproef met de echte templatebestanden
(`test/scripts/app-init-template.test.ts`). Na initialisatie vindt die proef de oorspronkelijke invoer in de gekoppelde
Git-geschiedenis. CI haalt hiervoor de volledige geschiedenis op; er wordt niets teruggeschreven naar de eigen checkout.

Begin met de taakrelevante secties van `node scripts/kit/feiten.mjs`, bijvoorbeeld `gates specs fase`.
De hoofdsessie bepaalt de route uit framework §8 (ADR 0058). Alleen een beperkte bugfix of heel kleine aanpassing binnen
bestaande functionaliteit/interactie is licht: geen nieuwe ADR/spec/mini-spec of record; uitkomst, scope en bewijs staan
kort in de opdracht/PR. Bij gedragsverandering of -herstel schrijft een aparte tester eerst de regressie; zonder gedrag
geen vaste tester. Daarna bouwer en aparte reviewagent. Nieuwe features, pagina's, interacties en risicowerk krijgen altijd
architect/spec, contract waar nodig, tester, bouwer en afgedwongen onafhankelijke review. Twijfel of scopegroei gaat
volledig. Hergebruik passende feature-specs; een feature vraagt niet automatisch een ADR. Een classificatie geeft geen
extra rechten. Bestaande besluiten, specs, spec-review en negatieve securitytests blijven gelden.
Architect of hoofdsessie schrijft spec of ADR direct met de bedoelde status; de eigenaar merget
(besluit) of sluit de PR (afwijzen). Alleen voor een broncodemandaat (`--path`) bereidt de hoofdsessie een besluitrecord voor:

```sh
pnpm docs:decision docs/specs/voorbeeld.md goedgekeurd --branch feat/voorbeeld --path src/api/app.ts
```

Herhaal `--path` voor exacte bronbestanden. Het record bindt de inhoudsdigest aan repository en bouwbranch; wijzigt de
spec daarna van inhoud, dan vervalt het mandaat en is een nieuw record nodig (ADR 0046 punt 7).
De agent legt document en record in één reviewbare PR voor. Het register in de werkbranch geeft nog geen rechten.

Na eigenaarreview en merge haalt de hoofdsessie `origin/main` op. De bouwbranch neemt het document ongewijzigd over
en registreert de status:

```sh
pnpm docs:status docs/specs/voorbeeld.md goedgekeurd
```

Werkmap en HEAD moeten overeenkomen. Commit de status voordat je een volgende registreert. De eigenaar hoeft geen
YAML-regel te typen. Intrekking van een mandaat: eigenaar
verwijdert of vervangt het record op main; lokaal verversen, CI gebruikt de actuele basis. Een verouderde lokale
basis kan nog oud akkoord zien.

### Gerichte feedback en één volledige lokale eindgate

Developer-stop gebruikt dezelfde typecheck, lint op gewijzigde code en gerelateerde unit-/DOM-tests als Stop.
Daarbij worden de volledige unit-suite en overige `gate:fast`-onderdelen niet bij iedere overdracht herhaald.
De gerichte feedback kijkt naar nog gewijzigde bestanden; voer vóór review ook toepasselijke controles op de
gecommitte branchdiff uit. Geen codewijziging betekent geen feedback, nooit een volledige groene einduitslag.

Pre-push blijft ongewijzigd en start de volledige `pnpm gate:fast`. Alle CI-workflows en vereiste checks blijven
ongewijzigd op iedere PR. Toepasselijke runnerchecks blijven verplicht. Een codewijziging of ongeldige controle-invoer
vraagt nieuw bewijs; geen hergebruik van een oude groene uitslag of generieke cache.

Overdracht bevat alleen doel, toepasselijke spec/contract of verwachte uitkomst uit de opdracht/PR, gewijzigde paden,
open keuzes en echte checkuitslagen. Reviewagent met schone context en leesopdracht bij licht werk; technische isolatie
waar beschikbaar, zonder die isolatieclaim als ze ontbreekt. Dat ontbreken alleen verplicht geen externe of menselijke
reviewer. Zonder aparte agent, of zonder afgedwongen rolscheiding bij volledig werk, voert de eigenaar de ontbrekende
stap uit. De bouwer claimt geen eigen controle als aparte review.

De gerichte feedback volgt ADR 0057; de routegrens en rolkeuze volgen ADR 0058. Eerst de afzonderlijke besluit-PR mergen,
daarna de implementatie. De vertrouwde
hooklader gebruikt main; een branch activeert geen nieuwe rechten. De App, live ruleset en strikte build-proof uit dat
ADR zijn afzonderlijk vervolgwerk en worden door deze hookwijziging niet als gebouwd of actief verklaard.

`test/hooks/lean-workflow.test.ts` bewaakt de gerichte feedback en het blokkeren op type-, lint- en testfouten,
en voert de echte pre-push-config in een tijdelijke repository uit met groene en rode gate-uitvoer.
De bestaande tests in `werkstraat.test.ts` en `werkstraat-script.test.ts` zijn aangepast omdat developer-stop
nu gerichte controles uitvoert; de controle op de git-root uit de payload blijft behouden.

### Feature-lane en mini-spec (ADR 0046)

Een besluit kost één PR: de merge is het besluit. Architect of hoofdsessie zet de statusregel in het voorstel; commitvolgorde,
inhoud na de status en committer doen er niet toe (ADR 0046 punt 7). Zonder record herkent `check-document-status` twee gevallen
(`scripts/kit/lane.mjs`); de samenvatting noemt elk document dat een eigenaarstatus krijgt. Een PR met een eigenaarstatus merget altijd de eigenaar.

**Functionele UI in de template (ADR 0056/0058):** een beperkte fix binnen de lichte grens van framework §8 krijgt geen
nieuwe mini-spec. Noteer de uitkomst, scope en testbewijs kort in de PR, inclusief gewijzigde bestaande UI-tests met reden.
Voor overige functionele UI gebruik je de mini-spec met aanvullend `scope: functionele-ui` in de frontmatter.
Beschrijf het gevraagde gedrag en de acceptatiecriteria en bouw in dezelfde PR; een vooraf gemergde spec en een record met
bronpaden zijn hiervoor niet nodig. De scope omvat bestaande componenten in `src/core/web/ui`, vaste teksten in
`src/core/web/copy`, aansluitende app-UI, UI-tests en gebruiksdocs. Gewijzigde bestaande UI-tests krijgen per bestand een
reden en vervangend bewijs in de PR. Auth, API/contracten, queries, andere core, dependencies, agentinstructies, gedeelde
fixtures en testsetup blijven erbuiten; een gemengde PR volgt de strengste route. De guard meldt de gebruikte uitzondering,
corepaden en bestaande UI-tests voor eigenaarreview. Een app-repository krijgt deze core-uitzondering niet.
Na groene verplichte checks werkt `pnpm docs:status` ook voor de nieuwe UI-mini-spec: het bewijs blijft aan dezelfde
broncommit, repository en geopende PR gebonden. Een gewijzigde implementatie na die broncommit vraagt nieuw bewijs.

- **Overige feature-lane:** app-werk met een mini-spec (`docs/specs/_mini.md`, veld `sjabloon: mini`). Alles mag meewijzigen (ook docs,
  `CHANGELOG.md`, de roadmap en gegenereerde bestanden zoals het schema-snapshot) behalve `src/core`, een pad uit `voorReview`
  (`.claude/gates.json`), een ADR, een gewijzigde of verwijderde bestaande test of migratie, en een tweede document met een eigenaarstatus.
  Een PR bevat hoogstens één nieuwe migratie. Die maakt precies één owner-tabel in `public` volgens `pnpm new:resource`:
  vaste id-, owner_id- en created_at-kolommen, ENABLE en FORCE RLS, vier afzonderlijke eigenaarpolicies met
  `(select app.current_user_id())` en expliciete SELECT/DELETE-grants aan `app_authenticated`. INSERT/UPDATE-grants
  zijn alleen per app-kolom toegestaan. Eenvoudige extra velden mogen text, integer/int, bigint, boolean, uuid of
  timestamptz zijn, eventueel met NOT NULL en een letterlijke default. Indexen bevatten alleen kolomnamen;
  quoted objectnamen, expressies en andere SQL-vormen volgen de framework-lane (`scripts/kit/lane.mjs`). De vaste
  verwijzing naar `better_auth."user" (id)` blijft toegestaan. Een retentionregistratie heeft precies de volgorde
  NO FORCE → één rij voor de nieuwe tabel → FORCE; losse of herhaalde toggles worden geweigerd. De mini-spec heeft de kop
  "Datawijzigingen (met grants)". Een geneste `CLAUDE.md` of `AGENTS.md` valt eruit. Een onbekend pad buiten `gates` en buiten `src/`, `docs/` en `db/` (zoals `.vscode/` of `.mcp.json`) valt eruit. Diff-guard en
  CODEOWNERS blijven gelden voor elk gate-pad in de PR. Het bereik is ruimer dan de letter van ADR 0046 punt 14 (eigenaarbesluit).
- **Besluit-PR (framework-lane):** een of meer ADR's en specs die een eigenaarstatus krijgen (ook `vervangen door NNNN` of `vervallen`, of nieuwe inhoud van een goedgekeurde spec), met hooguit hun eigen records in `.claude/decisions.json` (andere records of `requiredChecks` wijzigen telt niet), zonder code of andere bestanden: alleen documenten in `docs/adr/` en `docs/specs/` die zelf een besluit krijgen, ook geen index of ander document. Wijzigt de inhoud van een spec met een `--path`-mandaat, dan vervalt dat mandaat; code eronder vraagt een nieuw record. Bouwen volgt in een volgende PR.
- Past de PR in geen van beide, dan geldt de strenge route: de status heeft een record op main nodig (ADR 0046, hierboven).

## Ontwikkelen en runnerchecks

`check-core` weigert een core-veranderende merge die een eerder geïmporteerde templateversie terugdraait, ook als de
oudere ouder zelf vertrouwd is of de merge-ouders omgedraaid zijn (`scripts/kit/check-core.mjs`). De controle gebruikt
de gedeelde Git-geschiedenis van beide ouders en `template/main`, zonder extra versieregister. Een template-update
zonder core-wijziging en een nieuwere core met behoud van app-code blijven mogelijk; ontbrekende geschiedenis vraagt
een volledige fetch. Dit bewaakt core; het vervangt de inhoudelijke review van app-code niet.

Het rolhek reserveert PR-creatie en schrijvende `gh api`-opdrachten voor de hoofdsessie; inline GraphQL-queries
blijven voor subagents leesbaar, oncontroleerbare GraphQL-invoerbestanden niet. `pnpm format` en `pnpm run format`
vragen de hoofdsessie expliciet akkoord omdat ze ook beschermde bestanden schrijven; subagents gebruiken gerichte
formattering. De padcontrole volgt bij cp/mv/ln/install ook `-t` en `--target-directory`.
`git update-ref --stdin` (ook afgekort) wordt geweigerd omdat de te wijzigen refs niet in de opdracht staan.
Dit sluit bekende omwegen; de bestaande sandbox en CI blijven nodig voor niet-geclassificeerde programma's.

Een geldig broncodemandaat geeft alleen de bekende developer toegang tot genoemde beschermde bronbestanden.
Core kan uitsluitend in de template zelf worden ontwikkeld. App-uitbreidingen blijven via registratie en app-code
lopen. Tests en bewaking houden hun bestaande bescherming.

Bij een weigering meldt de developer commando/bestand en werkelijke rolhekreden als onvoltooid. De hoofdsessie
verwerkt de grens of vraagt een concrete scope-uitbreiding. Een blokkadetekst schakelt de groen-eis niet uit.

De bestaande runner start zijn eigen verse teststack; hiervoor hoeft de eigenaar geen dev-stack te starten.
Zo draait hij (ADR 0044): `scripts/runner.sh` roept compose aan met vaste argumenten: alleen `compose.yaml`, een eigen
projectnaam, `--env-file db/test.env` en `--profile test` (`scripts/runner.sh:91`), nooit `.env`, `.env.local` of een
override. Het anker `x-runner` (`compose.yaml:9`) zet de container op `read_only`, `cap_drop: [ALL]` en
`no-new-privileges`, mount de repo read-only met één uitvoermap `.runner-output`, houdt `/tmp` (ook de caches,
`RUNNER_CACHE_DIR`) in tmpfs en hangt hem alleen aan het interne netwerk `test-net` (`compose.yaml:231`). Vooraf weigert
`check_host_files` bij afwijkende hostbestanden (`HOST_FILES`, `scripts/runner.sh:15`). `test/isolatie/runner.int.test.ts`
bewijst de isolatie: geen internet, geen route naar de host, `postgres` geweigerd en een read-only repo.
`pnpm test:db`, `pnpm ui:check` en `pnpm gate:slow` mogen automatisch bij `autoRunner` op main en onveranderde
hostbestanden. Start ze vanuit de repositoryroot; een package in een submap krijgt geen automatische hosttoestemming.
Alleen de exacte opdrachten krijgen expliciete toestemming, zonder extra argumenten, environment-
overrides of samengestelde shellopdracht.

`pnpm pr:verify` weigert een vuile werkmap, behalve ongetrackte bestanden onder `werkmapNegeer` in `.claude/gates.json`
(uit `origin/main`, nooit uit de werkmap; `scripts/kit/pr-verify.mjs`, ADR 0045 punt 23). Een getrackte wijziging onder zo'n
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
Bij CodeQL telt ook de aparte `CodeQL`-resultaatcheck van GitHub Advanced Security mee: een geslaagde analysejob kan
bevindingen hebben. Een rode, lopende of nog ontbrekende resultaatcheck geeft geen groen oplever- of bouwbewijs.
Met `--watch` maximaal 30 minuten wachten; een deadline is onvoltooid, daarna controleert de agent opnieuw.
Een veranderende PR of werkmap vraagt nieuwe verificatie.

De hoofdsessie kan een documentatie-PR markeren:

```sh
pnpm pr:label-gate 123
```

Dit is administratie. `gateMarker: docs` op main beperkt het tot documentatie; `all` kan uitsluitend na een nieuw
eigenaarbesluit worden ingesteld. De helper zet geen review of check-status. Directe labelschrijfacties blijven
verboden. Diff-guard behoudt label én eigenaarreview op de uiteindelijke head-SHA, met de overgang uit ADR 0045 punt 17.

Bij afgeronde implementatie en groene verplichte checks registreert de agent:

```sh
pnpm docs:status docs/specs/voorbeeld.md gebouwd --pr 123 --roadmap
```

Schrijft alleen de statusregel met PR en gevalideerde bron-SHA, en met `--roadmap` het vinkje van het item dat de spec noemt. Commit en push de administratie, controleer CI opnieuw.
De guard mag de groene broncommit gebruiken als de latere diff uitsluitend statusregels en het vinkje van de eigen taak wijzigt. Inhoud, code, tests
of configuratie wijzigen vraagt nieuw bouwbewijs. Gebouwd vereist geen merge. ADR's hebben geen gebouwd-status:
implementatiebewijs hoort bij hun gekoppelde spec.

`vervallen` of `vervangen door NNNN` schrijft de architect of hoofdsessie in een besluit-PR; de merge door de eigenaar beslist.

## Invoering en runtime

Zonder record op main geeft het register geen taakmandaat. De invoering is gebeurd (#130, #144): de guard staat op main en
helpers en taakrechten worden vanuit main actief; werkbranchconfig activeert geen automatische runner of ruimere labelscope.
Een wijziging aan die guard zelf vraagt, zolang hij nog niet op main staat, eigenaarreview vóór merge.

Claude Code gebruikt de geteste hooks. Codex en andere runtimes draaien ze niet automatisch: volg dezelfde procedure
en meld ontbrekende lokale rolgrenzen. Een subagent met dezelfde rechten als de hoofdsessie is geen afgedwongen
onafhankelijke reviewer. Bij lichte fixes volstaat een aparte agent met leesopdracht zonder die isolatieclaim;
bij volledig werk verzorgt de eigenaar de ontbrekende onafhankelijke stap vóór samenvoegen. De agent merget nooit.

## Bekende beperkingen

- De automatische runner draait ook door de agent geschreven tests buiten de sandbox, zonder prompt (het gat uit ADR 0044).
  De hostbestanden in `rails/hooks/lib/runner-authority.mjs` en `scripts/runner.sh` zijn de enige controle vooraf: scripts,
  packagebestanden, compose en de configs van vite, vitest en playwright. De testbestanden zelf horen daar niet bij; die vraagt
  de agent juist te mogen toevoegen en draaien.
- De hooks lezen de vertrouwde basis uit de lokale ref `origin/main` en doen geen netwerkwerk. Het rolhek weigert elke andere
  manier om die ref of de remote `origin` te veranderen dan `git fetch origin` (`movesTrustedBase` in `rails/hooks/lib/rolhek.mjs`).
  Een commando buiten de hooks, of een andere runtime, valt daar niet onder; de CI-guard leest `main` bij GitHub en is de echte grens
  (`scripts/kit/check-document-status.mjs`).

## Gate-PR in de overgang

Is de auteur van een PR zelf goedkeurder, dan geeft `diff-guard` de uitslag `overgang` (groen met waarschuwing;
[ADR 0045](../adr/0045-railwerk.md) punt 17). Dan:

1. Lees de samenvatting van `diff-guard` (de geraakte gate-paden, bewaakte sleutels, gewijzigde tests en het Risico-overzicht: nieuwe, gewijzigde of hernoemde migraties, permissiesleutels, elke tekstwijziging in een contractbestand onder `src/shared/contracts/**` (elk bestandstype, ook alleen commentaar of witruimte; `permission:` oud → nieuw waar eenduidig, anders "controleer permissie met de hand"; buiten het overzicht vallen verwijderde bestanden, hernoeming uit `contracts/` (een hernoeming naar `contracts/` telt als nieuw), `*.spec.*`-bestanden en permissiewaarden uit een bestand buiten `src/shared/contracts/**`), nieuwe dependencies en nieuwe routes (op method en path of contract)) en de uitslag van
   `document-status` (een eigen job in `.github/workflows/guard.yml`, ADR 0045 punt 20; een fout staat als `::error title=document-status::`).
2. Een label `gate-wijziging` of een review is niet nodig; een review is ook niet mogelijk, want GitHub laat de auteur zijn
   eigen PR niet goedkeuren. De eigenaar merget zelf.
3. Is `document-status` rood, merge dan niet: laat de oorzaak herstellen.

## Correctie aan een geaccepteerd ADR

Een geaccepteerd ADR herschrijven of een ADR met een eigenaarstatus op main verwijderen mag alleen in een besluit-PR (alleen `docs/adr/`,
`docs/specs/` en het record), door architect of hoofdsessie. Een vervallen of vervangen ADR verandert niet van inhoud, en geen ADR gaat terug
naar `voorgesteld` of wordt hernoemd: guard en rolhek (dat vergelijkt met main) weigeren dat (A4, ADR 0046 punt 2). Kies het spoor naar wat
er verandert ([ADR 0045](../adr/0045-railwerk.md) punt 21):

1. **Normatief** (wat besloten is): herschrijf het bestaande ADR in een besluit-PR, met een nieuwe herzieningsregel
   `Herzien: JJJJ-MM-DD (#NNN): wat` (bestaande datum, het PR-nummer, wat er verandert; oude regels blijven staan). Een nieuw ADR
   alleen voor een onderwerp dat in geen bestaand ADR past; `vervangen door NNNN` op het oude mag in dezelfde PR, zonder record.
   Een oud ADR verwijderen mag in een besluit-PR nadat een reviewer heeft bevestigd dat de inhoud volledig in het nieuwe staat.
   De guard eist dat een nieuwe herzieningsregel deze PR noemt, dat een verwijderd nummer nooit terugkomt, en dat na een
   verwijdering elke `vervangen door NNNN` nog naar een bestaand ADR wijst; `docs/adr/archief/` telt daarbij mee als doel en
   als verwijzer, en een nummer dat alleen nog in het archief staat blijft bezet (`scripts/kit/check-document-status.mjs`).
2. **Verwijzing naar een later ADR**: een ADR-link achter de statuswaarde, met alleen het nummer als linktekst en het
   bestand ernaast als doel (zoals `0045` naar het bestand van ADR 0045). Geen record nodig; de eigenaar ziet het in de gate-PR.
   Achter de statuswaarde mag verder alleen `(JJJJ-MM-DD)` en `#<nr>`, gescheiden door `, ` of ` — ` (punt 22,
   `statusregelOvertreding` in `rails/hooks/lib/document-state.mjs`); anders is `document-status` rood. Een ongewijzigde regel
   op main blijft geldig.

Een niet-normatieve tekstcorrectie (taalfout, kapotte link) heeft geen eigen spoor meer: ze verdwijnt bij de volgende vervanging.
