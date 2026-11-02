---
status: goedgekeurd
namespace: rolhek-lezen
---

# Rolhek: lezen voor de reviewer, schrijven blijft streng

## Doel

De reviewer kan met een kleine lijst alleen-lezen commando's onderzoeken wat de Read-, Grep- en Glob-tools niet kunnen, zonder dat het rolhek een schrijf- of uitvoerweg opent ([ADR 0064](../adr/0064-leesbudget-per-laag.md) punt 5 en 7). Drie reviews konden `gh issue view` en `gh run view` niet gebruiken; `git diff --output` is een bestaande schrijfweg (leerpunt #409).

## Rollen en wie wat ziet

n.v.t. — het rolhek (`rails/hooks/lib/rolhek.mjs`); geen app-gebruikers.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes.

## Kopieer de vorm van

- `rails/hooks/lib/rolhek.mjs` — `REVIEWER_COMMANDS`, `reviewerMay`, `ghCommandWords`
- `rails/hooks/lib/shell.mjs` — schrijfdoelen van opties (`fileTargets`)

## Hergebruik en UX

n.v.t. — geen UI. De weigermelding noemt de regel en de toegestane opties.

## Acceptatiecriteria

- **rolhek-lezen/AC-1** — De reviewer mag zonder weigering, met alleen deze opties. Een optie met waarde neemt altijd het volgende woord als waarde (ook als dat met `-` begint, zoals pflag); elke andere optie is een vlag zonder waarde; een woord dat met `-` begint en niet in de lijst staat, ook vastgeplakt of in een cluster, wordt geweigerd. Een waarde bestaat uit `[A-Za-z0-9_./,:-]` (geen `$`, backtick, `;`, spatie of aanhalingsteken), zodat de shell van pnpm niets kan uitvoeren:
  - `git ls-files`: vlag-loos, paden na `--`;
  - `gh issue view <nr>`: vlag `--comments`, met waarde `--json`, `--jq`;
  - `gh issue list`: met waarde `--label --state --limit --json --jq`;
  - `gh run view <id>`: vlaggen `--log --log-failed`, met waarde `--json --jq --job`;
  - `gh run list`: met waarde `--branch --workflow --limit --json --jq`;
  - `pnpm leespad`: vlag `--json`, met waarde `--ref`; `pnpm meting`: vlaggen `--json --pr-tabel --help`, met waarde `--branch --sessie`.

  `gh ... --web`, `-R`/`--repo` en `gh api` blijven geweigerd. Zoeken en tellen doet de Grep-tool; `git grep`, `git blame`, `wc` en pipes komen er niet bij. Tabeltests bevatten `--comments --web` en `--log --web`.
- **rolhek-lezen/AC-2** — Voor elke rol wordt geweigerd: `--output`, `--output=…` en elke afkorting ervan bij `git diff|log|show`, en `-O`, `-O<commando>`, `--open-files-in-pager` en elke afkorting of cluster ervan (`--open-files`, `-iO`, `-nOvim`) bij `git grep` (nieuwe weigering; ze stonden niet in de schrijfdoelen). Daarmee is leerpunt #409 gesloten.
- **rolhek-lezen/AC-3** — Een onbekende optie bij een commando uit AC-1 geeft voor de reviewer een weigering die de toegestane opties noemt. `git diff|log|show|status` en `gh pr view|diff|checks` blijven zoals nu, behalve AC-2 en AC-4 (AC-4 dicht ook het bestaande gat dat `NODE_OPTIONS=… node scripts/kit/feiten.mjs` doorlaat).
- **rolhek-lezen/AC-4** — Voor de reviewer wordt elke variabele vóór het commando geweigerd (`X=… cmd`, ook `LC_ALL=C git status`); negatieve tabeltests per commando met `METING_GH`, `GIT_EXTERNAL_DIFF` en `NODE_OPTIONS`, elk met een basis die zonder variabele slaagt (leerpunt #401).
- **rolhek-lezen/AC-5** — Alle bestaande aanvaltests en vals-positieve tests van het rolhek blijven ongewijzigd groen. Voor hoofdsessie, developer en tester verandert alleen AC-2; `git ls-files`, `gh issue view|list` en `gh run view|list` zijn daar al toegestaan of vragen (ask) zoals nu, en een test legt dat vast.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| `git show <ref>:<pad>` door de reviewer | toegestaan zoals nu | n.v.t. |
| `git grep`, `git blame`, `wc`, `x \| y` door de reviewer | geweigerd met "gebruik de Grep-tool" | n.v.t. |
| `gh run view <id> --log-failed` | toegestaan (leest alleen) | n.v.t. |
| `gh issue view 5 --web` | geweigerd (start een browser) | n.v.t. |
| `gh issue view 5 --comments --web` | geweigerd (`--comments` heeft geen waarde, `--web` staat niet in de lijst) | n.v.t. |
| `-nO…`, `-C3`, `-efoo` bij een git-optie | geweigerd tenzij exact in de lijst; `-O` in een cluster ook voor elke rol | n.v.t. |
| `gh run view <id> --log` | toegestaan; gh schrijft een cache buiten de repo (`~/.cache/gh`) | n.v.t. |
| Pad-wrapper of geëxpandeerd argument | geweigerd zoals nu | n.v.t. |

## Raakt ook

`test/hooks/rolhek*.test.ts` (nieuwe tabeltests), leerpunt #409, `docs/operations/review-checklists.md`, `.claude/agents/reviewer.md` (de leeslijst), framework §8 R-ROL-04 en R-ROL-08.

## Buiten scope

`grep`, `rg`, `awk`, `sed`, `node -e` en pipes voor de reviewer; het volledig dichten van de bekende gaten uit het roadmap-item "Bekende gaten in het rolhek"; hoofdsessie en developer verruimen.

## Testplan

Tabeltests per commando, optie en variabele; de aanvallen uit AC-2 en AC-4 zijn negatieve gevallen met een basis die eerst slaagt.

## Open vragen

- **OV-1 ✅ besloten** — De lijst van AC-1; uitbreiding via een leerpunt en een tabelrij (ADR 0064 punt 7).
