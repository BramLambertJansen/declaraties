# 0031 — Diff-guard en pr:verify bruikbaarder maken (overgangsfase)

Status: geaccepteerd

Vult [0017](0017-diff-guard.md) (OV-2, overgang), [0027](0027-taakmandaat-voor-frameworkwerk.md) (punt 2 en 6) en
[0030](0030-ci-lus-en-agent-merge.md) (punt 1, CI-lus) aan. Wijzigt geen van hun besluiten. Buiten dit ADR: `diff-guard`
verplicht maken in de ruleset; dat blijft 0017 OV-1, met de GitHub App. De keuzes op de open vragen zijn van de
eigenaar (2026-10-14): de aanbeveling, behalve bij besluit 5 (kortere lijst) en 6 (later).

## Context

Onderzoek van PR #149 en de huidige code laat vijf knelpunten zien.

1. **Rode status zonder oorzaak.** De job `diff-guard` in `.github/workflows/guard.yml` heeft twee stappen: `diff-guard.mjs`
   en `check-document-status.mjs`. Een check op GitHub heet naar de job, niet naar de stap. In #149 faalde de tweede stap
   (inhoud van het geaccepteerde ADR 0030 gewijzigd zonder besluitrecord op main), maar de status heette `diff-guard`.
   `check-document-status.mjs` schrijft zijn fout naar stderr zonder `::error`-annotatie en zonder stapsamenvatting.
2. **Overgang zonder instructie.** Is de auteur goedkeurder (de agent pusht onder het eigenaaraccount), dan geeft `beoordeel`
   `overgang`: groen met waarschuwing. Nergens staat dat label en review dan niet gevraagd worden (GitHub laat de auteur
   zijn eigen PR niet goedkeuren) en wat de eigenaar wel doet.
3. **Correctie aan een geaccepteerd ADR heeft geen beschreven route, en de voor de hand liggende werkt niet.** Een
   inhoudswijziging met status `geaccepteerd` slaagt alleen via `canRecordStatus` (`.claude/hooks/lib/task-authority.mjs`).
   Dat vraagt een record op main waarvan de digest gelijk is aan die van het document óp main (`currentDecision`). Een record
   vooraf op main, met de digest van de nieuwe tekst, slaagt dus nooit zolang main de oude tekst heeft. Wat nu wel werkt:
   (a) PR 1 zet de tekst terug op `voorgesteld` met het record erbij (de guard slaat `voorgesteld` over), PR 2 registreert
   `geaccepteerd` met `pnpm docs:status`; tussen beide merges is het ADR geen besluit. (b) Tekst ná de statuswaarde op de
   statusregel (`— …`, `(…)`, `# …`) valt buiten de digest (`documentInfo`, `.claude/hooks/lib/document-state.mjs`); zo'n
   wijziging slaagt zonder record. Dat is bruikbaar voor verwijzingen, maar ook een ongetoetst tekstkanaal.
4. **`pr:verify` weigert in een agent-worktree.** `verifyHead` in `scripts/kit/pr-verify.mjs` eist een lege
   `git status --porcelain --untracked-files=all`. Runtimebestanden die nooit getrackt zijn (`.claude/commands/`,
   `.claude/launch.json`, `.claude/loop.md`, `.claude/output-styles/`, `.claude/routines/`, `.claude/scheduled_tasks.json`,
   `.claude/workflows/`, `.mcp.json`) en testuitvoer (`.vitest/`, niet in `.gitignore`) laten hem altijd falen, dus kan de
   CI-lus van 0030 daar niet draaien.
5. **Uitslag pas na de push.** De agent kan niet vooraf zien wat de guard zal zeggen, terwijl `beoordeel` een pure functie is.

Daarnaast: `requiredChecks` in `.claude/decisions.json` (de lijst van `pr:verify` en van het bouwbewijs) bevat geen
guard-check. Een rode `check-document-status` stopt de CI-lus dus niet; de agent ziet hem alleen als hij zelf kijkt.

## Besluit

