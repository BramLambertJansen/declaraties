---
status: gebouwd # #521
namespace: document-status-lokaal
model: sonnet
---

# Document-status lokaal bij git push

## Doel

`git push` draait dezelfde `scripts/kit/check-document-status.mjs` als de verplichte CI-check `document-status`, zodat een
spec die niet in een commit vóór de eerste code of test staat (ADR 0062 punt 3) al vóór de push blijkt, zolang de commits
nog lokaal te herschikken zijn. Aanleiding: leerpunt #520 (PR's #506 en #517 gingen op 4 november 2026 rood op die volgorde;
#506 moest als #507 opnieuw).

## Rollen en wie wat ziet

n.v.t. — een pre-push-job in `lefthook.yml` voor elke sessie en de eigenaar; geen app-gebruikers.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes.

## Kopieer de vorm van

- `scripts/kit/main-achterstand.mjs` — pre-push-script met een geïnjecteerde `git`-functie, harde timeout en geen prompt
- `test/scripts/main-achterstand.test.ts` — tabeltests op de pure functies plus een echte tijdelijke git-repo

## Hergebruik en UX

n.v.t. — geen UI. Elke melding begint met `pre-push: document-status` en zegt of het een blokkade of een waarschuwing is.

## Acceptatiecriteria

- **document-status-lokaal/AC-1** — `lefthook.yml` heeft in `pre-push`, ná `main-achterstand` (die `origin/main` ophaalt), een
  job `document-status` met `use_stdin: true` die `scripts/kit/document-status-lokaal.mjs --pre-push` draait. Ontbreekt dat
  script in de werkmap (een oude checkout), dan slaagt de job zonder iets te draaien.
- **document-status-lokaal/AC-2** — Met `--pre-push` leest het script de regels van git op stdin
  (`<lokale ref> <lokale sha> <remote ref> <remote sha>`) en toetst alleen als één regel de huidige branch
  (`refs/heads/<branch>`) pusht met lokale sha gelijk aan HEAD. Geen zo'n regel (een andere branch, een tag, een verwijdering,
  lege stdin): melding en exitcode 0. Zonder `--pre-push` (met de hand) toetst het HEAD.
