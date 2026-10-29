---
status: gebouwd # #296; gevalideerd: a3a985009cf27d4360ae2b37462223f0a2bdb737
namespace: datumkiezer-fallback
sjabloon: mini
scope: functionele-ui
---

# Native fallback van de datumkiezer

## Doel

Behoud een bruikbare native datumkiezer wanneer programmatisch openen ontbreekt of wordt geweigerd.

## Rollen en wie wat ziet

Alle bestaande gebruikers van DateInput; geen wijziging in rechten.

## Routes en foutcodes

N.v.t. — uitsluitend het bestaande UI-component, zonder API- of datawijziging.

## Kopieer de vorm van

- `src/core/web/ui/date-input.tsx` — behoud Input, Button, ref, datumstring en toegankelijkheidsattributen.

## Acceptatiecriteria

- **datumkiezer-fallback/AC-1** — Zonder showPicker blijft de native indicator beschikbaar en ontbreekt een loze extra knop.
- **datumkiezer-fallback/AC-2** — Bij een geweigerde aanroep herstelt native bediening zonder verlies van waarde of focus.
- **datumkiezer-fallback/AC-3** — Ondersteund openen, disabled/readonly, grenzen en formuliergedrag blijven werken.

## Hergebruik en UX

Hergebruik DateInput, Input en Button. De bestaande tekst "Kalender openen" blijft gelijk waar de extra knop werkt.
Native bediening volgt de browser en blijft gekoppeld aan het veldlabel. Geen browserdetectie of nieuw component.
De aangepaste bestaande compound-input-tests modelleren expliciet een ondersteunde browser; hun gedragsasserties blijven.

## Open vragen

Geen — de eigenaar heeft herstel van deze fallback in de hardeningopdracht toegestaan. De merge beoordeelt dit voorstel.