1. **Twee jobs, twee namen.** `guard.yml` krijgt naast `diff-guard` (naam ongewijzigd) een tweede job `document-status`
   die `check-document-status.mjs` draait. Beide jobs doen zelf de bestaande controles (base-repo, SHA's, checkout van de
   base-SHA met `persist-credentials: false`, PR alleen als git-objecten, geen install). Elke job schrijft een fout als
   `::error title=<jobnaam>::` en een korte stapsamenvatting.
   - `diff-guard` behoudt zijn naam; de ruleset, `scripts/github-ruleset.sh` en 0017 OV-1 hoeven niet te wijzigen.
   - `test/scripts/github-ruleset.test.ts` eist dat elke workflowjob óf verplicht is óf in `NIET_VERPLICHT` staat; daar komt
     `document-status` bij (bestaande test gewijzigd: gedrag verandert, met reden in de PR).
   - `document-status` komt in `requiredChecks` in `.claude/decisions.json`, zodat `pr:verify` en de CI-lus hem zien.
     Voorwaarde: vooraf is aangetoond dat de check-run van `pull_request_target` op de head-SHA van de PR staat, met de app-id
     van GitHub Actions (`checkProgress` in `scripts/kit/pr-verify.mjs` filtert op beide). Is dat niet zo, dan gaat
     `document-status` niet in de lijst en komt dit ADR terug bij de eigenaar.
   - `diff-guard` gaat niet in `requiredChecks`: met de App is hij rood tot de eigenaarreview, en dat is geen fout die de
     CI-lus moet herstellen.
   - Wordt de guard later verplicht in de ruleset (0017 OV-1), dan gaat het om beide namen.
2. **Duidelijke overgangstekst.** Bij `overgang` noemt de samenvatting van `diff-guard` letterlijk:
   "Overgang (ADR 0017, OV-2): de auteur is zelf goedkeurder. Label `gate-wijziging` en review worden in deze fase niet
   gevraagd en niet gecontroleerd. Lees de geraakte paden hieronder; de eigenaar merget zelf." De bestaande reden met
   "auteur én goedkeurder" blijft staan, zodat de bestaande test niet hoeft te wijzigen.
3. **Docs voor de eigenaar en voor ADR-correcties** in `docs/operations/agent-doorloop.md` (procedure; geen gate-pad), met een
   verwijzing van één regel in framework §10 bij "Diff-guard". Operations, niet §10: het is werkwijze; de grens zit in de checks,
   en deze tekst kan geen check afzwakken.
   - _Gate-PR in de overgang:_ lees de samenvatting van `diff-guard` en `document-status`; geen label of review nodig (en een
     review is niet mogelijk); merge zelf. Is `document-status` rood, dan niet mergen maar de oorzaak laten herstellen.
   - _Correctie aan een geaccepteerd ADR_, drie sporen:
     1. Normatieve wijziging (wat besloten is): een nieuw ADR dat het oude wijzigt of vervangt. De tekst van het oude blijft.
     2. Verwijzing naar een later ADR: een ADR-link achter de statuswaarde op de statusregel, in de vorm van besluit 4.
        Geen record nodig; de eigenaar ziet het in de gate-PR.
     3. Niet-normatieve correctie in de tekst (taalfout, kapotte link): route 3(a) uit de context, met het record
        (`pnpm docs:decision <adr> geaccepteerd --branch <tweede branch>`) in PR 1. De PR-beschrijving noemt dat het ADR
        tussen beide merges `voorgesteld` is; bundel zulke correcties.
   - De ADR 0027-garantie blijft: geen inhoud in de digest verandert zonder record op main en eigenaarmerge.
