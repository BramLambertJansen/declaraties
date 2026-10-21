# 0038 — Beslisroute: de merge is de acceptatie

Status: geaccepteerd

Vervangt [0029](0029-snellere-beslisroute.md) en [0035](0035-statusakkoord-in-de-sessie.md). Wijzigt
[0025](0025-werkstraat-tot-de-merge.md), [0027](0027-taakmandaat-voor-frameworkwerk.md) en
[0031](0031-guard-en-pr-verify-bruikbaarder.md) besluit 3; per punt in punt 8 hieronder. Drempel: A3 en A4.

## Herkomst

Eigenaarbesluiten in de sessie, 2026-10-21, letterlijk:

- "ik wil dat je dit advies in ieder geval meeneemt - van mij mag je alle ADR's herschrijven tot een nieuwe lijst om alle
  correcties in de juiste documenten te ondervangen (mits het framework goed blijf werken). en ik wil inderdaad een ADR
  vervangen met een nieuwe, bijgewerkte variant"
- Volgorde: "Eerst proces-ADR". ADR 0036 en 0037: "Opnemen in consolidatie". ADR 0018–0022 en 0024: "Inhoud gelijk, jij beslist".

Eigenaarbesluit: de kern van punt 1–4 (het advies), de volgorde en het vervolg. De rest is agentvoorstel.

## Context

Een besluit kost nu een voorstel plus een statusstap in de webeditor, na elke inhoudsfix opnieuw; een vervanging ook een
record-PR. Zo is consolidatie van 38 ADR's onbetaalbaar. De web-flow-eis bewijst geen identiteit: de agent
pusht als de eigenaar (overgang, [0017](0017-diff-guard.md)); het anker is diens merge.
0035 is nooit gebouwd.

## Besluit

1. **Merge is acceptatie** (eigenaarbesluit). De architect schrijft een ADR of spec in de PR direct met de bedoelde status
   (`geaccepteerd`, `goedgekeurd`, `vervallen`, `vervangen door NNNN`). De merge door de eigenaar is het besluit; afwijzen is
   de PR sluiten. Agentvoorstel: mergen met `vervallen` als de reden bewaard moet blijven; `voorgesteld`/`voorstel` blijft
   voor een bewust geparkeerd voorstel; `gebouwd` blijft bij `pnpm docs:status --pr` met bouwbewijs (0027 punt 4).
2. **A4 blijft** (eigenaarbesluit). De tekst van een geaccepteerd ADR verandert niet; een normatieve correctie is een nieuw
   ADR. Het nieuwe ADR en `vervangen door NNNN` of `vervallen` op het oude mogen in dezelfde PR, zonder record; meerdere ADR's
   per PR mogen. Agentvoorstel: de statusregel volgt 0031 besluit 4; `geaccepteerd` terug naar `voorgesteld` is niet meer
   toegestaan (omweg om A4: terugzetten met nieuwe inhoud, daarna opnieuw accepteren).
3. **Korte ADR's** (eigenaarbesluit). Richtlijn één pagina: context, besluit, alternatieven, gevolgen. Geen regelnummers en
   geen werkinstructie (die horen in `docs/`). Agentvoorstel: geen woordtelling als check (P1).
4. **Drempel** (eigenaarbesluit; vervangt 0029 punt 4). Een ADR is nodig bij A2 (moeilijk terug te draaien: migratie op
   bestaande rijen, rollen/RLS-model, auth of identiteit, provider of nieuwe dependency), A3 (rechten verruimen, of een
   check, hook of gate afzwakken), A4 (geaccepteerd ADR wijzigen of vervangen), en van A1 alleen een wijziging van het
   contract tussen zones. Het ADR noemt welke; een strengere check is geen ADR; anders een regel in `docs/`. Agentvoorstel, de toets: "als de twee mensen die dit besloten morgen weg zijn, weet de rest dan waarom?"
5. **Guard** (agentvoorstel). `check-document-status` laat in een PR zonder record toe: een nieuw document met een
   eigenaarstatus (`geaccepteerd`, `goedgekeurd`, `vervallen`, `vervangen door NNNN`); `voorstel`/`voorgesteld` naar een
   eigenaarstatus; `geaccepteerd` naar
   `vervangen door NNNN` (NNNN op main of in de PR) of `vervallen`; een spec van `goedgekeurd` of `gebouwd` naar
   `vervallen`. `gebouwd` komt alleen met bouwbewijs. Het weigert punt 2 (A4, terugzetten). Inhoud van een goedgekeurde
   spec wijzigen mag alleen in een besluit-PR; die is geen bouw-PR, dus de eigenaar merget hem (punt 7); met code blijft
   het geweigerd. Een besluit-PR bevat een of meer documenten in
   `docs/adr/` en `docs/specs/` met hun records, zonder code; de feature-lane blijft één mini-spec met code. De samenvatting
   noemt elk document dat een eigenaarstatus krijgt.
6. **Rolhek** (agentvoorstel). Alleen architect en hoofdsessie mogen een eigenaarstatus schrijven, ook zonder record.
   Zij mogen ook de inhoud van een goedgekeurde spec wijzigen. Andere rollen blijven beide geweigerd; de developer, die
   daar wel mag schrijven, houdt alleen `gebouwd` via `docs:status`. De lokale A4-weigering blijft.
