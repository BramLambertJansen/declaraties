# 0038 — Beslisroute: de merge is de acceptatie

Status: voorgesteld

Vervangt [0029](0029-snellere-beslisroute.md) en [0035](0035-statusakkoord-in-de-sessie.md). Wijzigt
[0025](0025-werkstraat-tot-de-merge.md), [0027](0027-taakmandaat-voor-frameworkwerk.md) en
[0031](0031-guard-en-pr-verify-bruikbaarder.md) besluit 3; per punt in punt 8 hieronder. Drempel: A3 en A4.

## Herkomst

Eigenaarbesluiten in de sessie, 2026-10-21, letterlijk:

- "ik wil dat je dit advies in ieder geval meeneemt - van mij mag je alle ADR's herschrijven tot een nieuwe lijst om alle
  correcties in de juiste documenten te ondervangen (mits het framework goed blijf werken). en ik wil inderdaad een ADR
  vervangen met een nieuwe, bijgewerkte variant"
- Volgorde: "Eerst proces-ADR". ADR 0036 en 0037: "Opnemen in consolidatie". ADR 0018–0022 en 0024: "Inhoud gelijk, jij beslist".

Eigenaarbesluit zijn de kern van punt 1–4 (het advies), de volgorde en het vervolg voor 0036/0037 en 0018–0022/0024.
Gemarkeerd als agentvoorstel: de rest; de eigenaar bevestigt of wijst het af met zijn merge.

## Context

Een besluit kost nu een voorstel plus een statusstap in de webeditor, na elke inhoudsfix opnieuw; een vervanging ook een
record-PR voor het oude ADR. Zo is consolidatie van 38 ADR's onbetaalbaar. De web-flow-eis bewijst geen identiteit: de agent
pusht onder het account van de eigenaar (overgang, [0017](0017-diff-guard.md)). Het anker is de merge door de eigenaar.
0035 is nooit gebouwd.

## Besluit

1. **Merge is acceptatie** (eigenaarbesluit). De architect schrijft een ADR of spec in de PR direct met de bedoelde status
   (`geaccepteerd`, `goedgekeurd`, `vervallen`, `vervangen door NNNN`). De merge door de eigenaar is het besluit; afwijzen is
   de PR sluiten. Agentvoorstel: mergen met `vervallen` als de reden bewaard moet blijven; `voorgesteld`/`voorstel` blijft
   voor een bewust geparkeerd voorstel; `gebouwd` blijft bij `pnpm docs:status --pr` met bouwbewijs (0027 punt 4).
2. **A4 blijft** (eigenaarbesluit). De tekst van een geaccepteerd ADR verandert niet; een normatieve correctie is een nieuw
   ADR. Het nieuwe ADR en `vervangen door NNNN` of `vervallen` op het oude mogen in dezelfde PR, zonder record; meerdere ADR's
   per PR mogen. Agentvoorstel: de statusregel volgt 0031 besluit 4; `geaccepteerd` terug naar `voorgesteld` is niet meer
   toegestaan (anders ontstaat een omweg om A4: terugzetten met nieuwe inhoud, daarna opnieuw accepteren).
3. **Korte ADR's** (eigenaarbesluit). Richtlijn één pagina: context, besluit, alternatieven, gevolgen. Geen regelnummers en
   geen werkinstructie; die staan in `docs/framework.md` of `docs/operations/`. Agentvoorstel: geen woordtelling als check (P1).
4. **Drempel** (eigenaarbesluit; vervangt 0029 punt 4). Een ADR is nodig bij A2 (moeilijk terug te draaien: migratie op
   bestaande rijen, rollen/RLS-model, auth of identiteit, provider of nieuwe dependency), A3 (rechten verruimen, of een
   check, hook of gate afzwakken), A4 (geaccepteerd ADR wijzigen of vervangen), en van A1 alleen een wijziging van het
   contract tussen zones. Het ADR noemt welke; een strengere check is geen ADR; anders een regel in `docs/framework.md` of
   `docs/`. Agentvoorstel, de toets: "als de twee mensen die dit besloten morgen weg zijn, weet de rest dan waarom?"
5. **Guard** (agentvoorstel). `check-document-status` laat in een PR zonder record toe: een nieuw document met elke status;
   `voorstel`/`voorgesteld` naar een eigenaarstatus; `geaccepteerd` naar `vervangen door NNNN` (NNNN op main of in de PR) of
   `vervallen`; een spec van `goedgekeurd` of `gebouwd` naar `vervallen`. Het weigert `geaccepteerd` naar `voorgesteld` en
   elke inhoudswijziging aan een geaccepteerd ADR. Een besluit-PR mag meerdere documenten in `docs/adr/` en `docs/specs/`
   met hun records bevatten, zonder code; de feature-lane blijft één mini-spec met code. De samenvatting noemt elk document
   dat een eigenaarstatus krijgt.
6. **Rolhek** (agentvoorstel). Alleen architect en hoofdsessie mogen een eigenaarstatus schrijven, ook zonder record.
   Developer, tester, reviewer en docs niet; de developer, die daar wel mag schrijven, houdt alleen `gebouwd` via
   `docs:status`. De lokale A4-weigering (inhoud van een geaccepteerd ADR wijzigen) blijft.
