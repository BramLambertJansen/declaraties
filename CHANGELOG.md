# Changelog

Hier staan wijzigingen die van belang zijn bij het gebruiken of bijwerken van de template. Releaseversies volgen zodra de template releases krijgt. Oudere bouwstappen en reviews zijn terug te vinden in Git en de pull requests.

## [Unreleased]

### Toegevoegd

- Leerlus van app naar template (ADR 0059, spec `docs/specs/leerlus.md`): een generieke les uit een app gaat als issue met
  label `leerpunt` naar de template-repo, via het formulier `.github/ISSUE_TEMPLATE/leerpunt.yml` en de leerpuntstap in de
  skill `opleveren` (Opruimen stap 8). De reviewer markeert per blokkerende bevinding `Leerpunt: ja (<soort>)` of `nee`.
  Het rolhek laat de hoofdsessie `gh issue create` zonder vraag alleen doen naar `onderhoud.repository` met precies één
  `--label leerpunt` (anders ask); subagents krijgen deny op schrijvende `gh issue`-opdrachten. De eigenaar maakt het
  label aan en triageert. Het rolhek leest het gh-subcommando zoals gh zelf (optiewaarden overgeslagen): `gh issue new`
  telt als `create`, en leesopdrachten als `gh issue list --search create` krijgen geen deny meer.

- Browser-smoke van de productie-SPA: de CI-job `image` opent `/` en `/admin/accounts` uit de gebouwde image in Chromium,
  zonder database. Dat bewijst dat de bundel laadt en dat router en foutscherm renderen; de smoke faalt op een
  CSP-schending, een ongevangen JS-fout, een mislukte asset of een `console.error` buiten mislukte `/api/`-requests en
  de door de ErrorBoundary gevangen serverfout (`ApiError` met status ≥ 500).
  Een crash in een specifiek scherm (bv. login) valt erbuiten (`e2e/prod-spa.smoke.spec.ts`,
  `playwright.smoke.config.ts`). Lokaal met `SMOKE_BROWSER=1 scripts/check-image.sh <image>` na `pnpm install`; zonder die
  variabele doet het script hetzelfde als voorheen. De gewone e2e (`playwright.config.ts`) slaat `*.smoke.spec.ts` over.
  De smoke-container leest alleen een tijdelijke projectie van smokebronnen en configuratie, met dependencies apart
  alleen-lezen. Privébestanden en Git-metadata blijven erbuiten; symlinkbronnen worden geweigerd en de projectie wordt
  ook bij fouten opgeruimd (`docs/operations/runner-invoer.md`).

- DateInput behoudt de native kalender als `showPicker` ontbreekt of wordt geweigerd. De extra kalenderknop verschijnt
  bij een beschikbare showPicker-functie; een geweigerde aanroep herstelt de native indicator en behoudt waarde en focus.

- De snelle gate laat lint en tests bij weinig geheugen na elkaar draaien. Alle bestaande controles en
  faalvoorwaarden blijven gelden; met voldoende geheugen blijven de drie parallelle banen beschikbaar.
  Weinig is minder dan 6 GiB beschikbaar, op macOS een host met hooguit 8 GiB;
  `GATE_WEINIG_GEHEUGEN=1|0` beslist voor de host (`scripts/kit/geheugen.mjs`).
- Dezelfde geheugengrens begrenst browserworkers tot één bij weinig ruimte; anders de helft van de CPU's, hooguit vier.
  Een runner met 4 vCPU draait daardoor twee in plaats van vier workers.
  De volledige e2e-suite, toegankelijkheidscontroles en time-outs blijven gelden.

- De Stop-feedback van de developer controleert ook code die de branch al heeft gecommit (schone werkmap), respecteert
  `stop_hook_active` en toont per rode controle een eigen deel van de uitvoer (`rails/hooks/lib/werkstraat.mjs`).
- `check-docs` vangt een open vraag ook met `⚠️`, in hoofdletters en zonder opsommingsteken, en weigert een
  `.md`-bestand in `docs/adr/` dat niet `NNNN-slug.md` heet (README.md en `_`-sjablonen uitgezonderd). Bij een update:
  hernoem een afwijkend ADR-bestand.

- De feitenopdracht laadt de UI-catalogus alleen wanneer componentinformatie wordt gevraagd. Gerichte vragen over
  gates, ADR's, specs, migraties, routes, permissies, foutcodes en fase starten zonder de TypeScript-compiler te laden.

- De SQL-feature-lane laat alleen één migratie met één owner-tabel volgens het generatorpatroon toe. Owner-policies,
  ENABLE/FORCE RLS en grants worden expliciet gecontroleerd; quoted objectnamen, brede schrijfgrants, meerdere tabellen
  en ongeldige retentionvolgordes gaan naar de framework-lane. Afwijkende SQL blijft mogelijk via de bestaande zwaardere
  reviewroute (`scripts/kit/lane.mjs`, `docs/operations/agent-doorloop.md`).

- `check-core` weigert een oudere core via een vertrouwde template- of app-main-merge, ook bij omgedraaide ouders.
  Git-geschiedenis bepaalt welke templateversies al geïmporteerd zijn; er komt geen extra versieregister bij.
  Een geldige nieuwere update en een merge zonder core-wijziging blijven toegestaan (`scripts/kit/check-core.mjs`).

- Het rolhek weigert PR-creatie en schrijvende GitHub-API-opdrachten door subagents. Brede formattering vraagt
  expliciet eigenaarakkoord via de hoofdsessie; de automatische toestemming voor `pnpm format` is verwijderd.
  De Git-padcontrole herkent `--target-directory` en weigert ondoorzichtige refmutaties via `git update-ref --stdin`.
  Voor elke rol zijn ook `env -S`, git-aliassen met `!` of via `--config-env`, xargs/find `-exec` met `gh` en
  `pr merge` zonder herkenbaar `gh` dicht (`rails/hooks/lib/rolhek.mjs:516`, `:589`, `:779`, `:985`). Gebruik
  `git commit -F <bestand>` en `gh pr create --body-file <bestand>` in plaats van `$(…)`/heredoc in het bericht.
  Ook dicht: `env -S` na optiewaarden (`-u NAAM`, `-C MAP`) of in een cluster (`-vS`), `pr review … --approve` zonder
  herkenbaar `gh`, en xargs/find `-exec` met een omhulsel (`env`, `nice`, `timeout` …), een shell of `git`. Een argument
  met `pr merge` (ook `grep 'pr merge'`) weigert het rolhek nu ook voor de hoofdsessie; gebruik `-F`/`--body-file`.
  Met een los `gh` in de tekst is `pr review` voor elke rol dicht, ook zonder `--approve` en achter een omhulsel
  (`env -i gh pr review …`, `setsid`, `timeout`); `-a` telt ook vooraan een cluster (`-ab`, `-aF`). Nog open voor de
  hoofdsessie: omhulsels met opties vóór gh (label, `@file`, `gh alias`) en xargs-optiewaarden (`docs/roadmap.md`).
  Een leeg woord vóór de gh-groep (`gh "" api …`) verbergt het subcommando niet meer (`rails/hooks/lib/rolhek.mjs:1269`).

- Het roadmaparchief valt onder de beschermde gate-paden en CODEOWNERS, ook bij verwijderen of weg-hernoemen.

- Documentcontroles bewaken ADR-nummers in actieve bestanden, archief en verwijdergeschiedenis, ook als main sinds het
  aftakken verderging. De historische dubbele 0039 geeft geen vrijstelling voor nieuwe dubbelen. Vervangingsketens mogen
  geen cycli bevatten; de besluit-lane valideert het volledige besluitregister. Genummerde open vragen en onjuiste
  bronvoorbeelden blokkeren nu eveneens een goedgekeurde spec.

- De initialisatietests controleren ook de echte README, CHANGELOG, appnamen, CODEOWNERS en gateconfiguratie. De proef
  blijft werken na initialisatie van de checkout en detecteert incompatibele wijzigingen aan de template-invoer.

- De resourcegenerator vraagt ook een tweede create-sample voor echte cursorpaginering. De securitysuite weigert een
  ontbrekend sample en gelijke create-ID's. Resourcemetadata kiest de toegestane rol voor A en B, inclusief admin met MFA.
  Bij een update: geef elke regel in `test/security/resources.ts` een `sample.createTweede` (anders is `pnpm test:db`
  rood) en een `rol` als de resource niet voor `user` is (standaard `user`).

- De componentskill verwijst naar de verplichte catalogusdekking voor alle componenten en eindige varianten. De oude
  aanwijzing om een uitzondering in het controlescript te maken is verwijderd; die mogelijkheid bestaat niet.

- De testrunner ziet een tijdelijke selectie van bronbestanden in plaats van de hele werkmap. Privébestanden en
  Git-metadata blijven erbuiten; symlinkomwegen worden geweigerd. Worktrees krijgen ieder een eigen testprojectnaam.

- `withUser()` onderscheidt bevestigde commit, bevestigde rollback en onbekende uitkomst via de optionele
  `onTransactionOutcome`. Bij een verloren COMMIT-bevestiging wordt de verbinding vernietigd en draait route-cleanup
  geen gecommitteerde gegevens terug. Alleen bevestigde rollback staat compensatie toe, ook voor laat geregistreerde
  acties. Herstel en de gevolgen voor eigen `WithUser`-implementaties staan in `docs/operations/transactie-uitkomsten.md`.

