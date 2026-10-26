---
status: voorstel # voorstel | goedgekeurd | gebouwd | vervallen — de architect zet de status in het voorstel, de merge door de eigenaar is het besluit (ADR 0046); gebouwd: # #<PR>; gevalideerd: <sha> (pnpm docs:status)
namespace: <resource>
---

# <Feature>

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

<één zin>

## Rollen en wie wat ziet

## Datawijzigingen (met grants)

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

## Kopieer de vorm van

Per regel een bestaand pad uit `docs/gouden-pad.md` (accountbeheer) en wat je overneemt; `check-docs` controleert het pad.

- `src/api/routes/accounts.ts` — <wat je overneemt>

## Hergebruik en UX

- Bestaande componenten:
- Staten per scherm: laden, leeg, fout, bezig, gelukt, verouderd
- Alle zichtbare tekst letterlijk:
- Focusvolgorde en toetsenbord:

## Acceptatiecriteria

- **<namespace>/AC-1** — Gegeven … wanneer … dan …

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|

## Raakt ook

## Buiten scope

## Testplan

## Open vragen

Een vraag zonder aanbeveling (de eigenaar kiest) blokkeert `goedgekeurd`; een vraag met aanbeveling mag blijven staan. `check-docs` telt elke regel in deze sectie met het waarschuwingsteken en "open" (ook met U+FE0F of hoofdletter, ook zonder opsommingsteken).

- **OV-1 ⚠ open** — <vraag>; <opties> (geen aanbeveling: de eigenaar kiest)
- **OV-2** — <vraag>; <opties>. Aanbeveling: <keuze en reden>
- **OV-3 ✅ besloten** — <besluit en reden>
