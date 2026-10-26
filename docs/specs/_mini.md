---
status: voorstel # voorstel | goedgekeurd | gebouwd | vervallen — de architect zet de status in het voorstel, de merge door de eigenaar is het besluit (ADR 0046); gebouwd: # #<PR>; gevalideerd: <sha> (pnpm docs:status)
namespace: <resource>
sjabloon: mini
---

# <Feature>

Lichte fixes zonder mini-spec; een mini-spec verkort het document, niet de rollen — route en rollen: framework §8 (ADR 0058).

Korte spec voor app-werk in de feature-lane (ADR 0046 punt 13–14), of een functionele UI-wijziging in de template
(ADR 0056). Voor die UI-scope voeg je `scope: functionele-ui` toe aan de frontmatter. Bestaande componenten in
`src/core/web/ui` en vaste teksten in `src/core/web/copy` mogen dan met hun UI-tests en gebruiksdocumentatie in dezelfde PR,
zonder voorafgaand broncodemandaat. De eigenaar beoordeelt het gedrag en de gewijzigde tests en merget de complete PR.
Auth, API/contracten, overige core, queries, dependencies, agentinstructies en bewaking vallen buiten deze UI-scope;
een app mag core niet wijzigen. Een migratie op bestaande rijen, rollen/RLS-model of `security definer` vraagt het
volledige sjabloon (`_template.md`). Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

<één zin>

## Rollen en wie wat ziet

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

## Kopieer de vorm van

Per regel een bestaand pad uit `docs/gouden-pad.md` (accountbeheer) en wat je overneemt; `check-docs` controleert het pad.

- `src/api/routes/accounts.ts` — <wat je overneemt>

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

## Open vragen

Een vraag zonder aanbeveling (de eigenaar kiest) blokkeert `goedgekeurd`; een vraag met aanbeveling mag blijven staan. `check-docs` telt elke regel in deze sectie met het waarschuwingsteken en "open" (ook met U+FE0F of hoofdletter, ook zonder opsommingsteken).

- **OV-1 ⚠ open** — <vraag>; <opties> (geen aanbeveling: de eigenaar kiest)
- **OV-2** — <vraag>; <opties>. Aanbeveling: <keuze en reden>
- **OV-3 ✅ besloten** — <besluit en reden>