- Ook idle database- en readiness-poolfouten gebruiken de veilige logmetadata. SQL, persoonsgegevens, detail en cause
  worden niet meer uit het foutbericht overgenomen; SQLSTATE en de vaste waarschuwing blijven bruikbaar. Een logfout
  beëindigt het proces niet.

- Optionele MFA-inschrijving binnen een bestaande sessie ververst de laatste-loginhistorie niet. De eerste verplichte
  MFA-inschrijving van een beheerder blijft zijn login voltooien.

- Het spec-skelet van `pnpm new:resource` volgt `docs/specs/_template.md`: sectie "Kopieer de vorm van" (verwijzing naar `src/api/routes/accounts.ts`) en een `OV-1 ⚠ open`-regel onder "Open vragen", zodat een gegenereerd voorstel niet ongemerkt als besluit kan doorgaan (`scripts/kit/templates/spec.md.tmpl`). De status blijft `voorstel`.

- Het rolhek berekent het runnervertrouwen (`trustedRunner`, enkele git-aanroepen) alleen nog wanneer een Bash-opdracht een automatische runner is, en hoogstens eens per hookaanroep; de beslissing blijft fail-closed (`rails/hooks/rolhek.mjs`, `rails/hooks/lib/rolhek.mjs`).

- De skill `security-review` draait als aparte, read-only `reviewer`-subagent (`context: fork`, `agent: reviewer`; read-only via de toolslijst van de agent en het rolhek) en heeft extra controlepunten voor MFA en sessiesterkte, IDOR, auditregels, rate limits en tokenflows (`.claude/skills/security-review/SKILL.md`, `test/rails/security-review-skill.test.ts`).

- Onverwachte fouten in `createApp` en de route-cleanup worden gelogd via `logUnexpectedError()` (`src/core/api/http/safe-error-log.ts`) met alleen requestId, route, errorClass, code en label.
  Het foutobject zelf (message, SQL, parameters, detail, stack, cause) gaat niet meer naar de log; zie framework §6.
  Voor een app: de logregel op stderr heeft een nieuwe vorm, wie op het foutbericht zocht vindt dat niet meer; zoek op requestId.
  Niet gedekt: de eigen foutlog van Better Auth onder `/api/auth/*`.

- CI-bewijs controleert bij CodeQL ook de afzonderlijke resultaatcheck van GitHub Advanced Security op dezelfde commit.
  Een geslaagde analysejob met een bevinding, of een nog ontbrekend resultaat, wordt niet meer als groen oplever- of bouwbewijs geaccepteerd.

- Functionele UI-wijzigingen aan bestaande componenten in de template kunnen met `scope: functionele-ui` in hun
  mini-spec, code, tests en gebruiksdocs in één PR (ADR 0056). Geen voorafgaand broncodemandaat; groene checks en
  eigenaarreview blijven vereist. Andere core, auth, dependencies, agentinstructies en bewaking houden hun bestaande route.

- Spec-discipline: `check-docs` weigert een lijstitem met `⚠ open` in "Open vragen" (ook een kop als "Open vragen voor de eigenaar") van een goedgekeurde of gebouwde spec (`docs:<spec>:open-vraag`) en een niet-bestaand pad (een `:regel` of `:van-tot` erachter telt niet mee) in "Kopieer de vorm van" bij voorstel of goedgekeurd (`docs:<spec>:vorm`; `scripts/kit/check-docs.mjs`). Beide secties staan in `_template.md` en `_mini.md` (geen verplichte mini-kop); de architect en de spec-skill hebben een afsluitcheck, de reviewer een spec-review-modus vóór de besluit-PR, of bij een mini-spec vóór het bouwen (framework §8 stap 1); de afsluitcheck draait `pnpm ratchet`, en `opleveren` sluit af met de vraag wat sjabloon, gouden pad of een check moet leren. Bij een update: vervang in eigen specs `⚠ open` door een besluit of aanbeveling vóór `goedgekeurd`.

- Laatste volledig geslaagde login in de accountlijst en afzonderlijk deactiveren/activeren naast blokkeren/deblokkeren
  (ADR 0052). Beide maatregelen behouden gegevens, trekken toegang direct in en zijn onafhankelijk omkeerbaar.
  Herstel maakt oude sessies en MFA-challenges niet opnieuw geldig; de laatste bruikbare beheerder blijft beschermd.

