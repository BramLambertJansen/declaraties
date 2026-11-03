# 0068 — Eén lijst verplichte checks, handhaving die bestaat, rollen zonder tegenspraak

Status: geaccepteerd

Vult [0045](0045-railwerk.md), [0057](0057-risicogestuurde-werkstraat.md) en [0062](0062-spec-en-bouw-in-een-pr.md) aan; die blijven gelden.

## Context

De review van main op 2 november 2026 vond drie soorten tegenspraak (C1–C3). Agents kiezen bij tegenspraak de lichtste lezing,
en een tekst die handhaving claimt die niet bestaat, laat een agent zelf controle overslaan (R-PRINC-11).

- **C1, verplichte checks.** R-CI-01 en `docs/dod.md` noemen er 4, `requiredChecks` in `.claude/decisions.json` 10 (zonder
  `check-core`), `scripts/github-ruleset.sh` 11 (met `check-core`). `pnpm pr:verify` leest het register en kan dus groen
  melden terwijl de ruleset blokkeert. Dat gaat in tegen R-PRINC-03 (één bron per feit).
- **C2, geclaimde handhaving.** R-CODE-02 noemt cognitive-complexity 15 onder "Afgedwongen door: ESLint", maar die regel
  staat niet in `eslint.config.js`. R-WERK-23, R-ROL-10, `AGENTS.md` en de regels "Afgedwongen door" van §8 en §9 noemen de
  diff-guard een grens of handhaving, terwijl hij geen verplichte check is (0045: pas met de GitHub App).
- **C3, rollen.** R-ROL-01 en `developer.md` verbieden de developer bestaande tests te wijzigen, het rolhek meldt het alleen.
  R-WERK-07 geeft spec-inhoud alleen aan de architect, het rolhek laat de developer specs schrijven. `new-resource` meldt
  op twee plekken dat de eigenaar de spec op goedgekeurd zet, terwijl R-WERK-08 de architect de status laat zetten en de merge het besluit
  is. R-ROL-05 zegt niet of een verse reviewer-subagent als onafhankelijke review telt; daardoor is onduidelijk of de
  eigenaar bij elk volledig werk zelf moet reviewen.

## Besluit

1. **`requiredChecks` in `.claude/decisions.json` is de enige lijst verplichte checks.** `check-core` komt erbij. Het
   rulesetscript zet precies die lijst (met `--zonder-codeql` zonder de twee CodeQL-checks), een test toetst dat, en een test
   toetst dat elke job uit `.github/workflows/` op de lijst staat of bewust niet verplicht is (nu alleen `diff-guard`).
   R-CI-01 en `docs/dod.md` verwijzen naar de lijst in plaats van de vereiste checks op te sommen.
2. **R-CODE-02 wordt afgedwongen met de ESLint-kernregel `complexity` op 15.** Dat is cyclomatische complexiteit, geen
   cognitive complexity; de tekst zegt dat precies. Geen nieuwe dependency. De overschrijdingen op main gaan in de
   bestaande onderdrukkingen (`eslint-suppressions.json`, met `eslint --suppress-rule complexity`). Die tellen per bestand:
   in een bestand met een onderdrukking valt een nieuwe overschrijding pas op als het aantal stijgt. Dat is de bestaande
   werking van de ratchet voor elke lintregel en blijft zo.
3. **De diff-guard heet geen grens zolang hij niet verplicht is.** R-WERK-23, R-ROL-10, `AGENTS.md` en de regels
   "Afgedwongen door" noemen als grens CI, de ruleset op GitHub en de eigenaarmerge; de diff-guard staat erbij als
   zichtbare check die nog niet verplicht is (0045).
4. **Het rolhek volgt de rolregels voor de developer.** Het weigert de developer een spec onder `docs/specs/` aan te maken,
   te wijzigen, te verwijderen of te hernoemen, en een bestaande test te wijzigen; ook als een ander programma het pad
   verandert (de toets op effect). De weigering verwijst voor een spec naar de architect (R-WERK-07) en voor een test naar
   de hoofdsessie, die hem wijzigt als spec of opdracht het gedrag verandert, of naar de tester als hij fout lijkt
   (R-TEST-02). Uitzonderingen: een spec terugzetten naar de tekst op main, en een statusregel met geldig bewijs
   (`pnpm docs:status`, zoals nu). Een status terug naar `voorstel` zetten blijft,
   zoals nu, aan architect en hoofdsessie (R-WERK-08). Een nieuwe test toevoegen blijft vrij. Voor de hoofdsessie, de architect en de tester verandert niets;
   R-ROL-01 zegt dat nu ook voor de hoofdsessie (een bestaande test alleen volgens R-TEST-02, met reden in de PR).
   `new-resource` noemt in beide meldingen R-WERK-08.
5. **Een verse reviewer-subagent telt als onafhankelijke review**, bij licht en bij volledig werk: schone context, geen eigen
   werk in die context, en het rolhek laat hem alleen lezen (R-ROL-04). Dat geldt ook voor een ad-hoc subagent die aan die
   eisen voldoet (`CLAUDE.md`). Bij kritiek werk (0062 punt 2) reviewt de eigenaar daarnaast inhoudelijk vóór de merge.
   Zelfreview telt nooit, een rolnaam is geen reviewbewijs, en niemand claimt afgedwongen onafhankelijkheid: het rolhek is
   een vangnet (R-ROL-10).

## Alternatieven

- **Ruleset als bron van de checks:** staat buiten de repo en is lokaal niet te lezen. Verworpen.
- **`eslint-plugin-sonarjs` voor echte cognitive complexity:** nieuwe dependency, eerder geparkeerd. Verworpen.
- **De claims schrappen:** maakt de tekst eerlijk, maar laat de norm onbewaakt. Verworpen voor complexiteit; voor de
  diff-guard is het de keuze tot de GitHub App er is.
- **Regels ruimer maken voor de developer:** de regels zijn bewust zo, en een melding wordt overgeslagen. Verworpen.
- **Eigenaarreview bij al het volledige werk:** schaalt met de tijd van de eigenaar, niet met de uitvoer. Verworpen.

## Gevolgen

- `pnpm pr:verify` en de ruleset vragen dezelfde checks; `check-core` telt voortaan ook in `pr:verify` en in het
  `gebouwd`-bewijs van `pnpm docs:status` (dat leest `requiredChecks`). `check-core` draait op elke PR
  (`pull_request_target`), dus dat bewijs blijft haalbaar.
- Na de merge van de bouw-PR draait de eigenaar het rulesetscript niet opnieuw: de ruleset had `check-core` al.
- Een developer die een bestaande test of spec moet wijzigen, stopt en geeft het terug aan de hoofdsessie. Commando's die zulke paden indirect veranderen (`prettier --write`, `vitest -u`, een rebase of pull), laat de developer ook aan de hoofdsessie.
- `docs/nieuwe-app.md` somt de checks voor een app op; die lijsten blijven, want tests bewaken ze al tegen het rulesetscript.
- Buiten scope: een check die elke regel "Afgedwongen door" toetst op een bestaand mechanisme; dat wordt een roadmap-item.
