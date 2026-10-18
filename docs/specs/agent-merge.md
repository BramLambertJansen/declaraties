---
status: goedgekeurd # voorstel | goedgekeurd | gebouwd | vervallen — alleen de eigenaar zet goedgekeurd; gebouwd: # #<PR>; gevalideerd: <sha> (pnpm docs:status)
namespace: agent-merge
---

# Agent-merge in de feature-lane (ADR 0029 stap 7)

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan staat het onder "Nog niet beslist".

## Doel

De hoofdsessie merget een feature-lane-PR zelf met exact `gh pr merge <nr> --squash --match-head-commit <sha>` (`<sha>` = lokale
`HEAD`), na een permissieprompt, alleen als de voorwaarden uit [ADR 0029](../adr/0029-snellere-beslisroute.md) punt 14–16 en de
eigenaarbesluiten hieronder aantoonbaar gelden, onder het account van de eigenaar.

### Uitgangspunt (opdracht van 2026-10-18; de eigenaar bevestigt het met de status `goedgekeurd`)

- Route 2: agent-merge nu bouwen, onder het account van de eigenaar. Geen GitHub App; ST-01 blijft open.
- De zwakte uit ADR 0029 punt 17 is geaccepteerd: de merge is geen identiteitsbewijs, het reviewerakkoord is een sessie-artefact,
  en de diff-guard staat voor de eigenaar als auteur op `overgang` (groen met waarschuwing, `scripts/kit/diff-guard.mjs:166`).
- De voorwaarden uit ADR 0029 punt 10 en 16 zijn vervuld op `origin/main` `1c56274`: AC→test-check en risico-overzicht (#167, #170,
  `docs/roadmap.md:451`), ADR 0029 `geaccepteerd`.
- Eigenaarbesluiten V-1 tot en met V-4 en V-6 (zie "Besloten door de eigenaar") zijn in de hele spec doorgevoerd.

### Huidige stand (origin/main `1c56274`)

| Onderdeel | Stand | Bron |
|---|---|---|
| `scripts/check-github.mjs` | bestaat niet; framework §10 beschrijft hem al | `docs/framework.md:415-418`, `docs/nieuwe-app.md:366` |
| `.github/settings/main-protection.json` | bestaat niet; alleen `.github/settings/.gitkeep` | — |
| Ruleset als script | `scripts/github-ruleset.sh` met payload; test op checknamen | `test/scripts/github-ruleset.test.ts` |
| Sleutel `merge` in `.claude/gates.json` | bestaat niet; `loadConfig` kent hem niet | `rails/hooks/lib/rolhek.mjs:34` |
| Mergen | deny voor elke rol in `ghForbidden` en `Bash(gh pr merge*)` | `rails/hooks/lib/rolhek.mjs:659`, `.claude/settings.json:45-46` |
| Lane-herkenning | `laneVan` in `scripts/kit/lane.mjs`; alleen gebruikt door `check-document-status` | `scripts/kit/check-document-status.mjs:241` |
| Config van de diff-guard | `leesConfig` leest alleen `gates`, `testpaden`, `goedkeurders`, `jsonGates` | `scripts/kit/diff-guard.mjs:61-83` |
| Verplichte checks voor `pr:verify` | `requiredChecks` in `.claude/decisions.json`, met `document-status`, zonder `diff-guard` | `.claude/decisions.json` |
| Skill `opleveren` | "de hoofdsessie merget nooit"; `allowed-tools` zonder `gh pr merge` | `.claude/skills/opleveren/SKILL.md:4` (`allowed-tools`), `:27` (merget nooit) |
| Roadmap | geen item "ADR 0029 stap 7: agent-merge"; alleen het geparkeerde "ADR 0030 PR 2" | `docs/roadmap.md:230` |

Twee correcties op de opdracht, uit de feiten:

1. Het rolhek staat sinds ADR 0033 in `rails/hooks/lib/rolhek.mjs`; `.claude/hooks/rolhek.mjs` is een stub die de versie van `main`
   laadt. `.claude/hooks/lib/rolhek.mjs` bestaat niet. Deze spec gebruikt `rails/hooks/lib/rolhek.mjs`.
2. `.claude/gates.json`, `.claude/decisions.json` en `.github/**` (dus ook `.github/settings/main-protection.json`) staan in
   `altijdVragen`: de developer-subagent krijgt daar deny, de hoofdsessie een prompt (ADR 0033 punt 3). Die drie bestanden in PR A
   schrijft dus de hoofdsessie met eigenaarakkoord per bewerking, niet de developer. `scripts/**`, `rails/**`, `test/**` en `docs/**`
   zijn in de onderhoudsmodus een melding.

### Verhouding tot ADR 0029

