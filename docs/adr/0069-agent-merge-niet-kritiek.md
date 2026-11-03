# 0069 — De hoofdsessie merget niet-kritiek werk zelf

Status: geaccepteerd
Herzien: 2026-11-03 (#NNN): punt 3 (Codex-voorwaarde drieledig, omvanggrens `agentMerge.maxRegels`), punt 5
(steekproef, terugval, overgang), Gevolgen en Meten; versoepelt de Codex-voorwaarde; uitwerking in
[spec](../specs/agent-merge-zonder-codex.md)

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
   - de PR klein is: hoogstens `agentMerge.maxRegels` (geheel getal, template 400) toegevoegde plus verwijderde regels, en
     geen binair bestand; ontbreekt of onleesbaar: geen merge. Dezelfde grens zit in het oordeel van de job `agent-merge`
     (punt 2, geteld met git op de merge-base);
   - de Codex-voorwaarde volgens `agentMerge.codex` (ontbreekt of onleesbaar: `true`):
     - `true`: Codex (`chatgpt-codex-connector[bot]`) rondde de head-SHA af zonder open punten (samenvatting met marker
       `codex-review-state:v1` op die SHA, nieuwste telt, of een 👍 na de ontvangst van die SHA) en er is geen onopgeloste
       review-thread (afspraak);
     - `"indien-aanwezig"` (template): rondde Codex ooit een review af, dan geldt de voorwaarde van `true` volledig; zonder
       zo'n spoor vervalt ze. Een spoor is een samenvatting met marker en status `completed`, een PR-review, een
       inline-reviewcommentaar of een 👍 van die bot, op welke SHA ook, op deze PR of op een andere PR met dezelfde
       head-branch die open is of zonder merge gesloten. Geen spoor: een 👀, een samenvatting met een andere status
       (`failed`, bezig), een commentaar zonder marker;
     - `false`: geen Codex-voorwaarde (een app zonder Codex).
   *Waarom:* elke voorwaarde dekt een eigen faalwijze: verkeerde PR of SHA, verouderde basis, verouderde lokale `origin/main`,
   rode CI, kritieke inhoud, doorbouwen op rode `main`, review van een oudere versie, genegeerde Codex-punten, een diff te groot
   om te overzien. *Waarom drieledig (herzien 2026-11-03):* met `true` hing de agent-merge aan het Codex-reviewtegoed; was dat
   op, dan merget geen agent meer (review 3 november 2026, P2). Dit versoepelt de Codex-voorwaarde (R-PRINC-09, met
   eigenaarsbesluit); in de plaats komen de omvanggrens, de steekproef en de terugval (punt 5). `"indien-aanwezig"` houdt
   een gegeven Codex-oordeel bindend: een inline-punt zonder samenvatting of een nieuwe PR van dezelfde branch laat de
   voorwaarde niet vervallen. Alleen een afgeronde review telt, omdat Codex bij tegoed op zelf een samenvatting met marker
   (status `failed`, `has_unresolved_findings: true` zonder bevinding) en een limietmelding plaatst (PR #447 tot en met #453,
   met `gh api` nagegaan); "elke marker" of "elk commentaar" blokkeerde dan elke PR. Een gemergde PR van dezelfde branch telt
   niet, omdat een thread meerdere PR's na elkaar van één branch maakt. Een 👀 of een ronde die nog bezig is, telt niet
   (ontwerp van de eigenaar); daarmee is het venster waarin Codex met tegoed nog bezig is en de agent al mergt, aanvaard (spec
   OV-1). *Waarom een omvanggrens, ook met Codex:* zonder Codex is
   de verse reviewer de enige inhoudelijke lezer, en een kleine diff is wat die betrouwbaar overziet. Voorbeeld is de praktijk
   van Ona die de eigenaar aanhaalde (opdracht 3 november 2026: laag-risico-PR's automatisch goedgekeurd onder 1.000 regels
   met een deterministische padregel; cijfers niet zelf nagegaan), hier strenger omdat er geen mens meekijkt. Een binair
   bestand telt GitHub als 0 regels en kan de reviewer niet lezen, dus dat sluit uit. De review-regel en het oplossen van threads zijn afspraken, geen harde voorwaarden: de sessie zet ze onder het account van de
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
   fout herstelt hij met een revert-PR, die zelf ook punt 1 moet halen. Elke agent-merge zonder Codex-spoor meldt de
   hoofdsessie in de thread met het woord "steekproef"; de eigenaar telt en kijkt de eerste tien achteraf na en zegt daarna of
   de melding blijft. Terugval: na een revert van een agent-merge, één rode `main` door een agent-merge of een agent-merge die
   achteraf kritiek blijkt, merget de hoofdsessie niets meer via `pr:merge`, opent een PR die `merge` op `"eigenaar"` zet,
   meldt dat, en dit besluit wordt herzien; pas na de merge van die PR of een ander besluit van de eigenaar gaat het verder.
   Overgang: de herziening van punt 3 en 5 geldt vanaf de merge van de bouw-PR; tot dan merget de hoofdsessie geen PR boven
   400 regels. Bij `"indien-aanwezig"` vraagt de hoofdsessie geen extra `@codex review` zolang er geen spoor is, en met spoor
   vraagt ze er een op elke nieuwe head; ze ontwijkt Codex niet (geen draft om de automatische review te mijden, geen
   commentaar weghalen). Elke agent-merge bij `codex: false` geldt ook als steekproef. Steekproef, terugval, overgang en het
   vragen van Codex zijn afspraken, geen gate: het script meldt alleen dat de Codex-voorwaarde
   verviel, en `.claude/gates.json` wijzigen is een gate die de eigenaar merget.
   *Waarom (herzien 2026-11-03):* zonder Codex valt een vangnet weg; de steekproef laat de eigenaar zien of de reviewer en de
   omvanggrens het opvangen, en de terugval maakt een fout goedkoop in plaats van ongemerkt. Geen teller in het script: niets
   in de kit telt nu agent-merges, en een sessie onthoudt het niet; de eigenaar telt in de thread. Zonder stop na een trigger
   kon de agent doormergen tot de eigenaar de terugzet-PR merget. Een gevraagde review die afrondt, maakt de voorwaarde
   bindend; vrij vragen gaf de agent dus een keuze om het vangnet te mijden.
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
- **Codex uitzetten (`false`) zonder vervanging (herzien 2026-11-03):** dan blijft alleen de verse reviewer over, zonder grens
  aan wat die moet overzien. Verworpen: geen tweede vangnet.
- **Codex verplicht houden:** de autonomie hangt dan aan een betaalde externe dienst en stopt als het tegoed op is. Verworpen.
- **Een andere externe reviewer:** een nieuwe dienst met eigen besluit en kosten. Niet nu.

## Gevolgen

- Licht werk in app-code en gewone docs gaat zonder wachtmoment naar `main`. In de template valt het meeste werk onder gates
  en blijft het bij de eigenaar; in een app is het grootste deel van de lichte fixes agent-mergebaar.
- Restrisico, bewust aanvaard: binnen Claude Code is het rolhek het vangnet tegen een merge buiten `pr:merge` om; de ruleset
  dwingt alleen groene verplichte checks en opgeloste gesprekken af, niet de inhoudstoets. Een agent die het script bewust
  omzeilt, houdt GitHub niet tegen.
- De bouw-PR is kritiek (`.github/**`, `.claude/**`, besluitscripts); de eigenaar merget hem en pusht de workflowwijziging.
  `docs/specs/agent-merge.md` gaat daarin naar `vervallen`, met de roadmap-items voor ADR 0029 stap 7 en ADR 0030 PR 2.
- Met `"indien-aanwezig"` gaat de agent-merge door als het Codex-tegoed op is, maar alleen voor PR's tot `maxRegels`
  regels zonder binair bestand; een grotere niet-kritieke PR merget de eigenaar, of de agent splitst hem in PR's onder de
  grens, elk met een eigen verse review. Restrisico's (herzien 2026-11-03): komt Codex pas na de merge met punten, dan telden
  ze niet, ook als Codex met tegoed nog bezig was toen de agent mergde; en onder het eigenaaraccount kan de sessie een Codex-commentaar verwijderen of bewerken (het rolhek weigert dat
  nu niet), zodat het spoor verdwijnt; of ze opent de PR als draft, zodat de automatische Codex-review niet start. Een Codex-review
  die mislukt terwijl er tegoed is, laat geen spoor na. Het verwijderen en de draft zijn een bewuste omzeiling, net als het script omzeilen hierboven; de steekproef
  en de terugval vangen het achteraf op.
- Meten (0046 punt 36): aantal agent-merges, met en zonder Codex-signaal, reverts daarvan en rode `main` na een agent-merge.
  Terugval zoals in punt 5: een revert van een agent-merge, één rode `main` door een agent-merge of één agent-merge van iets
  dat achteraf kritiek blijkt: modus via een PR terug naar `"eigenaar"`, melden, en dit besluit herzien. *Waarom (herzien
  2026-11-03):* ook een revert telt nu, omdat zonder Codex een fout eerder pas na de merge zichtbaar wordt.
