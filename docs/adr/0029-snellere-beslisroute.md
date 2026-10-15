# 0029 — Snellere beslisroute: één PR per besluit, ADR-drempel en mini-spec

Status: voorgesteld

Wijzigt [0027](0027-taakmandaat-voor-frameworkwerk.md) punt 2 en vult [0025](0025-werkstraat-tot-de-merge.md) punt 1 en 10 aan.
Vervangt [0023](0023-tokenzuinige-werkstraat.md) (eigenaarbesluit 2026-10-15; de status daar zet de eigenaar, zie Gevolgen).
Wijzigt [0030](0030-ci-lus-en-agent-merge.md) punt 2 (waarde `"feature-lane"` van de sleutel `merge`) en punt 4–5 voor de feature-lane (punt 14).
ADR-drempel (punt 4): A3 (punt 9, 14 en 18 verruimen wat de agent zonder prompt, eigenaarreview of eigenaarmerge doet) en A4 (0027 punt 2, 0030).
Eigenaarbesluiten 2026-10-15 (in de sessie): P1–P7, `_mini.md`, 0023 vervangen, en de punten gemarkeerd met "(besluit 2026-10-15)".

## Context

Een besluit kost nu 2–3 PR's: voorstel, status (`pnpm docs:decision` + `pnpm docs:status`, ADR 0027), soms een registerfix.
Gemeten met `gh pr list`: ADR 0025 #99 → #101 (2 PR's, 1u53m), ADR 0026 #115 → #116 (2, 2u03m), ADR 0028 #131 → #133 + #134
(3, 3u17m). Een statuswijziging zelf is snel (#126: 4m42s); de wachttijd zit in het aantal ronden. Van de laatste 40 gemergde
PR's (#93–#134, 11–13 okt) leveren er ~5 productfunctionaliteit (#93, #117, #128, #129, #111); de rest is docs, hooks, rails en
scripts. Meta-ADR's 0023, 0025, 0027 en 0028 hadden deels een frameworkregel kunnen zijn. De spec-plicht (framework §8 stap 1)
eist het volledige sjabloon bij elke migratie, route of permissie.

Wat het register wel en niet bewijst: `canRecordStatus` (`.claude/hooks/lib/task-authority.mjs:86`) accepteert een
statusovergang alleen met een record op main met dezelfde digest én het document al op main (`currentDecision`, :78).
Daarom faalt een status die de eigenaar in de voorstel-PR zelf zet nu in `check-document-status.mjs` (`verifyDocument`).
Het echte vertrouwensanker is in beide routes dezelfde: de merge door de eigenaar (ADR 0027, "Vertrouwensgrens"). De agent
pusht onder het account van de eigenaar, dus geen PR-artefact (auteur, committer, web-flow-handtekening) onderscheidt eigenaar
van agent; ook de contents-API van `gh` maakt een web-flow-commit. De tweede PR voegt dus geen verifieerbare kracht toe,
alleen een ronde. Het register heeft wél eigen waarde voor het broncodemandaat (`canWriteProtected`: paden + bouwbranch).

Prompts: `ask` in `.claude/settings.json:55-119` spiegelt CODEOWNERS min `OWNERS_ONLY` (`scripts/kit/check-docs.mjs:21`,
`mirrorViolations` :203), en het rolhek vraagt de hoofdsessie op elk gate-pad opnieuw (`gate()`,
`.claude/hooks/lib/rolhek.mjs:121`). Een prompt op bijvoorbeeld `docs/roadmap.md` voegt niets toe wat diff-guard en
CODEOWNERS in de PR niet al afdwingen. Meten: ADR 0023 (`voorgesteld`) is grotendeels niet gebouwd; alleen het meetpunt is
nog nodig, en dat telt tokens, geen prompts of weigeringen (`docs/reviews/2026-10-15-principes-inventaris.md`, correctie 2, D-2).
Bron voor deze herziening: dezelfde inventaris met de eigenaarbesluiten van 2026-10-15.

## Besluit

**Principes.** Elk punt hieronder volgt uit deze zeven; framework §1 krijgt er in stap 5 een korte versie van.

- **P1 Bewijs vóór uitbreiding.** Geen nieuwe template-capability, rail of meta-ADR zonder aanleiding: een app-behoefte, een
  doorgeglipte fout of gemeten wrijving.
- **P2 Rails blijven.** Nooit een check, test, hook, RLS-regel of type afzwakken voor autonomie.
- **P3 Prompts alleen voor wat werkt vóór review**: code die op de machine van de eigenaar of in CI draait, en de eigen
  instructies en rechten van de agent. De rest is zichtbaar in de PR via CODEOWNERS en diff-guard.
- **P4 Eén ronde per besluit.** Framework-lane streng; feature-lane met mini-spec; spec en bouw in één PR.
- **P5 Wat een check kan, is een check.** Elk acceptatiecriterium heeft een test (AC→test); elke PR een risico-overzicht.
- **P6 Meten vóór en na.** Een wijziging aan de werkstraat heeft een nulmeting en een vergelijking.
- **P7 Eén bron per feit,** en die beschrijft de huidige werking.

**Framework-lane** (punt 1–4): alles wat `src/core`, rails, gates of agentconfiguratie raakt, en elk besluit met een ADR.

1. **Eén PR per besluit; de merge is het besluit.** De architect levert spec of ADR als `voorstel`/`voorgesteld`. De eigenaar
   zet de statusregel in dezelfde PR (GitHub-webeditor) en merget. Geldt voor `goedgekeurd`, `geaccepteerd`, `vervallen` en
   `vervangen door NNNN`. De agent zet die regel nooit (AGENTS.md, ADR 0025 punt 10 blijven gelden). `gebouwd` blijft bij
   `pnpm docs:status --pr` met bouwbewijs (ADR 0027 punt 4). In de framework-lane bevat die PR alleen het besluit (en een
   eventueel record, punt 2); bouwen gebeurt in een volgende PR.
2. **Register alleen voor broncodemandaat en verplichte checks.** `.claude/decisions.json` houdt naast de records ook
   `requiredChecks`, de lijst die `pnpm pr:verify` leest (`scripts/kit/pr-verify.mjs:102`); punt 16 voegt daar een check aan
   toe. Verder krijgt een statusbesluit geen record. Een spec die beschermde bronbestanden nodig heeft, krijgt zijn
   `pnpm docs:decision`-record in díe PR; na de merge staan document en record samen op main en is het mandaat actief. Een ADR
   of spec zonder `--path` krijgt geen record: de status op main is zelf het bewijs (eerste tak van `canRecordStatus`).
3. **Wat de guard controleert** (minimale wijziging in `verifyDocument`, als `canRecordStatus` faalt en de overgang van
   `voorstel`/`voorgesteld` of een nieuw bestand naar een eigenaarstatus gaat): (a) de commit die de statusregel zette wijzigt
   alleen statusregels (`statusOnlyDiff(parent, commit)`); (b) de digest op HEAD is gelijk aan die op die commit, dus geen
   inhoud na de status; (c) de committer is GitHub web-flow. (c) is frictie tegen een per ongeluk gepushte status, géén
   identiteitsbewijs. De uitslag meldt "statusovergang in de PR; bevoegdheid is de merge door de eigenaar (overgang, ADR 0017)".
   Niet verifieerbaar: wíe de regel zette en of de eigenaar las. Tot deze wijziging op main staat, geldt de route van ADR 0027.
4. **Drempel voor een ADR.** Een ADR is nodig als minstens één geldt; de ADR noemt welke: **A1** raakt twee of meer zones
   (`src/core`, `src/web`, `src/api`, `db/`, `.github/`, `.claude/`) of het contract daartussen; **A2** moeilijk terug te draaien:
   migratie op bestaande rijen, rollen/RLS-model, auth of identiteit, provider of nieuwe dependency; **A3** verruimt rechten van
   agent of rol, of zwakt een check, hook of gate af; **A4** wijzigt of vervangt een geaccepteerde ADR. Anders: een regel in
   `docs/framework.md` of `docs/` met PR-nummer, via de gewone gate-PR met eigenaarreview. Een strengere check is geen ADR.

**Feature-lane** (punt 5–7): app-werk zonder ADR.

5. **Mini-spec** in een eigen sjabloon `docs/specs/_mini.md` (besluit 2026-10-15), voor een route, een permissie of een
   nieuwe tabel: koppen Doel, Rollen en wie wat ziet, Routes en foutcodes, Acceptatiecriteria (randgevallen als criterium),
   Hergebruik en UX (verplicht niet-leeg vanaf `goedgekeurd`, `check-docs.mjs:185`; zonder UI "n.v.t. — reden"), en bij een
   nieuwe tabel "Datawijzigingen (met grants)". Frontmatter gelijk (`status`, `namespace`, `model`) plus de marker
   `sjabloon: mini`, die `check-docs` controleert (besluit 2026-10-15). **Migraties** (besluit 2026-10-15): alleen een nieuwe
   tabel via `pnpm new:resource` (RLS, grants en pgTAP uit de generator). Alles onder A2 (bestaande rijen, rollen/RLS-model,
   `security definer`) en elke wijziging in `src/core` blijft framework-lane met het volledige sjabloon (`_template.md`).
6. **Route.** Bereik: app-werk in `src/{api,web,shared}`, inclusief `src/api/app.ts` en `src/shared/permissions.ts` (besluit
   2026-10-15; na punt 18 geen gate meer), nieuwe tests, een nieuwe migratie volgens punt 5 en
   `docs/specs/`; géén `src/core`, rails (`scripts/`, `.github/`, hooks, checkconfiguratie) of agentconfiguratie. De mini-spec
   ontstaat uit de verhelderende vragen van de architect; de eigenaar keurt hem in de sessie goed vóór het bouwen; spec en
   bouw gaan in één PR; de merge is het formele akkoord (door de eigenaar, of door de agent volgens punt 14). De statusregel
   volgt punt 1 en 3.
7. **Herkenning in `check-document-status`** (ontwerp; bouwen in de bouw-PR van deze ADR, test-eerst). De tak van punt 3
   geldt alleen voor (i) een framework-lane-PR die naast het besluitdocument hooguit zijn record wijzigt, of (ii) een
   feature-lane-PR. Een PR is feature-lane als: precies één spec in de diff een eigenaarstatus krijgt; die spec uit `_mini.md`
   komt (`sjabloon: mini`); en elk ander pad uit de diff (bij een rename beide
   paden, zoals `verifyScope` :93) binnen het bereik van punt 6 valt: geen `src/core/**`, geen pad uit `voorReview` (punt 9),
   geen ADR, geen gewijzigde of verwijderde bestaande test, migraties alleen nieuw (status `A`). Valt één pad erbuiten, dan
   vervalt de tak en geldt de strenge route: zonder geldig record op main faalt de status (huidige `canRecordStatus`).
   `verifyScope` (`scripts/kit/check-document-status.mjs:90`) blijft ongewijzigd voor specs met een record. Diff-guard en
   CODEOWNERS blijven voor elk gate-pad in de PR gelden (bijv. `src/api/kit.ts`).
   Tabeltests in `test/rails/` met fixtures. Positief: mini-spec + `src/web/**` + `src/api/routes/**` + nieuwe test slaagt;
   framework-lane-PR met alleen een ADR slaagt. Negatief (moet falen): mini-spec plus (1) een pad in `src/core/**`; (2) een
   pad uit `voorReview` (`.claude/**`, `scripts/**`, `.github/**`, `package.json` → `scripts`); (3) een gewijzigde of
   verwijderde bestaande test; (4) een ADR in dezelfde PR; (5) twee specs naar een eigenaarstatus; (6) een gewijzigde
   migratie; (7) een rename van `src/core/x` naar `src/web/x`; (8) een volledige spec (`_template.md`) met code; (9) een
   statuscommit die ook inhoud wijzigt, inhoud na de status of een andere committer dan web-flow (punt 3); (10) een
   framework-lane-PR met een in-PR-status én code.

**Promptbeleid (P3).**

8. **Lijst `voorReview`** in `.claude/gates.json`, een deelverzameling van `gates` + `jsonGates`. De lijst ontstaat in de
   bouw-PR van punt 1–3 en 7: daar gebruikt alleen de lane-herkenning hem, en `check-docs` controleert dat hij binnen
   `gates` + `jsonGates` valt. Prompts en rolhek veranderen pas in punt 9. Een pad hoort erin als het
   effect heeft vóór review: (a) het bestand is gereedschap dat op de machine van de eigenaar of in CI draait (scripts, CI,
   hooks, dependencies, omgeving, configs); app- en testcode vallen er niet onder, want die draaien geïsoleerd in de runner
   (ADR 0009) (besluit 2026-10-15); (b) het wijzigt instructies, rechten of hooks van de agent; (c) het verandert de vertrouwde
   basis van checks. Toetsing van de huidige gates (`.claude/gates.json:3-54`), twijfelgevallen besloten 2026-10-15:

   | Gate-pad | `voorReview` | Reden |
   |---|---|---|
   | `AGENTS.md`, `CLAUDE.md`, `docs/framework.md`, `docs/dod.md`, `.claude/**` | ja | (b) instructies, rechten, hooks |
   | `scripts/**`, `.github/**`, `lefthook.yml`, `package.json` (`scripts`) | ja | (a) draait lokaal of in CI |
   | `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `.pnpmfile.cjs` | ja | (a) installatie draait code |
   | `compose*.yaml`, `db/init/**`, `db/docker/**`, `db/test.env`, `Dockerfile`, `.dockerignore`, `mise.toml` | ja | (a) omgeving |
   | `vitest.config.ts`, `playwright.config.ts`, `vite.config.ts` | ja | (a)+(c) runnerconfig |
   | `docs/roadmap.md`, `docs/adr/**`, `docs/specs/**`, `docs/nieuwe-app.md` | nee | documentatie; zichtbaar in de PR |
   | `src/api/{kit,server,env}.ts` | nee | appcode als onderwerp van checks |
   | `src/api/app.ts`, `src/shared/permissions.ts` | nee | appcode; gaan na punt 18 helemaal uit `gates` |
   | `deploy/**` | nee | draait pas bij release, na de merge |
   | `renovate.json` | nee | Renovate leest de default branch |
   | `.gitattributes` | nee | geen code; drivers staan in `.git/config` |
   | testpaden (`**/*.test.*`, `**/*.spec.*`, `e2e/**`, `test/**`, `db/tests/**`) | nee | nu al zonder `ask` (`OWNERS_ONLY`); rolhek ongewijzigd |
   | `eslint.config.*`, `.dependency-cruiser.*` | ja | (a)+(c): JS-config die lint en ratchet uitvoeren |
   | `tsconfig*.json`, `.prettierrc.json`, `.prettierignore` | ja | (c): bepaalt wat typecheck en opmaak accepteren |
   | `.kit/**`, `eslint-suppressions.json`, `osv-scanner.toml` | ja | (c): een versoepeling maakt de groen-lus onbetrouwbaar |
   | `.betterleaksignore` | ja | (c): een genegeerd geheim is na de push niet terug te draaien |
   | `.env.example` | ja | (a): `scripts/dev.mjs:29` kopieert hem naar `.env.local`; demo-waarden zijn een securityregel |
   | `src/core/**` | nee | appcode; blijft dicht via `check-core` en CODEOWNERS |

9. **Gevolg voor prompts** (stap 7, na punt 10). `ask` (Edit-regels) = `voorReview`; de `ask`-regels voor commando's (`pnpm add`, runnerchecks, `sed -i`, …)
   blijven. Het rolhek vraagt de hoofdsessie alleen nog op `voorReview` (`gate()`); op andere gate-paden geeft het een melding
   ("gate-pad: eigenaarreview in de PR"). Subagentrollen, migraties, gegenereerde bestanden en bestaande tests blijven in het
   rolhek ongewijzigd. CODEOWNERS blijft = `gates` + `jsonGates`; de diff-guard blijft gelijk. De spiegelregel in `check-docs`
   wordt "`ask` = `voorReview`". `src/core` blijft in een app
   dicht (`check-core`).
10. **Volgorde: compensatie vóór versoepeling.** Punt 9 (en punt 14 en 18) wordt pas gebouwd als (1) de AC→test-check en het risico-overzicht
    in de diff-guard (P5) op main staan en (2) deze ADR `geaccepteerd` is.

**Meten (P6).** Vervangt ADR 0023; neemt het meetpunt (0023 punt 2) verbreed over.

11. **Per besluit:** aantal PR's dat het document of zijn record raakt tot de eindstatus op main, en doorlooptijd van
    `createdAt` eerste PR tot `mergedAt` laatste, via `gh pr list --state merged --json number,createdAt,mergedAt,files`.
    Basislijn mediaan: 2 PR's, 2u03m.
12. **Per sessie en branch.** Hooks op de Claude Code-events voor een permissievraag en een weigering (vermoedelijk
    `PermissionRequest` en een weigerings-event; **te verifiëren in de Claude Code-docs** vóór de bouw), plus de bestaande
    events voor beurten. Fail-open (exit 0 bij een fout), zonder netwerk, elk met een tabeltest in `test/hooks/`. Opslag:
    alleen tellingen en paden, buiten git-tracking (in de git-dir, zoals 0023 punt 3); nooit promptinhoud, commando-argumenten
    buiten het commandoprefix, of geheimen. Overzichtscommando (voorstel: `pnpm meting`) toont per sessie/branch: prompts per pad
    of commandoprefix, weigeringen, beurten, CI-rondes (via `gh`, met timeout; zonder netwerk "onbekend") en correcties van de
    eigenaar: elk eigenaarbericht na de opdracht in dezelfde sessie, als telling (een bovengrens; besluit 2026-10-15).
13. **Nulmeting** vóór punt 9: `pnpm new:resource demo --dry-run` (`scripts/kit/new-resource.mjs:523`) plus een
    walk-through van het gouden pad (`docs/gouden-pad.md`), droog, zonder merge. Dezelfde opdracht na elke wijziging aan de
    werkstraat. **Herzien** na de eerste 5 besluiten als de mediaan > 1 PR is of de doorlooptijd niet onder de basislijn
    ligt; direct bij één status op main zonder statuscommit van de eigenaar in de PR; en na punt 9 als prompts niet dalen of
    weigeringen, blokkerende reviewbevindingen of correcties stijgen ten opzichte van de nulmeting.

**Agent-merge in de feature-lane** (besluit 2026-10-15).

14. **Wanneer.** De hoofdsessie merget een feature-lane-PR zelf, met exact `gh pr merge <nr> --squash` (vorm uit 0030 punt 4),
    als alles geldt: (1) `pnpm pr:verify <nr>` is groen op de head-SHA (alle verplichte checks); (2) een onafhankelijke
    reviewer (eisen framework §8) gaf akkoord op die SHA en er staat geen blokkerende bevinding open; (3) de diff-guard
    bevestigt de lane: geen pad uit `voorReview`, geen `src/core`, geen gewijzigde of verwijderde bestaande test, geen
    gewijzigde migratie, geen ADR (dezelfde herkenning als punt 7); (4) de voorwaarden uit 0030 punt 2–3 gelden: de
    merge-sleutel `merge` in `.claude/gates.json` staat op `"feature-lane"` op `origin/main`, en de ruleset is bewezen via
    `scripts/check-github.mjs` tegen `.github/settings/main-protection.json` (de harde grens blijft GitHub, 0030 punt 6).
    **Die drie bestaan nog niet**; ze hoorden bij 0030 PR 2, die geparkeerd is. De stap agent-merge bouwt ze daarom zelf:
    `scripts/check-github.mjs` (alleen-lezend), de settings als code, en de sleutel `merge: "eigenaar" | "feature-lane" |
    "agent-na-akkoord"` (ontbreekt of onleesbaar → `"eigenaar"`, gelezen uit `origin/main` zoals 0030 punt 2). De waarde
    `"agent-na-akkoord"` blijft ongebruikt zolang 0030 PR 2 voor de framework-lane geparkeerd is; `check-docs` faalt erop. De eigenaar krijgt achteraf een melding: de eindmelding van `opleveren` én
    een commentaar op de PR. In de framework-lane merget de eigenaar, ongewijzigd.
15. **Verhouding tot 0030.** Voor de feature-lane vervangen (2) en (3) het akkoord per PR in de sessie (0030 punt 4) en de eis
    "raakt geen gate-pad" (0030 punt 5); `--admin`, `--auto`, `gh api …/merge` en subagent-merge blijven deny. De algemene
    agent-merge (0030 PR 2) blijft voor de framework-lane geparkeerd (inventaris B-8). 0030 krijgt een verwijsregel
    "Gewijzigd door 0029".
16. **Volgorde.** Actief pas als de AC→test-check en het risico-overzicht in de diff-guard (P5) op main staan en deze ADR
    `geaccepteerd` is (punt 10). Daarnaast moet de lane-uitslag meetellen in `pr:verify`: nu draait `check-document-status` in
    de niet-verplichte job `diff-guard` (inventaris, besluit 2; ADR 0031 PR 2), en `pr:verify` kent alleen de namen uit
    `requiredChecks` in `.claude/decisions.json`. `diff-guard` (of een aparte lane-check) komt in `requiredChecks` (punt 2).
17. **Zwakte.** De agent pusht en merget onder het account van de eigenaar: de merge is geen identiteitsbewijs, en het
    reviewerakkoord is een sessie-artefact (geen GitHub-review; `gh pr review` blijft deny), dus niet verifieerbaar in CI. De
    grens ligt in de diff-guard en de verplichte checks. Na punt 18 kan de agent ook een feature met een nieuwe route of
    permissie zelf mergen; een PR met een ander gate-pad haalt de diff-guard alleen met een eigenaarreview op de head-SHA.
18. **`src/api/app.ts` en `src/shared/permissions.ts` uit `gates`** (besluit 2026-10-15; A3). Ze verdwijnen daarmee ook uit
    CODEOWNERS en uit de eis van eigenaarreview in de diff-guard. Compensatie: het risico-overzicht in de diff-guard (P5)
    noemt elke nieuwe of gewijzigde permissiesleutel en elke nieuwe route; de bestaande rails blijven (`defineRoute`, een test
    per verboden rol per route, `can()`). Zwakte: minder menselijke review op juist de bestanden die bepalen wie wat mag; de
    eigenaar ziet een nieuwe permissie of route alleen nog in het risico-overzicht en de melding achteraf. Volgorde als punt 10:
    pas na de P5-checks.

## Alternatieven

- **Agent levert direct met `geaccepteerd`, merge = akkoord**: verworpen; botst met AGENTS.md en ADR 0025 punt 10, en een
  `voorgesteld` document kan dan niet meer bewust geparkeerd op main staan.
- **Register-PR houden, sneller mergen**: verworpen; het aantal ronden blijft, zonder extra bewijs.
- **Status uit het register laten afleiden (geen statusregel)**: verworpen; groter dan nodig, raakt hooks, generator en feiten.
- **Volledig sjabloon houden met "n.v.t."**: verworpen; de kosten zitten in het schrijven en lezen, niet in de check.
- **Mini-spec als frontmatterveld van `_template.md`**: verworpen door de eigenaar; een apart sjabloon is korter te lezen.
- **`ask` ongewijzigd laten**: verworpen (P3); prompts zonder effect vóór review leren de eigenaar door te klikken.
- **Gates uit CODEOWNERS of diff-guard halen om prompts te besparen**: verworpen (P2); de enige uitzondering is punt 18, met
  compensatie in het risico-overzicht.
- **`ask` versoepelen vóór de P5-checks**: verworpen; eerst compensatie (punt 10).
- **Agent-merge ook in de framework-lane**: verworpen; daar blijft de eigenaar mergen (0030 PR 2 geparkeerd).
- **Agent-merge met akkoordprompt per PR (0030 punt 4) ook in de feature-lane**: verworpen; de prompt kost een ronde zonder
  extra bewijs zolang lanecheck, verplichte checks en onafhankelijke review gelden.
- **ADR 0023 bouwen zoals voorgesteld** (`pnpm tokens`, `pnpm stand`, agent `onderzoek`, sessiebudget): verworpen (P1);
  tokens meten niet wat deze ADR stuurt (ronden, prompts, correcties). De tekst van 0023 blijft daar staan.

## Gevolgen

Na invoering: één PR per besluit, spec en bouw samen in de feature-lane, minder prompts, minder meta-ADR's; de zwakte blijft
gelijk (merge-afspraak, `overgang`), en geldt na punt 14 ook voor de merge door de agent (punt 17). Wijzigingen in andere bestanden (beschermd; elk met eigenaarakkoord), in volgorde:

- **Eigenaarstap bij acceptatie:** ADR 0023 → `vervangen door 0029`; de agent zet die status niet.
- **Stap 3 (meten):** hooks uit punt 12 in `.claude/hooks/` + `.claude/settings.json`, het overzichtscommando in `scripts/kit/`
  en `package.json`, tests in `test/hooks/`; framework §8 (fail-open meldhooks naast de blokkerende hooks); nulmeting (punt 13).
- **Bouw-PR punt 1–3 en 7:** `scripts/kit/check-document-status.mjs` (tak en lane-herkenning) met fixtures in `test/rails/`;
  de lijst `voorReview` in `.claude/gates.json` (punt 8) met een `check-docs`-regel dat hij binnen `gates` + `jsonGates` valt;
  `docs/specs/_mini.md` nieuw; `check-docs` kent het frontmatterveld van de mini-spec; `docs/operations/agent-doorloop.md`
  ("Besluit en taakscope voorbereiden"); `docs/roadmap.md` (controle als deel van `check-spec-approval`).
- **Stap 5 (teksten):** `docs/framework.md` regel 4 (drempel uit punt 4), §1 (korte versie P1–P7), §8 stap 1 en licht pad
  (lanes, mini-spec), §10 "Meten" (`docs/framework.md:441-444`, naar punt 11–13) en "Beschermde paden" (`voorReview`);
  `AGENTS.md` Werkafspraken (mini-spec, lanes); ADR 0027 en 0025 alleen een verwijsregel "Gewijzigd door 0029".
- **Vóór stap 7:** de PR('s) van P5: AC→test-check en risico-overzicht in de diff-guard.
- **Stap 7 (prompts, pas na punt 10):** Edit-regels in `ask` in `.claude/settings.json`;
  `gate()` in `.claude/hooks/lib/rolhek.mjs`; spiegelregel in `scripts/kit/check-docs.mjs` (`mirrorViolations`, `OWNERS_ONLY`);
  tests `test/rails/check-docs-gates.test.ts`, `test/rails/sandbox-settings.test.ts` en de rolhektests (nieuwe gevallen; een
  bestaande test aanpassen alleen met reden in de PR); framework §8/§10. Label `gate-wijziging`.
- **Stap 7 of later (agent-merge, pas na punt 16; nog te bouwen):** de onderdelen van 0030 PR 2 die punt 14 nodig heeft:
  `scripts/check-github.mjs` (alleen-lezend), `.github/settings/main-protection.json` (settings als code) en de sleutel
  `merge` in `.claude/gates.json` met de `check-docs`-regel uit punt 14; `ghForbidden` in `.claude/hooks/lib/rolhek.mjs`
  (exacte mergevorm alleen voor de hoofdsessie bij `"feature-lane"` en een bevestigde lane, met tabeltests in `test/hooks/`);
  `.claude/settings.json` (`Bash(gh pr merge*)` uit `deny`; `--auto`, `--admin` en `gh api *merge*` blijven deny); skill
  `opleveren` (voorwaarden punt 14, reviewer-SHA, melding); `scripts/kit/diff-guard.mjs` en `.github/workflows/guard.yml`
  (lane-uitslag); `requiredChecks` in `.claude/decisions.json` (punt 16); framework §8 stap 6/7 en §10, AGENTS.md ("merge
  nooit"), CLAUDE.md; ADR 0030 verwijsregel. Wijzigingen in `.github/workflows/**` pusht de eigenaar
  (`docs/framework.md:438`); dat is een afspraak, geen technische grens zolang de agent onder het account van de eigenaar pusht.
- **Stap 7 (versoepeling, na P5): punt 18.** `src/api/app.ts` en `src/shared/permissions.ts` uit `gates` in
  `.claude/gates.json` en uit `.github/CODEOWNERS` (en uit `ask`); `check-docs`-fixtures voor de spiegeling
  (`test/rails/check-docs-gates.test.ts`, nieuwe gevallen); `scripts/kit/new-resource.mjs` (behandelt beide nu als gate,
  :6 en :378) met `test/rails/new-resource.test.ts`; framework §10 "Beschermde paden". Label `gate-wijziging`.

## Niet beslist

- **GitHub App (ST-01, W-3 geparkeerd 2026-10-12)** opnieuw wegen als structurele oplossing: de agent pusht onder het account
  van de eigenaar, die eigen PR's niet formeel kan goedkeuren (diff-guard `overgang`). Pas met een App wordt punt 3 een
  identiteitsbewijs en punt 14 een merge met eigen identiteit. Geen token-, App- of credentialwerk in deze ADR.
- (c) uit punt 3 als harde voorwaarde of alleen melding.
- Drempelwaarden uit punt 13.
- De eventnamen voor de meethooks uit punt 12: te verifiëren in de Claude Code-docs.
