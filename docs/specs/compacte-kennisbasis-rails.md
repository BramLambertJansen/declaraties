---
status: goedgekeurd
namespace: compacte-kennisbasis-rails
model: sonnet
---

# Compacte kennisbasis: rails

## Doel

Rails voor [ADR 0063](../adr/0063-compacte-kennisbasis-en-lichtere-werkstraat.md) in drie kritieke bouw-PR's met
eigenaarreview: PR 2, 6a, 6b. Tot de merge bepaalt main de rechten (ADR 0063 punt 9). Hier staan de gevallen van punt 7.

## Rollen en wie wat ziet

Eigenaar merget en past `.claude/settings.json` aan; tester test eerst, developer bouwt.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen route, permissie of foutcode.

## Kopieer de vorm van

Geen accountbeheerpad uit `docs/gouden-pad.md` past (werkstraat, geen UI).

- `test/rails/document-state-a4.test.ts` — tabeltests per overgang.
- `test/hooks/rolhek-indirect-writes.test.ts` — echte payloads.

## Hergebruik en UX

- Componenten, staten, focus: n.v.t. — geen UI.
- Tekst: een nieuwe melding noemt bestand en regel en een framework-§ of R-id, geen ADR.

## Acceptatiecriteria

**PR 2 — archief, verwijzingen, budget**

- **compacte-kennisbasis-rails/AC-1** — `document-status` is groen bij een byte-gelijke `git mv` van een vervangen of vervallen
  ADR naar `docs/adr/archief/`; rood bij een gewijzigde byte, een `geaccepteerd` ADR, een andere rename, een terugverhuizing of
  een nieuw bestand in `archief/` (`verifyAdrWeg`, `verifyGeenRename`, `verifyDocument`, `beslisOvergang`).
- **compacte-kennisbasis-rails/AC-2** — Elke wijziging of verwijdering in `archief/` geeft `a4`, ook in het rolhek (`documentKind`).
- **compacte-kennisbasis-rails/AC-3** — Een nummer in beide mappen is rood; `feiten adr` telt beide voor het volgende nummer en
  toont standaard alleen `docs/adr/` (`adrs`, `markdownFiles`, `adrFiles`).
- **compacte-kennisbasis-rails/AC-4** — `vervangen door NNNN` en links (`linkViolations`) lossen op naar `archief/`, ook relatief
  vanuit `archief/`; een niet-bestaand pad is rood.
- **compacte-kennisbasis-rails/AC-5** — `documentKind` herkent `docs/template/specs/` als spec, met AC-traceerbaarheid. Een
  byte-gelijke `git mv` van een spec (elke status) daarheen is groen in `verifyGeenRename` en de lane-herkenning.
- **compacte-kennisbasis-rails/AC-6** — `framework §N` of `framework.md §N` met N buiten §1–§12 en §11a is rood, behalve in
  `docs/adr/` en `archief/` (onwijzigbaar; de ankers blijven).
- **compacte-kennisbasis-rails/AC-7** — Een backtick-pad in `docs/framework.md` dat niet bestaat, is rood tenzij direct erachter
  `(nog niet gebouwd)` staat; die markering bij een bestaand pad is ook rood.
- **compacte-kennisbasis-rails/AC-8** — Rood: een R-id in `.claude/rules/*` die niet letterlijk in het regelboek staat, en een
  dubbele R-id in het regelboek. Zonder R-id's groen.
- **compacte-kennisbasis-rails/AC-9** — Rood (1 KB = 1024 B; baseline met de huidige overschrijdingen): `AGENTS.md` > 100 regels of 9 KB,
  `framework.md` > 40 KB, nieuwe spec > 10 KB, nieuw ADR > 6 KB, groei van of te ruime waarde in de baseline.
- **compacte-kennisbasis-rails/AC-10** — `heeftAdr` en `mandate-follow-up-docs.test.ts` (terugvalpad, reden in de PR;
  eigenaarbesluit 2026-10-30) vinden een ADR ook in `archief/`.

**PR 6a — rolhek (ADR 0063 punt 7)**

- **compacte-kennisbasis-rails/AC-11** — Elk geval geeft dezelfde uitslag als een schrijf- of verwijderactie op het beschermde
  pad zelf (deny voor een subagent bij een bestaande test):

  | Soort | Gevallen |
  |---|---|
  | `find` | `-delete`, `-fprint f`, `-fprint0 f`, `-fprintf f x`, `-fls f` |
  | `awk`, `sort` | `awk '{print > "x"}' f`, `awk '{print >> "x"}' f`, `awk -i inplace '{}' f`, `sort -o f f` |
  | redirect | `cmd >f`, `>>f`, `>\|f` (noclobber-override), `>&f`, `&>f`, `&>>f`, `2>f`, `3<>f`; fd-duplicatie (`>&2`, `2>&1`, `>&-`) blijft toegestaan |
  | map | `find test -name x.test.ts -delete`, `find . -delete`, `rm -r test`, `rm -rf test`, `mv test x`, `cp -r x test`: telt voor elk pad op of onder de map |

