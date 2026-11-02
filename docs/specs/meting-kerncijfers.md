---
status: gebouwd # #406
namespace: meting-kerncijfers
---

# Meting: kerncijfers per PR

## Doel

Per PR vijf kerncijfers meetbaar maken, zodat blijkt of de compacte kennisbasis tokens en doorlooptijd bespaart (roadmap: "Vervolg compacte kennisbasis", V2).

De nulmeting van het leespad gebeurt met `pnpm leespad --ref <sha>` (vóór #385: nieuwe feature 124232 B, lichte fix 14163 B, review 100352 B); het doel (nieuwe feature ≤ 25 KB) is geen acceptatiecriterium van deze spec.

## Rollen en wie wat ziet

n.v.t. — lokaal hulpmiddel voor de eigenaar en de hoofdsessie; leest alleen `<git common dir>/agent-meting` en `gh run list`.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes.

## Kopieer de vorm van

n.v.t. — geen app-code; breidt `scripts/kit/meting.mjs` en `rails/hooks/lib/meting.mjs` uit.

## Hergebruik en UX

n.v.t. — geen UI. De tabel is markdown voor de PR-beschrijving.

## Acceptatiecriteria

- **meting-kerncijfers/AC-1** — Gegeven een `Agent`- of `Task`-aanroep, wanneer de hook de sleutel bepaalt, dan is die `agent <type>` voor een `subagent_type` van een letter gevolgd door hoogstens 63 kleine letters, cijfers of streepjes, anders `agent`; prompt, beschrijving en andere velden komen nooit in de meetregel. `EVENTS` blijft ongewijzigd (compacte-kennisbasis-rails/AC-13).
- **meting-kerncijfers/AC-2** — Gegeven `pnpm meting --pr-tabel --branch <b>`, dan staat er een markdowntabel met doorlooptijd (laatste min eerste eventtijd), reviewrondes (aanroepen van `agent reviewer`, ontdubbeld op ID), CI-rood (gh-runs met conclusion failure; onbekend bij een gh-fout, nooit 0), weigeringen (als bovengrens) en een handmatige regel voor Codex-bevindingen; `--json` geeft dezelfde velden onder `prTabel`. Een `PreToolUse` van de tool `Agent` of `Task` zonder Post telt niet als weigering (een commando of pad dat `agent` heet wel); zonder `--branch` geeft het een foutmelding en exit 1.
- **meting-kerncijfers/AC-3** — Gegeven `pnpm leespad [--json] [--ref <ref>]`, dan staan per scenario (nieuwe-feature, lichte-fix, review) de bytes van het verplichte leespad en de ontbrekende bestanden (die tellen 0); met `--ref` leest het via `git show`; een ongeldige ref of een ref die met `-` begint geeft een foutmelding en exit 1 zonder git-argumentinjectie.
- **meting-kerncijfers/AC-4** — `package.json` bevat het script `leespad`.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Branch zonder events | doorlooptijd `onbekend`, tellers 0 | n.v.t. |
| gh faalt of time-out | CI-rood `onbekend` | n.v.t. |
| Bestand ontbreekt bij een ref | telt 0, staat in `ontbreekt` | n.v.t. |
| Ongeldige of `-`-ref | foutmelding, exit 1 | n.v.t. |

## Raakt ook

`docs/operations/agent-doorloop.md` ("Metingen lezen").

## Buiten scope

Een gate op de cijfers, een nieuwe hookregistratie in `settings.json`, het automatisch tellen van Codex-bevindingen en het onderscheid tussen valse en terechte weigeringen.

## Testplan

`test/rails/meting-kerncijfers-sleutel.test.ts`, `-pr-tabel.test.ts`, `-leespad.test.ts` en `-review.test.ts`.

## Open vragen

Geen.