4. **Strikte statusregel voor ADR's.** Is de statusregel van een ADR nieuw of gewijzigd ten opzichte van main, dan faalt
   `document-status` tenzij achter de statuswaarde alleen staat: een datum `(JJJJ-MM-DD)`, PR-nummers `#<nr>` en links
   naar bestaande ADR's (een gewone Markdown-link met alleen het ADR-nummer als tekst), gescheiden door `, ` of ` — `. Ongewijzigde statusregels op main blijven
   geldig; herschrijven zou hun herkomsttekst wissen. Dit sluit het kanaal uit context 3(b) voor elke nieuwe wijziging.
   Specs vallen erbuiten: hun `#`-commentaar draagt het bouwbewijs (`builtReference`).
5. **`pr:verify`: begrensde uitzondering, uit main.** Nieuwe sleutel `werkmapNegeer` in `.claude/gates.json` (gate-pad), gelezen
   uit `origin/main` zoals `autoRunner`, nooit uit de werkmap. Exacte paden of mapvoorvoegsels, geen globs over mappen heen.
   Alleen **ongetrackte** bestanden onder die paden tellen niet mee; een getrackte wijziging, ook onder zo'n pad, laat `pr:verify`
   weigeren. Beginlijst: `.claude/launch.json`, `.claude/loop.md`, `.claude/output-styles/`, `.claude/routines/`,
   `.claude/scheduled_tasks.json`, `.claude/workflows/`. `.mcp.json` en `.claude/commands/` staan er niet in: een app kan ze
   willen committen, dus dat beslist de app. `.vitest/` komt in `.gitignore`, naast `coverage/` en `test-results/`: het is
   testuitvoer van de repo zelf. `check-docs` faalt als een pad in `werkmapNegeer` getrackt is of niet onder `.claude/` valt.
   Wat het bewijs nog garandeert: PR-head = lokale HEAD, branch en repository kloppen, HEAD niet verschoven, elke verplichte
   check van GitHub Actions groen op die SHA. Wat het kost: een vergeten, ongetrackt bestand onder een genegeerd pad valt niet
   meer op. Omdat geen van die paden code, tests of config van de app bevat, raakt dat CI en de PR-inhoud niet.
6. **Later, bij de GitHub App: `pnpm pr:guard-preview [nummer]`.** Alleen-lezend en adviserend: de diff van `origin/main` naar
   HEAD door `beoordeel` en `samenvatting`, daarna `check-document-status` met `BASE_SHA` = `origin/main`. Niet nu: in de
   overgang is `diff-guard` voor de agent altijd groen of `overgang`; met de App gaat de voorspelling van label en review pas
   tellen. Bouwen vraagt dan een eigen PR met tests.

## Alternatieven

- **Eén job met `::error title=…` per stap** (besluit 1): kleiner, maar de checklijst toont nog steeds `diff-guard` rood.
  Verworpen als oplossing; de annotatie komt er wel bij. **Matrix-job**: geeft namen als `guard (diff-guard)` en is dus een
  rename; verworpen. **`needs:` tussen de jobs**: verbergt de tweede uitslag als de eerste faalt; verworpen.
- **Record vooraf op main, dan de tekst** (besluit 3): werkt niet met `currentDecision` (context 3) en vraagt de eigenaar een
  hash goed te keuren zonder de tekst te zien. **`canRecordStatus` verruimen tot records van de PR zelf**: botst met 0027
  punt 2 (werkversie van het register geeft geen rechten). **Uitzondering op inhoud voor "niet-normatieve" correcties**:
  de guard kan normatief niet van niet-normatief onderscheiden zonder heuristiek; verworpen. **ADR-tekst nooit corrigeren**:
  kapotte links breken `check-docs`; verworpen.
- **Strikte statusregel voor alle ADR's, ook ongewijzigde** (besluit 4): vraagt het herschrijven van ruim twintig statusregels
  en wist hun herkomst; verworpen. **De vrije tekst in de digest opnemen**: maakt elke datum- of verwijswijziging een
  inhoudswijziging met record; verworpen.
- **`pr:verify` met `--untracked-files=no`** (besluit 5): eenvoudig, maar dan valt elk vergeten nieuw bestand weg, ook een
  test of bronbestand. **Alles via `.gitignore`**: niet bewaakt (geen gate-pad), en runtimebestanden horen niet in de
  `.gitignore` van een template; alleen voor `.vitest/`. **`.git/info/exclude`**: lokaal en onzichtbaar; verworpen.