- Generieke securitysuite (spec `docs/specs/security-suite.md`): `test/security/` controleert elke route uit het register (rechten per rol, foutvorm) en elke owner-tabel uit `test/security/resources.ts` (A-tegen-B, spoof), en `db/tests/security.sql` legt C1–C3 vast voor elke tabel en policy; draait in `pnpm test:db`. `pnpm new:resource` drukt voortaan de declaratie voor `test/security/resources.ts` af, met de samples als `INVULLEN` (`scripts/kit/new-resource.mjs`). Bij een update: declareer elke eigen route en owner-tabel in `test/security/resources.ts`, anders is `pnpm test:db` rood.
- Op het inlogscherm kan de gebruiker het wachtwoord tonen en weer afschermen met een toegankelijke toggle. De ingevoerde waarde blijft behouden; na opnieuw laden is het veld weer afgeschermd (`src/web/features/login/login-page.tsx`, `docs/login-password-visibility.md`).
- Bewaarcatalogus `app.retention` met `app.retention_cutoff()` (migratie `20261019120000_retention.sql`): elke tabel in `public` en `app` krijgt een termijn, een invariant bewaakt dat. Verlopen regels in `app.audit_log` (ouder dan 1 jaar) en `app.rate_limits` mogen door `app_definer` worden verwijderd; update en truncate op de audit log blijven geweigerd. Bij een update: een nieuwe eigen tabel heeft een rij in `app.retention` nodig.
- `pnpm new:resource` registreert voortaan de nieuwe tabel in de bewaarcatalogus `app.retention` (migratie-template); de feature-lane laat die rij en de tijdelijke FORCE-toggle toe (de laatste toggle moet `force` zijn). Bij een update: bestaande eigen migraties van nieuwe tabellen hebben een rij in `app.retention` nodig (zie `scripts/kit/templates/migratie.sql.tmpl`).
- De schemagenerator (`pnpm db:generate`) ondersteunt nu ook de kolomtypes `regclass` (als `text`) en `interval`; andere onbekende types blijven falen (`scripts/db/schema-source.mjs`).
- **Eigen job `document-status` in `guard.yml` (ADR 0031 PR 2, besluit 1).** `check-document-status` draait niet meer als stap van `diff-guard` maar als aparte job met een eigen naam in de checklijst en een `::error title=document-status::`-annotatie; `NIET_VERPLICHT` in `test/scripts/github-ruleset.test.ts` bevat de nieuwe job en `test/scripts/guard-workflow.test.ts` bewaakt de veiligheidsstappen van beide jobs. `document-status` staat in `requiredChecks` (`.claude/decisions.json`), zodat `pnpm pr:verify` een rode documentstatus ziet; de eigenaar toonde met `gh api` aan dat de check-run van `pull_request_target` op de head-SHA van de PR staat met app-id 15368 (PR #202: `2f4388b`). Het bouwbewijs eist daardoor ook `document-status` op de bron-SHA (ADR 0031, "Gevolg voor gebouwd").
- **Feature-lane en mini-spec (ADR 0029 punt 1–3, 5 en 7).** `docs/specs/_mini.md` is het korte sjabloon voor een route, permissie of nieuwe tabel (`sjabloon: mini`); `check-docs` eist de vaste koppen (`docs:<spec>:sjabloon`). `check-document-status` accepteert een statusovergang in de PR zelf alleen in een herkende lane (`scripts/kit/lane.mjs`: mini-spec zonder `src/core`, `voorReview`-paden, ADR of gewijzigde bestaande test/migratie (bereik ruimer dan de letter van punt 6: docs, CHANGELOG en het schema-snapshot mogen meewijzigen), of een besluit met hooguit zijn record) en als de statuscommit alleen statusregels wijzigt, er geen inhoud na de status komt en de committer GitHub web-flow is. Een nieuwe migratie moet een nieuwe tabel zijn (`migratieOvertreding`), een hernoemde spec met een eigenaarstatus op main telt niet als nieuw, en het record in de framework-lane mag alleen het eigen record zijn. Elk ander geval blijft de strenge route (record op main). Uitleg in `docs/operations/agent-doorloop.md`.
- **Onderhoudsmodus voor templatewerk (ADR 0033 punt 2–4).** `.claude/gates.json` krijgt `onderhoud: { "repository": "BramLambertJansen/template" }` en `altijdVragen`. Is `origin` die repository (hoofdletterongevoelig) en komt de configuratie uit de vertrouwde basis, dan is een `voorReview`-pad voor hoofdsessie en developer alleen een melding ("noem het in de PR"), behalve `altijdVragen` (`.github/**`, `.claude/hooks/**`, `.claude/settings.json`, `.claude/gates.json`, `.claude/decisions.json`, `package.json`, `pnpm-lock.yaml`). De Edit-regels in `ask` van `.claude/settings.json` zijn nu precies `altijdVragen` (`check-docs` bewaakt dat, en de vorm van `onderhoud`); buiten de modus vraagt het rolhek zelf op `voorReview`. **Vertrouwde basis uit het anker:** binnen een hook lezen het rolhek, het register en de runnercheck hun configuratie uit het anker van de stub-lader (`RAILS_ANKER`), met hashcontrole van commit, trees en blob (`rails/hooks/lib/objecten.mjs`); een omgebogen lokale `origin/main` telt niet meer, en zonder gecontroleerde `.claude/gates.json` faalt het rolhek dicht. Wat verandert voor een app: niets aan de strengheid (andere `origin`, dus geen onderhoudsmodus); zonder prompt-regels op de meeste `voorReview`-paden vraagt het rolhek daar zelf. **Nieuw voor elke rol:** Schrijven in een `.git`-map (remote-URL, refs, objecten) met Edit/Write of met Bash (`sed -i`, redirect, `cp`, `tee`, `dd`, `mv`, `rm`, `ln`) is altijd een deny, ook in de onderhoudsmodus (`test/hooks/rolhek-git-map.test.ts`). `pnpm app:init` haalt `onderhoud` uit `.claude/gates.json` van een nieuwe app en weigert als die regel niet meer te vinden is. De vormcheck van `onderhoud` staat op één plek (`onderhoudVan` in `rails/hooks/lib/rolhek.mjs`, ook gebruikt door `check-docs`). Wat de eigenaar moet doen: niets.

- Gedeelde Claude Code-instellingen: `acceptEdits` als standaardmodus en vooraf toegestane snelle checks, featurebranch-pushes en GitHub-commando's (`.claude/settings.json:4`, ADR 0034). Overgenomen uit eigenaarcommit `4d6c0ab` op de actuele `main`.

- **Hooks draaien van `main` (ADR 0033 punt 1).** De hookbroncode verhuist van `.claude/hooks/` naar `rails/hooks/` (entry's en `lib/`); `.claude/hooks/{rolhek,werkstraat,meting}.mjs` zijn stubs die via `.claude/hooks/laden.mjs` de versie van `main` op de remote draaien. Het anker (`git ls-remote origin refs/heads/main`, ververst bij de start van een sessie) en de cache per tree-oid staan in `.claude/hooks/.cache/` (genegeerd door git, onschrijfbaar voor de sandbox); de cache wordt vóór elke run tegen de blob-hashes gecontroleerd en git draait zonder replace-objecten. Een hookwijziging op een branch werkt pas na de merge; een omgebogen lokale `origin/main` telt niet. Rolhek en werkstraat falen dicht, de meethook open. `rails/**` is een gate- en `voorReview`-pad (CODEOWNERS, `ask`, `*secret*`-leesweigering); scripts en tests importeren uit `rails/hooks/lib/`. Wat verandert voor een app: na de template-merge draait de app de hooks van zijn eigen remote `main`; eigen aanpassingen in `.claude/hooks/lib/` verhuizen mee naar `rails/hooks/lib/`. Wat de eigenaar moet doen: niets; de eerste sessie na de merge legt het anker vast (netwerk nodig).

- Minder prompts op gate-paden (ADR 0029 punt 8, 9 en 18): `.claude/gates.json` kent `voorReview`, de gates met effect vóór review (scripts, CI, hooks, instructies, dependencies, omgeving, check-configs). Alleen daar vraagt het rolhek de hoofdsessie en weigert het de developer; op een ander gate-pad (`docs/adr/`, `docs/roadmap.md`, `src/core/` in de template, `src/api/{kit,server,env}.ts`, `deploy/`, …) meldt het "noem het in de PR". De Edit-regels in `ask` zijn gelijk aan `voorReview` (`check-docs`); CODEOWNERS blijft `gates` + `jsonGates`. `src/api/app.ts` en `src/shared/permissions.ts` zijn geen gate meer; `pnpm new:resource` schrijft ze zelf. Het rolhek leest de lijst uit origin/main, dus de versoepeling werkt pas na de merge. Wat verandert voor een app: minder prompts; een nieuwe permissie of route ziet de eigenaar in het risico-overzicht van de diff-guard.
- Leesbare preflight voor een sessie zonder toolchain: `node scripts/kit/feiten.mjs` (en daarmee de SessionStart-hook) meldt één regel `✗ toolchain ontbreekt: …` als Node buiten de versie uit `mise.toml` valt of de install onvolledig is (`node_modules/.modules.yaml` of `typescript` ontbreekt), in plaats van een stacktrace (`scripts/kit/toolchain.mjs`). `scripts/cloud-setup.sh` geeft bij een mislukte netwerkstap (curl van mise, `mise install`, `pnpm install`) een diagnose (netwerktoegang Trusted, proxy). `docs/ENVIRONMENT.md` beschrijft de vereisten aan het begin van een sessie, de schrijfgrens van de Bash-sandbox op `.claude/` en de opgelegde branchnaam. Wat verandert voor een app: niets.
- Omgeving vastgelegd in code: `scripts/cloud-setup.sh` installeert nu ook `bubblewrap` en `socat` (idempotent, nodig voor de Bash-sandbox) en `docs/ENVIRONMENT.md` beschrijft de opzet. Het omgevingsscript hoeft alleen `bash scripts/cloud-setup.sh` te zijn. Wat verandert voor een app: niets. Wat de eigenaar moet doen: het setup-script van de omgeving vervangen door die ene regel.
- Snellere beslisroute (ADR 0029, geaccepteerd; vervangt ADR 0023): principes P1–P7 (ADR 0029; P1, P3, P4 en P6 kort in `docs/framework.md` §1), ADR-drempel A1–A4, mini-spec en feature-lane als besluit; de roadmap heeft de structuur Nu/Volgende/Geparkeerd, afgedwongen door `check:roadmap` (#162, #164). Inventaris tegen de principes: `docs/reviews/2026-10-15-principes-inventaris.md` (#158–#161).
- `check:roadmap` blokkeert vinkjes en gebouwde specs zonder bewijs (#127).
- Auditlog van beheeracties (ADR 0021, spec `audit-log`): tabel `app.audit_log` met guard-trigger, schrijvers `app.audit` en `app.audit_account_action`, `ctx.audit` en de `requestId` van de server in `withUser()`; uitnodigen, opnieuw uitnodigen, rolwijziging en blokkeren schrijven een regel (#128).
- UI-kit: Checkbox, RadioGroup, Textarea, StatusBadge, EmptyState, `busy` op Button en DropdownMenu en bijbehorende formuliervelden (#145); catalogusvoorbeelden die vindbaar en inspecteerbaar zijn, met staatvoorbeelden (#146); doorzoekbare Combobox, Accordion, List en DescriptionList (#150).

- Risico-overzicht in `diff-guard` (nieuwe, gewijzigde of hernoemde migraties, permissiesleutels, nieuwe dependencies, nieuwe routes op method en path of contract en elke tekstwijziging in een contractbestand onder `src/shared/contracts/**` (elk bestandstype, ook alleen commentaar, opmaak of witruimte; alleen een byte-identiek bestand geeft niets) met de `permission:`-regels uit de ruwe tekst, oud → nieuw waar eenduidig, anders "controleer permissie met de hand"; grenzen: verwijderde bestanden, hernoeming uit `contracts/` (een hernoeming naar `contracts/` telt als nieuw), `*.spec.*`-bestanden en permissiewaarden uit een bestand buiten `src/shared/contracts/**`; puur tekstueel); `check-docs` controleert AC-traceerbaarheid van gebouwde specs; de meethook slaat de modus op en `pnpm meting` toont prompts per modus; `check:roadmap` R1 telt ook ingesprongen open items.

- Meten per sessie en branch (ADR 0029 punt 12): meethook `.claude/hooks/meting.mjs` (observe-only, fail-open, alleen tellingen en sleutels in `<git common dir>/agent-meting/` of `METING_DIR`; buiten een repo niets) op de permissie-, tool-, prompt- en stop-events in `.claude/settings.json` (rij in `docs/framework.md` §8), en `pnpm meting` (`scripts/kit/meting.mjs`, `--json`, `--sessie`, `--branch`) met prompts per pad of commandoprefix, weigeringen, beurten, eigenaarberichten, pushes en CI-rondes (`gh run list` per branch, `METING_GH`/`METING_GH_TIMEOUT_MS`; bij een fout `onbekend`).

- Strikte ADR-statusregel (ADR 0031 besluit 4): `document-status` faalt als een nieuwe of gewijzigde ADR-statusregel achter de statuswaarde iets anders draagt dan `(JJJJ-MM-DD)`, `#<nr>` of `[NNNN](NNNN-<slug>.md)` naar een bestaand ADR (`statusregelOvertreding` in `.claude/hooks/lib/document-state.mjs`). Ongewijzigde regels op main blijven geldig; specs vallen erbuiten. Wat verandert voor een app: een eigen ADR met vrije tekst op een nieuwe statusregel wordt rood; zet die tekst in de body.
- Overgangstekst in `diff-guard` (ADR 0031, PR 1): de samenvatting bij uitslag `overgang` legt uit dat label en review niet gevraagd worden en de eigenaar zelf merget; nieuwe sectie "Gate-PR in de overgang" in `docs/operations/agent-doorloop.md`.

- Skill `opleveren` (ADR 0030, PR 1): CI-lus tot groen met `pnpm pr:verify <nr> --watch` en vaste stopgronden, en opruimen na de merge (`main` fast-forward, lokale en remote branch weg). Het rolhek weigert `git branch -d/-D` van `main`. De merge blijft bij de eigenaar; een agent-modus volgt in PR 2.

- Taakmandaat-vervolg (spec `taakmandaat-vervolg`): binnen een taakmandaat mag alleen het vinkje van het roadmap-item van de eigen spec meewijzigen, `pnpm docs:status <spec> gebouwd --pr <nummer> --roadmap` zet status en vinkje samen, een spec naar `gebouwd` heeft één bewijsvorm (`status: gebouwd # #<PR>; gevalideerd: <sha>`) en `scripts/runner.sh` weigert genegeerde en onveilige hostpaden.

- Taakgebonden frameworkontwikkeling en bewijsgebonden ADR/spec-statusadministratie (ADR 0027), met controle vanuit main. De agent verzorgt veilige runnerchecks, verzamelt CI-bewijs en kan documentatie-PR's administratief markeren; inhoudelijke besluiten en merge blijven van de eigenaar.

- `check-docs` weigert twee ADR's met hetzelfde nummer. De ADR over de volledige UI-catalogus is hernummerd naar 0028 (ADR 0027 is het taakmandaat). `PageHeader` heeft een eigen `preview`-prop naast `documentTitle`.

- Een React-webapp en Hono-API met een aparte core- en app-laag.
- Inloggen, uitnodigingen en tweestapsverificatie met Better Auth. Beheerders kunnen accounts bekijken, rollen wijzigen en uitnodigingen opnieuw versturen.
- Postgres-migraties, row-level security en tests voor datatoegang.
- Een UI-kit met componentcatalogus, formulieren, bevestigingsdialogen en toegankelijke navigatie.
- Een lokale omgeving met Postgres en Mailpit, installatie- en diagnosecommando's en demoaccounts.
- Een resourcegenerator die eerst een featurespec maakt en na goedkeuring een implementatieskelet. De handlers moeten nog worden ingevuld. De gegenereerde lijst heeft zoeken en sorteren in de URL.
- Een setup-playbook en hernoemscript voor nieuwe apps. Template-updates gebruiken merge-commits om de geschiedenis te behouden.
- Requestlogging, health- en readinessroutes, gecontroleerd stoppen en een containerimage voor de webapp en API.
- Controles voor codekwaliteit, architectuur, migraties, database- en schermgedrag, kwetsbaarheden en secrets, lokaal en in GitHub Actions.
- Accounts blokkeren en deblokkeren (ADR 0026): een geblokkeerd account is direct overal uitgelogd en kan niet inloggen; de laatste telbare beheerder kan niet geblokkeerd worden.
- Toasts in de basiskit: `useToast().success/error` met een `Toaster` in de AppShell, beleefd voorgelezen bij succes en direct bij een fout. `ToastProvider` staat in `src/web/main.tsx`; zonder provider gooit `useToast`. Een toast verschijnt alleen waar een `Toaster` staat (de AppShell), dus niet op schermen in `CenteredCard`.
- Uitgewerkte roadmaptaken voor de verdere ontwikkeling van de starter.

### Gewijzigd

- Nieuwe app starten is ook te volgen zonder technische kennis: `START-NIEUWE-APP.md` heeft een sectie Begeleiding
  (één eigenaarstaak tegelijk, met wat je ziet en hoe je meldt dat het gelukt is) en eenmalige Windows-stappen om
  Ubuntu en Claude Code te installeren. Het playbook (`docs/nieuwe-app.md`) maakt nieuwe app-repo's standaard public
  (voorlopig; private vraagt Pro/Team en betaalde code scanning) en sluit af met een openingsopdracht voor de nieuwe
  sessie in de app-map in plaats van featurewerk in de setupsessie.

- Subagents verliezen GraphQL en elke schrijvende gh-aanroep. Het rolhek laat hen bij GitHub alleen lezen:
  `gh pr view/diff/checks/list/status`, `gh run view/list/watch`, `gh issue view/list`, `gh repo view` en `gh api`
  REST-GET met alleen `--jq`, `--paginate`, `--include`, `--silent` of een Accept-header. Ook `git credential`,
  curl/wget met een token, configbestand, headerbestand of `$`-argument, `pnpm lint --fix`, brede
  prettier/eslint-schrijfacties, `eval`, `source`/`.` en een shell zonder scriptbestand weigert het hun. Een grove regel
  op de ruwe commandotekst (heredocs inbegrepen) laat bij tekst met `gh`, `api.github.com` of `git credential` alleen
  één direct gh-leescommando zonder shell-trucs toe (`$(`, backtick, `eval`, `source`, brace-expansie, pipe naar een
  shell, heredoc). Bewust vals positief: `grep gh x`.
- De regel op de ruwe tekst werkt op een genormaliseerde tekst zonder `\`, `'` en `"`, zodat `g\h`, `g""h` en `mer''ge`
  meetellen, en kijkt nu ook naar `api.github.com` en `graphql` (ook `mergePullRequest`, `enablePullRequestAutoMerge`
  en `mergeBranch` via curl). Een commandowoord dat niet letterlijk is (`$CMD …`, `${x}h …`, `$(echo ls)`, een glob als
  `g[h]`, `{…}` of een `~` vooraan, na een sleutelwoord als `!`/`if`/`while` of een omhulsel als `env`/`nice`/`time`/`sudo`
  moet elk woord van het segment letterlijk zijn (bewust vals positief: `time ls *.md`), en achter xargs of find `-exec`). Een glob op welke
  positie ook die naar `gh` of `gh.exe` kan wijzen (`/usr/bin/g[h]`, `g?`), brace-expansie (`g{h..h}`, `{g,x}h`) en POSIX-klassen
  (`[[:alpha:]]`, `[[=h=]]`) zijn los van elke lijst omhulsels dicht (bewust vals positief: `echo {a,b}`, `echo {1..3}`,
  een `--jq`- of JS-object met een komma), een variabel woord na het commandowoord (`${G}h`, `$G`) in een opdracht met
  een gh-subcommandowoord als `pr`, `api`, `run` of `merge` (bewust vals positief: `echo $HOME run`); met een geëxpandeerd argument (`$X`, `$(…)`) mag alleen een programma uit een
  vaste lijst (`echo`, `cat`, `ls`, `cp`, `rm`, `grep`, …; niet `sed`/`awk`, die zelf een commando kunnen uitvoeren), anders deny voor subagents en ask voor de hoofdsessie (`git diff
  $BASE`); en `eval`/`bash -c`
  met expansie zijn voor elke
  rol dicht; subagents gebruiken geen xargs met een commando en geen find `-exec`. Bewuste valse melding: een PR-titel of -body met het woord `merge ` als argument; gebruik `--body-file` en
  een titel zonder dat woord. De inhoud van `$(…)` en backticks wordt recursief gecontroleerd; `gh` telt alleen als los
  woord (niet in `gh-notes` of een testpad). Bewuste valse melding: een commitbericht met `merge` naast `gh`, `graphql`
  of `/pulls/`; gebruik `git commit -F <bestand>`. Scripts in de repo en interpreters blijven open; de harde grens is GitHub zelf (ruleset en
  eigenaarmerge).
- De hoofdsessie mag nog: PR's maken, lezende GraphQL-queries (ook met variabelen als `query($n:Int!)` binnen enkele
  aanhalingstekens), REST-aanroepen, `gh pr view --json state,mergedAt,mergeCommit` en `git merge` zonder gh. Ze mag
  niet meer: `gh -R/--repo` gebruiken om de merge- en reviewregels te omzeilen, `gh alias set/import` of een onbekende
  gh-groep (mogelijk een alias) gebruiken, `gh api` aanroepen met een niet-letterlijke GraphQL-query (`$(`,
  shell-variabele, `@file`, `--input`) of met een schrijvende methode naar een onleesbaar endpoint (ook via `-iX PUT`,
  `/graphql` of een volledige URL), en in tekst met `gh` of `/pulls/` `merge` als commando- of endpointwoord,
  `review --approve` of `/reviews` met `APPROVE` gebruiken, ook in `{ …; }`, `if` of `$(…)`. `pnpm format` vraagt ook na
  pnpm-opties akkoord. Het rolhek is een vangnet: `node -e` en andere interpreters blijven open; de harde grens blijven
  CI, de diff-guard en de GitHub-ruleset (`rails/hooks/lib/rolhek.mjs`, `rails/hooks/lib/shell.mjs`,
  `test/hooks/rolhek-gh-allowlist.test.ts`).
- De vertraagde zoekactie van `ListToolbar` gebruikt de actuele callback. Een ouderwijziging tijdens de wachttijd
  laat de zoekactie geen verouderde filter- of sorteertoestand meer terugschrijven; de bestaande 300 ms blijven gelijk.

- Een laat sluitende `EditableSection` trekt focus niet meer weg uit een ander veld of een andere knop. Het gewone
  focusherstel naar Bewerken en het opruimen van de uitgestelde focustimer blijven behouden.

- Succes-toasts uit een mount-effect krijgen ook tijdens de eerste render en in StrictMode een werkende afteller.
  Bestaande aftellers blijven doorlopen wanneer er een melding bijkomt; hover-/focuspauze, blijvende fouten en de
  bestaande termijn van vijf seconden veranderen niet.

- Uitgeschakelde `Button asChild`-links blokkeren nu ook activering en geven `aria-disabled` door. De middelste
  muisknop kan niet meer langs de blokkering van een disabled of busy linkknop gaan. Link, label en normale bediening
  na herstel blijven behouden; de bestaande component-API verandert niet.

- De web-ingang zet zod vóór schema-initialisatie op `jitless` (`src/core/web/lib/zod-config.ts`, als eerste import in
  `src/web/main.tsx`). `package.json` bewaart die module als `sideEffects`, zodat de productiebuild de configuratie niet
  wegoptimaliseert. Een echte geminificeerde bundeltest controleert schema-validatie zonder poging tot codegeneratie;
  de bestaande CSP blijft gelden. Gevonden door de browser-smoke van de productie-SPA (PR #289).

- De lichte werkstraat geldt alleen voor beperkte bugs en heel kleine aanpassingen binnen bestaande functionaliteit
  en interactie, zonder nieuwe ADR/spec/mini-spec. Gedragsverandering of -herstel krijgt eerst een aparte tester en
  daarna een aparte reviewagent; zuivere tekst/opmaak zonder gedrag geen vaste tester. Nieuwe features, pagina's,
  interacties en risicowerk behouden de volledige straat. Volledige pre-push en CI blijven verplicht (ADR 0058).
- Developer-stop geeft gerichte type-, lint- en testfeedback. De volledige lokale gate blijft in pre-push en
  volledige CI blijft op iedere PR; geen oude groene uitslagen of testcache als vervanging.
- Taakgerichte feiten en compacte overdracht in agentprofielen en skills. Activering volgt na de afzonderlijke
  eigenaarmerge van ADR 0057; GitHub App, ruleset en build-proof zijn nog vervolgwerk.

- ADR's geconsolideerd: 0001–0038 zijn `vervangen door` de geldende 0039–0051 (#249–#253, #255; verwijzingen in code, docs en tests bijgewerkt in #258–#260). Afgesloten ADR's mogen ongewijzigd naar `docs/adr/archief/` (ADR 0053, #269). Bij een update: verwijs in eigen code en docs naar de nieuwe nummers; `node scripts/kit/feiten.mjs adr` toont welke gelden.
- Sandbox: de root-weigering op `*secret*` is `Read(/*secret*)` in plaats van `Read(./*secret*)` (`.claude/settings.json`).
  `./*secret*` matcht als kale bestandsnaam op elke diepte en maskeerde daardoor nog steeds `node_modules` (better-auth
  `secret-utils.mjs`): typed lint en de pre-push-hook faalden alleen in de sandbox. `.claude` is voortaan per getrackte
  submap gedekt (`agents`, `hooks`, `rules`, `skills`) plus `Read(./.claude/*secret*)`, zodat de node_modules in
  `.claude/worktrees/` niet meer gemaskeerd worden. Ongetrackte `.claude`-inhoud (de worktrees) valt daardoor alleen
  nog onder de `.env*`-weigering. De overige regels per getrackte map blijven.
- `docs/roadmap.md` is afgeslankt (55 → 31 KB): de afgevinkte items van de sectie Gebouwd en van Besluiten staan ongewijzigd in `docs/roadmap-archief.md`; open items, ook uit een afgerond stuk, blijven in de roadmap. Geldende ADR-besluiten komen uit `node scripts/kit/feiten.mjs adr`. De vereiste koppen van `check:roadmap` blijven.
- `pnpm gate:fast` draait de snelle gates uit het register in drie banen (`test:unit`, `lint`, de rest na elkaar) via `scripts/kit/gate-fast.mjs`, in plaats van een &&-keten: gemeten 92 → 61 s op 16 cores. Eerst de uitvoer van de rode gates, dan de lijst in registervolgorde; een rode gate stopt de andere niet meer, zodat één ronde alle fouten toont. Bij een update: `gate:fast` in `package.json` is nu `node scripts/kit/gate-fast.mjs`; een eigen snelle gate komt in `scripts/kit/gates.mjs`.
- A4 (ADR 0046 punt 2): een geaccepteerd ADR mag in een besluit-PR worden herschreven (met een herzieningsregel
  `Herzien: JJJJ-MM-DD (#NNN): wat`) en een ADR met een eigenaarstatus mag in een besluit-PR worden verwijderd; lokaal mogen alleen
  architect en hoofdsessie dat (`check-document-status`, rolhek). De tekst van ADR 0046 punt 2 volgt in een besluit-PR. Bij een update:
  een eigen ADR herschrijven of opruimen gaat voortaan via een besluit-PR in plaats van een vervangend ADR.
- `tsc -b` werkt incrementeel (`incremental` in `tsconfig.base.json`, buildinfo in `node_modules/.tmp/`): een tweede typecheck zonder wijziging duurt ~0,2 s in plaats van ~9 s, na een bronwijziging ~5 s. Dat geldt voor `pnpm typecheck`, `gate:fast`, `build` en de Stop- en SubagentStop-hooks. `tsc -b` ziet een gewijzigde `.d.ts` in `node_modules` niet als reden om opnieuw te controleren; na een dependency-update leeg je de cache met `rm -rf node_modules/.tmp` (CI begint altijd vers).
- `"sideEffects": ["**/*.css"]` in `package.json`: Rolldown behandelt de barrel `src/web/ui/index.ts` als vrij van bijwerkingen, zodat een scherm alleen de componenten laadt die het gebruikt. Gemeten bovenop de entry (kB gzip): `/login` 72 → 36, `/` 58 → 2, `/admin` 75 → 19; de catalogus (`/design-system`, alleen admins) draagt nu zelf de componenten die alleen daar voorkomen. Totaal JS 243 → 248 kB door meer kleine chunks. Het bundelbudget meet daarom per scherm in plaats van de som van alle JS (die groeit met elk scherm, ~15 kB per resource): entry ≤ 190, zwaarste route ≤ 285, `/design-system` ≤ 310, `/login` boven de entry ≤ 45 (legt de winst vast), grootste chunk 115 en CSS 15 (kB gzip). De getallen staan in `src/web/bundle-budget.ts`, van de app; `test/ui/bundle-budget.test.ts` leest ze. Bij een update: een app die het oude totaalbudget had opgehoogd in de test, zet zijn getallen voortaan in `src/web/bundle-budget.ts`; een eigen module met een bijwerking op importniveau (geen CSS) moet je expliciet in `sideEffects` opnemen. `/design-system` gebruikt geen `lazyRouteComponent` meer: `autoCodeSplitting` splitst al.
- CI draait de drie delen van `gate:slow` (`test:db`, `ui:check`, `check:snapshot`) als parallelle jobs, elk met een eigen verse stack; de job `gate:slow` blijft de verplichte check en is alleen groen als elk deel geslaagd is (`.github/workflows/ci.yml`). Verwacht: ~6 naar ~3,5 min wachttijd per PR, tegen drie keer installeren.
- `node scripts/kit/feiten.mjs` per rol en zuiniger: componenten leesbaar (`variant=a|b`, label `publiek`/`intern`, catalogus-URL één keer in de kop), `adr` toont standaard alleen geldende en voorgestelde ADR's (`--alle` voor alles; het volgende nummer telt alles), nieuwe sectie `fase` met de open roadmap-items en hun fase voor de reviewer (`docs/dod.md`). Elke agent vraagt in stap 1 alleen zijn secties (`.claude/agents/*.md`); de reviewer mag het script draaien (`rails/hooks/lib/rolhek.mjs`). Bij een update: `--json` van `componenten` is nu `{ catalogus, lijst }` en `adr --json` is standaard gefilterd met een veld `overig` (`--alle` voor de volledige lijst); `.claude/settings.json` staat `node scripts/kit/feiten.mjs` met secties toe.
- Unittests draaien parallel per bestand en Vitest gebruikt hooguit vier workers (`vitest.config.ts`); de integratietests (`int`) blijven serieel. Bij een update: eigen unittests (`src/**/*.test.ts`) mogen geen gedeelde state hebben (vaste poorten, vaste paden, de echte database); zie `docs/operations/testuitvoering.md`.
- Beslisroute (ADR 0038): de merge door de eigenaar is de acceptatie. Architect en hoofdsessie schrijven de eigenaarstatus in het voorstel; `check-document-status` laat zonder record en zonder web-flow een besluit-PR met meerdere ADR's en specs toe, en guard en rolhek weigeren een ADR met eigenaarstatus terug naar `voorgesteld` of met nieuwe inhoud (`rails/hooks/lib/document-state.mjs`, `scripts/kit/lane.mjs`).

### Opgelost

- `scripts/runner.sh` vergelijkt de host-bestanden met de merge-base van `main` zoals de remote die meldt
  (`git ls-remote origin refs/heads/main`), niet met de lokale ref `origin/main`; een omgebogen lokale ref opent de runner
  niet meer. Ontbreekt die commit lokaal, dan weigert het script met `git fetch origin main`. In CI blijft de controle
  tegen `HEAD`. Het rolhek weigert daarnaast `GIT_CONFIG_*`, `GIT_DIR` en `GIT_WORK_TREE` vóór git en een fetch van
  `origin` naar `refs/remotes/origin/main` (`rails/hooks/lib/rolhek.mjs`). Een niet-getrackt invoerbestand met meer dan
  één hardlink gaat niet meer mee naar de runner. De runner verdedigt zich ook zelf: hij wist elke `GIT_*`-variabele en `XDG_CONFIG_HOME`,
  zet `HOME` op de home uit de gebruikersdatabase (`getent`/`dscl`; onleesbaar → stoppen),
  negeert replace-objecten, leest de sha bij exact `refs/heads/main` en stopt als `remote.origin.url` niet precies één
  keer uit de repo-config komt of als `git ls-remote --get-url origin` ervan afwijkt (een `insteadOf` die origin omlegt). Het rolhek weigert die `GIT_*`-variabelen nu voor elk programma
  (ook `export`/`declare -x`), `git replace` behalve `--list`, en config op `include.*`/`includeIf.*`. Tijdelijke mappen van runner en browser-smoke volgen `TMPDIR`.
- `test-pgtap` faalt als `db/tests` geen tests bevat, in plaats van groen te melden.
- Een Combobox die bij het mounten focus krijgt, houdt zijn keuzelijst open. `autoFocus` wordt niet meer direct
  ongedaan gemaakt door het synchroniseren van de beginwaarde; een latere waarde- of formulierreset sluit nog steeds.

- Het foutenoverzicht focust ook bij later ontvangen serverveldfouten na clientvalidatie. Gewone veldcorrecties houden
  hun focus; de bestaande uitgestelde focus na een mislukte verzendpoging blijft behouden.

- De teruglink en het kruimelpad in de componentencatalogus openen nu `/admin/accounts`. Hun eerdere doel `/accounts`
  bestond niet en toonde de foutpagina; de bestaande bevestiging bij onopgeslagen wijzigingen blijft gelden.

- Opnieuw uitnodigen verwijdert de oude reset-tokens en mailt pas na commit van de route-transactie (`reinviteUser(auth, userId, lifecycle?)`), en SMTP heeft time-outs (`SMTP_TIMEOUTS`), zodat een hangende mailserver geen transactie vasthoudt. Een app die `services.invitations.reinvite` aanroept: nieuwe signatuur `reinvite(userId, lifecycle?)`, geef `{ afterCommit }` uit de route-ctx mee.

- Nieuwe-app-start: bootstrap controleert de machine met `doctor --machine`, zonder nog niet gestarte appdiensten als
  installatiefout te melden. De volledige doctor blijft verplicht na het starten. De poortpreflight neemt ook API en web
  mee en houdt beide origins gelijk aan de gekozen webpoort (`docs/nieuwe-app.md`, fase 7).
- Hernoemen met `app:init` breekt de initialisatie-, onderhouds- en core-bewakingstests niet meer; uitnodigingstests volgen `APP_NAME`.
  De setup stopt bij ontbrekende of onbekende CodeQL-beschikbaarheid vóór de eerste push: alleen de rulesetvlag is geen
  compleet CI-profiel (`docs/nieuwe-app.md`, fase 6).
- Vite bijgewerkt van 8.3.2 naar 8.3.3 voor GHSA-587h-7wmj-h5pm, GHSA-698v-4r3x-3vcv en GHSA-r825-w8mm-5pxw. De exacte versie staat in `package.json`; `pnpm-lock.yaml` legt de bijbehorende dependencyboom vast.
- Directe authenticatieroutes weigeren nu ook geblokkeerde accounts en sessies ouder dan zeven dagen. Sessie-opvragingen geven dan geen gegevens terug en de browsercookie wordt gewist, ook als het opruimen van de sessierijen faalt. Geldige sessies en opnieuw inloggen blijven werken (`src/core/api/auth/hooks.ts`, `test/auth/session-policy.int.test.ts`).
- Verbindingsverlies tijdens een API-handler stopt de request gecontroleerd in plaats van het hele proces. Geblokkeerde accounts blijven geblokkeerd als sessie-opruiming faalt; uitnodigingsmail volgt pas na commit en een half auth-account wordt na rollback opgeruimd (`src/core/api/db/with-user.ts`, `src/core/api/http/route-effects.ts`, `src/core/api/auth/invitations.ts`).
- Gelijktijdig hetzelfde account blokkeren of deblokkeren schrijft slechts één auditregel per statusovergang (migratie `20261019070000_account_audit_idempotency.sql`).
- De sessielijst verbergt ook sessies waarvan de idle-termijn verstreken is. Een 401 wist gecachete accountgegevens voordat de app naar inloggen navigeert (`src/core/api/auth/profile.ts`, `src/web/lib/session.ts`).
- Browser-terugnavigatie tijdens het zoeken annuleert achterhaalde invoer; een `readOnly` Combobox laat geen wijzigingen toe. Ongeldige datumcursors geven een validatiefout met behoud van microseconden in geldige cursors (`src/core/web/ui/list-toolbar.tsx`, `src/core/web/ui/combobox.tsx`, `src/api/routes/accounts.ts`).
- Formulieren sturen onbekende foutcodes zoals `constructor` niet meer ten onrechte naar een veld; ze tonen de algemene formuliermelding (`src/core/web/ui/form.tsx`).
- De bestandsserver weigert ook directory-indexen die via een symlink buiten de buildmap wijzen. Een onveilige hoofdindex wordt bij opstart geweigerd; symlinks binnen de buildmap blijven werken (`src/core/api/http/web.ts`).
- De server ruimt de shutdowntimer ook op als het sluiten van bronnen synchroon of asynchroon faalt (`src/core/api/http/serve.ts`).
- Navigatielinks respecteren `target` en `download`: openen in een ander venster of downloaden wordt niet meer vervangen door navigatie in het huidige tabblad (`src/core/web/ui/nav-link.tsx`).
- Oude retrytimers van bevestigingsdialogen kunnen de dubbelklikbeveiliging na heropenen of snel opnieuw proberen niet meer voortijdig opheffen. De timer wordt bij verwijderen van de dialoog opgeruimd (`src/core/web/ui/confirm-dialog.tsx`).
- Onbekende permissienamen zoals `constructor` en `__proto__` worden geweigerd zonder een fout te veroorzaken (`src/core/shared/can.ts`).
- Profielinitialen knippen Unicode-letters niet meer doormidden (`src/core/web/ui/topbar.tsx`).
- Gedeelde lijstlinks behouden ook filters en sorteringen waarvan de toegestane tekstwaarden op getallen of booleans lijken, zoals `jaar=2026` of `actief=false`. De API blijft echte getallen en booleans weigeren (`src/core/shared/list-search.ts`).
- Dialogen slaan verborgen, uitgeschakelde en inerte velden over bij het kiezen van de eerste focus. Een bruikbaar `data-autofocus`-doel houdt voorrang (`src/core/web/ui/dialog.tsx`).
- Een synchrone fout bij het starten van een readiness-controle geeft nu “niet klaar” en blokkeert latere controles niet blijvend (`src/core/api/http/readiness.ts`).
- Cursors met ongeldige UTF-8 worden geweigerd in plaats van stilzwijgend naar een andere sorteersleutel te worden omgezet (`src/core/shared/cursor.ts`).
- Onbekende foutcodes zoals `constructor`, `toString` en `__proto__` tonen de algemene fouttekst. Ze werden ten onrechte als geregistreerde teksten gelezen, wat een lege melding of renderfout kon veroorzaken (`src/core/web/ui/error-texts.tsx`).
- De sessielijst herkent Firefox op iOS als Firefox in plaats van Safari (`src/core/api/auth/user-agent.ts`).
- Gedeelde zoeklinks met `?q=true` of `?q=false` behouden hun letterlijke zoekterm. De router las die als booleans, waarna het zoekschema de term wegliet (`src/core/shared/list-search.ts`).
- De accountformulieren geven bij een te lang inlogwachtwoord, huidig wachtwoord of nieuw e-mailadres een Nederlandse lengtemelding met het maximum. De bestaande grenzen blijven gelijk (`src/shared/schemas/auth.ts`).
- De API-client laat optionele queryvelden met waarde `undefined` weg bij GET en DELETE. Ze kwamen als de tekst `"undefined"` bij de server terecht, waardoor een weggelaten filter onbedoeld een validatiefout kon geven. Lege tekst, `0`, `false` en de letterlijke zoekterm `"undefined"` blijven behouden (`src/core/web/lib/api-client.ts`).
- Het inlogformulier hanteert nu ook de bestaande `MAX_EMAIL_LENGTH` uit `src/shared/limits.ts`, met een Nederlandse melding bij een te lang adres; dezelfde grens geldt al bij uitnodigen en e-mail wijzigen (`src/shared/schemas/login-email-length.test.ts`).
- **Toast: geen dubbele aankondiging meer in NVDA.** In `src/core/web/ui/toast.tsx` stond een `role="status"`/`"alert"` binnen een `aria-live`-container; de rol is zelf al een live-regio, dus NVDA las de melding twee keer voor. De containers hebben geen `aria-live` meer; de rol blijft op de kaart. Wat verandert voor een app: niets in de API; schermlezers lezen een toast één keer voor. Een `role=status` die met zijn inhoud wordt toegevoegd, lezen sommige schermlezers minder betrouwbaar voor dan een bestaande live-regio. Wat de eigenaar moet doen: niets.
- **Toast: pauze bij hover en focus, een fout blijft staan (WCAG 2.2.1).** In `src/core/web/ui/toast.tsx` loopt de timer van een succes-toast (5 s) niet door zolang de muis op een toast staat of de focus erin; daarna loopt hij verder met de resterende tijd. Een fout-toast verdwijnt niet meer vanzelf (was 8 s) en blijft tot de gebruiker hem sluit (of tot het maximum van drie toasts tegelijk hem verdringt). Wat verandert voor een app: een `toast.error(…)` blijft staan tot sluiten; wie dat niet wil, laat de aanroep weg of gebruikt `toast.success`. Wat de eigenaar moet doen: niets.
- De tester-stop (`subagent-stop`) leest het JSON-rapport van vitest 5 weer: vitest krijgt een vast uitvoerbestand (`.vitest/json/tester-run.json`) en de hook leest dat, in plaats van "geen uitvoer van vitest" te melden. Wat verandert voor een app: niets behalve dat de tester-stop weer werkt. Wat de eigenaar moet doen: niets.
- De terugweg na inloggen wordt na URL-normalisatie gecontroleerd. Externe doelen met backslashes of tabs/regeleinden en genormaliseerde paden naar de inlogpagina worden geweigerd; gewone interne paden behouden hun zoekparameters en fragment (`src/web/lib/session.ts`, `src/web/lib/session-redirect.test.ts`).
- Tabs zonder expliciete waarde tonen weer het eerste beschikbare paneel wanneer de items later binnenkomen of na een lege/volledig uitgeschakelde tussenstand terugkeren. De selectie blijft bij herschikken behouden; expliciete waarden en focus buiten de tabs worden gerespecteerd (`src/core/web/ui/tabs.tsx`).

### Documentatie

- De README beschrijft de huidige basis, lokale installatie en beschikbare controles.
- Een leeswijzer maakt onderscheid tussen gebruiksdocumentatie, ontwikkelafspraken en agentinstructies.
- De lichte en volledige route staan alleen nog in `docs/framework.md` §8; instructies, agents en skills verwijzen ernaar.

### Bij een update

Account-lifecycle vereist de nieuwe migratie vóór de nieuwe API-code. Bestaande accounts krijgen geen verzonnen
loginhistorie: de lijst toont "Onbekend" tot de volgende volledig geslaagde login. Zie
[de spec](docs/specs/accountstatus-en-laatste-login.md) voor gedrag en tests.

De template heeft nog geen releaseversies. Controleer bij een update de gewijzigde migraties, architectuurbesluiten en instellingen. Een volledige upgradecontrole staat op de roadmap.

- **Compose-testservices zonder runner falen dicht.** De invoermounts in `compose.yaml` zijn lange bind-mounts met `create_host_path: false`; zonder `scripts/runner.sh` wijst de bron naar het niet-bestaande `./.runner-output/geen-invoer-start-via-runner` in plaats van de oude `./.runner-output/empty-input`. Wat verandert voor een app: een testservice (bv. `test-pgtap`) direct starten faalt op de ontbrekende invoermap; gebruik `pnpm test:db`, `pnpm ui:check` of `pnpm db:generate`. De dev-stack (`pnpm dev`, postgres en mailpit) werkt ongewijzigd. `test-pgtap` faalt nu bij een lege `db/tests`. De runner vergelijkt met `main` bij de remote: draai vóór een lokale run `git fetch origin main` als de remote verder is. Alleen een `insteadOf` of extra `remote.origin.url` die de origin-url zelf omlegt, laat de runner lokaal stoppen. Wat de eigenaar moet doen: niets. Conflicten: alleen als de app `compose.yaml` of `scripts/runner.sh` zelf aanpaste.
- **Sandbox: `*secret*`-weigering per map, `.env.example` leesbaar.** `.claude/settings.json`: `Read(./**/*secret*)` wordt `Read(./*secret*)` plus één regel per getrackte map (`Read(./src/**/*secret*)` enz.), zodat de sandbox bestanden in `node_modules` (better-auth `secret-utils.mjs`, jose `generate_secret.js`) niet meer maskeert; daardoor faalden typed lint, één unit-test en de pre-push-hook alleen in de sandbox. `sandbox.filesystem.allowRead` heropent alleen `./.env.example` (git faalde erop). `test/rails/sandbox-settings.test.ts` faalt als een getrackte map niet gedekt is. Wat verandert voor een app: niets aan de bescherming van getrackte bestanden; een nieuwe map in de repo vraagt een eigen regel (de test meldt het). Wat de eigenaar moet doen: na de merge een nieuwe sessie starten. Conflicten: alleen als de app `permissions.deny` of `sandbox` in `.claude/settings.json` zelf aanpaste.
- **SessionStart haalt `origin/main` op en meldt een achterstand.** `.claude/hooks/lib/werkstraat.mjs` (`mainLag`): `git fetch origin +refs/heads/main:refs/remotes/origin/main` met een harde timeout van 5 s en `GIT_TERMINAL_PROMPT=0` (het SSH-commando van de gebruiker blijft ongemoeid); daarna meldt de hook hoeveel commits de branch achterloopt. Een mislukte fetch wordt gemeld en blokkeert niets; zonder bekende `origin/main` blijft de melding weg. Wat verandert voor een app: elke sessiestart doet één korte netwerkaanroep naar `origin`. Wat de eigenaar moet doen: niets. Conflicten: alleen als de app `.claude/hooks/` zelf aanpaste.
- **CI-job `secrets` scant op een PR alleen de eigen commits.** `.github/workflows/ci.yml`: op een `pull_request` `betterleaks git --log-opts origin/main..HEAD`, bij `push` naar `main` (en elk ander event) alle gefetchte refs, in beide gevallen met `scripts/kit/betterleaks.toml` en zonder inline allows; de check heet nog `secrets`. Eén valse melding op een andere branch maakte eerder elke open PR rood, en force-push is verboden (#97, #99). Wat verandert voor een app: een geheim op een branch zonder PR blokkeert andere PR's niet meer, maar komt pas aan het licht bij de scan op `main`; een geheim in een PR-commit blijft ook na een herstelcommit zichtbaar. Wat de eigenaar moet doen: niets. Conflicten: alleen als de app de job `secrets` in `.github/workflows/ci.yml` zelf aanpaste.
- **Audit log: `withUser()` eist `requestId`; `createRouteKit` eist `audit` (spec `audit-log`).** `withUser`-aanroepen buiten de template (eigen scripts, tests) geven nu `requestId` mee in de opties (`WithUserOptions`); `createRouteKit({ permissions, audit })` krijgt de acties uit `src/shared/audit.ts` (`defineAuditActions({})` is genoeg). Nieuwe migratie `audit_log` met `app.request_id()` (`db/migrations/`); draai `pnpm db:generate`. Wat verandert voor een app: admin-acties laten een onwijzigbare regel achter in `app.audit_log`; `ctx.audit` is beschikbaar voor eigen acties.
- **Roadmap-vinkjes afgedwongen (`check:roadmap`).** `pnpm check:roadmap` (ook in `gate:fast` en dus in pre-push en CI) meldt ten opzichte van het afsplitspunt met `origin/main` een nieuw of gewijzigd `[x]` in `docs/roadmap.md` zonder PR-nummer, testpad of checknaam erachter, een genoemd bestand dat niet bestaat, en een spec die naar `gebouwd` gaat zonder bewijs (`scripts/kit/check-roadmap.mjs`, spec `docs/specs/roadmap-vinkjes.md`). Bestaande vinkjes blijven ongemoeid. Wat verandert voor een app: een app met een roadmap vult bij elk nieuw vinkje bewijs in, en zet bewijs achter `status: gebouwd # …` in een spec; zonder leesbare `origin/main` faalt de check zoals `check:migrations` (`git fetch origin main`). Wat de eigenaar moet doen: niets. Conflicten: alleen als de app `scripts/kit/gates.mjs`, `scripts/kit/check-docs.mjs` (nu met exports) of de `gate:fast`-regel in `package.json` zelf aanpaste.
- **Mergen en force-push dicht voor elke rol; runner en migraties tegen `origin/main` (WS-04a).** Het rolhek weigert nu ook voor de hoofdsessie `gh pr merge` (ook `--auto`), `gh api` naar `…/merge`, `…/merges` of `…/auto-merge` met elke methode (ook GET op `…/pulls/<n>/merge`; lees de status met `gh pr view --json merged`) en de GraphQL-mutaties `mergePullRequest`, `enablePullRequestAutoMerge` en `mergeBranch` (`ghForbidden`), en elke force-push: `--force` (ook afgekort vanaf `--forc`), `-f` (ook `-fu`/`-uf`), `--force-with-lease[=…]`, `--force-if-includes` en een refspec met `+` (`gitForbidden` in `.claude/hooks/lib/rolhek.mjs`). Een migratie telt als gecommit als hij in de merge-base met `origin/main` staat, zoals `check:migrations`; een eigen, nog niet gemergde migratie mag de agent dus wijzigen of hernoemen. Zonder leesbare `origin/main` valt het rolhek terug op `HEAD` en noemt de weigering `git fetch origin` (`committedIn` in `.claude/hooks/rolhek.mjs`). `scripts/runner.sh` (`pnpm test:db`, `pnpm ui:check`, `pnpm db:generate`) weigert lokaal ook gecommitte wijzigingen aan host-bestanden t.o.v. de merge-base met `origin/main`, en weigert als `origin/main` onleesbaar is; in CI (`CI=true`) blijft het de controle tegen `HEAD` (ADR 0025 punt 4, regel in ADR 0009). Wat verandert voor een app: mergen doet alleen de eigenaar, ook vanuit de hoofdsessie; een branch die `scripts/`, `package.json` of een ander host-bestand wijzigt, draait de runner lokaal pas met `--sta-wijzigingen-toe`. Wat de eigenaar moet doen: vóór `pnpm test:db` of `pnpm ui:check` `git fetch origin`; bij een eigen PR op host-bestanden de wijziging lezen en de vlag gebruiken. Conflicten: alleen als de app `.claude/hooks/`, `scripts/runner.sh` of `docs/adr/0009-…` zelf aanpaste.
- **Railgaten: testpaden, configs en de docs-rol (WS-02).** `test/**` en de configs die checks bepalen (`vitest.config.ts`, `playwright.config.ts`, `vite.config.ts`, `.prettierrc.json`, `.prettierignore`, `Dockerfile`, `.dockerignore`, `db/test.env`, `docs/nieuwe-app.md`) zijn gate-paden (`.claude/gates.json`, gespiegeld in CODEOWNERS en `ask`). Het rolhek behandelt bestaande hulpbestanden in testpaden apart: fixtures (`test/rails/fixtures/`) en `test/setup/` wijzigen of verwijderen is een gate, andere hulpbestanden verwijderen ook, wijzigen geeft een melding (`existingTest` in `.claude/hooks/lib/rolhek.mjs`). Een fixture of setupbestand dat als testbestand heet (`*.test.*`) is net zo vergrendeld. De docs-rol schrijft alleen nog `docs/reviews/`, `docs/operations/`, `docs/README.md`, `docs/gouden-pad.md`, `README.md` en `CHANGELOG.md`; `check-docs` faalt als `schrijfrecht` van een rol overlapt met `gates` (`schrijfrechtViolations` in `scripts/kit/check-docs.mjs`); alleen de bestandsnaam-gates uit `testpaden` (`**/*.test.*`, `**/*.spec.*`) tellen daarbij niet, map-gates als `test/**` en `e2e/**` wel, met de tester als uitzondering. Wat verandert voor een app: deze configs, fixtures en setup wijzigen vraagt in de hoofdsessie akkoord en is voor subagents dicht; in CI vraagt de diff-guard het label `gate-wijziging`. Wat de eigenaar moet doen: niets, tenzij de app eigen rollen of `schrijfrecht` heeft: draai `pnpm ratchet` en los een overlap op. Conflicten: alleen als de app `.claude/gates.json`, `.claude/settings.json`, `.github/CODEOWNERS`, `.claude/hooks/` of `.claude/agents/docs.md` zelf aanpaste.
- **MCP-tools onder het rolhek (WS-06).** De rolhek-matcher vangt nu ook `mcp__.*` (`.claude/settings.json:129`). Een MCP-tool die niet exact in de nieuwe lijst `mcpLezen` in `.claude/gates.json` staat, vraagt in de hoofdsessie goedkeuring en wordt voor elke subagent geweigerd (`.claude/hooks/lib/rolhek.mjs:115`); ontbreekt de sleutel, dan faalt het rolhek dicht. Architect, tester en docs hebben daarnaast `disallowedTools: mcp__*`. Wat verandert voor een app: connectors (bijv. Supabase, Vercel) zijn voor subagents dicht en vragen in de hoofdsessie elke keer akkoord. Wat de eigenaar moet doen: read-only tools die vrij mogen, met exacte naam in `mcpLezen` zetten (gate-wijziging). Conflicten: alleen als de app `.claude/gates.json`, `.claude/settings.json`, `.claude/hooks/` of `.claude/agents/` zelf aanpaste.
- **Werkstraat-hooks in de juiste map; uitgesloten commando's kloppen met `package.json` (WS-03).** De werkstraat-hooks nemen hun root, net als het rolhek, uit de git-root van `cwd` in de payload (terugval `CLAUDE_PROJECT_DIR`), dus in een worktree draaien Stop en "groen vóór klaar" op de gewijzigde code (`.claude/hooks/lib/root.mjs`). `excludedCommands` en `ask`: `db:reset` en `db:types` (bestonden niet) weg, `db:generate` en `check:snapshot` erbij; `test/rails/excluded-commands.test.ts` bewaakt dat. Reviewer en security-review diffen tegen `origin/main`. Wat verandert voor een app: `pnpm db:generate` en `pnpm check:snapshot` vragen nu goedkeuring en draaien buiten de sandbox. Wat de eigenaar moet doen: vóór een review `git fetch origin`. Conflicten: alleen als de app `.claude/settings.json`, `.claude/hooks/` of `.claude/agents/reviewer.md` zelf aanpaste.
- **`.claude/settings.json`: dode deny-regels `Read(!.env.example)` en `Edit(!.env.example)` weg.** Claude Code las de `!` als letterlijke padnaam, niet als uitzondering. Wat verandert voor een app: niets in gedrag; `.env.example` was en blijft voor agents onleesbaar via `.env.*` (permissieregel én sandbox). Wat de eigenaar moet doen: niets. Conflicten: alleen als de app deze regels in `.claude/settings.json` zelf aanpaste.
- **ADR 0026 en drift-correcties in docs en rules.** Wat verandert voor een app: niets aan de code; ADR 0010, 0013, 0014, framework §6 en §11a, `.claude/rules/database.md` en `web.md` volgen de gebouwde stand. Conflicten: alleen als een app deze teksten zelf wijzigde. Wat de eigenaar moet doen: niets.
- **ADR 0025 (geaccepteerd): werkstraat tot de merge en modelkeuze per spec.** Wat verandert voor een app: nog niets. Alleen besluittekst; rails, hooks, settings en skills volgen in aparte PR's, elk met een eigen notitie. Wat de eigenaar moet doen: niets bij deze update. Conflicten: geen bij app-ADR's vanaf `0100` (ADR 0006); `docs/adr/0009-…` kreeg één regel, en die geeft alleen een conflict als de app die ADR zelf wijzigde.
- **`docs/nieuwe-app.md` bij de repo: bootstrap, `pnpm dev`, `pnpm db:migrate` en een ruleset met verplichte checks.** Wat verandert voor een app: niets aan de code; alleen het playbook. Wat de eigenaar moet doen: een app die vóór deze versie is opgezet, heeft mogelijk geen git-hooks (`scripts/doctor.sh` meldt dat; dan `scripts/bootstrap.sh`) en een ruleset zonder verplichte checks (vergelijk met fase 6.2). Conflicten: geen, de app wijzigt `docs/nieuwe-app.md` niet.
- **`scripts/cloud-setup.sh` en README-sectie Cloud.** Setup-script voor een cloudomgeving van Claude Code: mise (gepind, van github.com), `mise install`, `pnpm install --frozen-lockfile`, `lefthook install`. Wat verandert voor een app: niets lokaal. Wat de eigenaar moet doen: alleen voor cloudsessies de omgeving instellen (README, Cloud). Conflicten: alleen als de app de README-sectie **Controles** direct erboven wijzigde.
- **`scripts/github-ruleset.sh`: ruleset `main` voor een app-repo.** Zet via `gh api` PR-plicht, geen force push of delete, opgeloste gesprekken, merge en squash, en de verplichte checks uit `.github/workflows/` (`--zonder-codeql` voor een private repo zonder GHAS). Wat verandert voor een app: niets vanzelf. Wat de eigenaar moet doen: een bestaande app kan het script één keer draaien (`scripts/github-ruleset.sh <owner>/<repo>`); opnieuw draaien werkt de ruleset bij. Conflicten: geen.
- **`scripts/runner.sh`: images eerst binnenhalen, met time-out en herkansing.** `pnpm test:db`, `pnpm ui:check` en `pnpm db:generate` doen eerst `docker compose pull` (300 s per poging, drie pogingen) en stoppen met een duidelijke fout als de registry blijft hangen, in plaats van de 30 minuten van `gate:slow` op te maken. Wat verandert voor een app: niets aan het testgedrag. Wat de eigenaar moet doen: niets. Conflicten: alleen als de app `scripts/runner.sh` zelf wijzigde.
- **`pnpm pr:verify` negeert ongetrackte lokale `.claude/`-bestanden (`werkmapNegeer`, ADR 0031 besluit 5).** `.claude/gates.json` krijgt `werkmapNegeer` (`.claude/launch.json`, `loop.md`, `output-styles/`, `routines/`, `scheduled_tasks.json`, `workflows/`), gelezen uit `origin/main`; alleen ongetrackte bestanden eronder tellen niet als vuile werkmap (`scripts/kit/pr-verify.mjs`). `check-docs` faalt als een pad in de lijst getrackt is of niet onder `.claude/` valt. `.vitest/` staat nu in `.gitignore`. Wat verandert voor een app: een app die `.claude/routines/`, `workflows/` e.d. in git heeft, krijgt een rode `check-docs`; commit die bestanden niet, of haal het pad uit `werkmapNegeer`. `.mcp.json` kan niet in de lijst: committen of in `.gitignore`; `.claude/commands/` mag er wel in. Wat de eigenaar moet doen: niets. Conflicten: alleen als de app `.claude/gates.json` of `.gitignore` zelf aanpaste.
