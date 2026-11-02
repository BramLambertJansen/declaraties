---
status: goedgekeurd
namespace: reviewer-opties
---

# Rolhek: vaste opties voor alle reviewer-commando's

## Doel

Ook de reviewer-commando's buiten de leeslijst van [rolhek-lezen](rolhek-lezen.md) krijgen een vaste optielijst, zodat de reviewer niet via een optie schrijft of andere code laadt. De review van main op 2 november 2026 vond dat bij `pnpm check|test|gate`, `git diff|log|show|status`, `gh pr view|diff|checks` en `feiten.mjs` alleen de kop werd getoetst. Daardoor schreef `pnpm test:unit --outputFile=<pad>` een bestand, herschreef `-u` snapshots, laadde `--config` andere code en toonde `gh pr view --jq env` tokens uit de omgeving. Deze spec vervangt voor die commando's de zin "blijven zoals nu" uit rolhek-lezen/AC-3; de rest van rolhek-lezen blijft gelden.

## Rollen en wie wat ziet

n.v.t. — het rolhek (`rails/hooks/lib/rolhek.mjs`), rol reviewer; geen app-gebruikers.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes.

## Kopieer de vorm van

- `rails/hooks/lib/rolhek.mjs` — `REVIEWER_READS` en `readArgsAllowed` (de leeslijst van rolhek-lezen/AC-1)

## Hergebruik en UX

n.v.t. — geen UI. De weigermelding noemt de toegestane opties, zoals bij rolhek-lezen/AC-3.

## Acceptatiecriteria

- **reviewer-opties/AC-1** — Voor de reviewer gelden de regels van rolhek-lezen/AC-1 (een optie met waarde neemt het volgende woord; elk ander woord met `-` vooraan dat niet in de lijst staat, ook vastgeplakt of in een cluster, wordt geweigerd; een waarde bestaat uit `[A-Za-z0-9_./,:-]`) ook voor:
  - `pnpm check:<naam>`, `pnpm test:unit|db|e2e`, `pnpm gate:fast|slow`: geen opties; losse woorden zijn testfilters of paden (`pnpm test` blijft ook toegestaan: een bestaande test legt dat vast; het script bestaat niet, dus pnpm faalt zelf);
  - `git diff`: vlaggen `--stat --shortstat --numstat --name-only --name-status --no-color -w --ignore-all-space --cached --staged --merge-base`;
  - `git log`: dezelfde diffvlaggen plus `--oneline -p --patch --no-merges --merges --first-parent --reverse --graph --decorate --follow` en `-<n>`, met waarde `-n --max-count --since --until --author --grep`;
  - `git show`: de diffvlaggen plus `--oneline --no-patch -s`;
  - `git status`: `--short -s --porcelain -b --branch`;
  - `gh pr view [<nr>]`: vlag `--comments`, met waarde `--json --jq`; `gh pr diff [<nr>]`: `--name-only --patch`; `gh pr checks [<nr>]`: vlag `--required`, met waarde `--json --jq`; het nummer is optioneel; `--jq` alleen met paden (`.title`, `.a.b,.c`), geen jq-functies zoals `env`;
  - `node scripts/kit/feiten.mjs`: secties als losse woorden, vlaggen `--alle --json`.
- **reviewer-opties/AC-2** — Bij de pnpm- en git-commando's van AC-1 en bij `git ls-files` staan na `--` alleen paden: een woord met `-` vooraan wordt geweigerd, omdat pnpm het aan het script doorgeeft en dat het als optie kan lezen (`pnpm test:unit -- --outputFile x`, `pnpm check:new-resource -- --bewaar`).
- **reviewer-opties/AC-3** — Een los woord van de reviewer (ref, pad, PR-nummer, sectie; ook bij de leeslijst van rolhek-lezen/AC-1) mag naast de tekens van een waarde ook `~` en `^` bevatten (`HEAD~1`, `HEAD^:pad`), maar begint niet met `/` of `~` en heeft geen padsegment `..`. Zo blijft elk pad binnen de repository, ook na `--`: `git diff /dev/null .env` en `git diff ~/.config/gh/hosts.yml /dev/null` (impliciet `--no-index`) worden geweigerd, omdat ze bestanden buiten de leesregels tonen.
- **reviewer-opties/AC-4** — De gewone review blijft zonder weigering: `git diff origin/main...HEAD` (ook met `--stat` en `--name-only … -- <pad>`), `git log --oneline -n 20`, `git log -5`, `git show HEAD:<pad>`, `git status --short`, `gh pr view <nr> --json body --jq .body`, `gh pr view <nr> --comments`, `gh pr diff <nr> --name-only`, `gh pr checks <nr>` en `node scripts/kit/feiten.mjs gates specs fase|hoofdstuk <n>|adr --alle`. Alle bestaande rolhek-tests blijven ongewijzigd groen, ook de vals-positieve tests (`pnpm test`, `gh pr view` zonder nummer, `git log <branch>`).
- **reviewer-opties/AC-5** — Een geweigerd commando uit AC-1 geeft een melding die de toegestane opties noemt, zoals rolhek-lezen/AC-3.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| `pnpm test:unit --outputFile=<pad>`, `-u`, `--update-snapshots`, `--config <x>`, `pnpm check:<naam> --fix` | geweigerd | n.v.t. |
| `git diff --ext-diff`, `git show --textconv`, `git log --format=…` | geweigerd (niet in de lijst; `%` is geen geldig teken) | n.v.t. |
| `gh pr view <nr> --web`, `-R <repo>`, `--jq env` | geweigerd | n.v.t. |
| `pnpm testx` of een ander onbekend script | geweigerd | n.v.t. |
| `git diff /pad/a /pad/b`, `git diff /dev/null .env`, `git show HEAD:../x` | geweigerd (AC-3: pad buiten de repository) | n.v.t. |

## Raakt ook

`rails/hooks/lib/rolhek.mjs` (`REVIEWER_COMMANDS`, `readArgsAllowed`), `test/hooks/rolhek-reviewer-opties.test.ts` (nieuw), framework R-ROL-04, [rolhek-lezen](rolhek-lezen.md) AC-3.

## Buiten scope

Hoofdsessie, developer en tester; de commando's en opties van de leeslijst van rolhek-lezen/AC-1 (alleen de tekenregel van AC-3 en AC-2 bij `git ls-files` gelden ook daar); `git grep`, `git blame`, `pnpm lint`, `pnpm ratchet` en pipes voor de reviewer.

## Testplan

Tabeltests per commando: de weigeringen uit de randgevallen en AC-2, en de gewone review uit AC-4. Elke negatieve test faalt op de huidige code (R-PRINC-04).

## Open vragen

Geen. Aanleiding (ADR 0064 punt 7): bevinding R1 van de review van main op 2 november 2026, door de eigenaar in de projectthread aangenomen; geen apart leerpunt. Rolhek-lezen blijft ongewijzigd (een gebouwde spec wijzigt alleen in een PR met code, en die is hier kritiek); deze spec gaat voor bij de commando's van AC-1.
