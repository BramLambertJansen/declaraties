# 0038 — Beslisroute: de merge is de acceptatie

Status: voorgesteld

Vervangt [0029](0029-snellere-beslisroute.md) en [0035](0035-statusakkoord-in-de-sessie.md). Wijzigt
[0025](0025-werkstraat-tot-de-merge.md), [0027](0027-taakmandaat-voor-frameworkwerk.md) en
[0031](0031-guard-en-pr-verify-bruikbaarder.md) (Besluit, punt 7). Drempel: A3 en A4.

## Herkomst

Eigenaarbesluiten in de sessie, 2026-10-21, letterlijk:

- "ik wil dat je dit advies in ieder geval meeneemt - van mij mag je alle ADR's herschrijven tot een nieuwe lijst om alle
  correcties in de juiste documenten te ondervangen (mits het framework goed blijf werken). en ik wil inderdaad een ADR
  vervangen met een nieuwe, bijgewerkte variant"
- Volgorde: "Eerst proces-ADR". ADR 0036 en 0037: "Opnemen in consolidatie". ADR 0018–0022 en 0024: "Inhoud gelijk, jij beslist".

Eigenaarbesluit: punt 1–4 (het advies). De rest is agentvoorstel; de eigenaar bevestigt het met zijn merge.

## Context

Een besluit kost nu een voorstel plus een statusstap in de webeditor, na elke inhoudsfix opnieuw; een vervanging ook een
record-PR voor het oude ADR. Zo is consolidatie van 38 ADR's onbetaalbaar. De web-flow-eis bewijst geen identiteit: de agent
pusht onder het account van de eigenaar (overgang, [0017](0017-diff-guard.md)). Het anker is de merge door de eigenaar.
0035 is nooit gebouwd.

## Besluit

1. **Merge is acceptatie** (eigenaarbesluit). De architect schrijft een ADR of spec in de PR direct met de bedoelde status
   (`geaccepteerd`, `goedgekeurd`, `vervallen`, `vervangen door NNNN`). De merge door de eigenaar is het besluit; afwijzen is
   de PR sluiten, of mergen met `vervallen` als de reden bewaard moet blijven. `voorgesteld`/`voorstel` blijft voor een
   bewust geparkeerd voorstel (agentvoorstel). `gebouwd` blijft bij `pnpm docs:status --pr` met bouwbewijs (0027 punt 4).
2. **A4 blijft** (eigenaarbesluit). De tekst van een geaccepteerd ADR verandert niet; een normatieve correctie is een nieuw
   ADR. Het nieuwe ADR en de statusregel `vervangen door NNNN` of `vervallen` van het oude mogen in dezelfde PR, zonder record.
   Meerdere ADR's per PR mogen. Een statusregel volgt 0031 besluit 4 (verwijzing achter de statuswaarde).
3. **Korte ADR's** (eigenaarbesluit). Richtlijn één pagina: context, besluit, alternatieven, gevolgen. Geen regelnummers en
   geen werkinstructie; die staan in `docs/framework.md` of `docs/operations/`. Geen woordtelling als check (agentvoorstel, P1).
4. **Drempel** (eigenaarbesluit; vervangt 0029 punt 4). Een ADR is nodig bij A2 (moeilijk terug te draaien), A3 (rechten
   verruimen, of een check, hook of gate afzwakken), A4 (geaccepteerd ADR wijzigen), en van A1 alleen een wijziging van het
   contract tussen zones. Toets: "als de twee mensen die dit besloten morgen weg zijn, weet de rest dan waarom?" Anders een
   regel in `docs/framework.md` of `docs/`.
5. **Guard** (agentvoorstel). `check-document-status` laat in een PR toe: een nieuw document met elke status; `voorstel` naar
   een eigenaarstatus; `geaccepteerd` naar `vervangen door NNNN` (NNNN op main of in de PR) of `vervallen`. De eis van een
   aparte statuscommit door web-flow vervalt. Blijft: geen inhoudswijziging aan een geaccepteerd ADR (A4); de lanes uit 0029,
   waarbij een besluit-PR nu meerdere documenten in `docs/adr/` en `docs/specs/` met hun records mag bevatten; het
   statusregelformaat. Nieuw: de samenvatting noemt elk document dat een eigenaarstatus krijgt.
