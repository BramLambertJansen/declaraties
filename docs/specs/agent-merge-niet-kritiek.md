---
status: goedgekeurd # voorstel | goedgekeurd | gebouwd | vervallen — de architect zet de status in het voorstel, de merge door de eigenaar is het besluit (ADR 0046); gebouwd: # #<deze PR> in de PR met de implementatie (ADR 0062), of # #<PR>; gevalideerd: <sha> (pnpm docs:status)
namespace: agent-merge-niet-kritiek
model: opus
---

# De hoofdsessie merget niet-kritiek werk zelf

## Doel

De hoofdsessie merget een PR zelf met `pnpm pr:merge <nr>` als die niet kritiek is en geen beschermd pad raakt, en alleen als
CI, review en Codex dat aantoonbaar zeggen ([ADR 0069](../adr/0069-agent-merge-niet-kritiek.md)). Alle andere merge-routes
blijven dicht. Aanleiding: opdracht van de eigenaar, 3 november 2026.

## Rollen en wie wat ziet

n.v.t. — geen app-gebruikers. Alleen de hoofdsessie mag `pnpm pr:merge`; subagents nooit; de eigenaar merget alles wat het
oordeel niet toelaat en zet de modus.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes. Het script stopt met exit 1 en één regel per niet-vervulde voorwaarde (AC-3).

## Kopieer de vorm van

- `scripts/kit/diff-guard.mjs` — `geraakt()`, `risico()` en `beoordeel()` (oordeel op de PR als git-data)
- `scripts/kit/pr-verify.mjs` — `checkProgress()` (verplichte checks op de head-SHA uit `requiredChecks`)
- `.github/workflows/guard.yml` — job `diff-guard` (`pull_request_target`, scripts van `main`, geen PR-code uitvoeren)
- `rails/hooks/lib/rolhek.mjs` — de bestaande merge-weigering (WS-04) en de blobcontrole van de lader tegen het anker

## Hergebruik en UX

n.v.t. — geen UI. Meldingen van `pr:merge` en het rolhek zijn Nederlands en noemen de voorwaarde en ADR 0069.

## Acceptatiecriteria

- **agent-merge-niet-kritiek/AC-1** — `scripts/kit/diff-guard.mjs` exporteert een functie die voor een PR `agent-merge: ja`
  of `agent-merge: nee` met redenen geeft. `ja` alleen als: elk geraakt pad (bij hernoeming beide) past op
  `agentMerge.toegestaan` en op geen glob uit `gates`, `agentMerge.kritiek` of `kritiekPad()`, met als enige uitzondering een
  nieuw testbestand uit `testpaden` onder `src/`, `test/`, `e2e/` of `db/tests/` met extensie `.ts`, `.tsx` of `.sql`; geen
  pad dat op naam vanzelf geladen wordt, waar ook (een segment dat met `.` begint, `CLAUDE*.md`, `AGENTS*.md` zoals
  `INSTRUCTIES` in `scripts/kit/lane.mjs`, `*.config.*`, `package.json`, `tsconfig*.json`); geen
  `jsonGates`-sleutel verandert; geen bestaande test verandert, verdwijnt of hernoemd wordt; het risico-overzicht leeg is
  (migraties, permissiesleutels, dependencies, routes) en geen contractbestand verandert; en geen toegevoegde of verwijderde
  regel in `src/` het woord `permission` bevat. Een onbekend pad, een ontbrekende of onleesbare `agentMerge` en een APPROVED
  van een goedkeurder geven `nee` respectievelijk geen verandering. Tabeltest met per uitsluiting een PR die `nee` geeft (o.a.
  `docs/adr/0070-x.spec.md`, `.claude/agents/x.test.md`, een nieuwe `postcss.config.mjs`, `playwright.smoke.config.ts`,
  `src/api/login-policy.ts`, een verwijderde permissiesleutel, `src/web/CLAUDE.md`, `docs/AGENTS.md`,
  `src/web/postcss.config.mjs`, `src/x/.claude/skills/y.md`, `docs/operations/agent-doorloop.md`) en een PR met alleen `src/web`-code, een nieuwe test en een doc
  buiten de gates die `ja` geeft.