7. **Agent-merge** (agentvoorstel; let op). Een PR waarin een document een eigenaarstatus krijgt, ook een feature-lane-PR
   met spec en code, merget altijd de eigenaar. De agent merget alleen een bouw-PR van een mini-spec (`sjabloon: mini`) die
   al goedgekeurd op main staat, met dezelfde inhoudscontrole als de feature-lane nu (migratie alleen een nieuwe tabel,
   niets uit de uitsluitingen). Het bereik blijft dat van 0029, gesplitst in spec-PR (eigenaar merget) en bouw-PR; de
   overige voorwaarden uit 0029 punt 14–17 en 0030 punt 2–6 blijven. Agent-merge staat nog niet aan (sleutel `merge`
   ontbreekt); `docs/specs/agent-merge.md` moet vóór invoering hierop worden aangepast.
8. **Wat blijft en wat wijzigt** (agentvoorstel). Uit 0029 blijven P1–P7, de lanes met mini-spec (bouwen in de
   framework-lane in een volgende PR), `voorReview` en promptbeleid, meten, de volgorde-eisen van punt 10 en 16, punt 18 en
   de wijzigingen aan 0030; agent-merge zoals punt 7. Vervalt: de webeditorroute, "de agent zet die regel nooit", wat punt 9
   noemt, de herzieningsgrond over een status zonder statuscommit, het zelf-wijzigen van een ADR, en heel 0035.
   0025 punt 1 en 10 en 0027 punt 1: de agent schrijft de status in het voorstel, de merge beslist. 0027 punt 2: het register
   blijft alleen voor broncodemandaat (`--path`) en `requiredChecks`, met rechten pas na de merge. 0031 besluit 3: spoor 1
   en 2 blijven; spoor 3 (niet-normatieve correctie via twee PR's) vervalt; een taalfout verdwijnt bij vervanging.
9. **P2-uitzondering** (agentvoorstel; de eigenaar aanvaardt haar met zijn merge). Verloren gaan: de statuscommit-eisen
   (a) alleen statusregels, (b) geen inhoud erna en (c) web-flow; een apart eigenaarspoor in git; in het rolhek voor
   architect en hoofdsessie de weigering van een eigenaarstatus zonder record (ook bij een nieuw bestand) en van
   `goedgekeurd`; de beperking tot één document met eigenaarstatus; de recordeis bij `geaccepteerd` naar `vervangen
   door`/`vervallen` en bij een spec van `goedgekeurd`/`gebouwd` naar `vervallen`; de weigering van een inhoudswijziging
   aan een goedgekeurde spec zonder record, in de guard en in het rolhek (voor architect en hoofdsessie). Een `--path`-record
   van zo'n spec vervalt daardoor (0027 punt 2); het mandaat vraagt een nieuw record.

   Anker: de merge door de eigenaar, met de statusregel in de diff. CODEOWNERS op `docs/adr/` en `docs/specs/` dwingt pas
   review af met een eigen identiteit voor de agent (GitHub App, 0017); tot dan is het een afspraak. Compensatie: punt 2
   (A4 dicht), 5 (geen code in een besluit-PR, samenvatting), 6 en 7.

## Alternatieven

- **0035 bouwen (sessieakkoord):** veel machinerie, geen sterker anker.
- **A4 loslaten (correctie in het ADR zelf):** verworpen door de eigenaar.
- **Agent-merge laten vervallen:** niet nodig; een bouw-PR na een besluit op main heeft het anker al.
- Gangbaar elders: [Quarkus](https://fossies.org/linux/quarkus/adr/README.adoc),
  [Picodata](https://git.picodata.io/core/picodata/-/blob/02b2aa3189cf2ed445a59eed10ff651ccad6504f/doc/adr/README.md);
  achtergrond: [Fowler](https://www.martinfowler.com/bliki/ArchitectureDecisionRecord.html),
  [antipatronen](https://jopr.org/blog/detail/10-adr-antipatterns),
  [AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/welcome.html).

## Gevolgen

**Bootstrap** (volgorde: eigenaarbesluit; uitwerking: agentvoorstel). Dit ADR krijgt zijn status nog via de webeditor. Daarna
één implementatie-PR (tester, developer, reviewer; label `gate-wijziging`) voor guard, rolhek (ook de melding "heropen het
voorstel"), `docs:status`, tests en de docs die de route beschrijven (ook spoor 3). Tot dan is de check strenger dan de
regel. `vervangen door 0038` op 0029 en 0035 volgt in een eigen PR erna, want de guard draait uit main; dat is de eerste
toets.

**Meten** (agentvoorstel). Mediaan één PR per besluit; herzien bij één onbedoelde status op main.

**Vervolg** (eigenaarbesluit; clusterindeling en markering: agentvoorstel). De overige ADR's gaan per cluster, elk in één
PR, op in een kleinere set. 0036 en 0037 gaan op in achtergrondtaken en core/app-grens; 0018–0022 en 0024 gaan ongewijzigd
over, gemarkeerd als eerder door de agent geaccepteerd; de merge van de eigenaar is het eigenlijke besluit.
