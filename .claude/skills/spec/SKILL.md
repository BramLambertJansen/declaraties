---
name: spec
description: Een spec schrijven voor nieuwe features, pagina's, interacties, migraties, routes of permissies volgens docs/specs/_template.md. Hergebruik passende specs; beperkte fixes vragen geen nieuw document (framework §8).
allowed-tools: Bash(node scripts/kit/feiten.mjs *)
---

# Spec schrijven

Wanneer: nieuwe feature, pagina, interactie, migratie, route of permissie (volledige straat, framework §8); een lichte fix
krijgt geen spec. Hergebruik een passende bestaande feature-spec; een ADR is alleen nodig bij de bestaande beslisdrempels.

Bouwen pas als de spec met status `goedgekeurd` op main staat (een mini-spec mag met haar code in één feature-lane-PR):
de eigenaarmerge is het besluit (ADR 0046). De hoofdsessie coördineert de architect; de route verandert niets aan
spec-review, broncodemandaat of eigenaarbesluit. Bindende specs inhoudelijk wijzigen volgt de bestaande besluitroute.

Feiten nu:

!`node scripts/kit/feiten.mjs specs routes permissies foutcodes`

Stappen:
1. Een resource met een eigenaar per rij: `pnpm new:resource <naam>` maakt het skelet `docs/specs/<naam>.md` (alleen de
   hoofdsessie; als architect kopieer je het zelf, zie `docs/gouden-pad.md`). Anders: kopieer `docs/specs/_template.md` naar
   `docs/specs/<naam>.md`, met `status: goedgekeurd` (`voorstel` alleen voor een bewust geparkeerd voorstel).
2. Vul elke kop in; "n.v.t. — reden" mag. Teksten letterlijk; acceptatiecriteria toetsbaar (een test per criterium).
3. "Kopieer de vorm van": per regel een bestaand pad uit `docs/gouden-pad.md` (accountbeheer) en wat je overneemt.
   "Hergebruik en UX": noem de bestaande componenten (`node scripts/kit/feiten.mjs componenten`); een nieuw component alleen met reden.
4. Routes en foutcodes: hergebruik bestaande codes uit de feiten; een nieuwe code krijgt een tekst.
5. Open beslissingen staan in "Open vragen": `⚠ open` zonder aanbeveling (blokkeert `goedgekeurd`), anders met `Aanbeveling:`. Vul geen aanname in; vraag de eigenaar.
6. Afsluitcheck:
   - de paden in "Kopieer de vorm van" bestaan (`pnpm ratchet`);
   - route-, permissie-, tabel- en foutcodenamen zijn gelijk over de hele spec;
   - elk acceptatiecriterium kan falen;
   - "Raakt ook" noemt de checks die de spec raakt: `check:migrations`, `check:secdef`, `test:db`/policies, `test/security/resources.ts`, permissietest per verboden rol;
   - geen `⚠ open` bij `goedgekeurd`: los de vraag eerst op met de eigenaar, of geef haar een `Aanbeveling:`.
7. Bij een migratie, route of permissie: laat de reviewer de spec in spec-modus toetsen (`.claude/agents/reviewer.md`), vóór de besluit-PR, of bij een mini-spec vóór het bouwen.
8. Eigen besluit-PR met alleen de spec (en eventueel een broncodemandaat-record via `pnpm docs:decision --path`, hoofdsessie). De eigenaar merget of sluit. Lever op met open vragen; bouwen in een volgende PR. Zie `docs/operations/agent-doorloop.md`.
