---
name: spec
description: Een spec schrijven voor een migratie, nieuwe route of nieuwe permissie (status voorstel), volgens docs/specs/_template.md. Gebruik vóór je zulk werk bouwt.
allowed-tools: Bash(node scripts/kit/feiten.mjs *)
---

# Spec schrijven

Wanneer: elke migratie, nieuwe route of nieuwe permissie (AGENTS.md). Bouwen pas bij status `goedgekeurd`, administratief vastgelegd met bewezen eigenaarbesluit uit main (ADR 0027).

Feiten nu:

!`node scripts/kit/feiten.mjs specs routes permissies foutcodes`

Stappen:
1. Een resource met een eigenaar per rij: `pnpm new:resource <naam>` maakt het skelet `docs/specs/<naam>.md` (alleen de
   hoofdsessie; als architect kopieer je het zelf, zie `docs/gouden-pad.md`). Anders: kopieer `docs/specs/_template.md` naar
   `docs/specs/<naam>.md`, met `status: voorstel`.
2. Vul elke kop in; "n.v.t. — reden" mag. Teksten letterlijk; acceptatiecriteria toetsbaar (een test per criterium).
3. "Hergebruik en UX": noem de bestaande componenten (`node scripts/kit/feiten.mjs componenten`); een nieuw component alleen met reden.
4. Routes en foutcodes: hergebruik bestaande codes uit de feiten; een nieuwe code krijgt een tekst.
5. Open beslissingen staan als vraag in de spec. Vul geen aanname in; vraag de eigenaar.
6. Eigen PR met spec en eventueel het voorbereide besluitrecord (hoofdsessie via `pnpm docs:decision`). Lever op met open vragen; geen werkbranchrecord als actief mandaat. Zie `docs/operations/agent-doorloop.md`.
