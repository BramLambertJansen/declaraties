---
status: goedgekeurd # voorstel | goedgekeurd | gebouwd | vervallen — de merge door de eigenaar is het besluit (ADR 0046); gebouwd: # #<PR>; gevalideerd: <sha> (pnpm docs:status)
namespace: ci-in-delen
---

# De trage CI-jobs in delen

## Doel

Een PR-run duurt ongeveer 4 minuten in plaats van 5,6, doordat `gate:fast`, `check:new-resource` en `ui:check` in CI in
delen naast elkaar draaien, met dezelfde gates, dezelfde tests en dezelfde verplichte checknamen
([ADR 0076](../adr/0076-ci-in-delen.md)).

**Toets aan framework §1.** Aanleiding: vraag van de eigenaar (3 november 2026) en de meting in ADR 0076. Geen nieuwe
dependency. Geen check verdwijnt of wordt overgeslagen; R-CI-08 blijft gelijk. Het raakt de vorm van verplichte checks,
daarom een besluit-PR.

## Rollen en wie wat ziet

| Rol | Doet | Mag niet |
|---|---|---|
| CI | draait elk deel op elke PR en elke push naar `main`; de samenvattende job is de verplichte check | een deel overslaan op grond van de diff |
| developer / hoofdsessie | draait lokaal `pnpm gate:fast` zonder deelkeuze (alles), of één deel om een rode CI-uitslag na te spelen | een groen deel melden als groene gate |
| eigenaar | merget de bouw-PR en beslist over de terugval (ADR 0076 punt 7) | — |

## Datawijzigingen (met grants)

n.v.t.: geen migratie, tabel of policy.

## Routes en foutcodes

n.v.t.: geen API-route, permissie of foutcode.

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

## Kopieer de vorm van

- `.github/workflows/ci.yml`: de jobs `gate-slow-part` (matrix, `fail-fast: false`, naam met het deel) en `gate-slow`
  (naam van de verplichte check, `needs`, `if: always()`, rood tenzij `success`).
- `scripts/kit/gate-fast.mjs`: `banen()` en `gateFast()`; de deelkeuze filtert de lijst vóór `banen()`.

## Hergebruik en UX

- Hergebruikt: `snelleGates()` uit `scripts/kit/gate-fast.mjs` (op het register in `scripts/kit/gates.mjs`), `draaiProef()` en `genereer()` van `check:new-resource`,
  `vitest --shard` en Playwright `--shard`.
- Alle zichtbare tekst letterlijk:
  - onbekend deel: `✗ gate:fast: onbekend deel <naam>; kies checks, test-1 of test-2`
  - eindregel per deel van gate:fast: `✓ gate:fast (<deel>) groen` of `✗ gate:fast (<deel>) rood: <scripts>`
  - eindregel per deel van check:new-resource: `check:new-resource (<deel>): time-entries haalt deel <deel> van gate:fast na app:init`
    (in een app zonder `na app:init`)
  - samenvatting rood: `::error title=<check>::een deel van <check> is <uitslag>`
- Focusvolgorde en toetsenbord: n.v.t., geen UI.

### Werking (bindend)

1. **Delen van de snelle suite.** `pnpm gate:fast --deel <naam>` kent drie namen: `checks` (elke snelle gate uit het
   register behalve `test:unit`, in de bestaande banen), `test-1` en `test-2` (`test:unit` met `--shard=1/2` en `--shard=2/2`).
   Zonder `--deel` draait alles zoals nu. De deeldefinitie staat op één plek (`scripts/kit/gate-fast.mjs`); `draaiProef()`
   gebruikt dezelfde.
2. **CI voor gate:fast.** Job `gate-fast-part` met `matrix.deel: [checks, test-1, test-2]`, naam `gate:fast (${{ matrix.deel }})`,
   `fail-fast: false`, en `fetch-depth: 0` in elk deel (check:migrations, ratchet en de kopie lezen de geschiedenis). De kooi-stap staat in elk deel (de kooitests kunnen in elke helft vallen). `pnpm build`,
   `pnpm check:docs-drift` en `pnpm leespad` (met `if: always()`) staan alleen in deel `checks`. Job `gate-fast` heet
   `gate:fast`, met `needs: gate-fast-part`, `if: always()` en rood tenzij het resultaat `success` is.
3. **check:new-resource.** `pnpm check:new-resource --deel <naam>` maakt een eigen kopie, draait in de template `app:init`,
   dan de generator, dan het gekozen deel van de suite (zelfde namen als stap 1). Zonder `--deel` alles, zoals nu. In CI een
   matrixjob `check-new-resource-part` met naam `check:new-resource (${{ matrix.deel }})` en een samenvattende job
   `check:new-resource`, zoals in stap 2.
4. **ui:check.** Een omgevingsvariabele `UI_DEEL` (`1/2` of `2/2`) gaat via `compose.yaml` naar de ui-runner en wordt in
   `playwright.config.ts` de optie `shard`; zonder variabele alles. In CI
   worden de delen van `gate-slow-part` `test:db`, `ui:check 1/2`, `ui:check 2/2` en `check:snapshot`, elk met een eigen
   stack. De job `gate:slow` blijft de verplichte check.
5. **Niet:** geen cache van een eerdere uitslag, geen `paths`-filter, geen `if:` op jobniveau van een deel, geen overslaan op grond van de
   diff; `requiredChecks`, de ruleset en `pr:verify` veranderen niet.

## Acceptatiecriteria

- **ci-in-delen/AC-1** — Gegeven het gate-register, dan is de vereniging van de gates van `checks`, `test-1` en `test-2`
  precies `snelleGates()`, en zit elke gate in precies één deel, behalve `test:unit`, dat in `test-1` en `test-2` zit.