V-1 wijzigt de exacte vorm uit ADR 0029 punt 14, en V-3 (een prompt per merge) gaat in tegen het verworpen alternatief "Agent-merge met
akkoordprompt per PR (0030 punt 4) ook in de feature-lane" (`docs/adr/0029-snellere-beslisroute.md:209`). Dat is een normatieve
wijziging van een geaccepteerd ADR (`docs/framework.md:431`,
[procedure](../operations/agent-doorloop.md#correctie-aan-een-geaccepteerd-adr)). Voor een normatieve wijziging schrijft ADR 0031
besluit 3 spoor 1 voor: een nieuw ADR (`docs/operations/agent-doorloop.md:147`). **Eigenaarbesluit V-11 wijkt daar bewust van af:**
geen nieuw ADR; ADR 0029 zelf wijzigt, in de vorm van spoor 3 (`docs/operations/agent-doorloop.md:153-155`), met twee PR's vóór de
spec. Eén PR kan niet: `eigenaarStatussen` (`scripts/kit/check-document-status.mjs:204`) telt alleen documenten die op `main`
`voorstel`/`voorgesteld` zijn, dus een status `geaccepteerd` → `voorgesteld` → `geaccepteerd` in dezelfde PR krijgt geen herkende lane.

- **ADR 0029-PR 1:** ADR 0029 terug op `voorgesteld` met het record (`pnpm docs:decision docs/adr/0029-snellere-beslisroute.md
  geaccepteerd --branch <branch van PR 2>`), plus de inhoudswijziging: punt 14 (vorm met `--match-head-commit`, prompt per merge,
  merge-toets V-4) en het verworpen alternatief op :209. De PR-beschrijving noemt dat ADR 0029 tussen beide merges `voorgesteld` is.
- **ADR 0029-PR 2:** registreert `geaccepteerd` met `pnpm docs:status`.

Deze spec verwijst daarna alleen naar ADR 0029 punt 14 in die gewijzigde vorm; er komt geen verwijsregel in ADR 0029. V-4 is strenger
dan punt 14 (ADR 0029 punt 4: "Een strengere check is geen ADR"), maar staat voor de duidelijkheid wel in de nieuwe tekst van punt 14.

### Levering

Volgorde: ADR 0029-PR 1 → ADR 0029-PR 2 → spec-PR (dit document, `goedgekeurd` door de eigenaar) → A → B → C.

| PR | Inhoud | Wie past toe | Label |
|---|---|---|---|
| **ADR 0029-PR 1** — terug op voorgesteld, vóór de spec | ADR 0029 `voorgesteld` met record; punt 14 en het alternatief op :209 aangepast (V-1, V-3, V-4) | architect schrijft (record via de hoofdsessie), eigenaar merget | `gate-wijziging` |
| **ADR 0029-PR 2** — opnieuw geaccepteerd | `geaccepteerd` geregistreerd met `pnpm docs:status`, na de merge van PR 1 | hoofdsessie, eigenaar merget | `gate-wijziging` |
| **Spec** | dit document; de eigenaar zet `goedgekeurd` en merget | architect schrijft, eigenaar beslist | `gate-wijziging` |
| **A** — bouwstenen, nog geen merge-recht | A1 `scripts/check-github.mjs`; A2 `.github/settings/main-protection.json`; A3 sleutel `merge: "eigenaar"` in `.claude/gates.json` met `check-docs`-regel; A4 lane- en merge-uitslag in `scripts/kit/diff-guard.mjs`; A5 `diff-guard` in `requiredChecks`; A6 `pnpm pr:verify <nr> --lane`; tests; docs | developer (A1, A4, A6, docs), tester (tests), hoofdsessie met prompt (A2, A3, A5) | `gate-wijziging` |
| **B** — het merge-recht | B1 rolhek; B2 `.claude/settings.json`; B3 skill `opleveren`; B4 `.github/workflows/guard.yml`; B5 framework §8/§10; B6 `AGENTS.md`; B7 `CLAUDE.md`; B8 statusregel ADR 0030; B9 overige teksten | de eigenaar (V-2), volgens de exacte teksten en tabeltests hieronder | `gate-wijziging` |
| **C** — aanzetten | `merge: "feature-lane"` in `.claude/gates.json`; in de PR-beschrijving de volledige uitvoer van `node scripts/check-github.mjs BramLambertJansen/template` met exit 0; `check-docs` groen | de eigenaar, na de merge van A en B; handmatige controle, geen AC | `gate-wijziging` |

PR A verandert niets aan wat de agent mag: de sleutel staat op `"eigenaar"` en het rolhek leest hem nog niet. PR B werkt pas na de merge
(de stub laadt het rolhek van `main`), en zolang C niet gemerged is blijft mergen deny. Het roadmap-item "ADR 0029 stap 7: agent-merge"
voegt de eigenaar toe via een eigen branch (V-12, afgesproken).

## Rollen en wie wat ziet

| Rol | Na A + B + C |
|---|---|
| Eigenaar | Zet de modus (C), beantwoordt de prompt bij elke agent-merge (V-3), krijgt achteraf een PR-commentaar en de eindmelding, merget elke framework-lane-PR zelf. |
| Hoofdsessie | Mag alleen de exacte vorm uit "Doel" op een feature-lane-PR, met de voorwaarden uit B1; het rolhek geeft daarbij `ask`, nooit `allow`. |
| Developer, tester, reviewer, architect, docs, onbekende subagent | Mergen blijft deny, in elke modus. |
| GitHub | Harde grens: de ruleset eist de verplichte checks van GitHub Actions (ADR 0030 punt 6); `--match-head-commit` laat GitHub een PR met een andere head weigeren. |

## Datawijzigingen (met grants)

n.v.t. — geen migratie, tabel of rol.

## Routes en foutcodes

n.v.t. — geen API-route of permissie. Uitvoer gaat via exitcodes en meldingen van scripts en hooks (zie "Letterlijke meldingen").

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

## Hergebruik en UX

- Bestaande componenten: n.v.t. — geen UI. Hergebruik in code: `laneVan`, `isMiniSpec`, `migratieOvertreding` (nu
  `scripts/kit/lane.mjs`, na PR A `rails/hooks/lib/lane.mjs`); `geraakt` (nu `scripts/kit/diff-guard.mjs:113`, na PR A ook in
  `rails/hooks/lib/lane.mjs`); `globMatch`, `ghForbidden`, `loadConfig` (`rails/hooks/lib/rolhek.mjs`); `splitCommand`
  en `WRAPPERS` (`rails/hooks/lib/shell.mjs:168`); `checkRuns`, `pullRequest` (`scripts/kit/github-evidence.mjs`);
  `GITHUB_ACTIONS_APP_ID` (`rails/hooks/lib/built-evidence.mjs`); `onderhoudVan`-patroon voor de vormcheck in `check-docs`; de `gh`-stub
  uit `test/scripts/github-ruleset.test.ts`. Geen tweede lane-herkenning: de besluitbepaling (`eigenaarStatussen`,
  `scripts/kit/check-document-status.mjs:200`), de rename-toets (`verifyGeenRename`, :210) en de inhoudstoets
  (`verifyFeatureInhoud`, :221) verhuizen als pure functies (met lezers voor basis- en headtekst als argument) naar
  `rails/hooks/lib/lane.mjs` (zie A0); `check-document-status`, de diff-guard en het rolhek gebruiken die drie, zodat ze dezelfde
  lane-definitie hebben. Samen heten ze hieronder "de lanetoets".
- Staten per scherm: n.v.t. — geen scherm.
- Alle zichtbare tekst letterlijk: zie "Letterlijke meldingen" en de teksten bij B3–B7.
- Focusvolgorde en toetsenbord: n.v.t. — geen scherm.

### Begrip: gate-pad in deze spec

Een gate-pad is wat `geraakt(pr, config)` in `scripts/kit/diff-guard.mjs:113-130` teruggeeft (na A0 in `rails/hooks/lib/lane.mjs`): een pad (bij een rename of kopie beide
paden) dat matcht met `gates`, behalve een nieuwe test (status `A` of `C` in `testpaden`); plus elke gewijzigde bewaakte JSON-sleutel
(`package.json` → `scripts`) en elke gewijzigde of verwijderde test (`tests`). Een nieuwe test is dus géén gate-pad, ook al staat
`**/*.test.*` in `gates` (`.claude/gates.json:40`). **Merge-toets (V-4):** `geraakt.gates` bevat alleen de mini-spec die in de PR zijn
eigenaarstatus krijgt, en `geraakt.json` en `geraakt.tests` zijn leeg. Daardoor blokkeren onder meer `docs/roadmap.md`, `deploy/**`,
`renovate.json`, `src/api/{kit,server,env}.ts`, `.gitattributes` en `docs/nieuwe-app.md` een agent-merge.

### A0 — gedeelde lane-implementatie naar `rails/hooks/lib/lane.mjs`

Het rolhek draait in productie uit de `rails/hooks`-boom van het anker: `.claude/hooks/laden.mjs` controleert en pakt alleen die boom
uit (`laden.mjs:100-140`), dus een import van `scripts/kit/lane.mjs` of `scripts/kit/diff-guard.mjs` vanuit het rolhek bestaat daar
niet. Daarom in PR A:

- `globMatch` verhuist van `rails/hooks/lib/rolhek.mjs` naar een nieuw `rails/hooks/lib/glob.mjs`; `rolhek.mjs` importeert en
  re-exporteert hem, zodat bestaande imports (`scripts/kit/diff-guard.mjs:16`, `scripts/kit/lane.mjs`, tests) blijven werken.
- `scripts/kit/lane.mjs` verhuist naar `rails/hooks/lib/lane.mjs` (inhoud gelijk; `globMatch` komt uit `./glob.mjs`, niet uit
  `./rolhek.mjs`, zodat er na B1 geen cyclus `lane.mjs` → `rolhek.mjs` → `lane.mjs` ontstaat).
  `scripts/kit/lane.mjs` wordt een dunne re-export (`export * from '../../rails/hooks/lib/lane.mjs'`), zodat `test/rails/lane.test.ts`
  en `scripts/kit/check-document-status.mjs` ongewijzigd blijven werken. Geen testwijziging: alleen het importpad van de implementatie.
- `geraakt` en zijn afhankelijkheden `jsonVerschil`, `past` en `TEST_GEWIJZIGD` (`scripts/kit/diff-guard.mjs:22`, :86-88, :96-130,
  puur) verhuizen naar `rails/hooks/lib/lane.mjs`; `scripts/kit/diff-guard.mjs` importeert ze daarvandaan (geen kopie) en
  re-exporteert `geraakt`, zodat `test/rails/diff-guard.test.ts` ongewijzigd blijft.
- De besluitbepaling, `verifyGeenRename` en de inhoudstoets (zie "Hergebruik en UX") komen in hetzelfde bestand.
- `rails/hooks/lib/lane.mjs` importeert alleen uit `rails/hooks/lib/` (`./glob.mjs`, `./document-state.mjs`) en Node-modules; nooit
  uit `scripts/` en niet uit `./rolhek.mjs`. B1 laat het rolhek daarna uit `./lane.mjs` importeren.
- Reviewcontrole (geen AC, want na de merge is het verschil altijd leeg): in PR A zijn `test/rails/lane.test.ts` en
  `test/rails/diff-guard.test.ts` ongewijzigd (`git diff --quiet origin/main -- <beide>`) en groen; de reviewer noemt dat in zijn verslag.
- Nieuwe test `test/hooks/lane-van-main.test.ts`, met de stub-loader zoals `test/hooks/hooks-van-main.test.ts`: een repo met
  `rails/hooks/lib/lane.mjs` op main en een hook die hem importeert, draait via `.claude/hooks/laden.mjs` zonder `scripts/` in de
  uitgepakte boom en geeft de verwachte lane.

### A1 — `scripts/check-github.mjs`

- Aanroep: `node scripts/check-github.mjs <owner>/<repo>`. Exit 0 = alles komt overeen; 1 = afwijking of onleesbaar; 2 = gebruik.
  Geen `pnpm`-script (dat raakt `package.json`, `jsonGates`).
- Alleen-lezend: elke aanroep is `gh api <endpoint>` zonder `-X`/`--method`, `-f`, `-F`, `--field`, `--raw-field` of `--input`.
- Leest `.github/settings/main-protection.json` naast het script (zoals `github-ruleset.sh` zijn payload).
- Endpoints: `repos/<repo>/rulesets` (zoek `name == "main"`), `repos/<repo>/rulesets/<id>`, `user` (login).
- Toetst, elk als aparte regel in de uitvoer:
  1. precies één ruleset `main`, `enforcement: "active"`, `target: "branch"`, `conditions.ref_name.include` bevat `~DEFAULT_BRANCH`,
     en `conditions.ref_name.exclude` is gelijk aan die in het bestand (een lege lijst): een uitsluiting zou `main` alsnog buiten de
     ruleset kunnen halen;
  2. `bypass_actors` is aanwezig en leeg (ontbreekt het veld, bijvoorbeeld door te weinig rechten: onleesbaar → fout);
  3. de regeltypes `deletion`, `non_fast_forward`, `pull_request` en `required_status_checks` zijn aanwezig;
  4. `pull_request.parameters.required_review_thread_resolution` is `true`; `allowed_merge_methods` bevat `squash` en geen methode
     buiten de lijst in het bestand;
  5. elke check uit het bestand staat in `required_status_checks` met `integration_id` 15368 (GitHub Actions); een extra verplichte
     check op GitHub is goed (strenger), een ontbrekende of een met een andere `integration_id` is fout;
  6. de login van `gh api user` staat in `goedkeurders` van `.claude/gates.json`: géén fout maar de melding `overgang` (V-6).
- Elke `gh`-fout, timeout (10 s per aanroep), niet-JSON-antwoord of ontbrekend veld telt als fout, nooit als goed.

### A2 — `.github/settings/main-protection.json`

```json
{
  "$comment": "Ruleset main als code (framework §10, ADR 0030 punt 3). scripts/github-ruleset.sh zet hem, scripts/check-github.mjs controleert hem alleen-lezend; test/scripts/main-protection.test.ts houdt beide gelijk.",
  "ruleset": { "<precies de payload van scripts/github-ruleset.sh <repo> zonder --zonder-codeql>": "" }
}
```

`ruleset` is letterlijk het object dat `scripts/github-ruleset.sh` zonder `--zonder-codeql` naar GitHub stuurt (naam, target,
enforcement, `bypass_actors: []`, conditions, de vier regels, de acht checks met `integration_id` 15368). `github-ruleset.sh` blijft
ongewijzigd. De nieuwe test vergelijkt alleen de stub-payload met het bestand; welke checks verplicht zijn, blijft de bestaande test
`test/scripts/github-ruleset.test.ts` bewaken (één bron voor `NIET_VERPLICHT`, geen kopie).

### A3 — sleutel `merge` in `.claude/gates.json`

- Toevoegen: `"merge": "eigenaar"`, en in `$comment` de zin: "`merge` (ADR 0029 punt 14): `\"eigenaar\"` of `\"feature-lane\"`;
  ontbreekt of onleesbaar → `\"eigenaar\"`; het rolhek leest hem uit het anker, nooit uit de werkmap."
- `check-docs` (nieuwe sleutel `docs:gates:merge`, in `scripts/kit/check-docs.mjs` naast `onderhoudViolations`): ontbreekt → goed;
  `"eigenaar"` → goed; `"feature-lane"` → goed als `scripts/check-github.mjs` én `.github/settings/main-protection.json` in git staan,
  anders fout; `"agent-na-akkoord"` → fout; elke andere waarde of elk ander type → fout.

### A4 — lane- en merge-uitslag in `scripts/kit/diff-guard.mjs`

- `leesConfig` (:61-83) leest daarnaast `voorReview` en `migraties` (beide lijsten; ontbreekt `voorReview`, dan `gates`, zoals `laneVan`
  nu terugvalt); een ontbrekende of verkeerde `migraties` is een fout (dicht).
- `teLezen` (:527-539) levert daarnaast: elk gewijzigd `.md`-bestand onder `docs/specs/` en `docs/adr/` met zijn basisversie (`van`, bij
  een rename het oude pad; nieuw bestand → geen basis) en headversie, nodig voor de besluitbepaling (status op de basis tegen status op
  de head) en voor `isMiniSpec` en de kop "Datawijzigingen (met grants)"; en elke nieuwe migratie (status `A` in `migraties`), alleen
  de headversie, voor `migratieOvertreding`. Alles als git-object, nooit uitgevoerd.
- Lane en merge-toets komen uit `rails/hooks/lib/lane.mjs` (A0); de diff-guard heeft er geen eigen kopie van.
- De nieuwe velden op `Pr` (basis- en headteksten van documenten en migraties) zijn optioneel; ontbreken ze, dan berekent de diff-guard
  lane `null` met een reden en verandert `uitslag` niet. Zo blijven de bestaande `pr()`-helpers in `test/rails/diff-guard.test.ts`
  (:18, :162) en `test/rails/diff-guard-risico.test.ts` (:16) werken.
- `beoordeel` levert naast `uitslag` en `risico`:
  - `lane: { lane: 'feature' | 'framework' | null, reden: string }`, met `laneVan` en de lanetoets. `feature` geldt dus alleen als
    ook elke nieuwe migratie alleen een nieuwe tabel maakt én de mini-spec dan de kop "Datawijzigingen (met grants)" met inhoud heeft
    (zoals `verifyFeatureInhoud`), en als het besluitdocument geen rename of kopie is van een document met een eigenaarstatus op de
    basis (zoals `verifyGeenRename`; `docs/specs/a.md` `goedgekeurd` → `docs/specs/b.md` geeft `null`). Zo geven diff-guard,
    `document-status` en het rolhek op dezelfde PR dezelfde lane (AC-13).
  - `agentMerge: { ja: boolean, reden: string }`: `ja` alleen als `lane.lane === 'feature'` en de merge-toets (V-4, "Begrip: gate-pad")
    slaagt; anders de eerste reden (`lane: …` of `gate-pad <pad>`).
- Lane en merge-uitslag veranderen `uitslag` niet: een framework-PR blijft groen of `overgang` zoals nu.
- Uitvoer: regels in de samenvatting en twee annotaties (zie "Letterlijke meldingen"). De `<reden>` in een annotatie (die paden uit de
  PR kan bevatten) wordt geëscaped zoals `annotatie()` in `scripts/kit/check-document-status.mjs:266` (`%` → `%25`, CR → `%0D`,
  LF → `%0A`), zodat een bestandsnaam geen workflowcommando kan invoegen. Geen wijziging in `guard.yml` nodig: de stap draait al
  `node scripts/kit/diff-guard.mjs` met alle benodigde omgevingsvariabelen.

### A5 — `requiredChecks`

`"diff-guard"` erbij in `requiredChecks` van `.claude/decisions.json` (ADR 0029 punt 16). De ruleset op GitHub blijft ongewijzigd
(`NIET_VERPLICHT` in `test/scripts/github-ruleset.test.ts` blijft gelden, ADR 0017).

### A6 — `pnpm pr:verify <nr> --lane`

Nieuwe vlag naast `--watch` (beide samen mag). De uitslag moet bij deze PR horen, niet bij een andere PR op dezelfde head-SHA.

- **Base van de PR.** `parsePullRequest` (`scripts/kit/github-evidence.mjs:42`) leest nu `base.repo.full_name` maar geeft `base.ref`
  niet terug, en `verifyHead` (`scripts/kit/pr-verify.mjs:80`) toetst hem dus niet. `parsePullRequest` krijgt een veld `baseRef`;
  met `--lane` eist `verifyHead` dat `baseRef` gelijk is aan de default branch van de repo (`gh api repos/<repo>` →
  `default_branch`, onleesbaar → fout). Zonder `--lane` blijft het gedrag gelijk.
- **Waarom de base volstaat.** De diff-guard-job faalt als de base van de PR niet de default branch is
  (`.github/workflows/guard.yml:38`). Een run van een PR met een andere base kan dus nooit `success` zijn met `feature`/`ja`; zolang de
  base van PR `<nr>` de default branch is, beschrijft elke geslaagde diff-guard-run op die head-SHA dezelfde diff (base = default
  branch, head = die SHA). Het veld `pull_requests` van een check-run gebruikt `pr:verify` niet: GitHub vult het niet betrouwbaar, en
  bij `pull_request_target` mogelijk leeg.
- **Check-run.** `pr:verify --lane` kiest de laatste check-run met naam `diff-guard` op de head-SHA (hoogste `id`, zoals
  `checkProgress` in `scripts/kit/pr-verify.mjs:9`, sortering :18) en eist dat die van `app_id` 15368 komt en `success` is; oudere
  runs tellen niet. Van die ene run leest hij de annotaties (alleen GET). Groen alleen als er precies één annotatie met titel
`lane` en tekst `feature` is én precies één met titel `agent-merge` en tekst `ja`; anders exit 1 met de letterlijke melding. Zonder
`--lane` verandert er niets.

### B1 — `rails/hooks/lib/rolhek.mjs` (eigenaar)

**Config en context.**

- `loadConfig` leest `merge`; ontbreekt, onleesbaar of een andere waarde dan `"feature-lane"` → `"eigenaar"`. De hook laadt de config
  uit het anker (zoals `onderhoud`), nooit uit de werkmap. Is het anker of de config onleesbaar, dan faalt de hook al vóór `decide`
  dicht (`loadConfig`, :31-33); dat is bestaand gedrag en geen geval van deze tabel, want een onleesbaar anker is via `Ctx` niet uit
  te drukken.
- `Ctx` (:16-19) krijgt één nieuw optioneel veld `mergeFeiten?: () => MergeFeiten`, dat de hook-entry (`rails/hooks/rolhek.mjs`) vult
  en tests als fake meegeven. `MergeFeiten` = `{ changes: Wijziging[], basis: (pad) => string | null, head: (pad) => string | null,
  headSha: string, upstreamSha: string | null, werkmapSchoon: boolean, ghOmgeving: { repo: boolean, host: boolean } }`: de diff
  van `<anker-main>...HEAD` (`git diff --name-status -z --find-renames`), de teksten op de merge-base met het anker en op `HEAD`, de lokale `HEAD`, `@{upstream}` (lokale ref, geen
  netwerk) en `git status --porcelain` met `werkmapNegeer`. Ontbreekt `mergeFeiten`, of gooit het, dan deny met reden
  `geen mergefeiten` (dicht).
- `test/hooks/rolhek.test.ts:8` laadt de echte `.claude/gates.json` en geeft geen `mergeFeiten` mee. Na PR C staat daar
  `merge: "feature-lane"`; de bestaande gevallen (`:220`, `:310-312`, `:375`) en `test/hooks/rolhek-onderhoud.test.ts:270` blijven
  deny omdat hun vorm niet exact is en omdat `mergeFeiten` ontbreekt. Die tests blijven ongewijzigd.

**Toetsen.** `ghForbidden` krijgt een tweede argument `{ role, merge, woorden, mergeFeiten }`. Voor `gh pr merge` geeft het rolhek geen
deny als alles geldt; anders deny met de eerste reden:

1. `role` is de hoofdsessie (anders `alleen de hoofdsessie`);
2. `merge === "feature-lane"` (anders `modus is "eigenaar"`);
3. de ruwe woorden van het commandosegment, vóór `splitCommand`, zijn exact
   `['gh', 'pr', 'merge', <nr>, '--squash', '--match-head-commit', <sha>]`: geen omhulsel uit `WRAPPERS`
   (`rails/hooks/lib/shell.mjs:168`: `env`, `command`, `sudo`, `exec`, `time`, `nohup`, `nice`) en geen voorafgaande toewijzing
   (`X=1`, `GH_REPO=x`, `GH_TOKEN=x`); `<nr>` volgens `/^[1-9]\d*$/`; `<sha>` volgens `/^[0-9a-f]{40}$/` (anders `geen exacte vorm`);
4. `<sha>` is gelijk aan `mergeFeiten().headSha` (anders `sha is niet de lokale HEAD`);
5. `werkmapSchoon` (anders `werkmap niet schoon`) en `upstreamSha === headSha` (anders `HEAD is niet gepusht`);
5a. de omgeving van de hook zelf (de stub geeft zijn eigen env door: `.claude/hooks/laden.mjs:199`, "dezelfde … env") heeft geen
   `GH_REPO` en geen `GH_HOST` (anders `GH_REPO of GH_HOST is gezet`). Dit is een gedeeltelijke verharding: de hook ziet alleen zijn
   eigen omgeving, niet die van de Bash-shell die het commando straks draait (zie "Bekende gaten"). De hook-entry levert dit als `ghOmgeving: { repo: boolean, host: boolean }` in `MergeFeiten`, zodat
   tests het zonder echte omgeving kunnen zetten;
6. `laneVan` met de lanetoets (besluitbepaling, `verifyGeenRename` en inhoudstoets uit `rails/hooks/lib/lane.mjs`, A0) geeft `feature`
   (anders `lane: <reden>`);
7. de merge-toets (V-4), met `geraakt` uit `rails/hooks/lib/lane.mjs`: `geraakt.gates` bevat alleen de mini-spec, `geraakt.json` en `geraakt.tests` zijn leeg (anders
   `gate-pad <pad>`).

**Uitkomst.** Slagen alle toetsen, dan zet het rolhek de merge in `ask` met de melding uit "Letterlijke meldingen" en nooit
`decision.allow = true` (`Decision`, :23); de prompt is het vangnet van V-3. Een uitzondering bij 4–7 (ook 5a) geeft deny (in code dicht, ook al
is de hook als geheel fail-open). `gh api …/merge`, GraphQL-merge, `--admin`, `--auto` en elke andere vorm blijven deny voor elke rol.

**Bekende gaten** (niet gedicht door B1; zie V-13):

- Het rolhek past `ghForbidden` alleen toe als het programma exact `gh` heet (`forbidden`, :497). `/usr/bin/gh pr merge …` of
  `./gh pr merge …` ontloopt zowel het rolhek als de `deny`/`ask`-patronen in `.claude/settings.json`; dat gat bestaat nu al voor elke
  merge.
- De repo waarin `gh pr merge` mergt, kan buiten het zicht van het rolhek liggen: `GH_REPO` of `GH_HOST` uit het shellprofiel of uit
  `CLAUDE_ENV_FILE` (alleen in de Bash-shell, niet in de hook), en `gh repo set-default` (git config `remote.<naam>.gh-resolved`)
  sturen `gh pr merge <nr>` naar een andere repo. Beperkt doordat `--match-head-commit <sha>` alleen slaagt als PR `<nr>` daar exact de
  lokale `HEAD` als head heeft, en doordat de ruleset van die repo geldt. V-14 (`--repo` met de repo uit `onderhoud.repository`) blijft
  open.
- Het rolhek controleert de statuscommit van de mini-spec (alleen statusregels, digest gelijk, committer web-flow; ADR 0029 punt 3)
  niet; dat doet alleen `document-status` in CI, en die staat in `requiredChecks`. De ask-melding zegt dat.

Tabeltests in een nieuw bestand `test/hooks/rolhek-merge.test.ts`, met een eigen config (de echte `.claude/gates.json` plus `merge`) en
een fake `mergeFeiten`. `S` is een geldige 40-teken-SHA die gelijk is aan `headSha` en `upstreamSha`; "basis" is: mini-spec
`voorstel` → `goedgekeurd` + `src/web/features/x.tsx` + nieuwe `src/web/features/x.test.tsx`, werkmap schoon.

| # | Rol | `merge` | Feiten | Commando | Verwacht |
|---|---|---|---|---|---|
| 1 | hoofdsessie | `feature-lane` | basis | `gh pr merge 12 --squash --match-head-commit S` | ask, geen deny, geen allow |
| 2 | hoofdsessie | `eigenaar` | basis | als 1 | deny `modus is "eigenaar"` |
| 3 | hoofdsessie | ontbreekt | basis | als 1 | deny `modus is "eigenaar"` |
| 4 | hoofdsessie | `eigenaar` in de config, `feature-lane` alleen in een werkmapbestand | basis | als 1 | deny `modus is "eigenaar"` |
| 5 | hoofdsessie | `agent-na-akkoord` | basis | als 1 | deny `modus is "eigenaar"` |
| 6 | hoofdsessie | `feature-lane` | basis | als 1 plus `--admin` | deny `geen exacte vorm` |
| 7 | hoofdsessie | `feature-lane` | basis | `gh pr merge 12 --auto --squash --match-head-commit S` | deny `geen exacte vorm` |
| 8 | hoofdsessie | `feature-lane` | basis | `--merge` / `--rebase` / `-s` in plaats van `--squash` | deny `geen exacte vorm` |
| 9 | hoofdsessie | `feature-lane` | basis | als 1 plus `--delete-branch` | deny `geen exacte vorm` |
| 10 | hoofdsessie | `feature-lane` | basis | als 1 plus `-R o/r`; zonder `<nr>`; `<nr>` = `abc`; vlaggen in andere volgorde | deny `geen exacte vorm` |
| 11 | hoofdsessie | `feature-lane` | basis | `gh pr merge 12 --squash` (zonder `--match-head-commit`) | deny `geen exacte vorm` |
| 12 | hoofdsessie | `feature-lane` | basis | `--match-head-commit` zonder waarde; met de korte SHA `S[0..7]`; met hoofdletters; met 41 tekens | deny `geen exacte vorm` |
| 13 | hoofdsessie | `feature-lane` | basis, `headSha` ≠ `S` | als 1 | deny `sha is niet de lokale HEAD` |
| 14 | developer, tester, reviewer, architect, docs, onbekend | `feature-lane` | basis | als 1 | deny `alleen de hoofdsessie` |
| 15 | hoofdsessie | `feature-lane` | alleen een ADR naar `geaccepteerd` (framework-lane) | als 1 | deny `lane: …` |
| 16 | hoofdsessie | `feature-lane` | geen document met eigenaarstatus, alleen `src/web/x.tsx` | als 1 | deny `lane: …` (V-5) |
| 17 | hoofdsessie | `feature-lane` | mini-spec + elk van: `.claude/x`, `scripts/x.mjs`, `rails/x`, `.github/x`, `package.json`, `src/core/x.ts`, gewijzigde `test/x.test.ts`, gewijzigde `db/migrations/x.sql`, `docs/adr/0099-x.md`, rename `src/core/x.ts` → `src/web/x.ts` | als 1 | deny `lane: …` (elk een eigen rij) |
| 18 | hoofdsessie | `feature-lane` | volledige spec (`_template.md`) + code | als 1 | deny `lane: …` |
| 19 | hoofdsessie | `feature-lane` | mini-spec + nieuwe migratie met `create function`; nieuwe tabel zonder kop "Datawijzigingen (met grants)" | als 1 | deny `lane: …` (twee rijen) |
| 20 | hoofdsessie | `feature-lane` | basis, werkmap met getrackte wijziging | als 1 | deny `werkmap niet schoon` |
| 21 | hoofdsessie | `feature-lane` | basis, `upstreamSha` ≠ `headSha` of `null` | als 1 | deny `HEAD is niet gepusht` |
| 22 | hoofdsessie | `feature-lane` | rename `docs/specs/a.md` (op de basis `goedgekeurd`) → `docs/specs/b.md` met `sjabloon: mini` en status `goedgekeurd`, plus `src/web/x.tsx` | als 1 | deny `lane: …` (`verifyGeenRename`) |
| 23 | hoofdsessie | `feature-lane` | basis + elk van: `deploy/x`, `src/api/kit.ts`, `docs/roadmap.md`, `renovate.json` | als 1 | deny `gate-pad <pad>` (elk een eigen rij) |
| 24 | hoofdsessie | `feature-lane` | geen `mergeFeiten` in de ctx; `mergeFeiten` gooit | als 1 | deny `geen mergefeiten` |
| 25 | hoofdsessie | `feature-lane` | basis | `gh api -X PUT repos/o/r/pulls/12/merge` / GraphQL `mergePullRequest` | deny (bestaand) |
| 26 | hoofdsessie | `feature-lane` | basis | als 1 gevolgd door `&& git push origin main` | deny (het tweede segment) |
| 27 | hoofdsessie | `feature-lane` | basis | `env gh pr merge …` / `env X=1 gh pr merge …` / `command gh pr merge …` / `GH_REPO=o/r gh pr merge …` / `GH_TOKEN=x gh pr merge …`, telkens met de rest van 1 | deny `geen exacte vorm` |
| 28 | hoofdsessie | `feature-lane` | basis, `ghOmgeving.repo` waar; `ghOmgeving.host` waar | als 1 | deny `GH_REPO of GH_HOST is gezet` (twee rijen) |

### B2 — `.claude/settings.json` (eigenaar)

- `deny`: `"Bash(gh pr merge*)"` verhuist naar `ask`; erbij `"Bash(gh pr merge*--admin*)"` en `"Bash(gh pr merge*--auto*)"`.
  `"Bash(gh api *merge*)"` blijft.
- `ask`: erbij precies de brede regel `"Bash(gh pr merge*)"` als terugval. Elke directe `gh pr merge`, ook de exacte vorm, krijgt zo
  een prompt, ook bij een rolhek-timeout; met werkend rolhek is elke andere vorm al deny. Geen `allow`-regel voor `gh pr merge` (V-3);
  `deny` gaat vóór `ask` voor `--admin` en `--auto`.
- De spiegelregel `ask` = `altijdVragen` in `check-docs` geldt voor Edit-regels; dit is een commandoregel en blijft daarbuiten (ADR 0033
  punt 4: "De commando-regels in `ask` blijven").
- Nieuw bestand `test/rails/sandbox-settings-merge.test.ts`: `deny` bevat `Bash(gh pr merge*--admin*)`, `Bash(gh pr merge*--auto*)` en
  `Bash(gh api *merge*)`; de brede `Bash(gh pr merge*)` staat precies één keer in `ask` en niet in `deny`; geen regel in `allow` begint
  met `Bash(gh pr merge`.

### B3 — skill `opleveren` (eigenaar)

De sectie "Mergen" wordt letterlijk:

```markdown
## Mergen

Het rolhek beslist met `merge` uit zijn anker; deze stap leest de modus alleen ter informatie uit
`git show origin/main:.claude/gates.json`. Wijken die af (bijvoorbeeld een oude lokale `origin/main`), dan geldt de weigering van het
rolhek. Bij `"eigenaar"` (of zonder sleutel) reviewt en merget de eigenaar; de hoofdsessie merget nooit. Bij `"feature-lane"` merget de
hoofdsessie zelf (ADR 0029 punt 14), alleen als alles geldt:

1. De reviewer gaf akkoord op de huidige head: na de laatste review is `git diff <reviewer-sha>..HEAD` leeg of door de reviewer opnieuw
   bekeken, en er staat geen blokkerende bevinding open.
2. `pnpm pr:verify <nr> --lane` is groen op de huidige head.
3. De werkmap is schoon en `HEAD` is gepusht; de statuscommit van de eigenaar (webeditor) is lokaal binnengehaald met `git pull --ff-only`.
4. De PR raakt geen gate-pad buiten de mini-spec.

Dan exact `gh pr merge <nr> --squash --match-head-commit <sha>`, niets anders. Lees `<sha>` eerst met `git rev-parse HEAD` en zet de
volledige 40 tekens letterlijk in het commando; geen `$(...)`, geen variabele, geen omhulsel (`env`, `command`) en geen toewijzing
ervoor. Zet geen `GH_REPO` of `GH_HOST` en gebruik geen `gh repo set-default` naar een andere repo: het rolhek weigert als hij
`GH_REPO`/`GH_HOST` in zijn eigen omgeving ziet, maar een waarde uit het shellprofiel ziet hij niet. De eigenaar krijgt een permissieprompt. Weigert het rolhek of de eigenaar, stop dan en meld de reden; probeer geen andere vorm.
Na de merge: `gh pr comment <nr> --body "<melding>"` met de melding hieronder, en dezelfde tekst in de eindmelding. Een framework-lane-PR
merget altijd de eigenaar.

Melding: `Gemerged door de agent (feature-lane, ADR 0029 punt 14) op <head-sha>. Reviewer-akkoord op <reviewer-sha>; pr:verify --lane groen. Nieuwe permissies en routes: zie het risico-overzicht van de diff-guard.`
```

`allowed-tools` in de frontmatter van `SKILL.md` (:4) krijgt géén `gh pr merge`-patroon: een toegestaan gereedschap in de skill zou de
prompt uit B2 overslaan. `test/rails/opleveren-skill.test.ts` blijft geldig (de tekst noemt "de eigenaar merget"); nieuwe gevallen in
`test/rails/opleveren-merge.test.ts`: de skill noemt `pr:verify <nr> --lane`, `gh pr merge <nr> --squash --match-head-commit <sha>`,
`git rev-parse HEAD` en `gh pr comment`; noemt `--admin`, `--auto` en `--delete-branch` niet als toegestane vorm; bevat geen
`$(git rev-parse` in een merge-commando; en `allowed-tools` bevat geen `gh pr merge`.

### B4 — `.github/workflows/guard.yml` (eigenaar pusht)

Alleen de kopcommentaarregel 4: "Nog geen verplichte check (ADR 0017, OV-1): dat wordt hij bij de overstap op de GitHub App." wordt
"In de ruleset nog geen verplichte check (ADR 0017, OV-1); wel in `requiredChecks` voor `pnpm pr:verify` (ADR 0029 punt 16)." Geen
functionele wijziging: lane en merge-uitslag komen uit het script (A4).

### B5 — `docs/framework.md` (eigenaar)

- §8 stap 6, de zin "Inhoudelijke goedkeuring en merge blijven van de eigenaar;" wordt "Inhoudelijke goedkeuring blijft van de eigenaar;
  de merge ook, behalve een feature-lane-PR bij `merge: \"feature-lane\"` op `main`, na een prompt (ADR 0029 punt 14, skill
  `opleveren`);".
- §8 stap 7 wordt: "**Eigenaar** reviewt en merget; een feature-lane-PR merget de hoofdsessie volgens stap 6, na een prompt en met
  achteraf een melding aan de eigenaar."
- §8, tabel PreToolUse rolhek (Bash): bij "mergen (…)" toevoegen: "behalve exact `gh pr merge <nr> --squash --match-head-commit <sha>`
  zonder omhulsel of toewijzing en zonder `GH_REPO`/`GH_HOST` in de omgeving, door de hoofdsessie, met `<sha>` = lokale `HEAD`, bij `merge: \"feature-lane\"` op het anker, een
  feature-lane van `HEAD` en geen gate-pad buiten de mini-spec; dan `ask`, nooit `allow` (ADR 0029 punt 14)".
- §8, alinea permissieregels (`docs/framework.md:364-365`): in de opsomming van de deny-regels wordt "mergen" vervangen door "mergen
  (`gh pr merge` krijgt een prompt; `--admin`, `--auto` en `gh api *merge*` blijven deny, ADR 0029 punt 14)".
- §10 eerste bullet (`docs/framework.md:396`): "De eigenaar merget." wordt "De eigenaar merget; een feature-lane-PR mag de agent mergen
  na een prompt (ADR 0029 punt 14)."
- Ongewijzigd, met reden: `docs/framework.md:424` ("De eigenaar reviewt en merget het inhoudelijke besluit") gaat over besluit-PR's in
  de framework-lane, die de eigenaar blijft mergen.
- §10 bullet "Instellingen als code": "faalt als de agent onder het account van de eigenaar werkt" wordt "meldt `overgang` als de
  agent onder het account van de eigenaar werkt (ADR 0029 punt 17, geaccepteerd)" (V-6).

### B6 — `AGENTS.md` (eigenaar)

Regel 74: "Push nooit naar `main`, gebruik nooit `--no-verify`, merge nooit." wordt "Push nooit naar `main`, gebruik nooit `--no-verify`;
merge alleen een feature-lane-PR via de skill `opleveren` (ADR 0029 punt 14)."

### B7 — `CLAUDE.md` (eigenaar)

Regel 9: "→ eigenaar merget (jij nooit)." wordt "→ eigenaar merget (jij alleen een feature-lane-PR, skill `opleveren`)."

### B8 — ADR 0030 (eigenaar, correctieprocedure spoor 2)

De statusregel van ADR 0030 wordt `Status: geaccepteerd` gevolgd door ` — ` en een ADR-link met `0029` als linktekst en het bestand van ADR 0029 ernaast: ADR 0029 punt 15 wijzigt 0030 voor de
feature-lane. Toegestaan door `statusregelOvertreding` (link naar een bestaand ADR met alleen het nummer als linktekst). ADR 0029 vraagt
deze verwijsregel al sinds zijn acceptatie (punt 15, "0030 krijgt een verwijsregel").

### B9 — overige teksten (eigenaar of docs-rol, in PR B)

- `.claude/agents/reviewer.md:3`: "vóór de eigenaar merget" wordt "vóór de merge (door de eigenaar, of in de feature-lane door de
  hoofdsessie na een prompt)".
- `docs/operations/agent-doorloop.md:3`: "De eigenaar beslist inhoudelijk en merget." wordt "De eigenaar beslist inhoudelijk en merget;
  een feature-lane-PR merget de hoofdsessie na een prompt (ADR 0029 punt 14, skill `opleveren`)."
- `docs/operations/agent-doorloop.md:33-34`: "de eigenaar zet hem in dezelfde PR in de GitHub-webeditor en merget." wordt "de eigenaar
  zet hem in dezelfde PR in de GitHub-webeditor en merget; een feature-lane-PR mag daarna de hoofdsessie mergen, na een prompt (ADR 0029
  punt 14, skill `opleveren`)."
- `docs/operations/agent-doorloop.md:117`: "De agent merget nooit." wordt "De agent merget nooit, behalve een feature-lane-PR via de skill
  `opleveren` (ADR 0029 punt 14)."
- `docs/operations/agent-doorloop.md:138`: "De eigenaar merget zelf." wordt "De eigenaar merget zelf; een feature-lane-PR mag de
  hoofdsessie mergen (skill `opleveren`)."
- Gecontroleerd met `grep` op "merge nooit", "merget nooit", "eigenaar merget" in `AGENTS.md`, `CLAUDE.md`, `.claude/agents/*.md`,
  `docs/operations/agent-doorloop.md` en `docs/framework.md`; andere treffers (`docs/operations/agent-doorloop.md:19`, :113, :143)
  gaan over besluiten of guardwijzigingen en blijven.

### Letterlijke meldingen

| Waar | Tekst |
|---|---|
| check-github, gebruik | `Gebruik: node scripts/check-github.mjs <owner>/<repo>` |
| check-github, per regel | `✓ <onderwerp>` of `✗ <onderwerp>: verwacht <verwacht>, gevonden <gevonden>` |
| check-github, onleesbaar | `✗ <onderwerp>: onleesbaar (<endpoint>); een onleesbare instelling telt als fout` |
| check-github, account | `! overgang: gh is ingelogd als <login>, een goedkeurder; de merge is geen identiteitsbewijs (ADR 0029 punt 17)` |
| check-github, slot goed | `check-github: ruleset main op <repo> komt overeen met .github/settings/main-protection.json` |
| check-github, slot fout | `check-github: <n> afwijking(en); zet de ruleset met scripts/github-ruleset.sh <repo> en draai opnieuw` |
| check-docs, `agent-na-akkoord` | `.claude/gates.json: merge "agent-na-akkoord" is geparkeerd (ADR 0030 PR 2, ADR 0029 punt 14); gebruik "eigenaar" of "feature-lane"` |
| check-docs, `feature-lane` zonder A1/A2 | `.claude/gates.json: merge "feature-lane" vraagt scripts/check-github.mjs en .github/settings/main-protection.json (ADR 0030 punt 3)` |
| check-docs, andere waarde | `.claude/gates.json: merge is "eigenaar" of "feature-lane" (ADR 0029 punt 14)` |
| diff-guard, samenvatting | `**Lane:** feature — <reden>` / `**Lane:** framework — <reden>` / `**Lane:** geen — <reden>`, daaronder `**Agent-merge:** ja` of `**Agent-merge:** nee — <reden>` |
| diff-guard, annotaties | `::notice title=lane::feature` / `::notice title=lane::framework` / `::notice title=lane::geen: <reden>`, en `::notice title=agent-merge::ja` / `::notice title=agent-merge::nee: <reden>` |
| pr:verify `--lane`, fout | `lane: geen agent-merge volgens diff-guard op <sha7> (<gevonden>)` / `lane: geen geslaagde diff-guard van GitHub Actions voor PR #<nr> op <sha7>` / `lane: PR #<nr> heeft base <ref>, niet de default branch <default>` |
| rolhek, ask | `mergen: feature-lane op <sha7>, geen gate-pad buiten <mini-spec>; de statuscommit van de eigenaar (web-flow) controleert alleen document-status in CI, niet het rolhek; de eigenaar beslist met deze prompt (ADR 0029 punt 14)` |
| rolhek, deny | `mergen: <reden>; alleen exact gh pr merge <nr> --squash --match-head-commit <sha> door de hoofdsessie, bij merge "feature-lane" op main en een feature-lane (ADR 0029 punt 14)` met `<reden>` uit: `modus is "eigenaar"`, `geen exacte vorm`, `alleen de hoofdsessie`, `sha is niet de lokale HEAD`, `werkmap niet schoon`, `HEAD is niet gepusht`, `GH_REPO of GH_HOST is gezet`, `lane: <reden van laneVan>`, `gate-pad <pad>`, `geen mergefeiten` |

## Acceptatiecriteria

PR A:

- **agent-merge/AC-1** — Gegeven een `gh`-stub met een ruleset die overeenkomt met het bestand, wanneer `check-github` draait, dan is
  de exitcode 0 en de laatste regel de slottekst "komt overeen".
- **agent-merge/AC-2** — Gegeven een stub waarin één van de toetsen 1–5 (A1) afwijkt (per toets een geval: `enforcement: "evaluate"`,
  een bypass-actor, ontbrekende regel `non_fast_forward`, `required_review_thread_resolution: false`, een ontbrekende check, een check
  met `integration_id` ≠ 15368, en `include: ["~DEFAULT_BRANCH"]` met `exclude: ["refs/heads/main"]`), dan exit 1 met een `✗`-regel
  voor precies die toets.
- **agent-merge/AC-3** — Gegeven een stub die faalt, een timeout geeft, geen JSON teruggeeft, geen ruleset `main` heeft, twee heeft, of
  `bypass_actors` of `conditions.ref_name.exclude` weglaat, dan exit 1 met "onleesbaar" of een `✗`-regel; nooit exit 0.
- **agent-merge/AC-4** — Bij elke run (alle gevallen uit AC-1 t/m AC-3) bevat het aanroeplog van de stub alleen `gh api <endpoint>`
  zonder `-X`, `--method`, `-f`, `-F`, `--field`, `--raw-field` of `--input`.
- **agent-merge/AC-5** — Gegeven `gh api user` met een login uit `goedkeurders`, dan staat de `overgang`-regel in de uitvoer en
  hangt de exitcode alleen af van toetsen 1–5. Zonder argument of met een ongeldige repo: exit 2, geen `gh`-aanroep.
- **agent-merge/AC-6** — De payload van `scripts/github-ruleset.sh eigenaar/app` (stub, zonder `--zonder-codeql`) is `toStrictEqual`
  aan `ruleset` in `.github/settings/main-protection.json`. De test bevat geen eigen lijst met checknamen of `NIET_VERPLICHT`.
- **agent-merge/AC-7** — `check-docs` geeft geen `docs:gates:merge`-overtreding bij een ontbrekende sleutel en bij `"eigenaar"`.
- **agent-merge/AC-8** — `check-docs` geeft de letterlijke melding bij `"agent-na-akkoord"`, en de "andere waarde"-melding bij `"x"`,
  `true`, `null`, `[]` en `{}`.
- **agent-merge/AC-9** — `check-docs` faalt op `"feature-lane"` als `scripts/check-github.mjs` of `.github/settings/main-protection.json`
  niet in git staat, en slaagt als beide er zijn.
- **agent-merge/AC-10** — `.claude/gates.json` op de branch van PR A heeft `"merge": "eigenaar"`, en `check-docs` is groen.
- **agent-merge/AC-11** — Gegeven een PR met mini-spec naar `goedgekeurd` + `src/web/**` + `src/api/routes/**` + een nieuwe test, dan
  meldt `diff-guard` `lane: feature` en `agent-merge: ja` (samenvatting en annotaties) en blijft `uitslag` gelijk aan die zonder deze
  velden.
- **agent-merge/AC-12** — Voor elk negatief geval uit ADR 0029 punt 7 (1)–(8) en (10), een nieuwe migratie met meer dan een nieuwe
  tabel, en een nieuwe tabel zonder kop "Datawijzigingen (met grants)" in de mini-spec, meldt `diff-guard` `lane: geen: <reden>` of
  `lane: framework`, nooit `feature`, en `agent-merge: nee`.
- **agent-merge/AC-13** — `diff-guard` en `check-document-status` geven op dezelfde fixtures (AC-11, AC-12, en een rename
  `docs/specs/a.md` met status `goedgekeurd` op de basis → `docs/specs/b.md` met `sjabloon: mini` en status `goedgekeurd`, plus code)
  dezelfde lane. Per bestand: `scripts/kit/check-document-status.mjs` gebruikt de besluitbepaling, `verifyGeenRename` en de
  inhoudstoets uit `rails/hooks/lib/lane.mjs` (via `scripts/kit/lane.mjs`) en bevat ze zelf niet meer; `scripts/kit/diff-guard.mjs`
  gebruikt die drie plus `geraakt` uit `rails/hooks/lib/lane.mjs` en bevat ze zelf niet meer. "Dezelfde lane" betekent: dezelfde waarde `feature`/`framework`/`null`, en bij `null`
  dezelfde reden. De gedeelde functie geeft bij de rename een reden terug in plaats van te gooien; `check-document-status` maakt daar
  zoals nu een fout van (`scripts/kit/check-document-status.mjs:249`, job rood), de diff-guard `lane: geen: <reden>` en het rolhek deny
  `lane: <reden>`, telkens met dezelfde redentekst.
- **agent-merge/AC-14** — Gegeven lane `feature` plus één van `docs/roadmap.md`, `deploy/x`, `src/api/kit.ts`, `renovate.json`, of een
  gewijzigde sleutel `scripts` in `package.json`, dan meldt `diff-guard` `agent-merge: nee: gate-pad <pad>` (bij `package.json`:
  `gate-pad package.json → scripts`). Een nieuwe test naast de mini-spec geeft `agent-merge: ja`.
- **agent-merge/AC-15** — `diff-guard` met een `.claude/gates.json` zonder `migraties` faalt (exit 1); zonder `voorReview` gebruikt hij
  `gates` voor de lane.
- **agent-merge/AC-16** — `.claude/decisions.json` bevat `diff-guard` in `requiredChecks`; `pnpm pr:verify` meldt `diff-guard: ontbreekt`
  zolang die check-run niet bestaat.
- **agent-merge/AC-17** — `pr:verify <nr> --lane` met als laatste `diff-guard`-run op de head een geslaagde run van `app_id` 15368 met
  annotaties `lane`=`feature` en `agent-merge`=`ja`: exit 0. Exit 1 met de letterlijke melding bij: `framework` of `geen: …`;
  `agent-merge`=`nee: …`; een ontbrekende of dubbele annotatie; een andere `app_id`; een andere SHA; wanneer een oudere run de goede
  annotaties heeft maar de laatste niet; en een PR met `base.ref` ≠ default branch. Testgeval met twee PR's op dezelfde head-SHA:
  #12 met base `release` en #13 met base `main`, met een geslaagde diff-guard-run `feature`/`ja` op die SHA: `pr:verify 12 --lane`
  faalt op de base (`lane: PR #12 heeft base release, …`) en `pr:verify 13 --lane` slaagt. Zonder `--lane` is de uitvoer gelijk aan nu.
- **agent-merge/AC-18** — Voorwaarde uit ADR 0029-PR 1 en 2: `docs/adr/0029-snellere-beslisroute.md` heeft status `geaccepteerd`,
  bevat in punt 14 de tekst `gh pr merge <nr> --squash --match-head-commit <sha>`, en het alternatief "Agent-merge met akkoordprompt per
  PR" staat niet meer als verworpen; de test leest het bestand en faalt anders.
- **agent-merge/AC-19** — `docs/nieuwe-app.md` en `docs/operations/agent-doorloop.md` bevatten `node scripts/check-github.mjs`, en
  `docs/nieuwe-app.md` bevat niet meer "`check-github` bestaat nog niet"; de test leest beide bestanden.

PR B (de eigenaar past toe; tests eerst):

- **agent-merge/AC-20** — Tabelgeval 1 uit B1 geeft `ask` met de letterlijke ask-melding, geen deny en `allow` niet `true`.
- **agent-merge/AC-21** — Tabelgevallen 2–5 geven deny met reden `modus is "eigenaar"`.
- **agent-merge/AC-22** — Tabelgevallen 6–12 en 27 geven deny met reden `geen exacte vorm`.
- **agent-merge/AC-23** — Tabelgeval 13 geeft deny met reden `sha is niet de lokale HEAD`.
- **agent-merge/AC-24** — Tabelgeval 14 geeft deny voor elke subagentrol en voor een onbekende rol.
- **agent-merge/AC-25** — Tabelgevallen 15–19 en 22 geven deny met reden `lane: …`.
- **agent-merge/AC-26** — Tabelgevallen 20 en 21 geven deny met `werkmap niet schoon` of `HEAD is niet gepusht`.
- **agent-merge/AC-27** — Tabelgeval 23 geeft per pad deny met reden `gate-pad <pad>`.
- **agent-merge/AC-28** — Tabelgeval 24 geeft deny met reden `geen mergefeiten`; ook met de echte `.claude/gates.json` en
  `merge: "feature-lane"` geeft een ctx zonder `mergeFeiten` nooit `ask` of allow.
- **agent-merge/AC-29** — Tabelgevallen 25 en 26 geven deny (ongewijzigd gedrag van `apiMerges` en `pushesMain`).
- **agent-merge/AC-30** — Voor geen enkel geval uit de B1-tabel is `decision.allow` `true`.
- **agent-merge/AC-31** — `.claude/settings.json` voldoet aan de gevallen uit B2, met exact de patronen `Bash(gh pr merge*)` (ask,
  niet in deny), `Bash(gh pr merge*--admin*)`, `Bash(gh pr merge*--auto*)` en `Bash(gh api *merge*)` (deny).
- **agent-merge/AC-32** — De skill `opleveren` bevat de sectie uit B3 letterlijk, `allowed-tools` bevat geen `gh pr merge`, en
  `test/rails/opleveren-skill.test.ts` blijft groen.
- **agent-merge/AC-33** — `docs/framework.md`, `AGENTS.md`, `CLAUDE.md`, ADR 0030, `.claude/agents/reviewer.md` en
  `docs/operations/agent-doorloop.md` bevatten de teksten uit B5–B9 (ook `docs/operations/agent-doorloop.md:33-34` noemt de
  feature-lane-merge door de hoofdsessie), en `docs/framework.md` noemt in de deny-opsomming van de
  permissieregels "mergen" niet meer zonder de uitzondering; `check-docs`, `document-status` en `test/rails/opleveren-skill.test.ts`
  blijven groen.

Aanvullend (na de review op PR #208; nummers lopen door):

- **agent-merge/AC-34** — (PR A) Via de echte stub-loader (`.claude/hooks/laden.mjs`) draait een hook die `rails/hooks/lib/lane.mjs`
  importeert uit het anker, zonder `scripts/` in de uitgepakte boom, en geeft dezelfde lane als `scripts/kit/lane.mjs` in de werkmap;
  `rails/hooks/lib/lane.mjs` bevat geen import uit `scripts/`.
- **agent-merge/AC-36** — (PR B) Tabelgeval 28 geeft deny met reden `GH_REPO of GH_HOST is gezet`, en de ask-melding van tabelgeval 1
  belooft niets over `GH_REPO` of `GH_HOST`.

PR C heeft geen AC: de controle is handmatig door de eigenaar (zie Levering).

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Ruleset op GitHub strenger dan het bestand (extra check, `strict` aan) | goed | n.v.t. |
| Ruleset later versoepeld, na C | niet automatisch gezien (restrisico ADR 0030); GitHub blijft de grens bij elke merge | n.v.t. |
| `gh` zonder login of zonder rechten om `bypass_actors` te lezen | onleesbaar → exit 1 | n.v.t. |
| Private repo zonder CodeQL (`--zonder-codeql`) | `check-github` faalt op de twee CodeQL-checks; zie V-7 | n.v.t. |
| De eigenaar zet de status van de mini-spec in de webeditor na de review | nieuwe head; lokaal `git pull --ff-only`, reviewer bekijkt `git diff <reviewer-sha>..HEAD` (alleen de statusregel), `pr:verify --lane` opnieuw op de nieuwe head | n.v.t. |
| PR-head op GitHub ≠ lokale `HEAD` (iemand pushte erbij) | het rolhek ziet het niet (offline); GitHub weigert de merge door `--match-head-commit` | n.v.t. |
| `main` schuift door tussen `pr:verify` en de merge | GitHub eist de checks op de head; de lane is t.o.v. de merge-base berekend, niet opnieuw | n.v.t. |
| Rolhek-timeout of -crash (hook fail-open, framework §8) | de brede `ask`-regel `Bash(gh pr merge*)` uit B2 blijft staan: elke directe `gh pr merge`, in elke vorm, geeft een prompt zonder de controle van het rolhek, en de eigenaar beslist zelf (V-3); `--admin`, `--auto` en `gh api *merge*` blijven deny in de instellingen | n.v.t. |
| `GH_REPO` of `GH_HOST` in de omgeving van de hook | het rolhek weigert (tabelgeval 28) | n.v.t. |
| `GH_REPO`/`GH_HOST` alleen in het shellprofiel of `CLAUDE_ENV_FILE`, of `gh repo set-default` naar een andere repo | het rolhek ziet het niet (bekend gat); `--match-head-commit` laat de merge alleen slagen als die PR daar exact de lokale `HEAD` heeft; V-14 open | n.v.t. |
| `/usr/bin/gh pr merge …` of `./gh pr merge …` | ontloopt rolhek en instellingspatronen (bekend gat, B1; V-13); GitHub blijft de grens met de verplichte checks | n.v.t. |
| Statuscommit van de mini-spec niet via web-flow of met inhoud | het rolhek ziet het niet; `document-status` (verplicht in `pr:verify`) wordt rood, dus `pr:verify --lane` faalt | n.v.t. |
| Feature-PR die ook `docs/roadmap.md` aanvinkt | `gate-pad docs/roadmap.md` → geen agent-merge; de eigenaar merget (V-4) | n.v.t. |
| `merge` staat op `"feature-lane"` in een app uit de template | geldt daar ook, maar alleen als die app zelf C heeft gedaan (eigen `main`) | n.v.t. |
| PR met mini-spec waarvan de status al op `main` stond (bouw-PR na een besluit-PR) | geen in-PR-status → lane `null` → geen agent-merge; zie V-5 | n.v.t. |

## Raakt ook

- ADR 0029 (eigen PR vóór de spec, V-11) en de statusregel van ADR 0030 (B8).
- `scripts/kit/lane.mjs` wordt een re-export van `rails/hooks/lib/lane.mjs`; `scripts/kit/check-document-status.mjs` (besluitbepaling,
  `verifyGeenRename` en inhoudstoets verhuizen naar `rails/hooks/lib/lane.mjs`, gedrag gelijk; AC-13) en `scripts/kit/diff-guard.mjs`
  (`geraakt` verhuist mee, re-export blijft; A0).
- A5 raakt ook `gebouwd`: `canRecordBuilt` (`rails/hooks/lib/built-evidence.mjs:37`) eist alle `requiredChecks` op de gevalideerde SHA,
  dus na A5 ook een geslaagde `diff-guard`. In de overgang is die groen voor een PR van de eigenaar.
- `scripts/kit/pr-verify.mjs`, `scripts/kit/github-evidence.mjs` (`baseRef`, annotaties lezen, A6).
- `rails/hooks/rolhek.mjs` (hook-entry vult `mergeFeiten` met `ghOmgeving`, B1); `rails/hooks/lib/glob.mjs` (nieuw, `globMatch`, A0).
- `docs/nieuwe-app.md`, `docs/operations/agent-doorloop.md`, `CHANGELOG.md`; `docs/roadmap.md` (nieuw item, door de eigenaar; vinkje na C
  met PR-nummers).
- `docs/framework.md:415-418` beschrijft `check-github` al; B5 stemt die tekst af op route 2.
- ADR 0006 :35 noemt voor `check-github` ook "merge-commits toegestaan, rebase niet": zie V-8.

## Buiten scope

- GitHub App, tokens of credentials (ST-01, ADR 0029 "Niet beslist").
- Agent-merge in de framework-lane en de waarde `"agent-na-akkoord"` (ADR 0030 PR 2 blijft geparkeerd).
- `diff-guard` of `document-status` als verplichte check in de ruleset op GitHub.
- `gh pr merge --auto`, `--admin`, `--delete-branch`, `gh api …/merge`, `gh pr review`.
- Wijzigen van `scripts/github-ruleset.sh` (de JSON wordt nog niet de bron van het script; zie V-8).
- Periodiek opnieuw draaien van `check-github` (restrisico ruleset, ADR 0030).

## Testplan

| AC | Test (nieuw bestand, door de tester) |
|---|---|
| AC-1 t/m AC-5 | `test/scripts/check-github.test.ts` (gh-stub zoals `test/scripts/github-ruleset.test.ts`) |
| AC-6 | `test/scripts/main-protection.test.ts` |
| AC-7 t/m AC-10 | `test/rails/check-docs-merge.test.ts` |
| AC-11 t/m AC-15 | `test/rails/diff-guard-lane.test.ts` (fixtures in `test/rails/fixtures/`) |
| AC-34 | `test/hooks/lane-van-main.test.ts` (stub-loader zoals `test/hooks/hooks-van-main.test.ts`) |
| AC-16, AC-17 | `test/scripts/pr-verify-lane.test.ts` |
| AC-18, AC-19 | `test/rails/agent-merge-docs.test.ts` (leest de tekst van ADR 0029, `docs/nieuwe-app.md` en `docs/operations/agent-doorloop.md`) |
| AC-20 t/m AC-30, AC-36 | `test/hooks/rolhek-merge.test.ts` |
| AC-31 | `test/rails/sandbox-settings-merge.test.ts` |
| AC-32, AC-33 | `test/rails/opleveren-merge.test.ts` (skill, framework-, AGENTS-, CLAUDE-, ADR 0030-, reviewer- en agent-doorloopteksten) |

Elk testbestand noemt de AC-id's als `agent-merge/AC-n`, zodat `check-docs` ze vindt zodra de spec `gebouwd` is (`docs/framework.md:422`).
Bestaande tests worden niet gewijzigd. De tests voor PR B staan in PR B (ze falen tegen het rolhek van PR A). PR C heeft geen
geautomatiseerde test: de eigenaar controleert de uitvoer van `check-github` (zie Levering).

## Besloten door de eigenaar (2026-10-18)

Akkoord met het advies van de hoofdsessie; de status `goedgekeurd` volgt bij de merge van deze spec.

- **V-1:** de uitgebreide vorm `gh pr merge <nr> --squash --match-head-commit <sha>`; ADR 0029 punt 14 wijzigt mee (zie V-11).
- **V-2:** B1 (rolhek) blijft bij de eigenaar in PR B.
- **V-3:** `ask` als vangnet, geen `allow`; de prompt per merge is het aanvaarde gevolg zolang de hook geen fail-closed garantie heeft.
- **V-4:** agent-merge alleen als geen gate-pad buiten de mini-spec zelf geraakt is (tabelgeval 23).
- **V-6:** `check-github` meldt `overgang` onder het account van de eigenaar in plaats van een fout.
- **V-11:** geen nieuw ADR, bewust afwijkend van spoor 1 (ADR 0031 besluit 3): ADR 0029 zelf wijzigt via twee PR's vóór de spec
  (PR 1 terug op `voorgesteld` met record en de inhoudswijziging; PR 2 registreert `geaccepteerd`), zie "Verhouding tot ADR 0029".
- **V-12:** de eigenaar voegt het roadmap-item "ADR 0029 stap 7: agent-merge" toe via een eigen branch (afgesproken).
- **V-13:** het gat bij een volledig pad naar `gh` wordt een apart roadmap-item, niet in B1.

## Nog niet beslist

V-1 tot en met V-4, V-6 en V-11 tot en met V-13 hieronder zijn hierboven besloten; de tekst blijft als onderbouwing staan.

- **V-1 Exacte vorm.** ADR 0029 punt 14 zegt exact `gh pr merge <nr> --squash`. Het rolhek werkt offline en kan `<nr>` niet aan de
  branch koppelen: het toetst de lane van de lokale `HEAD`, niet van PR `<nr>`. Voorstel: de vorm
  `gh pr merge <nr> --squash --match-head-commit <sha>` met `<sha>` = lokale `HEAD`; dan weigert GitHub een PR met een andere head.
  Dat wijzigt de vorm uit punt 14 (A4, ADR-wijziging nodig). Keuze: ADR-vorm houden (met dit gat) of de uitgebreide vorm?
- **V-2 Plaats van het rolhek.** Het rolhek staat in `rails/hooks/lib/rolhek.mjs` (`rails/**`, in de onderhoudsmodus een melding,
  niet in `altijdVragen`). Blijft B1 in PR B door de eigenaar (zoals de opdracht), of mag de developer het in PR B bouwen met
  eigenaarreview?
- **V-3 Vangnet bij een falende hook.** Met `allow` op `Bash(gh pr merge * --squash)` is er geen prompt; een rolhek-timeout laat de
  merge dan zonder lanecheck door (de ruleset eist nog steeds de checks). Met `ask` is er een vangnet, maar dan een prompt per merge,
  wat punt 15 juist wegneemt. Welke?
- **V-4 Andere gate-paden.** In de overgang is de diff-guard groen voor een PR van de eigenaar, ook met een gate-pad. ADR 0029 punt 17
  zegt dat zo'n PR "de diff-guard alleen met een eigenaarreview" haalt; dat klopt onder route 2 niet. De lane laat `deploy/**`,
  `renovate.json`, `src/api/{kit,server,env}.ts`, `docs/roadmap.md`, `docs/nieuwe-app.md` en `.gitattributes` toe. Voorstel: agent-merge
  alleen als geen gate-pad buiten de mini-spec zelf geraakt is (tabelgeval 23). Akkoord, of mag (een deel van) die paden wel?
- **V-5 Feature-PR zonder in-PR-status.** `laneVan` eist precies één document dat in de PR een eigenaarstatus krijgt. Een feature-PR
  zonder nieuwe route, permissie of tabel (geen spec nodig) of een bouw-PR na een eerder gemergde spec is dan geen feature-lane en
  dus niet door de agent te mergen. Zo laten, of een tweede herkenning ("geen document, alle paden binnen punt 6")? Dat laatste
  verruimt rechten (A3) en vraagt een ADR-wijziging.
- **V-6 Account-toets in `check-github`.** Framework §10 zegt dat `check-github` faalt als de agent onder het account van de eigenaar
  werkt. Onder route 2 faalt hij dan altijd. Voorstel: een `overgang`-melding (A1 toets 6, B5). Bevestigen?
- **V-7 Repo zonder CodeQL.** Een `--zonder-codeql`-variant voor `check-github` (zoals het script), of alleen de template-repo met
  CodeQL?
- **V-8 Overige instellingen.** Ook controleren: repo-instellingen (rebase uit, merge-commit aan, ADR 0006 :35), "Allow GitHub Actions
  to create and approve pull requests" uit en "Require actions to be pinned" aan (framework §10), `allow_auto_merge` uit? En wordt
  `main-protection.json` later de bron van `github-ruleset.sh`?
- **V-9 Lane-uitslag uit `document-status` in plaats van `diff-guard`.** `check-document-status` berekent de lane al en staat al in
  `requiredChecks`. De annotatie daar zetten maakt A5 overbodig en voorkomt een tweede aanroep van dezelfde functie. De opdracht en
  ADR 0029 punt 14(3) noemen de diff-guard; deze spec volgt dat. Wijzigen?
- **V-10 Melding achteraf.** Is `gh pr comment` (nu niet geweigerd door rolhek of `.claude/settings.json`) de gewenste vorm, en is de
  tekst uit B3 goed?
- **V-11 Route voor de ADR-wijziging.** V-1 en V-3 wijzigen ADR 0029 punt 14 en gaan in tegen het verworpen alternatief op :209. Nieuw
  ADR of ADR 0029 zelf wijzigen?
- **V-12 Roadmap-item.** "ADR 0029 stap 7: agent-merge" bestaat niet in `docs/roadmap.md`; wie voegt het toe?
- **V-13 Gat bij een volledig pad naar `gh`.** `/usr/bin/gh pr merge …` ontloopt nu al rolhek en instellingspatronen (B1, "Bekende
  gaten"). Voorstel: het rolhek behandelt elk programma met basisnaam `gh` als `gh` en weigert mergen als het programma niet exact `gh`
  is. Dat is strenger (geen ADR nodig), maar valt buiten deze opdracht. Meenemen in B1, of een apart roadmap-item?
- **V-14 Repo expliciet in het commando.** Aanvulling op de gedeeltelijke `GH_REPO`/`GH_HOST`-weigering (B1 toets 5a): de vorm
  uitbreiden met `--repo <owner>/<repo>`, met de repo uit `onderhoud.repository` (in een app: een nog te kiezen sleutel). Dat dekt ook
  het shellprofiel en `gh repo set-default`. Dat wijzigt ADR 0029 punt 14 opnieuw (na V-11). Deze spec kiest de weigering en laat de vorm ongemoeid.
