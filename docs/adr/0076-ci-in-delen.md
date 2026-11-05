# 0076 — De trage CI-jobs in delen, zonder iets over te slaan

Status: geaccepteerd

Wijzigt [0073](0073-een-proefkopie-per-pr.md) punt 1 (één kopie per deel van de check in plaats van één kopie per check;
de suite draait nog steeds één keer). Drempel: A4 (vorm van verplichte checks in `.github/workflows/ci.yml`). Uitwerking:
[spec](../specs/ci-in-delen.md). Aanleiding: vraag van de eigenaar op 3 november 2026 ("de CI doet er erg lang over") en de
meting in de opschoningsronde van die dag.

## Context

Een PR-run duurt 5 min 40 s (run van #486, 3 november 2026). Drie jobs van elk ongeveer 5 minuten bepalen dat samen:
`check:new-resource` (5 min 39 s), `gate:fast` (5 min 05 s) en `gate:slow (ui:check)` (5 min 04 s). Versnel je er één, dan
wacht de PR nog steeds op de andere twee.

- In `gate:fast` duurt `test:unit` 4 min 46 s, omdat hij de vier cores van de runner deelt met ESLint (1 min 54 s). Lokaal
  op 4 cores, zonder ESLint ernaast, duren de twee helften van `vitest --shard` 1 min 50 s en 2 min 13 s.
- In `check:new-resource` gaan ongeveer 90 s naar kopie, `app:init`, generator en de checks vóór de tests; de tests in de
  kopie duren 210 s.
- In `ui:check` gaan ongeveer 70 s naar het opbouwen van de stack; de 91 e2e-tests duren 3,5 minuut met twee workers.

90 % van de unittesttijd (643 van 713 s opgeteld) zit in de tests van de harness (`test/rails`, `test/hooks`,
`test/scripts`). Die tests overslaan in de kopie heeft de eigenaar al afgewezen (0073 punt 3).

## Besluit

1. **Delen, niet overslaan.** `gate:fast`, `check:new-resource` en `ui:check` draaien in CI elk in delen, als matrixjobs
   naast elkaar. Samen draaien de delen precies dezelfde gates en tests als nu. R-CI-08 verandert niet: geen cache, geen
   overslaan op grond van de diff.
2. **De verplichte namen blijven.** Per check houdt een samenvattende job de naam uit `requiredChecks` (`gate:fast`,
   `check:new-resource`, `gate:slow`), zoals `gate:slow` dat al doet: groen alleen als elk deel geslaagd is, ook bij een
   overgeslagen of geannuleerd deel rood. `requiredChecks`, de ruleset en `pr:verify` veranderen niet.
3. **Drie delen voor de snelle suite.** Deel `checks` draait alle snelle gates behalve `test:unit`, in de bestaande banen;
   deel `test-1` en `test-2` draaien elk de helft van `test:unit` (`vitest --shard`). Dezelfde verdeling geldt in de kopie
   van `check:new-resource`: elk deel maakt een eigen kopie, draait `app:init` (in de template) en de generator, en daarna
   zijn deel van de suite.
4. **`ui:check` in twee delen**, elk met een eigen verse stack, via Playwright `--shard`.
5. **Lokaal verandert niets.** Zonder deelkeuze draaien `pnpm gate:fast`, `pnpm check:new-resource` en `pnpm ui:check` alles,
   zoals nu; ook de pre-push-hook.
6. **Bewijs dat niets wegvalt.** Een test eist dat de delen samen precies de snelle gates uit het register dekken en dat de
   twee testhelften samen precies alle testbestanden bevatten, zonder overlap.
7. **Terugval.** Wordt een deel flaky, of dekken de delen samen minder dan het geheel, dan gaat die check terug naar één
   job. De eigenaar beslist.

## Alternatieven

- **Alleen `gate:fast` delen.** Goedkoper in runnerminuten, maar de run blijft 5,6 minuut door de andere twee jobs.
- **Harness-tests overslaan in de kopie.** Scheelt het meest, maar dat heeft de eigenaar in 0073 afgewezen.
- **Een grotere runner (8 of 16 cores).** Eén regel, maar kost geld per minuut en maakt de template afhankelijk van een
  betaald runnertype; elke app erft die eis.
- **De traagste tests sneller maken.** Blijft zinvol en vult dit aan, maar wijzigt bestaande tests (R-TEST-02) en levert per
  bestand winst op; het lost de CPU-strijd tussen ESLint en Vitest niet op.
- **Laten zoals het is.** Geen risico, maar elke PR wacht 5,6 minuut en de tijd groeit met elke nieuwe test.

## Gevolgen

- Verwachte wandklok per PR: ongeveer 4 minuten in plaats van 5,6 (schatting uit de meting hierboven; `test:db` met 3 min
  20 s en de delen van `check:new-resource` met ongeveer 3,5 minuut worden het langst).
- Meer runnerminuten: elk extra deel installeert opnieuw (ongeveer 30 s) en elke extra kopie draait `app:init` en de
  generator opnieuw. Geschat 4 tot 6 minuten runnertijd per PR meer.
- Een rode uitslag staat in het deel waar hij optrad; de samenvatting noemt welk deel rood is.
- `samenhang-checks-rollen/AC-1` noemt nu alleen de delen van `gate:slow` als uitzondering; die uitzondering geldt voortaan
  voor de delen van elke verplichte check met een samenvattende job.