6. **Rolhek** (agentvoorstel). Het weigert de architect en de hoofdsessie niet langer een eigenaarstatus in `docs/adr/` en
   `docs/specs/`. Andere rollen schrijven daar niet, ongewijzigd.
7. **Wat blijft en wat wijzigt** (agentvoorstel).
   - Uit 0029 blijven: P1–P7, framework- en feature-lane met mini-spec, `voorReview` en promptbeleid, meten, en agent-merge in
     de feature-lane met één toevoeging: een PR waarin een document een eigenaarstatus krijgt, merget de agent nooit.
   - 0025 punt 1 en 10: de agent schrijft de statusregel; de eigenaar beslist met zijn merge.
   - 0027: het register blijft voor het broncodemandaat (`--path`) en `requiredChecks`; een record geeft pas rechten na de
     merge en vervalt bij inhoudswijziging. Statusbesluiten krijgen geen record. Punt 3–7 ongewijzigd.
   - 0031 besluit 3: spoor 1 en 2 blijven; spoor 3 (niet-normatieve correctie via twee PR's) vervalt; een taalfout
     verdwijnt bij vervanging.
   - Vervalt uit 0029: de webeditorroute, "de agent zet die regel nooit", de statuscommit-eisen (a)–(c), de herzieningsgrond
     over een status zonder statuscommit, en het zelf-wijzigen van een ADR. Vervalt: heel 0035.
8. **P2-uitzondering** (agentvoorstel; de eigenaar aanvaardt haar met zijn merge). Verloren: de web-flow-frictie tegen een
   per ongeluk gezette status, en een apart eigenaarspoor in git. Anker: de merge door de eigenaar, met de statusregel in
   de diff. CODEOWNERS op `docs/adr/` en `docs/specs/` dwingt pas review af
   met een eigen identiteit voor de agent (GitHub App, 0017); tot dan is het een afspraak. Compensatie: A4-check, lanes,
   samenvatting (punt 5), geen agent-merge (punt 7).

## Alternatieven

- **0035 bouwen (sessieakkoord met prompt):** veel machinerie, geen spoor in git, geen sterker anker.
- **Webeditor houden:** een ronde per besluit en per fix.
- **A4 loslaten (correctie in het ADR zelf):** verworpen door de eigenaar.
- Gangbaar elders: [Quarkus](https://fossies.org/linux/quarkus/adr/README.adoc),
  [Picodata](https://git.picodata.io/core/picodata/-/blob/02b2aa3189cf2ed445a59eed10ff651ccad6504f/doc/adr/README.md);
  achtergrond: [Fowler](https://www.martinfowler.com/bliki/ArchitectureDecisionRecord.html),
  [antipatronen](https://jopr.org/blog/detail/10-adr-antipatterns),
  [AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/welcome.html).

## Gevolgen

**Bootstrap.** Dit ADR krijgt zijn status nog via de huidige route: de eigenaar zet `geaccepteerd` in de webeditor. Daarna
één implementatie-PR (tester, developer, reviewer; label `gate-wijziging`): guard, rolhek, `docs:status`, `AGENTS.md`,
framework §8 en §10, `docs/operations/agent-doorloop.md`, `docs/dod.md`, sjablonen, skills en tests. Tot dan is de check
strenger dan de regel. `vervangen door 0038` op 0029 en 0035 volgt daarna in een eigen PR: de guard draait uit main en
weigert die overgang vóór de implementatie; zo is die PR de eerste toets van de nieuwe route.

**Meten.** Mediaan één PR per besluit. Herzien bij één status op main die de eigenaar niet bedoelde.

**Vervolg.** De overige ADR's gaan per cluster op in een kleinere set nieuwe ADR's, elk cluster in één PR. 0036 en 0037
gaan op in de clusters achtergrondtaken en core/app-grens; 0018–0022 en 0024 gaan inhoudelijk ongewijzigd over, gemarkeerd
als eerder door de agent geaccepteerd; de merge van de eigenaar is het eigenlijke besluit.