7. **Agent-merge** (agentvoorstel; let op). Een PR waarin een document een eigenaarstatus krijgt, ook een feature-lane-PR
   met spec en code, merget altijd de eigenaar. De agent merget alleen een bouw-PR van een spec die al met eigenaarstatus op
   main staat. Agent-merge staat nog niet aan (sleutel `merge` ontbreekt in `.claude/gates.json`). De voorwaarden uit 0029
   punt 14–17 blijven, behalve de lane: "feature-lane-PR" wordt "bouw-PR van een goedgekeurde spec op main". 0030 punt 2–6
   blijft. `docs/specs/agent-merge.md` moet vóór invoering daarop worden aangepast.
8. **Wat blijft en wat wijzigt** (agentvoorstel).
   - Uit 0029 blijven: P1–P7; framework- en feature-lane met mini-spec; in de framework-lane bouwen in een volgende PR;
     `voorReview` en promptbeleid; meten; de volgorde-eisen (compensatie vóór versoepeling, punt 10 en 16); punt 18
     (gebouwd); de wijzigingen aan 0030 uit de kop van 0029; agent-merge zoals in punt 7.
   - Vervalt uit 0029: de webeditorroute, "de agent zet die regel nooit", wat punt 9 noemt, de herzieningsgrond over een
     status zonder statuscommit en het zelf-wijzigen van een ADR. Vervalt: heel 0035.
   - 0025 punt 1 en 10: de agent schrijft de statusregel; de eigenaar beslist met zijn merge.
   - 0027 punt 1: "de eigenaar beslist" blijft; "de agent registreert" wordt "de agent schrijft de status in het voorstel,
     de merge beslist". Punt 2: het register blijft alleen voor broncodemandaat (`--path`) en `requiredChecks`; een record
     geeft pas rechten na de merge en vervalt bij inhoudswijziging; statusbesluiten krijgen geen record. Punt 3–7 ongewijzigd.
   - 0031 besluit 3: spoor 1 en 2 blijven; spoor 3 (niet-normatieve correctie via twee PR's) vervalt; een taalfout
     verdwijnt bij vervanging.
9. **P2-uitzondering** (agentvoorstel; de eigenaar aanvaardt haar met zijn merge). Verloren gaan:
   - de web-flow-eis (c) en de eisen (a) statuscommit alleen statusregels en (b) geen inhoud na de status;
   - het apart eigenaarspoor in git;
   - in het rolhek voor architect en hoofdsessie: de weigering van een eigenaarstatus zonder record (ook bij een nieuw
     bestand) en de weigering van `goedgekeurd`;
   - de lanebeperking tot één document met eigenaarstatus;
   - de eis van een record bij `geaccepteerd` naar `vervangen door`/`vervallen`.

   Anker: de merge door de eigenaar, met de statusregel in de diff. CODEOWNERS op `docs/adr/` en `docs/specs/` dwingt pas
   review af met een eigen identiteit voor de agent (GitHub App, 0017); tot dan is het een afspraak. Compensatie: punt 2
   (A4 dicht), 5 (geen code in een besluit-PR, samenvatting), 6 en 7.

## Alternatieven

- **0035 bouwen (sessieakkoord met prompt):** veel machinerie, geen spoor in git, geen sterker anker.
- **Webeditor houden:** een ronde per besluit en per fix.
- **A4 loslaten (correctie in het ADR zelf):** verworpen door de eigenaar.
- **Agent-merge vervalt helemaal:** niet gekozen; een bouw-PR na een besluit op main heeft het anker al.
- Gangbaar elders: [Quarkus](https://fossies.org/linux/quarkus/adr/README.adoc),
  [Picodata](https://git.picodata.io/core/picodata/-/blob/02b2aa3189cf2ed445a59eed10ff651ccad6504f/doc/adr/README.md);
  achtergrond: [Fowler](https://www.martinfowler.com/bliki/ArchitectureDecisionRecord.html),
  [antipatronen](https://jopr.org/blog/detail/10-adr-antipatterns),
  [AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/welcome.html).

## Gevolgen

**Bootstrap** (volgorde: eigenaarbesluit; uitwerking: agentvoorstel). Dit ADR krijgt zijn status nog via de webeditor. Daarna
één implementatie-PR (tester, developer, reviewer; label `gate-wijziging`) voor guard, rolhek, `docs:status`, tests en de docs
die de route beschrijven. Tot die op main staat, is de check strenger dan de regel. `vervangen door 0038` op 0029 en 0035
volgt in een eigen PR erna: de guard draait uit main en weigert die overgang ervoor; zo is die PR de eerste toets.

**Meten** (agentvoorstel). Mediaan één PR per besluit. Herzien bij één status op main die de eigenaar niet bedoelde.

**Vervolg.** De overige ADR's gaan op in een kleinere set nieuwe ADR's, elk cluster in één PR (clusterindeling en markering:
agentvoorstel). 0036 en 0037 gaan op in de clusters achtergrondtaken en core/app-grens; 0018–0022 en 0024 gaan inhoudelijk
ongewijzigd over, gemarkeerd als eerder door de agent geaccepteerd; de merge van de eigenaar is het eigenlijke besluit
(eigenaarbesluit).
