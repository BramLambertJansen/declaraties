# 0059 — Leerlus van app naar template

Status: geaccepteerd

Drempel: A3 (de agent krijgt een nieuw schrijfrecht buiten de eigen repo: een issue aanmaken in de template-repo).
Eigenaarbesluit 2026-10-27; de merge door de eigenaar maakt het geldend. Uitwerking: [spec leerlus](../specs/leerlus.md).

## Context

Framework §1.5 (rails groeien met bewijs) en P1 (geen uitbreiding zonder aanleiding) vragen dat lessen uit apps terugkomen
in de template. Dat gebeurt nu alleen als iemand het onthoudt: de slotvraag van `opleveren` heeft geen vervolg, het
ST-09-protocol vraagt templatebevindingen maar geen vast kanaal, en een app mag de template niet wijzigen (ADR 0040).
Nulmeting: nul teruggebrachte templateverbeteringen uit apps. Altijd-geladen proza mag niet groeien (framework §9).

## Besluit

1. **Signaleren** in de app-sessie op vaste momenten: de slotvraag van `opleveren` na de merge, de derde CI-ronde op
   dezelfde oorzaak (stopgrond b), een eigenaarcorrectie (al geteld door `pnpm meting`), een blokkerende reviewbevinding
   en een tweede mislukte correctiepoging. De slotstap van `opleveren` verzamelt ze alle vijf uit de sessie.
2. **Vastleggen** volgens het issue-sjabloon `leerpunt` van de template, met de velden soort, bron, kosten (alleen
   tellingen), generieke reproductie, voorstel voor de plek op de ladder, template-SHA van de app en optioneel `eerder: #nnn`.
   Soorten: doorgeglipte fout, herhaald handwerk, onduidelijke instructie, ontbrekend component, wrijving in de werkstraat,
   valkuil zonder check, efficiëntie van de code, kracht van de coding agent en tokenefficiëntie.
   Een les die alleen voor die app geldt, wordt geen issue maar een padregel, spec of ADR (vanaf 0100) in de app.
3. **Terugbrengen**: het enige kanaal is een GitHub-issue in de template-repo met label `leerpunt`. Generieke reproductie,
   geen appcode, appdata of geheimen. De hoofdsessie mag het issue zonder vraag aanmaken met `gh issue create`, maar alleen
   naar de template-repo en met label `leerpunt`. Elke andere `gh issue create` blijft de gewone permissievraag aan de
   eigenaar: dit besluit regelt het kanaal voor leerpunten en verbiedt geen andere issues. Triage blijft van de eigenaar.
4. **Verwerken** doet alleen de eigenaar: hij triageert en beslist wat wanneer wordt opgepakt. Een opgepakt leerpunt wordt
   een roadmap-item met het issue als aanleiding en volgt de bestaande werkstraat. De les landt zo hoog mogelijk op de
   ladder type → check → gouden pad/generator → skill → padregel → `AGENTS.md`; een check begint met een fixture die op
   de oude code faalt (framework §1.5).
5. **Verspreiden** via de bestaande `git merge template/main`. Een terugkerende fout krijgt een nieuw issue met
   `eerder: #nnn`: het signaal dat de rail niet werkt.
6. **Uitvoering binnen ST-09**, zonder nieuw roadmap-item (ST09-08, -09 en -11 vragen dit al). Stap 1 bouwt sjabloon,
   skillstap, reviewermelding, rolhekregel en documentatie; de spec beschrijft wat en hoe het getoetst wordt.
7. **Meten** (P6): na ST-09 het aantal leerpunt-issues, het aantal opgepakte en het aantal herhalingen (`eerder:`),
   tegen de nulmeting van nul.

## Alternatieven

- **Gedeeld agentgeheugen of een altijd geladen lessenbestand.** Afgewezen: groeit onbegrensd, is niet te toetsen en
  botst met framework §9.
- **Een register in de app of een tweede register in de template.** Afgewezen: twee bronnen voor één feit (P7); GitHub
  Issues hebben al status, labels en verwijzingen.
- **Alleen de eigenaar dient issues in.** Afgewezen door de eigenaar: kost hem een handeling per les, en lessen gaan verloren.
- **De app wijzigt de template automatisch.** Afgewezen: omzeilt triage, werkstraat en eigenaarmerge.

## Gevolgen

- Nieuw recht voor de hoofdsessie; subagents maken geen issues. De inhoud van een issue (geen appdata) is niet
  technisch af te dwingen: de agent toont de tekst in de eindmelding en de eigenaar toetst bij triage.
- Geen telemetrie naar buiten: `pnpm meting` blijft lokaal; in het issue staan alleen tellingen.
- Geen leerpunt zonder reproductie; de eigenaar sluit zo'n issue.
- Later, op aanleiding (buiten stap 1): een `pnpm leerpunt`-script, een periodieke oogst van open leerpunten en een
  terugkeermeting.