- **agent-merge-niet-kritiek/AC-2** — `.github/workflows/guard.yml` krijgt een job `agent-merge` die alleen draait (en
  slaagt) als het oordeel uit AC-1 `ja` is, en anders overgeslagen wordt; hij voert geen PR-code uit en staat niet in
  `requiredChecks`, maar op de lijst bewust niet verplichte jobs naast `diff-guard` (0068 punt 1). De diff-guard zelf
  verandert niet van uitslag.
- **agent-merge-niet-kritiek/AC-3** — `pnpm pr:merge <nr>` (`scripts/kit/pr-merge.mjs`) merget alleen via
  `PUT /repos/{repo}/pulls/{nr}/merge` met `merge_method=squash` en `sha=<head-SHA>`, en alleen als alle voorwaarden uit
  ADR 0069 punt 3 gelden. Modus en kop van `main` leest het via REST (`GET …/branches/main`, `GET …/contents/.claude/gates.json?ref=<sha>`),
  niet uit de lokale `origin/main`; ontbrekend of onleesbaar telt als `"eigenaar"`. `requiredChecks` leest het uit
  `.claude/decisions.json` op dezelfde main-SHA. Voorouder: `GET …/compare/<main-sha>...<head-sha>`
  met `behind_by` 0. Checks: elke naam uit `requiredChecks` (uit dezelfde main-SHA) `success` op de head-SHA, en job
  `agent-merge` `success` in de workflow-run met `path` `.github/workflows/guard.yml` en event `pull_request_target` op de
  head-SHA (een gelijknamige check uit een andere workflow telt niet); de laatste uitslag van `requiredChecks` op de kop van
  `main` is `success`. Koppelt `head_sha` van de `pull_request_target`-run niet aan de PR-head, dan via de check-run op de
  head en zijn `check_suite`; lukt geen van beide, dan geen merge. Omdat een `pull_request_target`-run aan de basis-SHA kan
  hangen, draagt de job de head-SHA in zijn naam (`agent-merge <head-SHA>`) en zoekt het script die naam in de jobs van de
  `guard.yml`-runs; de bouw-PR legt de koppeling vast met een test tegen een echte run. Review: een PR-commentaar `Review <head-SHA>: geen blokkerende bevindingen`. Codex (tenzij
  `agentMerge.codex: false`): de samenvatting van `chatgpt-codex-connector[bot]` (marker `codex-review-state:v1`) zegt voor
  `code_review` `status: completed`, `commit_sha` gelijk aan de head-SHA en `has_unresolved_findings: false`; of die bot gaf
  een 👍 op de PR na het moment dat de head gepusht werd (uit de PR-timeline, niet de commitdatum). Een 👀, een lopende review
  of een review op een andere SHA telt niet (negatieve test); en geen onopgeloste review-thread. Elke ontbrekende
  voorwaarde geeft een eigen regel en exit 1 zonder schrijfactie. Alleen REST, geen GraphQL. Unittest per voorwaarde met
  nagebootste API-antwoorden.
- **agent-merge-niet-kritiek/AC-4** — Het rolhek weigert elke rol `gh pr merge`, `gh api …/merge`, auto-merge en elke
  `mcp__`-merge, zoals nu. Het geeft de hoofdsessie `allow` voor precies `pnpm pr:merge <nr>` (`<nr>` alleen cijfers), alleen
  als op schijf `scripts/kit/pr-merge.mjs`, de bestanden die het importeert en de bestanden uit `HOST_FILES`
  (`rails/hooks/lib/runner-authority.mjs`) gelijk zijn aan de blobs in het anker; anders weigert het met de reden. Tabeltest
  met een gewijzigde scriptregel `pr:merge` in `package.json` en een gewijzigde `.npmrc`. Een subagent krijgt altijd een weigering. `.claude/settings.json` houdt de deny-regels voor `gh pr merge` en
  `gh api *merge*`, zet `pnpm pr:merge` in `sandbox.excludedCommands` (anders keurt `autoAllowBashIfSandboxed` hem vanzelf
  goed) en krijgt een `ask`-regel `Bash(pnpm pr:merge *)`, zodat een openvallend rolhek een prompt geeft. De bouw-PR toetst
  beide paden: met werkend rolhek geen prompt (hook-`allow`), met falend rolhek een prompt; geeft een hook-`allow` de
  `ask`-regel niet vrij, dan meldt de bouw-PR dat en kiest de eigenaar. `scripts/kit/pr-merge.mjs` staat in `KRITIEK` in `scripts/kit/lane.mjs`.
