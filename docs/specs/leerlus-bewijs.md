---
status: gebouwd # #538
namespace: leerlus-bewijs
---

# Leerlus met bewijs (stap 2)

## Doel

Een leerpunt gaat pas dicht met bewijs dat de les blijft hangen, en elk leerpunt-issue klopt met het sjabloon, wie of wat het
ook aanmaakte. Besluit: [ADR 0078](../adr/0078-leerlus-met-bewijs.md); stap 1 is [leerlus](leerlus.md).

**Toets aan framework §1.** Aanleiding: herbeoordeling van 4 november 2026. Nulmeting op main `30cc352`: 34 gesloten
leerpunten, 0 met getoetst sluitbewijs; 4 van 40 issues zonder sjabloon; 16 van 40 aangemaakt buiten het rolhek (MCP en Codex);
fixes die zelf een nieuw leerpunt opleverden: #424 → #432, #411 → #444, #317 → #334.

Dit is kritiek werk (elk ADR, `.github/`, skills; R-WERK-05): deze besluit-PR bevat ADR en spec; de bouw volgt in een eigen PR
zodra deze op main staat.

## Rollen en wie wat ziet

| Rol | Doet | Mag niet |
|---|---|---|
| hoofdsessie | schrijft de sectie `## Leerpunt` in een PR die een leerpunt sluit; dient leerpunten in via `gh` of, in de cloud, via de MCP-tool voor issues | via MCP iets anders schrijven dan een leerpunt-issue in de template-repo |
| reviewer | toetst bij `geen test: <reden>` of de reden klopt, en meldt dat als bevinding | iets indienen of sluiten (ongewijzigd) |
| CI-job `leerpunt-bewijs` (eigen workflow `leerpunt-bewijs.yml`, `pull_request`) | draait het bewijsbestand tegen basis en head, zonder token voor de PR-code | iets schrijven; code uit de PR draaien met token of geheimen |
| workflow `leerpunt-check` | zet of haalt de labels `leerpunt-onvolledig` en `leerpunt-zonder-bewijs` weg, met één comment | sluiten, heropenen, de body bewerken |
| eigenaar | maakt de twee labels aan, zet het workflowbestand (GitHub App heeft geen `workflows`-recht), merget PR's met `geen test` | — |

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen HTTP-route.

## Kopieer de vorm van

n.v.t. voor `docs/gouden-pad.md` (geen resource); railwerk volgt bestaande vormen:

- `.github/workflows/ci.yml` — vorm van een workflow onder `pull_request` met `permissions: read-all`. De bewijsjob krijgt een eigen
  workflow leerpunt-bewijs (types opened, synchronize, reopened, edited; eigen concurrency-groep), zodat een bewerkte
  beschrijving niet de hele CI afbreekt of verplichte checks op `skipped` zet. Het script komt via een aparte checkout van main.
  Een PR die dat workflowbestand wijzigt, draait onder `pull_request` zijn eigen versie; dat vangen alleen de diff-guard (die
  het oordeel `agent-merge` dan op nee zet) en de eigenaarreview
- `test/rails/leerpunt-sjabloon.test.ts` — sjabloon regelgebaseerd lezen zonder YAML-dependency; de nieuwe body-parser hergebruikt die lezer
- `scripts/kit/kooi.mjs` — draait het script buiten CI (een agent of pre-push), dan lopen beide bewijsruns via `inKooi`
  (R-TOOL-03: een werkmap is geen grens). In CI is de wegwerp-runner de grens, zoals voor elke test uit een PR; de
  basiskopie staat in een eigen tijdelijke map

## Hergebruik en UX

- Bestaande onderdelen: issue form `leerpunt.yml` als enige bron van koppen en keuzes; `gh` in CI met `GITHUB_TOKEN`; vitest.
  Geen nieuwe dependency.
- Sectie in de PR-beschrijving, letterlijk, één blok per gesloten leerpunt:

  ```text
  ## Leerpunt

  - #<nr>: trede <Type|Check|Gouden pad of generator|Skill|Padregel|AGENTS.md>; bewijs <testpad>
  - #<nr>: trede <Skill|Padregel|AGENTS.md>; bewijs geen test: <reden>
  ```