- **Preview nu bouwen** (besluit 6): weinig waarde zolang de overgang geldt; uitgesteld.

## Gevolgen

- Uitvoering in vier PR's, tester eerst, elk één onderwerp. Alle vier zijn gate-wijzigingen (`scripts/**`, `.claude/**`,
  `.github/**`, `docs/framework.md`).
  - **PR 1, overgangstekst** (agent): test in `test/rails/diff-guard.test.ts` (nieuw geval: samenvatting bevat de zin uit
    besluit 2), dan `scripts/kit/diff-guard.mjs`, docs "Gate-PR in de overgang".
  - **PR 2, twee jobs** (de eigenaar pusht; raakt `.github/workflows/`, de agent heeft geen `workflows`-recht).
    1. Eerst de verificatie uit besluit 1: met `gh api` (lezen) op een open PR nagaan dat de check-run `diff-guard` de
       head-SHA van die PR en app-id 15368 heeft. De uitkomst staat in de PR-beschrijving.
    2. Tests: `NIET_VERPLICHT` in `test/scripts/github-ruleset.test.ts`; een test dat beide jobs de veiligheidsstappen
       hebben (geen checkout van de PR, `persist-credentials: false`, geen install).
    3. `guard.yml`, `::error`-annotatie in `check-document-status.mjs`, framework §10, en (alleen bij een positieve
       verificatie) `document-status` in `requiredChecks`.
  - **PR 3, `pr:verify`-uitzondering** (agent): tests voor een pure functie (ongetrackt onder de lijst: door; ongetrackt
    elders, ook `.mcp.json` en `.claude/commands/`: weigeren; getrackt onder de lijst: weigeren; `.claude/launch.json.x` en
    `../`: weigeren; lijst uit `origin/main`, niet uit de werkmap), `check-docs`-test voor de lijst, dan `pr-verify.mjs`,
    `.claude/gates.json`, `.gitignore`, docs.
  - **PR 4, ADR-correcties en strikte statusregel** (agent): eerst tabeltests voor de statusregel (alleen datum: door; datum,
    PR en ADR-link: door; link naar een niet-bestaand ADR: rood; vrije tekst in een nieuwe of gewijzigde regel: rood; vrije
    tekst in een ongewijzigde regel: door; spec met `#`-commentaar: buiten de regel), dan de controle in
    `check-document-status.mjs` (eventueel met een pure functie in `.claude/hooks/lib/document-state.mjs`), en
    `agent-doorloop.md` met framework §10.
- **Gevolg voor `gebouwd`.** Na PR 2 eist het bouwbewijs ook `document-status` op de bron-SHA. Een spec met een bron-SHA van
  vóór PR 2 heeft die check niet; `pnpm docs:status … gebouwd` faalt dan. Oplossing: `origin/main` in de branch mergen en
  pushen; de nieuwe commit krijgt de check en wordt de bron-SHA.
- **Bekende beperking `pr:verify`.** In een worktree met een ongetrackte `.mcp.json` of `.claude/commands/` blijft `pr:verify`
  weigeren, ook in de template zelf. Per app kiest de eigenaar: committen, aan `.gitignore` toevoegen of aan `werkmapNegeer`.
- Geen nieuwe dependency, route, migratie of permissie; dus geen spec (framework §8 stap 1).
- **Restrisico statusregel.** Besluit 4 geldt alleen voor nieuwe of gewijzigde statusregels; bestaande vrije tekst blijft
  buiten de digest. Wijzigt iemand die tekst, dan valt hij onder de strikte vorm.
- **Restrisico terugzetten.** Een geaccepteerd ADR terugzetten op `voorgesteld` met andere inhoud slaagt in `document-status`
  zonder record. Spoor 3 leunt daarop. Het is een intrekking (0027 punt 1); alleen de eigenaarreview van de gate-PR toetst het.