- **agent-merge-niet-kritiek/AC-5** — `.claude/gates.json` krijgt `merge: "niet-kritiek"` en `agentMerge` met `toegestaan`,
  `kritiek` en `codex` zoals in ADR 0069 punt 1 en 3. `check-docs` weigert voor `merge` elke andere waarde dan `"eigenaar"` of
  `"niet-kritiek"`, en een configuratie waarin een pad uit `voorReview` of `altijdVragen` na de uitsluitingen (`gates`, `agentMerge.kritiek`,
  de naamregel uit AC-1) nog agent-mergebaar is; de toets gebruikt dezelfde functie als AC-1 op de vaste paden en globs van die
  lijsten. `docs/**` in `toegestaan` is dus geldig zolang `docs/framework.md` en `docs/dod.md` gates zijn.
- **agent-merge-niet-kritiek/AC-6** — Regelboek en instructies: R-REPO-01 en R-REPO-05 zeggen dat de eigenaar merget, behalve
  dat de hoofdsessie in Claude Code een PR met oordeel `agent-merge: ja` merget via `pnpm pr:merge` (0069); R-ROL-08 noemt
  `pnpm pr:merge` van de hoofdsessie als enige uitzondering op "mergen"; R-WERK-12 en stap 7 van §8 noemen de agent-merge;
  R-WERK-23 en R-ROL-10 zeggen dat de inhoudstoets voor een agent-merge een vangnet is (script en rolhek) en geen grens van
  GitHub, en dat een andere runtime niet merget; R-DOC-09 verwijst naar 0069 in plaats van "na de GitHub App". `AGENTS.md`,
  `CLAUDE.md` en de skill `opleveren` zeggen hetzelfde in één zin elk, met de regel dat de agent na een merge PR en SHA meldt
  en de CI op `main` volgt. `docs/specs/agent-merge.md` staat op `vervallen`; de roadmap-items "ADR 0029 stap 7" en
  "ADR 0030 PR 2" en de verwijzing bij "Volledig pad naar `gh` in het rolhek" verwijzen naar deze spec.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| PR raakt alleen `src/web` en voegt een test toe | `agent-merge: ja` (AC-1) | n.v.t. |