- **compacte-kennisbasis-rails/AC-12** — Het rolhek wordt niet verruimd: elke weigering van vóór de PR blijft, en alle bestaande
  aanvaltests blijven ongewijzigd groen. (Een vrijstelling voor leescommando's is geschrapt; agents lezen met Read, Grep en
  Glob, regel in `AGENTS.md` via PR 4.)

- **compacte-kennisbasis-rails/AC-13** — `werkstraat.mjs` geeft de docs-drift-herinnering alleen bij Stop; `meting.mjs` reageert
  alleen op SessionStart, Stop en SubagentStop (anders exit 0, geen uitvoer). Registratie: de eigenaar.

**PR 6b — mandaat en label weg**

- **compacte-kennisbasis-rails/AC-14** — `docs:decision`, `pr:label-gate`, `gateMarker` en het pad-mandaat bestaan niet meer;
  `docs:status`, `check-document-status`, `check-roadmap`, de ratchetmelding en `guard.yml` noemen geen mandaat of label;
  `.claude/decisions.json` bevat alleen `requiredChecks` en `decisions: []`.
- **compacte-kennisbasis-rails/AC-15** — Per rol, pad en modus dezelfde uitslag als vóór de PR zonder record, ook voor een pad
  met een mandaatrecord vóór de PR (de `Taakmandaat:`-allow en -melding verdwijnen):

  | Rol | Pad | Buiten onderhoud | In onderhoud |
  |---|---|---|---|
  | hoofdsessie | `altijdVragen` / overig `voorReview` | ask / ask | ask / melding |
  | developer | `altijdVragen` / overig `voorReview` | deny / deny | deny / melding |
  | hoofdsessie, developer | overige gate | melding | melding |
  | tester, reviewer, onbekend | gate | als vóór de PR | als vóór de PR |

  Tests, migraties, gegenereerde bestanden en `jsonGates` houden hun eigen uitslag. Ook als nu: deny voor een developer die
  `goedgekeurd`/`geaccepteerd` schrijft; `gebouwd` via `docs:status`; A4-basis uit main, ook na Bash; de UI-melding;
  `readRegistry`; `permissions.ts`, `app.ts`, `new:resource` en het gouden pad.
- **compacte-kennisbasis-rails/AC-16** — De diff-guard hangt niet van een label af: `overgang` als de auteur goedkeurder is,
  anders een APPROVED van een niet-auteur op de head-SHA.
- **compacte-kennisbasis-rails/AC-17** — Voor elke rol geweigerd bij `gh pr create` en `gh pr edit`: `-l x`, `--label x`,
  `--label=x`, `--add-label x`, `--add-label=x`, `--remove-label x`, `--remove-label=x`; ook `gh pr review` en labels, reviews
  en statussen via de API. Ongewijzigd: `gh issue create` (leerpuntvorm en de vraag aan de eigenaar uit ADR 0059,
  `test/hooks/rolhek-leerpunt.test.ts`) en leesfilters zoals `gh pr list --label x`.
- **compacte-kennisbasis-rails/AC-18** — Een gewijzigde of verwijderde mandaattest: het rolhek weigert elke subagent, de
  diff-guard noemt het pad (`verifyTestwijzigingen` geldt alleen in de feature-lane). Proces, geen test: de PR noemt hem met
  eigenaarakkoord.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Status zonder lane, na 6b | Geweigerd: geen records (ADR 0063 punt 5) | n.v.t. |
| Nieuw gat gevonden in een review | Nieuwe test bij AC-11, via een rails-PR | n.v.t. |

## Raakt ook

- PR 2: `check-document-status.mjs`, `document-state.mjs`, `check-docs.mjs`, `feiten.mjs`, `check-roadmap.mjs`,
  `mandate-follow-up-docs.test.ts`, framework §10.
- PR 6a: `rails/hooks/lib/shell.mjs`, `rolhek.mjs`, `werkstraat.mjs`, `rails/hooks/meting.mjs`, `test/hooks/`, framework §8.
- PR 6b: `document-decision.mjs`, `pr-gate-label.mjs`, `diff-guard.mjs`, `ratchet.mjs`, `document-status.mjs`, mandaattakken in
  `check-document-status.mjs`, `check-roadmap.mjs`, `task-authority.mjs` en `authority-context.mjs` (de modules, het
  niet-recorddeel van `canRecordStatus`, de A4-basis en de eigenaarstatusweigering blijven), `KRITIEK` in `lane.mjs`,
  `check-docs`, `guard.yml`, `package.json`, `.claude/decisions.json`, `gateMarker` in `.claude/gates.json` (eigenaar);
  mandaattests weg alleen met eigenaarakkoord. Docs: `AGENTS.md`, framework §8/§10, `docs/operations/agent-doorloop.md`, skill
  `opleveren`, `.github/pull_request_template.md`, `CHANGELOG.md`.
- Checks: `check-docs`, `document-status`, `gate:fast`; niet `check:migrations`, `check:secdef`, `test:db`/policies,
  `test/security/resources.ts` of permissietests.

## Buiten scope

Regelboek, instructies, verhuizen (PR 3–5), `.claude/settings.json`, roadmap, GitHub App.

## Testplan

Per AC een getagde tabeltest in `test/rails/` of `test/hooks/`; eerst rood. Volledige CI per bouw-PR.

## Open vragen

Geen.
