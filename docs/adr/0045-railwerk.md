# 0045 — Railwerk: rolhek, hooks uit main, ratchet, diff-guard en onderhoudsmodus

Status: geaccepteerd

Vervangt [0011](0011-railwerk.md), [0017](0017-diff-guard.md), [0031](0031-guard-en-pr-verify-bruikbaarder.md),
[0032](0032-developer-volgt-hoofdsessie-buiten-voorreview.md), [0033](0033-onderhoudsmodus-voor-templatewerk.md) en
[0034](0034-gedeelde-claude-permissies.md). Drempel: A4. Consolidatie zonder inhoudelijke wijziging (eigenaarbesluit
2026-10-21, [0038](0038-beslisroute.md) Gevolgen).

## Context

Railwerk faalt voor agents op voorspelbare plekken: een ongeteste hook laat een omweg door, een agent keurt via `gh` zijn eigen
werk goed, een lijst op drie plekken loopt uit elkaar, een regel na de code wordt nooit ingevoerd, een agent bouwt op verouderde
proza. Daarbij is de agent tot de GitHub App bestaat zelf de eigenaar: hij pusht met het account dat ook de enige goedkeurder
is, en GitHub laat een auteur zijn eigen PR niet goedkeuren. In de template bouwt de agent bovendien de rails zelf, en bijna al
dat werk valt onder `voorReview` ([0029](0029-snellere-beslisroute.md) punt 8, behouden door 0038 punt 8). Een hook die de agent
op zijn branch wijzigt, werkt direct in de lopende sessie; die grens moet blijven, maar niet via een prompt per bestand.

De uitbreiding naar zeven rollen ([0023](0023-tokenzuinige-werkstraat.md)) is niet gebouwd en verviel met 0029. Hoe een besluit
tot stand komt (merge is acceptatie, drempel, taakmandaat, CI-lus, merge- en force-pushverbod voor de hoofdsessie) staat in
0025, 0027, 0030 en 0038, niet hier.

## Besluit

**Rolhek en hooks**

1. **Eén rolhek** (was 0011 punt 1). `.claude/gates.json` is de enige lijst van gate-paden, testpaden, `jsonGates`
   (`package.json` → `scripts`), goedkeurders en schrijfrecht per rol. CODEOWNERS (`gates` + `jsonGates`) en `ask` worden ermee
   vergeleken door `check-docs`; de diff-guard leest dezelfde lijst.
2. **Hooks zijn gates** (was 0011 punt 2 en 11). Elke hook heeft een tabeltest met echte stdin-payloads en verwachte exitcode,
   inclusief bekende omzeilingen. Een rail-fix begint met een test die op de oude code faalt.
3. **Hooks draaien van `main`** (was 0033 punt 1; correctie op de plek uit 0011). De broncode staat in `rails/hooks/`;
   `.claude/hooks/` bevat alleen stubs die de versie van `main` uitpakken en starten. Het anker is de SHA van `main` op de
   remote, niet de lokale `origin/main`. De lader controleert zelf de hashes van commit, trees en bestanden; een vervalst object
   geeft een dichte hook, geen andere code. Het rolhek gebruikt geen netwerk. Rolhek en werkstraat falen dicht (exit 2) als het
   anker of de hook op `main` ontbreekt, en het rolhek maakt van elke andere exitcode dan 0 of 2 een 2; alleen de meethook
   faalt open. Een hookwijziging werkt pas na de merge, in de volgende
   sessie; tests importeren de branchversie. `rails/**` is een gate-pad en `voorReview`.
4. **Groen vóór klaar** (was 0011 punt 3). SubagentStop voor de developer blokkeert tot `gate:fast` groen is, ook bij een
   schone werkmap.
5. **Geen zelfreview** (was 0011 punt 4). Lokaal geblokkeerd en in CI zonder effect: reviews, het label `gate-wijziging`,
   statussen en check-runs via `gh`.
