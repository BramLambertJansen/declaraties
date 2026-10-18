---
status: voorstel # voorstel | goedgekeurd | gebouwd | vervallen — alleen de eigenaar zet goedgekeurd; gebouwd: # #<PR>; gevalideerd: <sha> (pnpm docs:status)
namespace: <resource>
sjabloon: mini
---

# <Feature>

Korte spec voor app-werk in de feature-lane (ADR 0029 punt 5–6): een route, een permissie of een nieuwe tabel via
`pnpm new:resource`. Alles in `src/core`, een migratie op bestaande rijen, rollen/RLS-model of `security definer` vraagt het
volledige sjabloon (`_template.md`). Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

<één zin>

## Rollen en wie wat ziet

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

## Acceptatiecriteria

Randgevallen zijn ook criteria.

- **<namespace>/AC-1** — Gegeven … wanneer … dan …

## Hergebruik en UX

Verplicht niet-leeg vanaf `goedgekeurd`; zonder UI: "n.v.t. — reden".

- Bestaande componenten:
- Staten per scherm: laden, leeg, fout, bezig, gelukt, verouderd
- Alle zichtbare tekst letterlijk:
- Focusvolgorde en toetsenbord:

## Datawijzigingen (met grants)

Alleen bij een nieuwe tabel: naam, kolommen, RLS-regel en grants zoals `pnpm new:resource` ze genereert. Anders weglaten.
