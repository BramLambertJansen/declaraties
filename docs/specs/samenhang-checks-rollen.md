---
status: goedgekeurd
namespace: samenhang-checks-rollen
---

# Eén lijst verplichte checks, handhaving die bestaat, rollen zonder tegenspraak

## Doel

Geen tegenspraak meer tussen regels, register, ruleset en rolhek over verplichte checks, afgedwongen grenzen en wat de developer mag ([ADR 0068](../adr/0068-samenhang-checks-en-rollen.md)). Aanleiding: bevindingen C1, C2 en C3 van de review van main op 2 november 2026.

## Rollen en wie wat ziet

n.v.t. — rolhek, `check-docs`, ESLint en de rulesettest; geen app-gebruikers.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes.

## Kopieer de vorm van

- `test/scripts/github-ruleset.test.ts` — `checksUitWorkflows()` (jobs uit de workflows tegen de ruleset)
- `rails/hooks/lib/rolhek.mjs` — `existingTest()` en `decideByRole()` (beslissing per rol en pad)
- `eslint.config.js` — de omvangregels van R-CODE-02 (`max-lines-per-function`, `max-params`, `max-depth`)

## Hergebruik en UX

n.v.t. — geen UI. Een weigering van het rolhek noemt de regel en wie het wel mag: voor een spec de architect, voor een test de hoofdsessie of de tester (AC-4).

## Acceptatiecriteria

- **samenhang-checks-rollen/AC-1** — `requiredChecks` in `.claude/decisions.json` bevat `check-core`. De checks die `scripts/github-ruleset.sh` zet, zijn precies `requiredChecks`; met `--zonder-codeql` precies `requiredChecks` zonder `codeql (actions)` en `codeql (javascript-typescript)`. Elke job uit `.github/workflows/` (behalve de matrixdelen van `gate:slow`) staat in `requiredChecks` of in de lijst die bewust niet verplicht is (nu alleen `diff-guard`), en omgekeerd. R-CI-01 en `docs/dod.md` noemen `requiredChecks` in `.claude/decisions.json` als de lijst en sommen de vereiste checks zelf niet op (andere zinnen, zoals de CI-inrichting in R-CI-01, mogen jobs noemen). `docs/nieuwe-app.md` houdt zijn lijsten voor een app; de bestaande tests (`test/scripts/github-ruleset.test.ts`, `test/scripts/check-app-init.test.ts`) bewaken die al.
- **samenhang-checks-rollen/AC-2** — `eslint.config.js` zet `complexity` op `['error', 15]` voor dezelfde bestanden als `max-depth`. In een fixture zonder onderdrukking is een functie met cyclomatische complexiteit 16 rood en 15 groen. De overschrijdingen op de merge-base (bij schrijven: 45; de bouw-PR stelt het aantal op de merge-base vast) komen in `eslint-suppressions.json` met `pnpm exec eslint . --suppress-rule complexity`; de bouw-PR noemt ze per bestand met aantal, en `eslint-suppressions.json` krijgt geen andere wijziging. Daarna geldt de bestaande ratchet: per bestand mag het aantal niet stijgen. R-CODE-02 noemt "cyclomatische complexiteit 15 (ESLint `complexity`)" in plaats van cognitive-complexity, en als bron 0068 in plaats van alleen AGENTS.
- **samenhang-checks-rollen/AC-3** — R-WERK-23, R-ROL-10, `AGENTS.md` en de regels "Afgedwongen door" van §8 en §9 in `docs/framework.md` noemen de diff-guard niet als grens of handhaving; waar ze hem noemen, staat erbij dat hij (nog) geen verplichte check is (ADR 0045). De grens is CI, de ruleset op GitHub en de eigenaarmerge.
- **samenhang-checks-rollen/AC-4** — Het rolhek weigert de developer, via Edit, Write en de toets op effect (welk programma het pad ook veranderde): een bestand onder `docs/specs/` aanmaken, wijzigen, verwijderen of hernoemen, en een bestaand testbestand (`**/*.test.*`, `**/*.spec.*`, `db/tests/**`) wijzigen. De weigering verwijst voor een spec naar de architect (R-WERK-07) en voor een test naar de hoofdsessie (spec of opdracht verandert het gedrag) of de tester (test lijkt fout), volgens R-TEST-02. Toegestaan blijven voor de developer: een spec terugzetten naar precies de tekst op main ("Status uit main"), een statusregel met geldig bewijs uit de vertrouwde basis (`pnpm docs:status`, zoals nu) en een nieuw testbestand. Een status terug naar `voorstel` blijft voor de developer geweigerd, zoals nu (`test/hooks/rolhek-beslisroute.test.ts`); architect en hoofdsessie doen dat (R-WERK-08). Voor de hoofdsessie, de architect en de tester verandert niets. De bestaande gates (verwijderen, skippen, gevallen weghalen, fixtures, setup) blijven voor elke rol gelijk. R-ROL-01 krijgt deze inhoud: de developer schrijft alles behalve gates, specs en bestaande tests; de hoofdsessie alles behalve gates, en een bestaande test alleen volgens R-TEST-02 met reden in de PR. `.claude/agents/developer.md` zegt hetzelfde.
- **samenhang-checks-rollen/AC-5** — `scripts/kit/new-resource.mjs` meldt (bij een spec op `voorstel` en in het verslag van een skelet) dat bouwen wacht tot de spec op `goedgekeurd` staat volgens R-WERK-08 (de architect zet de status, de merge door de eigenaar is het besluit), niet dat de eigenaar de status zet.
- **samenhang-checks-rollen/AC-6** — R-ROL-05 zegt: een verse reviewer-subagent (schone context, geen eigen werk in die context, alleen lezen volgens het rolhek) telt als onafhankelijke review bij licht en volledig werk, ook als ad-hoc subagent die aan die eisen voldoet; niemand claimt afgedwongen onafhankelijkheid (R-ROL-10); bij kritiek werk (ADR 0062 punt 2) reviewt de eigenaar daarnaast inhoudelijk vóór de merge; zelfreview en een rolnaam zijn geen reviewbewijs. R-ROL-05 noemt 0068. `CLAUDE.md` en `docs/dod.md` spreken dat niet tegen.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Nieuwe workflowjob zonder plek op de lijst | rulesettest rood (AC-1) | n.v.t. |
| `requiredChecks` krijgt een naam die geen job is | rulesettest rood (AC-1) | n.v.t. |
| Developer zet alleen de statusregel van een spec, ook terug naar `voorstel` | geweigerd, behalve terug naar de tekst op main (AC-4) | n.v.t. |
| Developer verwijdert of hernoemt een spec | geweigerd (AC-4) | n.v.t. |
| Developer draait `prettier --write`, `vitest -u`, rebase of pull en dat verandert een spec of bestaande test | de toets op effect weigert; de hoofdsessie doet het (AC-4) | n.v.t. |
| Developer schrijft een spec via Bash (`node -e`) | de toets op effect weigert met dezelfde beslissing (AC-4) | n.v.t. |
| Developer voegt een geval toe aan een bestaande test | geweigerd; de hoofdsessie of de tester doet het (AC-4) | n.v.t. |
| Architect wijzigt een spec | ongewijzigd: mag (schrijfrecht) | n.v.t. |
| Functie in een testbestand boven complexiteit 15 | rood, net als elders (AC-2) | n.v.t. |
| Kritiek werk met alleen een reviewer-subagent | de eigenaar reviewt ook vóór de merge (AC-6) | n.v.t. |