6. **Rollen** (was 0011 punt 8, gewijzigd in #94). Architect (spec en ADR), developer, tester, reviewer en een optionele docs-rol. Docs gaan
   mee in de PR van de code; een vaste docs-stap na de merge bestaat niet.
7. **Developer volgt de hoofdsessie** (was 0032). Op gate-paden buiten `voorReview` krijgt ook de developer-subagent geen deny
   en geen prompt, wel de melding dat het pad eigenaarreview in de PR vraagt. Ongewijzigd: een onbekende subagent krijgt de
   strengste rol (deny op elk gate-pad); het schrijfrecht van de andere rollen; migraties, gegenereerde bestanden en bestaande
   tests; `jsonGates`; op `voorReview` deny buiten het taakmandaat. Ontbreekt `voorReview`, dan telt elke gate als `voorReview`.

**Onderhoudsmodus en instellingen**

8. **Modus `onderhoud`, gebonden aan de template-repo** (was 0033 punt 2). Sleutel `onderhoud.repository` in `.claude/gates.json`,
   gelezen uit `main`, nooit uit de werkmap. De modus staat alleen aan als `origin` die repository is (hoofdletterongevoelig);
   een app uit de template heeft een andere origin en dus geen modus. Onleesbaar is uit.
9. **In `onderhoud`** (was 0033 punt 3–4) is `voorReview` voor hoofdsessie en developer een melding, zoals de overige
   gate-paden, behalve de lijst `altijdVragen` (`.github/**`, de hook-stubs, `settings.json`, `gates.json`, `decisions.json`,
   `package.json` en de lockfile): daar blijft ask voor de hoofdsessie en deny voor een subagent. De Edit-regels in `ask` van
   `.claude/settings.json` zijn gelijk aan `altijdVragen`; buiten de modus vraagt het rolhek zelf en faalt het dicht.
10. **Ongewijzigd, ook in `onderhoud`** (was 0033 punt 5): deny-regels en verboden git- en `gh`-acties (push naar `main`,
    force-push, `--no-verify`, mergen, reviews, het label `gate-wijziging`, check-statussen, `docker`), bestaande tests,
    gecommitte migraties, gegenereerde bestanden, `.env*`, `jsonGates`, het schrijfrecht van de andere rollen, de diff-guard,
    `check-document-status` en de merge door de eigenaar. De modus versoepelt de statusregels van 0038 niet.
11. **Gedeelde Claude Code-permissies** (was 0034, wijzigt 0033 punt 6). `acceptEdits` als standaardmodus en `allow` voor snelle
    checks, pushen naar een featurebranch, PR's aanmaken en lezend `gh`-werk staan in de gedeelde `.claude/settings.json`, niet
    alleen lokaal. Een `allow` heft geen `deny` of `ask` op; sandbox en hooks van `main` blijven gelden.

**Ratchet en feiten**

12. **Ratchet** (was 0011 punt 5). `.kit/baseline.json` plus ESLint bulk-suppressions: een nieuwe overtreding faalt, een
    opgeloste die nog in de baseline staat ook. De baseline laten groeien is een gate-wijziging.
13. **Gate-register** (was 0011 punt 6). `scripts/kit/gates.mjs` is de enige gate-tabel en gelijk aan `gate:fast`/`gate:slow`.
14. **Live feiten** (was 0011 punt 7). `scripts/kit/feiten.mjs` levert de feiten waarmee elke rol begint; proza die ze
    tegenspreekt, telt niet.

**Diff-guard en document-status**

15. **Regel** (was 0011 punt 9). Raakt een PR een gate-pad, `scripts` in `package.json`, of wijzigt hij een bestaande test, dan
    vraagt hij het label `gate-wijziging` én als laatste beslissende review een APPROVED van een goedkeurder die niet de auteur
    is, op exact de head-SHA. Paden NUL-gesplitst. De guard draait uit `main` (`pull_request_target`), de PR alleen als
    git-data.
16. **Gewijzigde test** (was 0017 OV-4) is een testpad met status `M`, `D`, `R` of `T` tegen de merge-base; toevoegen is vrij.
    Het rolhek blijft lokaal fijnmaziger; de guard is grof en onomzeilbaar.
17. **Overgang** (was 0017 OV-1 en OV-2, 0031 besluit 2). De guard is gebouwd maar niet verplicht tot de agent als GitHub App
    pusht. Is de auteur een goedkeurder, dan slaagt hij met een waarschuwing en een samenvatting van de geraakte paden; label en
    review worden niet gevraagd en de eigenaar merget zelf. Geen schakelaar: de overgang eindigt vanzelf met de App.
18. **Opnieuw draaien** (was 0017 OV-3): op `pull_request_target`, ook bij `labeled`; eerst goedkeuren, dan het label; Re-run
    als uitweg. `pull_request_review` pas heroverwegen met de App.
19. **De GitHub App** (was 0017 OV-5). Geen `workflows`-, `administration`- of `secrets`-recht; een goedkeuring door de App telt
    niet; de sleutel staat buiten de repo en is nooit leesbaar in de sandbox. Pas met de App wordt de guard verplicht.
20. **Twee jobs** (was 0031 besluit 1). `diff-guard` en `document-status` zijn aparte jobs met hun eigen naam, elk met de
    veiligheidscontroles en een `::error`-annotatie. `document-status` staat in `requiredChecks`; `diff-guard` niet (met de App
    is hij rood tot de eigenaarreview). Wordt de guard verplicht, dan beide namen.
21. **Correctie aan een geaccepteerd ADR** (was 0031 besluit 3, met 0038 punt 8). Normatief: een nieuw ADR. Een verwijzing naar
    een later ADR mag achter de statuswaarde. Een niet-normatieve correctie heeft geen eigen route meer; die verdwijnt bij
    vervanging.
22. **Strikte statusregel** (was 0031 besluit 4). Is de statusregel van een ADR nieuw of gewijzigd, dan staat achter de
    statuswaarde alleen een datum `(JJJJ-MM-DD)`, PR-nummers `#<nr>` en links naar bestaande ADR's met alleen het nummer als
    tekst, gescheiden door `, ` of ` — `. Ongewijzigde statusregels blijven geldig. Specs vallen erbuiten.
23. **`pr:verify` in een agent-worktree** (was 0031 besluit 5). Alleen ongetrackte bestanden onder `werkmapNegeer` (exacte paden
    of mapvoorvoegsels onder `.claude/`, gelezen uit `main`) tellen niet als vuile werkmap; een getrackte wijziging blijft
    weigeren. `.mcp.json` en `.claude/commands/` staan er niet in: dat beslist de app.
24. **Guard-preview later** (was 0031 besluit 6): een alleen-lezende voorspelling van de guard pas met de App, in een eigen PR.

**Database en uitrol**

25. **Functiecatalogus in pgTAP** (was 0011 punt 10). Elke functie in `public` en `app` is `client` of `intern`; grants passen
    bij de klasse; elke client-functie controleert de actor; elke `security definer` heeft `search_path = ''`.
26. **Inrichting en supply chain** (was 0011 punt 12). `check-github` eist verplichte checks van GitHub Actions, `enforce_admins`
    en conversation resolution; scanner-uitzonderingen hebben een reden en een einddatum; secret scanning met Betterleaks;
    image op digest.
27. **Release dubbel bewaakt** (was 0011 punt 13). `check-release-ci` vóór en na de build; `check-deployment-schema` faalt dicht
    en weigert een preview tegen de productiedatabase.
28. **Patronen** (was 0011 punt 14). Idempotente mutaties (request-UUID vóór het netwerk, bonnetabel met payload-hash, advisory
    lock, tombstone) en clientfouten (allowlist-velden, geen PII, 5 minuten dedupe, build-SHA).

Bewust niet (was 0011): checks op SQL met regex (de template leest de catalogus) en de volledige testset bij elke stop.

## Alternatieven

- **Losse hooks per rol met eigen lijsten** (was 0011): lijsten lopen uit elkaar, omzeilingen per hook opnieuw gevonden.
- **Alleen CI als bewaker** (was 0011): de agent hoort pas na een push dat hij een grens raakte.
- **Alleen CODEOWNERS met code-owner-review** (was 0017): ziet niet of een bestaande test wijzigt, en werkt pas met de App.
- **De guard als stap in de CI van de PR** (was 0017): draait de workflow van de PR zelf, die kan hem dan uitzetten.
- **Guard nu verplicht, of label genoeg** (was 0017): blokkeert elke gate-PR, of de agent zet het label met hetzelfde token zelf.
- **Eén job of een matrix-job** (was 0031): de checklijst toont de verkeerde naam of het is een rename.
- **`pr:verify` met `--untracked-files=no`** (was 0031): een vergeten nieuw bestand valt weg, ook een test.
- **Alleen `settings.local.json`, hooks uitzetten, of `voorReview` inkorten voor iedereen** (was 0033): een lokale `allow`
  heft een project-`ask` niet op; zonder hooks vallen ook de deny's weg; in een app moeten `.claude/**` en `scripts/**` dicht.
- **Rails als eigen pakket** (was 0033): zuiverder, maar te vroeg zolang de rails dagelijks veranderen.
- **Developer houdt deny buiten `voorReview`, of ook onbekende subagents verruimen** (was 0032): schuift werk naar de
  hoofdsessie zonder extra bescherming; een verkeerd benoemde agent zou het rolhek omzeilen.

## Gevolgen

- De echte grens is de diff-guard uit `main` plus de merge door de eigenaar. Een developer-subagent kan zonder prompt
  `src/core/**` en `deploy/**` wijzigen; daar beschermen CODEOWNERS, de guard en de review (was 0032).
- Een ongetrackt bestand onder een genegeerd pad valt in `pr:verify` niet op; een ongetrackte `.mcp.json` of
  `.claude/commands/` laat hem weigeren tot de app kiest (was 0031).
- In andere runtimes werken de hooks niet; daar zijn CI en GitHub de enige grens (was 0033).
- Een bouwbewijs voor `gebouwd` eist ook `document-status` op de bron-SHA (was 0031).
- `check-github`, `check-release-ci` en `check-deployment-schema` (punt 26–27) zijn besloten, maar nog niet gebouwd.
