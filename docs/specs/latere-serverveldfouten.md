---
status: gebouwd # #297; gevalideerd: 014a072fa62b5fef667cdd9c2ed9559e9e585c89
namespace: latere-serverveldfouten
sjabloon: mini
scope: functionele-ui
---

# Focus bij later ontvangen serverveldfouten

## Doel

Maak het bestaande foutenoverzicht bruikbaar wanneer een serverveldfout na de clientvalidatie binnenkomt.

## Rollen en wie wat ziet

Alle bestaande formuliergebruikers; geen wijziging in rechten.

## Routes en foutcodes

N.v.t. — bestaande React Hook Form-veldfouten, geen nieuwe API of foutcode.

## Kopieer de vorm van

- `src/core/web/ui/form-error-summary.tsx` — behoud het bestaande overzicht met titel en veldknoppen.

## Acceptatiecriteria

- **latere-serverveldfouten/AC-1** — Een later ontvangen serverveldfout na geldige clientvalidatie focust het overzicht.
- **latere-serverveldfouten/AC-2** — Gewone veldcorrecties en handmatige niet-serverfouten stelen de focus niet.

## Hergebruik en UX

Hergebruik FormErrorSummary, Form en Button. Titel, veldteksten en presentatie blijven door de bestaande caller bepaald.
Een nieuwe verzendpoging of nieuwe serverfouten geven de bestaande uitgestelde focus, na de veldfocus van RHF.
Correcties tijdens invoer krijgen geen nieuwe automatische overzichtsfocus.
De bestaande formulier- en focustests blijven clientfouten bij verzenden en serverfouten tijdens de normale cyclus bewaken.

## Open vragen

Geen — dit herstelt het toegankelijkheidscontract uit de goedgekeurde hardeningopdracht. De eigenaar beoordeelt de merge.
