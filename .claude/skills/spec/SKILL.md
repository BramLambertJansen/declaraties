---
name: spec
description: Een spec schrijven voor nieuwe features, pagina's, interacties, migraties, routes of permissies volgens docs/specs/_template.md. Hergebruik passende specs; beperkte fixes vragen geen nieuw document (framework §8).
allowed-tools: Bash(node scripts/kit/feiten.mjs *)
---

# Spec schrijven

Wanneer: nieuwe feature, pagina, interactie, migratie, route of permissie (volledige straat, framework §8); een lichte fix
krijgt geen spec. Hergebruik een passende bestaande feature-spec; de feiten hieronder tonen alleen open specs, zoek een
gebouwde op aanvraag met `node scripts/kit/feiten.mjs specs --alle` of in `docs/specs/`. Een ADR is alleen nodig bij de
bestaande beslisdrempels.

Spec en bouw gaan in één PR (feature-lane, ADR 0062): na de spec-review (stap 7) schrijft de tester de tests en bouwt de
developer verder op dezelfde branch; de eigenaarmerge is het besluit (ADR 0046). Alleen kritiek werk (ADR 0062 punt 2) bouwt
pas als de spec met status `goedgekeurd` op main staat. De hoofdsessie coördineert de architect; de route verandert niets aan
spec-review of eigenaarbesluit. Bindende specs inhoudelijk wijzigen volgt de bestaande besluitroute. Van het regelboek lees je alleen de geraakte hoofdstukken (`node scripts/kit/feiten.mjs hoofdstuk <n>`).

Feiten nu:

!`node scripts/kit/feiten.mjs specs routes permissies foutcodes`

Stappen:
1. Een resource met een eigenaar per rij: `pnpm new:resource <naam>` maakt het skelet `docs/specs/<naam>.md` (alleen de
   hoofdsessie; als architect kopieer je het zelf, zie `docs/gouden-pad.md`). Anders: kopieer `docs/specs/_template.md` naar
   `docs/specs/<naam>.md`, met `status: goedgekeurd` (`voorstel` alleen voor een bewust geparkeerd voorstel).
2. Vul elke kop in; "n.v.t. — reden" mag. Teksten letterlijk; acceptatiecriteria toetsbaar (een test per criterium).
3. "Kopieer de vorm van": per regel een bestaand pad uit `docs/gouden-pad.md` (accountbeheer) en wat je overneemt.
   "Hergebruik en UX": noem de bestaande componenten (`node scripts/kit/feiten.mjs componenten`); een nieuw component alleen met reden.
4. Routes en foutcodes: hergebruik bestaande codes uit de feiten; een nieuwe code krijgt een tekst. Leg voor iedere
   padparameter vorm, contractschema en validatie vóór een externe aanroep vast. Toets foutvolgorde en voor-stappen
   volgens "Padparameters en foutvolgorde" in `docs/gouden-pad.md`, inclusief gecombineerde foutgevallen.
5. Open beslissingen staan in "Open vragen": `⚠ open` zonder aanbeveling (blokkeert `goedgekeurd`), anders met `Aanbeveling:`. Vul geen aanname in; vraag de eigenaar.
6. Afsluitcheck:
   - de paden in "Kopieer de vorm van" bestaan (`pnpm ratchet`);
   - route-, permissie-, tabel- en foutcodenamen zijn gelijk over de hele spec;
   - elke padparameter heeft een vorm en contractschema; ongeldige invoer bereikt geen externe aanroep;
   - een voor-stap verbergt geen rol- of MFA-fout; gecombineerde fouten hebben een verwachte foutcode en test;
   - elk acceptatiecriterium kan falen;
   - "Raakt ook" noemt de checks die de spec raakt: `check:migrations`, `check:secdef`, `test:db`/policies, `test/security/resources.ts`, permissietest per verboden rol;
   - geen `⚠ open` bij `goedgekeurd`: los de vraag eerst op met de eigenaar, of geef haar een `Aanbeveling:`.
7. Laat de reviewer elke spec in spec-modus toetsen (`.claude/agents/reviewer.md`), vóór het bouwen; hij toetst ook of het werk kritiek is.
8. Commit de spec vóór de eerste code of test (`document-status` controleert de volgorde). Kritiek werk: eigen besluit-PR met alleen de spec, bouwen in een volgende PR. Zie `docs/operations/agent-doorloop.md`.