- **ci-in-delen/AC-2** — Gegeven de testprojecten `unit` en `web`, wanneer `vitest list --shard=1/2` en `--shard=2/2` draaien,
  dan is de vereniging precies de lijst van `vitest list` zonder shard, en hebben de twee lijsten geen bestand gemeen.
- **ci-in-delen/AC-3** — Gegeven `pnpm gate:fast` zonder `--deel`, dan draait hij dezelfde gates in dezelfde volgorde en
  banen als vóór deze spec (de bestaande tests van `gate-fast.mjs` blijven ongewijzigd groen).
- **ci-in-delen/AC-4** — Gegeven `--deel onbekend`, dan is de exitcode ≠ 0 met de melding uit Hergebruik en UX, en draait
  er geen gate.
- **ci-in-delen/AC-5** — Gegeven `.github/workflows/ci.yml`, dan heten de samenvattende jobs `gate:fast`,
  `check:new-resource` en `gate:slow`, hebben ze `needs` op hun matrixjob en `if: always()`, en zijn ze rood tenzij het
  resultaat `success` is; de matrixjobs hebben `fail-fast: false`, geen `if:` op jobniveau en geen `paths`-filter.
- **ci-in-delen/AC-6** — Gegeven de matrix van `check-new-resource-part`, dan zijn de delen precies `checks`, `test-1` en
  `test-2`, en `draaiProef()` gebruikt dezelfde deeldefinitie als `gate-fast.mjs`; een fixture waarin een gate alleen in
  deel `checks` rood is, maakt alleen dat deel rood (de rode samenvatting bewijst het negatieve bewijs in de PR).
- **ci-in-delen/AC-7** — Gegeven de matrix van `gate-slow-part`, dan dekken de delen precies de trage gates uit het register,
  met `ui:check` in twee helften; en `playwright test --list` met `shard` 1/2 en 2/2 geeft samen precies de lijst zonder
  shard, zonder overlap.
- **ci-in-delen/AC-8** — `requiredChecks` in `.claude/decisions.json` is ongewijzigd; een job uit `.github/workflows/` die niet
  in `requiredChecks` staat, is een deel van een verplichte check met een samenvattende job, of staat in de bewust niet verplichte lijst
  (`NIET_VERPLICHT` in `test/scripts/github-ruleset.test.ts`: nu `diff-guard` en `agent-merge`)
  (vervangt de uitzondering "de matrixdelen van `gate:slow`" in `samenhang-checks-rollen/AC-1`).

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Een deel is geannuleerd of overgeslagen | de samenvatting is rood met de uitslag | n.v.t. |
| Een nieuwe snelle gate in het register | valt automatisch in deel `checks` (AC-1 blijft groen) | n.v.t. |
| Een nieuw testbestand | `vitest --shard` verdeelt het; AC-2 blijft groen | n.v.t. |
| Een test die alleen slaagt na een andere in hetzelfde proces | Vitest isoleert bestanden al; zo'n test faalt nu ook lokaal met `vitest related` | n.v.t. |
| In een app | dezelfde delen en namen; de ruleset van de app verandert niet | n.v.t. |

## Raakt ook

- Code: `scripts/kit/gate-fast.mjs` (`--deel`), `scripts/kit/check-new-resource.mjs` en de suitestap in `draaiProef()`
  (`--deel`), `compose.yaml` (`UI_DEEL` naar de ui-runner), `playwright.config.ts` (`shard`), `.github/workflows/ci.yml`,
  `.claude/settings.json` (`pnpm gate:fast --deel *` naast `pnpm gate:fast`).
- Tests: nieuw voor AC-1 t/m AC-8; `test/rails/gate-slow-ci.test.ts` en `test/scripts/github-ruleset.test.ts` krijgen de
  nieuwe matrix en de bredere uitzondering; `test/scripts/een-proefkopie.test.ts` (de run-stap verhuist naar de
  matrixjob), `test/rails/meting-stuurt.test.ts` (`pnpm leespad` staat in `gate-fast-part`) en de contractcomment in
  `test/scripts/check-app-init.test.ts` (bestaande tests gewijzigd omdat deze spec het gedrag verandert, met reden in de PR).
- Herzien-markering (R-CI-05): ADR 0073 punt 1 (in deze besluit-PR); spec `samenhang-checks-rollen` AC-1 (in de bouw-PR,
  want een gebouwde spec wijzigt alleen samen met code, ADR 0062).
- Docs: `docs/operations/agent-doorloop.md` (CI-uitslag per deel lezen), `docs/operations/testuitvoering.md`, `CHANGELOG.md`.

## Buiten scope

- De traagste harness-tests sneller maken (eigen PR's, R-TEST-02).
- Een grotere runner.
- Delen van `test:db` of `image`.

## Testplan

- Unit: AC-1, AC-3, AC-4 tegen `gate-fast.mjs`; AC-2 met `vitest list --filesOnly` (de bouwer controleert dat `list --shard` in Vitest 5 werkt; anders telt hij de
  bestanden uit de JSON-uitslag van elk deel); AC-5 t/m AC-8 door `ci.yml` en `decisions.json`
  te lezen; AC-6 met de fixture van `check:new-resource`.
- Meting in de bouw-PR: de duur van elke job op de PR-run tegenover run 41727046859 (#486), en de som van de tests per
  deel tegenover het totaal (7817 in de kopie op #486).
- Negatief bewijs in de PR: een tijdelijke commit met een falende test in één helft, met de rode samenvatting als link.

## Open vragen

- **OV-1 ✅ besloten** — `check:new-resource` ook in drie delen, ten koste van twee extra kopieën (ADR 0076 punt 3); anders
  blijft hij met 5,6 minuut de langste job.