- Comment van de workflow bij `leerpunt-onvolledig`, letterlijk de eerste regel: `Dit leerpunt volgt het sjabloon niet:`,
  daarna per fout één regel (`ontbreekt: <kop>`, `leeg: <kop>`, `onbekende waarde bij <kop>: <waarde>`, `volgorde: <kop>`).
- Comment bij `leerpunt-zonder-bewijs`, letterlijk: `Gesloten zonder sluitbewijs (ADR 0078): geen gemergde PR met een sectie Leerpunt voor dit issue en geen comment "achterhaald: <reden>".`
- De workflow schrijft per issue hooguit één comment per soort; bij een volgende fout werkt hij die comment bij.
- Focusvolgorde en toetsenbord: n.v.t. — geen eigen UI.

## Acceptatiecriteria

- **leerlus-bewijs/AC-1** — Welke issues een PR sluit, komt uit GitHub zelf (GraphQL `closingIssuesReferences`), dus elk
  sluitwoord dat GitHub kent (close, closes, closed, fix, fixes, fixed, resolve, resolves, resolved, met of zonder dubbele
  punt) en een handmatige koppeling tellen. Een PR die zo een issue met label `leerpunt` sluit, zonder regel `- #n:` in de sectie `## Leerpunt`, maakt de job `leerpunt-bewijs` rood met de melding welk nummer
  ontbreekt. Een PR zonder zo'n verwijzing laat de job slagen zonder iets te draaien.
- **leerlus-bewijs/AC-2** — Bij `bewijs <testpad>`: het pad moet in de diff van de PR staan als toegevoegd of gewijzigd
  `*.test.ts(x)`-bestand buiten `*.int.test.ts` en `e2e/`, of bij trede Type als `*.test-d.ts`. Anders rood.
- **leerlus-bewijs/AC-3** — Het bewijsbestand draait in een tijdelijke kopie van de basis (merge-base) met alleen dat bestand
  uit de head en moet daar op minstens één assertie falen (vitest-uitslag `failed` met een assertiefout, geen laad- of
  importfout); het draait op de head en moet slagen. Bij trede Type: `vitest --typecheck` op het `*.test-d.ts`-bestand faalt
  op de basis en slaagt op de head. Slaagt het op de basis, faalt het daar alleen op laden, of faalt het op de head, dan rood
  met beide uitslagen. De PR-code draait zonder token: een voorbereidende stap met alleen-lezend token haalt de gesloten
  issues met hun labels op en zet die, met de beschrijving uit de event-payload, in een bestand; daarna geen `GH_TOKEN`,
  `GITHUB_TOKEN` of geheim in de env van workflow, job of bewijsstap, en geen `with: token` bij checkout
  (`persist-credentials: false`). Het token staat alleen in de env van die voorbereidende stap. De basisrun installeert uit de lockfile van de basis, de headrun uit die van de head, beide met
  `--ignore-scripts`. Een test leest het workflowbestand en faalt op een token in de env van workflow, job of een bewijsstap, of in `with: token`. Fixtures: een test die ook op de basis slaagt, en een test die op de basis
  alleen op een import faalt, maken de job allebei rood.
- **leerlus-bewijs/AC-4** — `geen test: <reden>` is alleen geldig bij trede Skill, Padregel of AGENTS.md, of bij een
  integratie- of e2e-test, met een niet-lege reden; dan slaagt de job en geeft het agent-merge-oordeel (`diff-guard.mjs`,
  gelezen door `pr-merge.mjs`) `nee` met reden `leerpunt zonder test`. Bij een andere trede of lege reden: rood. De job draait
  ook op `pull_request` type `edited`. Omdat de diff-guard niet op `edited` draait, leest `pr-merge.mjs` de beschrijving zelf op
  het moment van mergen met dezelfde parser van `## Leerpunt` als `leerpunt-bewijs.mjs`, en weigert bij `geen test:`, ook als
  het oordeel eerder `ja` was. Het omgekeerde (later `bewijs <pad>`) houdt het oordeel op `nee` tot de volgende push: veilig. Test: beschrijving na het oordeel
  gewijzigd van `bewijs <pad>` naar `geen test: …` geeft een weigering.