- **document-status-lokaal/AC-3** — Het script draait `scripts/kit/check-document-status.mjs` uit de werkmap als kindproces met
  `BASE_SHA` = `origin/main`, `HEAD_SHA` = `HEAD` (beide volledige SHA's), `HEAD_REF` = de huidige branch, `REPO` = de
  `owner/naam` uit `remote.origin.url` en `PR_NUMBER` = het nummer van de open PR voor deze branch volgens
  `gh api repos/<REPO>/pulls?head=<owner>:<branch>&state=open` (REST, `GH_PROMPT_DISABLED=1`, timeout 10 s). Precies één PR:
  dat nummer; geen `gh`, geen netwerk, geen of meer dan één PR, of een uitslag die geen geheel getal ≥ 1 is: leeg. Het
  verandert niets aan de check zelf; CI blijft de grens.
- **document-status-lokaal/AC-4** — Alleen een afkeuring op de volgorde (de melding bevat `(volgorde, ADR 0062 punt 3)`)
  blokkeert de push (exitcode 1). Elke andere afkeuring is een waarschuwing met exitcode 0 en de hint dat een branch die
  achterloopt eerst `git merge origin/main` krijgt: lokaal draait de check uit de werkmap en kan `gh` ontbreken, CI draait hem
  uit main met het echte PR-nummer.
- **document-status-lokaal/AC-5** — Bij een volgordeblokkade noemt de melding de herstelroute: nog niet gepusht, dan de
  commits opnieuw maken met de spec eerst (`git reset --soft $(git merge-base origin/main HEAD)`, de spec apart committen,
  dan de rest); al gepusht, dan een nieuwe branch vanaf `origin/main` (geen rebase of force-push, R-WERK-12).
- **document-status-lokaal/AC-6** — Blokkeert de check niet, dan toetst het script de volgorde ook zelf, los van de status:
  voor elke `docs/specs/<naam>.md` (naam niet beginnend met `_`) in `merge-base(origin/main, HEAD)..HEAD` is de eerste
  commit zonder merge die de inhoud wijzigt (nieuw bestand, of andere digest van `documentInfo`, dus zonder de statusregel)
  een commit vóór de eerste commit met een bestand buiten `docs/`. Zo niet: waarschuwing met exitcode 0 en de herstelroute,
  omdat CI dit afkeurt zodra de spec een besluit wordt (`goedgekeurd` of `gebouwd`). Een alleen-statuswijziging na de code
  (`pnpm docs:status`) telt niet.
- **document-status-lokaal/AC-7** — Ontbrekende invoer valt open met een melding en exitcode 0, zonder de check te draaien:
  geen `origin/main`, geen HEAD, geen huidige branch (detached HEAD), geen herkenbare `owner/naam` in `remote.origin.url`, of
  HEAD gelijk aan `origin/main` of erin opgenomen (niets te pushen). Een kindproces dat niet start of eindigt zonder exitcode
  (signaal, timeout van 60 s) is een waarschuwing met exitcode 0. Elke tak heeft een eigen test (leerpunt #504).
- **document-status-lokaal/AC-8** — Stap 8 van `.claude/skills/spec/SKILL.md`, de pre-push-alinea in
  `docs/operations/agent-doorloop.md`, R-CI-04 in `docs/framework.md` en de opsomming van de git-hooks in
  `docs/nieuwe-app.md` noemen dat `git push` de volgorde toetst.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Spec (`goedgekeurd`) en code in één commit, nog geen PR | blokkade met herstelroute (AC-4, AC-5) | n.v.t. |
| Spec (`voorstel`) en code in één commit (eerste push van #517) | de check slaagt; waarschuwing met herstelroute (AC-6) | n.v.t. |
| Bestaande spec krijgt nieuwe inhoud in de laatste commit na de code (#506) | blokkade (AC-4) of, zonder PR achter `gebouwd # #N`, waarschuwing (AC-6) | n.v.t. |
| Spec in een eerdere commit, daarna code, op het eind `gebouwd # #N` | groen (AC-6: alleen status) | n.v.t. |
| Alleen `docs/` gewijzigd (besluit-PR) | groen; de volgorde geldt alleen met code | n.v.t. |
| Geen netwerk of `gh` niet ingelogd | `PR_NUMBER` leeg (AC-3); alleen de volgorde blokkeert | n.v.t. |
| `gh`-bewijs voor `gevalideerd: <sha>` onleesbaar | waarschuwing (AC-4) | n.v.t. |
| Branch achter op een versoepeling in main | waarschuwing met de hint `git merge origin/main` (AC-4) | n.v.t. |
| `git push origin --delete <oud>`, `git push --tags`, andere branch pushen | niet getoetst (AC-2) | n.v.t. |

## Raakt ook

`lefthook.yml` (job), `.claude/skills/spec/SKILL.md` stap 8, `docs/operations/agent-doorloop.md` (pre-push-alinea),
`docs/framework.md` R-CI-04, `docs/nieuwe-app.md` (git-hooks), `CHANGELOG.md`. `scripts/kit/check-document-status.mjs` blijft ongewijzigd (kritiek pad, ADR 0062 punt 2).

## Buiten scope

De volgorde al bij `git commit` toetsen: een commit kent zijn opvolgers niet, en een spec mag later in een commit met code
nog wijzigen. De check in CI losser of strenger maken. Een fetch van `origin/main` in deze job (`main-achterstand` haalt hem al
op).

## Testplan

Tabeltests in `test/scripts/document-status-lokaal.test.ts` voor de pure beslisfuncties (AC-2 tot en met AC-7, elke tak met
ontbrekende invoer apart), integratietests met een echte tijdelijke git-repo met `origin/main` voor de gevallen uit de tabel
Randgevallen (ook de echte commitvorm van #517 met `voorstel` en van #506), met en zonder een nep-`gh` in `PATH`, en een
configtest op `lefthook.yml` (AC-1) en de docs (AC-8). Elke negatieve test faalt op de huidige code (R-PRINC-04).

## Open vragen

- **OV-1 ✅ besloten** — Alleen de volgorde blokkeert. De check is een spiegel van een verplichte CI-check, maar lokaal
  draait hij uit de werkmap (CI: uit main), kan `gh` ontbreken en is het PR-nummer vóór de PR onbekend; een valse blokkade
  zou alleen met `--no-verify` te omzeilen zijn, en dat is verboden. De volgorde hangt daar niet van af en is na de push niet
  meer te herstellen; de rest wel. De eigen toets (AC-6) is strenger dan CI op dat moment en daarom alleen een waarschuwing.
