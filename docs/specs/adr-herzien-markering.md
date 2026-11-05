---
status: gebouwd # #485
namespace: adr-herzien
---

# Gewijzigd ADR noemt het wijzigende ADR

## Doel

Elk geaccepteerd ADR waarvan een later geaccepteerd ADR een punt wijzigt, heeft een herzieningsregel die dat latere ADR en de
punten noemt, en `check-docs` faalt als die ontbreekt ([ADR 0074](../adr/0074-herziene-adr-punten-gemarkeerd.md)).

## Rollen en wie wat ziet

n.v.t. — documentatiecheck voor template-ADR's; geen app-gebruikers.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes.

## Kopieer de vorm van

- `scripts/kit/adr-numbers.mjs` — een pure ADR-functie in een eigen module, aangeroepen vanuit `scripts/kit/check-docs.mjs`
- `rails/hooks/lib/document-state.mjs` — herzieningsregels lezen via de export `nieuweHerzieningsregels('', tekst)`; geen
  kopie van de vorm en geen wijziging in dit bestand (ADR 0074 punt 3)
- `test/rails/check-docs-ac.test.ts` — fixture-repository in een tijdelijke map (`mkdtemp`)

## Hergebruik en UX

n.v.t. — geen UI. Melding, één regel per ontbrekend geval:
`docs/adr/<A>.md: herzieningsregel voor <B> ontbreekt (punt <N, M>); <B> wijzigt dit ADR (R-CI-05, ADR 0074)`.

## Acceptatiecriteria

- **adr-herzien/AC-1** — Gegeven een geaccepteerd ADR B met in de kop (alles vóór de eerste `## `-kop) een clausule `Wijzigt`,
  `Herziet` of `Vervangt` met een link naar geaccepteerd ADR A, wanneer A geen herzieningsregel heeft (de vorm `HERZIEN`, met
  vervolgregels tot de volgende lege regel of herzieningsregel) die naar B linkt of B's nummer noemt, dan meldt `check-docs` dat en is rood.
- **adr-herzien/AC-2** — Gegeven dat de clausule na de link naar A puntnummers noemt, wanneer de herzieningsregel(s) in
  A niet elk van die nummers noemen, dan is `check-docs` rood met de ontbrekende nummers. In een regel met één ADR-link
  tellen alle puntnummers van de regel (ook vóór de link, zoals `punt 3 en 7 volgen [0064]` in 0063); in een regel met
  meer ADR-links tellen de nummers na de link naar B tot de volgende link of puntkomma. Puntvormen: `punt N`, lijsten
  met `,` en `en`, bereiken `N–M` en `N-M` (alle nummers ertussen), en een herhaald `punt` (`punt 10, en punt 5 en 6`).
  De reeks eindigt bij het eerste woord dat geen nummer, `punt`, `,`, `en` of bereik is. Het testplan neemt de bestaande
  regels in 0063, 0064 en 0066 als gevallen.
- **adr-herzien/AC-3** — De clausule loopt van `Wijzigt`/`Herziet`/`Vervangt` tot de eerste puntkomma of het eerste zinseinde
  buiten een link en buiten backticks; elke link naar een ADR binnen de clausule telt als doel. Een link in `vult [A] aan` of
  in een andere zin telt niet.
- **adr-herzien/AC-4** — Gegeven dat A de status `vervangen door …` of `vervallen` heeft, in `docs/adr/archief/` staat, of B
  niet geaccepteerd is, dan eist de check niets.
- **adr-herzien/AC-5** — De check bepaalt A via het doelbestand van de link, niet via het nummer (0039 bestaat twee keer).
- **adr-herzien/AC-6** — Een fixture met één ontbrekende herzieningsregel maakt `check-docs` rood; dezelfde fixture met de
  regel is groen. Een fixture met een ontbrekend puntnummer is rood (AC-2).
- **adr-herzien/AC-7** — Na de bouw-PR is `check-docs` op `main` groen zonder sleutel in `.kit/baseline.json` voor deze check,
  en R-CI-05 zegt dat een ADR dat een punt van een ander ADR wijzigt, in dezelfde PR een herzieningsregel in dat ADR zet.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| B noemt A in twee clausules | Punten worden samengevoegd | n.v.t. |
| Twee herzieningsregels in A noemen B | Hun puntnummers tellen samen | n.v.t. |
| Herzieningsregel noemt B zonder puntnummers, B noemt er wel | Rood met de ontbrekende nummers (AC-2) | n.v.t. |
| Kop zonder `## Context` (0057, 0058 hebben `## Aanleiding`) | Kop eindigt bij de eerste `## `-kop (AC-1) | n.v.t. |
| Link naar een ADR dat niet bestaat | Al rood via de linkcontrole van `check-docs`; deze check slaat hem over | n.v.t. |

## Raakt ook

- `docs/framework.md` R-CI-05 (één zin); `.claude/rules/*` alleen als R-CI-05 daar letterlijk staat.
- Geen ADR-tekst: de herzieningsregels zet de besluit-PR van ADR 0074 (punt 5).

## Buiten scope

- Markeringen midden in de tekst van een punt (alternatief in ADR 0074).
- Een samenvatting per ADR in `feiten.mjs adr`; consolideren van 0045 en 0046.
- `Vult … aan` (de tekst van het oude ADR blijft geldig).

## Testplan

Unit, tabeltest op de parser van de clausule: de vormen uit AC-2 en AC-3 met de echte koppen van 0054, 0056, 0058, 0062, 0069
en 0071 als gevallen (verwachte doelen en punten per geval). Tabeltest op het lezen van herzieningsregels met vervolgregels.
Fixture-tests in een tijdelijke map voor AC-1, AC-2, AC-4, AC-5 en AC-6 en de randgevallen. `check-docs` op de repo zelf groen
(AC-7).

## Open vragen

- **OV-1 ✅ besloten** — `Vult … aan` telt niet mee; aanvullen laat de tekst van A geldig (ADR 0074 punt 1). Daardoor krijgt 0045
  geen nieuwe regel: 0063 herschreef het al met een herzieningsregel, 0068 en 0071 vullen het alleen aan.