## Raakt ook

`.claude/decisions.json`, `scripts/github-ruleset.sh`, `test/scripts/github-ruleset.test.ts` (bestaande test; wijzigt met reden in de PR), `eslint.config.js`, `eslint-suppressions.json`, `rails/hooks/lib/rolhek.mjs`, `test/hooks/rolhek.test.ts` en andere rolhektests die de developer spec of bestaande test laten schrijven (wijzigen met reden in de PR), `scripts/kit/new-resource.mjs` (regel 67 en 576) en zijn test, `docs/framework.md` (R-CI-01, R-CODE-02, R-WERK-23, R-ROL-01, R-ROL-05, R-ROL-10, "Afgedwongen door" van §8 en §9), `docs/dod.md`, `AGENTS.md`, `.claude/agents/developer.md`; het `gebouwd`-bewijs van `pnpm docs:status` en `pr:verify` lezen `requiredChecks` en vragen dan ook `check-core`.

## Buiten scope

Een check die elke regel "Afgedwongen door" toetst op een bestaand mechanisme (roadmap-item); de diff-guard verplicht maken (wacht op de GitHub App, ADR 0045); cognitive complexity met een plugin.

## Testplan

Tabeltests per AC: de rulesettest leest `requiredChecks` en de workflows; een ESLint-fixture op 15 en 16; rolhektests per rol (developer, hoofdsessie, architect, tester) voor spec nieuw, gewijzigd, verwijderd, terug naar main, terug naar `voorstel`, test nieuw en gewijzigd, via Edit en via de toets op effect; docs-tests op R-CI-01, R-CODE-02, R-WERK-23, R-ROL-01, R-ROL-05, R-ROL-10, `docs/dod.md`, `AGENTS.md` en `developer.md`. Elke negatieve test faalt op de huidige code (R-PRINC-04).

## Open vragen

Geen. De keuzes voor AC-2, AC-4 en AC-6 maakte de eigenaar op 3 november 2026 (ADR 0068).