- **leerlus-bewijs/AC-5** — De workflow `leerpunt-check` op `issues` (opened, edited, labeled, reopened) toetst een issue met label
  `leerpunt` tegen `leerpunt.yml`: elke kop aanwezig en in volgorde, verplichte velden niet leeg (`_No response_` telt als leeg),
  `Soort` en `Voorstel voor de plek` exact een optie. Bij fouten: label `leerpunt-onvolledig` en de comment uit "Hergebruik en UX";
  zonder fouten: label weg. Tabeltest per fout met echte bodies, ook #424, #487, #500 en #504 als vorm.
- **leerlus-bewijs/AC-6** — Bij `closed` op een leerpunt: zonder gemergde PR die het issue sluit (GraphQL
  `closedByPullRequestsReferences`) en een sectie `## Leerpunt` met dat nummer heeft, en zonder comment die begint met
  `achterhaald:` van een auteur met `author_association` OWNER, MEMBER of COLLABORATOR, zet de workflow
  `leerpunt-zonder-bewijs` met de comment. Bij `reopened`, of bij een geldige `achterhaald:`-comment na het sluiten
  (`issue_comment`), haalt hij het label weg. Een `achterhaald:` van een andere auteur telt niet.
- **leerlus-bewijs/AC-7** — De workflow heeft `permissions: issues: write` en verder niets; de job `leerpunt-bewijs` heeft
  `contents: read`, `pull-requests: read` en `issues: read`. Een test leest beide bestanden en faalt bij elk ander recht, bij
  elke aanroep die sluit, heropent of de body bewerkt, en bij elke `${{ github.event.* }}` in een `run:`-regel (issuebody en
  PR-beschrijving alleen via `env` of een bestand).
- **leerlus-bewijs/AC-8** — De skill `opleveren` stap 8 noemt de MCP-schrijfweg voor de cloud (alleen aanmaken, alleen
  template-repo, label `leerpunt`, dezelfde body) en de sectie `## Leerpunt`; `.github/pull_request_template.md` heeft de
  sectie `## Leerpunt` met de regelvorm. `docs/framework.md` R-SEC-09, R-ROL-12 en R-WERK-13, `AGENTS.md` (regel over externe
  diensten) en `CLAUDE.md` ("MCP alleen read-only") noemen de uitzondering met ADR 0078. Het rolhek blijft op de MCP-issuetool
  vragen (ask); `mcpLezen` in `.claude/gates.json` verandert niet.
- **leerlus-bewijs/AC-9** — De voorsortering staat als prompt in `docs/operations/leerpunten-voorsorteren.md`, zonder
  verwijzing naar een uitbreidingsstop, en noemt de labels `leerpunt-onvolledig` en `leerpunt-zonder-bewijs` als eigen bak.
- **leerlus-bewijs/AC-10** — Spec `leerlus.md` krijgt `status: gebouwd # #312`; het ST-09-protocol telt "opgepakt" als
  gesloten met sluitbewijs of achterhaald (ADR 0078 punt 6).

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| PR sluit twee leerpunten | Twee regels in `## Leerpunt`; elk bewijs apart getoetst | n.v.t. |
| Eén test bewijst twee leerpunten | Hetzelfde pad op twee regels mag | n.v.t. |
| Bewijstest heeft een nieuwe helper nodig die op de basis niet bestaat | Laadfout op de basis telt niet: de job is rood met de melding "faalt op laden, niet op een assertie"; de helper hoort in de test zelf of de bouwer kiest een test die de bestaande code aanroept | n.v.t. |
| Basis kan het testbestand niet laden door een gewijzigde configuratie | Rood met de uitvoer; de eigenaar kan dan `geen test: <reden>` met eigenaarmerge laten gelden | n.v.t. |
| Leerpunt gesloten via een commit op main zonder PR | Geen sluitbewijs: label `leerpunt-zonder-bewijs` | n.v.t. |
| Issue zonder label `leerpunt` | Workflow en job doen niets | n.v.t. |
| Issue in een app-repo (via template-merge) | Workflow draait alleen als `github.repository` gelijk is aan `onderhoud.repository` | n.v.t. |
| Body door GitHub-formulier ingevuld | Zelfde koppen; `_No response_` bij `eerder` is goed | n.v.t. |
| Leerpunt gesloten vóór de bouw | Niet opnieuw beoordeeld (ADR 0078, Gevolgen) | n.v.t. |
| Fork-PR of ontbrekend token | Job rood met "geen toegang tot issuelabels"; de eigenaar beoordeelt | n.v.t. |