| PR wijzigt een bestaande test met reden in de PR | `nee`; eigenaar merget (AC-1) | n.v.t. |
| PR met een spec of ADR | `nee`; de merge is het besluit (AC-1) | n.v.t. |
| Nieuw `docs/adr/0070-x.spec.md` of `.claude/agents/x.test.md` | `nee`: de testuitzondering geldt alleen onder `src/`, `test/`, `e2e/`, `db/tests/` (AC-1) | n.v.t. |
| Nieuw configbestand in de root (`postcss.config.mjs`, `.mcp.json`) | `nee`: niet op de toegestane lijst (AC-1) | n.v.t. |
| Wijziging in `src/api/login-policy.ts` of `src/shared/limits.ts` | `nee`: `agentMerge.kritiek` (AC-1) | n.v.t. |
| Permissiesleutel verwijderd of inline `permission:` gewijzigd | `nee` (AC-1) | n.v.t. |
| Eigenaar zette de modus terug, lokale `origin/main` is oud | geen merge: modus komt via REST van de kop van `main` (AC-3) | n.v.t. |
| App zonder Codex | `agentMerge.codex: false` in die app (AC-3) | n.v.t. |
| Agent in een andere runtime dan Claude Code | merget niet (AC-6) | n.v.t. |
| PR met een nieuwe migratie in het owner-patroon | `nee`; migraties zijn onherroepelijk in de geschiedenis (AC-1) | n.v.t. |
| PR met nieuwe permissie zonder spec | `nee` via het risico-overzicht (AC-1) | n.v.t. |
| PR-branch voegt een workflow met job `agent-merge` toe | telt niet: alleen de `guard.yml`-run met `pull_request_target`, en `.github/**` is een gate (AC-1, AC-3) | n.v.t. |
| Push na de review | reviewcommentaar hoort bij een oude SHA: geen merge (AC-3) | n.v.t. |
| `main` schoof door na de laatste CI-run | geen merge; eerst `git merge origin/main` en CI opnieuw (AC-3) | n.v.t. |
| `main` is rood | geen merge tot `main` groen is (AC-3) | n.v.t. |
| Modus staat op `"eigenaar"` of ontbreekt | geen merge (AC-3) | n.v.t. |
| Nieuwe `src/web/CLAUDE.md` of `src/web/postcss.config.mjs` | `nee`: vanzelf geladen op naam (AC-1) | n.v.t. |
| Branch wijzigt de scriptregel `pr:merge` in `package.json` | rolhek weigert: `HOST_FILES` wijkt af van het anker (AC-4) | n.v.t. |
| Lokaal aangepast `pr-merge.mjs` | rolhek weigert (AC-4); valt het rolhek open, dan eist de ruleset alleen groene checks: de inhoudstoets is dan weg (aanvaard restrisico, ADR 0069) | n.v.t. |
| Rolhek valt open op `gh pr merge` | deny-regel in `.claude/settings.json` (AC-4) | n.v.t. |

## Raakt ook

`scripts/kit/diff-guard.mjs`, `scripts/kit/pr-merge.mjs` (nieuw), `scripts/kit/lane.mjs` (`KRITIEK`), `package.json` (`scripts`), `.github/workflows/guard.yml`
(eigenaar pusht), `.claude/gates.json`, `.claude/settings.json`, `rails/hooks/lib/rolhek.mjs`, `scripts/kit/check-docs.mjs`,
`test/scripts/github-ruleset.test.ts` (lijst bewust niet verplichte jobs; bestaande test, wijzigt met reden in de PR),
`test/scripts/guard-workflow.test.ts`, `test/rails/diff-guard.test.ts`, de rolhektests met de merge-weigering (bestaande
tests; wijzigen met reden in de PR), `docs/framework.md`, `AGENTS.md`, `CLAUDE.md`, `.claude/skills/opleveren/SKILL.md`,
`docs/operations/agent-doorloop.md`, `docs/specs/agent-merge.md`, `docs/roadmap.md` (ADR 0029 stap 7, ADR 0030 PR 2, "Volledig pad naar `gh` in het rolhek"),
`rails/hooks/lib/runner-authority.mjs` (`HOST_FILES`; aanvullen met `.pnpmfile.mjs` als pnpm 11 die laadt). De bouw volgt na de bouw van
`samenhang-checks-rollen` (0068), die dezelfde rulesettest en `docs/framework.md` raakt.

## Buiten scope

Ruimer mergen op gate-paden buiten `voorReview`; de GitHub App (ST-01) en daarmee een harde grens bij GitHub; `agent-merge`
als verplichte check; mergen in andere runtimes dan Claude Code.

## Testplan

Tabeltest voor het oordeel (AC-1) op `geraakt()`- en `risico()`-invoer; workflowtest op job, conditie en `pull_request_target`
(AC-2); unittests per voorwaarde van `pr:merge` met nagebootste REST-antwoorden, ook een gelijknamige check uit een andere
workflow (AC-3); rolhektests voor hoofdsessie en elke subagentrol, met gelijk en afwijkend script (AC-4); `check-docs`-test op
de modus (AC-5); docs-tests op de regels uit AC-6. Elke negatieve test faalt op de huidige code (R-PRINC-04).

## Open vragen

Geen. De toegestane lijst volgt uit de opdracht ("niet kritiek en niets kunnen slopen"); ruimer, of andere runtimes, is een
apart besluit (ADR 0069, Alternatieven).