## Raakt ook

- Nieuw: `scripts/kit/leerpunt-bewijs.mjs`, `scripts/kit/leerpunt-check.mjs` (gedeelde sjabloonlezer), job in
  eigen workflow `leerpunt-bewijs.yml`, workflow `.github/workflows/leerpunt.yml`, `docs/operations/leerpunten-voorsorteren.md`.
- Gewijzigd: `.claude/skills/opleveren/SKILL.md`, `.github/pull_request_template.md`, `docs/framework.md` (R-SEC-09, R-ROL-12,
  R-WERK-13), `AGENTS.md`, `CLAUDE.md`, `docs/operations/st-09-praktijkproef.md`, `scripts/kit/diff-guard.mjs` en
  `scripts/kit/pr-merge.mjs` (AC-4), `docs/specs/leerlus.md`, `docs/nieuwe-app.md` (rulesetlijst) en
  `test/scripts/github-ruleset.test.ts`: `leerpunt-bewijs` erbij, en de job van `leerpunt.yml` (op `issues`, geen PR-check) als
  uitzondering op "elke workflowjob staat in requiredChecks"; dat wijzigt een bestaande test, met reden in de bouw-PR.
- Verplichte check: `leerpunt-bewijs` in de ruleset (`scripts/github-ruleset.sh`) en `requiredChecks` in `.claude/decisions.json`.
- Na de merge: de routine "Leerpunten voorsorteren" verwijst naar het bestand uit AC-9.

## Buiten scope

Herhalingen en clusters in de voorsortering (voorstel V3) en meting uit GitHub voor kosten (V4): later, apart. Bestaande
gesloten leerpunten opnieuw beoordelen. De workflow laten sluiten of heropenen. Een privé kanaal voor railgaten (ADR 0078 punt 7).

## Testplan

Fase 1. De tester schrijft vóór de bouw, rood op asserties:

- `test/scripts/leerpunt-bewijs.test.ts` — AC-1 t/m AC-4 met PR-beschrijvingen en diffs als tabel; AC-3 met een fixture-repo
  in een tijdelijke map: één test die op de basis faalt (geldig), één die op beide slaagt (rood).
- `test/scripts/leerpunt-check.test.ts` — AC-5 en AC-6 met echte issuebodies als tabel.
- `test/rails/leerpunt-workflow.test.ts` — AC-7.
- `test/rails/opleveren-skill.test.ts` en `test/rails/leerpunt-sjabloon.test.ts` uitbreiden (toevoegen) — AC-8 t/m AC-10.

Handmatig na de merge: één proefleerpunt met een lege kop indienen en zien dat het label en de comment komen; daarna sluiten
als achterhaald.

## Open vragen

- **OV-1 ✅ besloten** — V1, V2 en V5 samen; openbare leerpunten zijn prima (eigenaar, 4 november 2026).
- **OV-2** — Waar draait het bewijs? Opties: een job in `guard.yml` (`pull_request_target`), een job in `ci.yml`
  (`pull_request`), een eigen workflow. Aanbeveling: een eigen workflow onder `pull_request` met `edited` en een eigen
  concurrency-groep, het script van main en geen token voor de PR-code. Onder `pull_request_target` zou code uit de PR met de
  rechten van de basis draaien; in `ci.yml` zou `edited` de hele CI herstarten (spec-reviews, 4 november 2026).
- **OV-3** — Wie mag `achterhaald:` schrijven? Aanbeveling: alleen auteurs met schrijfrecht (OWNER, MEMBER, COLLABORATOR),
  dus de eigenaar en de hoofdsessie via zijn token, met verwijzing naar het bestand of de PR die het leerpunt overbodig maakte;
  de voorsortering toont deze sluitingen.
- **OV-4** — Mag het rolhek de MCP-issuetool doorlaten? Aanbeveling: nee, ask blijven tot een eigen besluit met tabeltest.
