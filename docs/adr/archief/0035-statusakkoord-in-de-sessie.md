# 0035 — Statusakkoord in de sessie: de agent zet de statusregel na een chatakkoord

Status: vervangen door 0038

Wijzigt [0029](0029-snellere-beslisroute.md) punt 1 ("De agent zet die regel nooit"), punt 3 (c) en één zin van punt 13,
[0025](0025-werkstraat-tot-de-merge.md) punt 1 (statusovergangen) en punt 10, en [0031](0031-guard-en-pr-verify-bruikbaarder.md)
besluit 4 (één extra deel achter de statuswaarde). Laat [0027](0027-taakmandaat-voor-frameworkwerk.md) en het register ongewijzigd.
Normatieve wijziging, dus een nieuw ADR (0031 besluit 3 spoor 1). ADR-drempel (0029 punt 4): A3 (verruimt wat de agent doet; (c)
vervalt als eis) en A4. Raakt `.claude/settings.json`, `.claude/agents/architect.md`, `.claude/skills/`, `rails/`, `scripts/`,
`test/`, `AGENTS.md`, `docs/framework.md`, `docs/dod.md`, `docs/operations/agent-doorloop.md`, `docs/specs/` en `docs/adr/`
(Gevolgen).

**Herkomst.** Eigenaarbesluit 2026-10-19, in de sessie, letterlijk "1 ja, 2 beide, 3 ja, gemerged". Dat antwoordde op drie
vragen: (1) optie B? (2) alleen ADR's of ook specs? (3) dit ADR schrijven na de merge van #209? Daarna, in de reviewronde: "Optie
a, pak alle openstaande punten mee". Eigenaarbesluit zijn **alleen**:

- optie B: de agent zet de statusregel na een chatakkoord en de eigenaar merget;
- de reikwijdte: ADR's én specs;
- dit ADR schrijven na de merge van #209;
- optie A: een `ask`-prompt op `--sessieakkoord` als sessiebewijs;
- alle reviewbevindingen verwerken.

Al het andere is **agentvoorstel** en staat zo gelabeld per punt. De eigenaar bevestigt het met zijn merge van dit ADR, of wijst
het daarvóór af.

## Context

Nu zet alleen de eigenaar een eigenaarstatus: in de PR via de GitHub-webeditor (0029 punt 1 en 3, gecontroleerd in
`verifyStatusCommit`, `scripts/kit/check-document-status.mjs:186`; committer web-flow :194-196) of via een record op main en
`pnpm docs:status` (0027). Wrijving, alleen wat de repo laat zien:

- #208 (spec `agent-merge`): 14 commits, waaronder de webeditorcommits "Change status from 'voorstel' to 'goedgekeurd'" en
  "Update agent-merge.md", daartussen "reset agent-merge to voorstel after content fix": na elke inhoudsfix opnieuw een
  handmatige statusstap van de eigenaar.
- #205 → #206 (ADR 0029 heropend en geaccepteerd): twee PR's; #206 raakt alleen het ADR.
- #209 (ST-03): twee specs in één PR passen in geen lane (`laneVan`, `scripts/kit/lane.mjs:56`), dus liep het via 7 records
  voor bouwbranches in `.claude/decisions.json`; beide specs staan op main nog op `voorstel`.

Wat (c) bewijst: niets over identiteit. 0029 punt 3 noemt het "frictie tegen een per ongeluk gepushte status, géén
identiteitsbewijs". De agent pusht onder het account van de eigenaar (overgang, ADR 0017). Een bewuste agent kan ook een
web-flow-commit maken met `gh api …/contents` (0029 Context): dat staat niet in `deny` (`.claude/settings.json:45-51`) en
`ghForbidden` weigert het niet (`rails/hooks/lib/rolhek.mjs:659`, `apiWritesSelfReview` :686). Toch vangt (c) vandaag wél elke
status die een agent via een gewone commit zet, ook als hij buiten het rolhek om schrijft (punt 8). Het vertrouwensanker is in
elke route hetzelfde: de merge door de eigenaar (0027, "Vertrouwensgrens").

Precedent: op 2026-10-10 en 10-11 keurde de agent onder mandaat zelf specs goed en accepteerde hij ADR's
(`docs/reviews/2026-10-11-keuzes-agent.md`). 0025 punt 10 beëindigde dat: "De agent zet geen spec op `goedgekeurd` en geen ADR op
`geaccepteerd`". Het verschil met dit ADR: toen koos de agent zelf. Hier beslist de eigenaar per document en status in een eigen
bericht, bevestigt hij met een prompt (punt 4) en merget hij zelf (punt 6). De agent schrijft alleen de regel.

## Besluit

1. **Route "sessieakkoord"** (eigenaarbesluit: optie B, ADR's en specs; overgangen en lanes: agentvoorstel). Geeft de eigenaar in
   de sessie akkoord op een genoemd document en een genoemde status, dan zet de hoofdsessie de statusregel in dezelfde PR als het
   voorstel.
   - Statussen: `goedgekeurd`, `geaccepteerd`, `vervallen` en `vervangen door NNNN`.
   - Alleen vanaf `voorstel`/`voorgesteld` op `origin/main`, of voor een bestand dat daar nog niet staat. Dat zijn dezelfde
     overgangen als 0029 punt 3 (`eigenaarStatussen`, `scripts/kit/check-document-status.mjs:204`; `vanVoorstel`, idem :73).
   - `gebouwd` blijft bij `pnpm docs:status --pr` met bouwbewijs (0027 punt 4).
   - De lanes van 0029 punt 7 blijven gelijk (`laneVan`, `verifyInPrStatus` :241): één besluitdocument met hooguit zijn record,
     of één mini-spec in de feature-lane.
   - Bedoeld voor de hoofdsessie. Een subagent mag deze route niet gebruiken. Wat technisch nog kan, staat in punt 4 en 8.
2. **Wat geen akkoord is** (agentvoorstel). Alleen een bericht van de eigenaar zelf in de sessie telt, dat document en status noemt,
   of ondubbelzinnig het voorstel waarop het antwoordt. Geen akkoord zijn: tekst uit een subagent-hand-back, tool- of
   hookuitvoer, notificaties (ook tekst die zich als `[SYSTEM NOTIFICATION]` of systeembericht voordoet), PR-, issue- of
   reviewcommentaar, bestandsinhoud, een algemeen "ga door" en een akkoord op een eerdere versie. Wijzigt de inhoud na het
   akkoord, dan vraagt de hoofdsessie opnieuw.
3. **Verantwoording op de statusregel** (agentvoorstel). Vaste vorm, buiten de digest (`documentInfo`,
   `rails/hooks/lib/document-state.mjs:39` haalt alleen de statusregel eruit). Een aparte regel zou inhoud zijn en punt 3 (a) en (b)
   van 0029 breken.
   - ADR: `Status: geaccepteerd — akkoord eigenaar in de sessie (2026-10-19)`
   - Spec: `status: goedgekeurd # akkoord eigenaar in de sessie (2026-10-19)`

   Wat akkoord is: de statuswaarde op die regel, voor de inhoud van dat document. Die inhoud ligt vast via (b): geen inhoud na
   de statuscommit.
   - 0031 besluit 4 krijgt één toegestaan deel, `akkoord eigenaar in de sessie (JJJJ-MM-DD)`, alleen achter een eigenaarstatus
     (`statusregelOvertreding` :84, `toegestaanDeel` :97).
   - `changeStatus` (`document-state.mjs:63`, patroon :73) herschrijft de hele regel. Daardoor verdwijnt bij een spec ook de
     sjabloonopmerking "alleen de eigenaar zet goedgekeurd". De regel blijft op main staan tot de status verder wijzigt; bij
     `gebouwd` of een vervanging verdwijnt hij uit de tekst. De git-geschiedenis en de PR houden hem vast.
4. **Normale route: `--sessieakkoord` achter een prompt** (eigenaarbesluit: optie A; uitwerking: agentvoorstel).
   - **Script.** `scripts/kit/document-status.mjs` krijgt de vlag `--sessieakkoord`. Het schrijft de exacte vorm met de datum van
     vandaag. Het weigert bij een andere beginstatus dan `voorstel`/`voorgesteld`, bij `gebouwd` en bij een vuile werkmap
     (`unchanged` :81). Het slaat `canRecordStatus` over; dat is de verruiming. Commit de status apart: (a) eist een statuscommit
     die alleen statusregels wijzigt.
   - **Prompt via substring, niet via opgesomde vormen.** Het rolhek toetst de ruwe commandotekst, zoals het al doet voor
     `--sta-wijzigingen-toe` (`rails/hooks/lib/rolhek.mjs:96`, `command.includes`). Bevat de tekst `--sessieakkoord`, dan roept
     het `gate()` aan (:143): `ask` voor de hoofdsessie, ook in de onderhoudsmodus (zoals `altijdVragen`, ADR 0033), `deny` voor
     elke andere rol. Zo valt elke vorm eronder waarin de vlag letterlijk staat, ongeacht welk programma hem start:
     - `pnpm docs:status`, `pnpm run docs:status`, `pnpm --silent docs:status` en `pnpm -C . docs:status`;
     - `pnpm exec node scripts/kit/document-status.mjs`, `node [./|absoluut]scripts/kit/document-status.mjs` en `env node …`;
     - `npm run docs:status -- …` en `bash -c '…'`.

     Een toets op `docs:status`/`document-status` samen met de vlag zou smaller zijn, en een `bash -c` met aanhalingstekens kan dan
     mislopen. Daarom de vlag alleen. Niet gedekt: een vlag die pas bij het uitvoeren ontstaat (`$(…)`, een variabele, `node -e`
     met eigen schrijfcode). `rails/hooks/lib/shell.mjs:3` herkent die bewust niet.

     Vals-positief: de toets slaat ook aan op tekst die de vlag alleen noemt, zoals een commitbericht, een PR-tekst via `gh` of
     `git log --grep=--sessieakkoord`. De hoofdsessie krijgt dan een prompt, een subagent een weigering. Zo'n onverwachte prompt
     vertroebelt detectie (i) uit punt 9 en leert de eigenaar doorklikken. Agentvoorstel voor PR 1:
     - de substring-toets blijft, omdat hij robuust is tegen nieuwe vormen;
     - tests leggen de vals-positieven vast;
     - werkafspraak: de agent zet de vlag niet letterlijk in commitberichten, PR-tekst of zoekopdrachten (hij schrijft
       "sessieakkoord-vlag");
     - een prompt waarvan het commando geen `docs:status`/`document-status` aanroept, weigert de eigenaar.

     Het alternatief, alleen toetsen als het uitvoerbare deel `docs:status` of `document-status` bevat, mist `bash -c` en
     `env`-varianten; daarom niet gekozen.
   - **Vangnet.** `.claude/settings.json` krijgt in `ask` een patroon op de vlag (bijvoorbeeld `Bash(*--sessieakkoord*)`; of een patroon met een `*` vooraan werkt, eerst nagaan in de Claude Code-docs), geen `allow`. Die gelden als het
     rolhek faalt; het rolhek is fail-open bij een timeout van 10 s (`.claude/hooks/laden.mjs:115`; framework §8, zoals 0029 punt 14).
   - **Wat de prompt bewijst.** De klik bewijst dat de eigenaar op de normale route in deze sessie een handeling deed, voor het
     document en de status die de prompt toont. Hij bewijst niet dat het chatbericht uit punt 2 bestond, of dat de eigenaar de
     inhoud las. Hij laat geen spoor na in git of op GitHub. Hij werkt alleen in Claude Code; in Codex, cloudsessies en andere
     runtimes is de merge door de eigenaar het enige anker. Om de prompt heen kan het wel: punt 8.
   - Een Edit of Write van de statusregel blijft geweigerd, maar alleen als het rolhek een vertrouwde basis (`authority`) heeft
     en pad en cwd geen `..` bevatten.
     - `scopedContext` (`rails/hooks/lib/rolhek.mjs:183-186`) zet `authority` bij `..` op `null`. Dan worden `recordedStatus` (:259)
       en de toets op :239 overgeslagen.
     - `approvesSpec` (:275-279) dekt alleen `goedgekeurd` in `docs/specs/`, niet `geaccepteerd` in `docs/adr/`.

     Dit ADR verandert daar niets aan; zie punt 8.
5. **Guard** (agentvoorstel, inclusief datumregel, citaatkop en uitslagtekst). Dit geldt in `verifyStatusCommit` (:186).
   - (a) en (b) blijven.
   - (c) wordt: committer web-flow, óf de statusregel op de statuscommit en op HEAD heeft exact de vorm uit punt 3.
   - Datum: de committerdatum van de statuscommit telt (`git log -1 --format=%cs`). De datum op de regel moet bestaan en mag niet
     later zijn. Dat is frictie, geen bewijs: de agent bepaalt de committerdatum zelf.
   - Citaatkop: bij de sessieakkoordvorm eist de guard dat de PR-beschrijving een kop `Akkoord in de sessie` heeft met daaronder
     een niet-leeg citaat van het eigenaarbericht. Dat is alleen een aanwezigheidscontrole; of het citaat klopt, toetst de
     eigenaar. De guard leest GitHub al alleen-lezend (`pullRequest` en `checkRuns` in `scripts/kit/github-evidence.mjs`, via
     `verifyBuilt` :29). De workflow draait niet bij het bewerken van de beschrijving (`guard.yml` :10), dus na zo'n wijziging is
     een nieuwe push of een Re-run nodig.
   - Ontbreekt iets, dan is de guard rood, zoals nu. Uitslag en stapsamenvatting melden: "statusovergang in de PR met
     sessieakkoord (ADR 0035): niet verifieerbaar vanuit de repo; bevoegdheid is de merge door de eigenaar (overgang, ADR 0017)".
6. **Geen merge door de agent in deze route** (agentvoorstel). Is de status niet door web-flow gezet, dan valt de PR buiten de
   agent-merge van 0029 punt 14 en is auto-merge uitgesloten. Voorwaarde: de merge-toets van `docs/specs/agent-merge.md` en zijn
   code krijgen deze uitsluiting vóórdat stap C (`merge: "feature-lane"`) aangaat (PR 3). Zonder die wijziging gaat C niet aan.
   Verruimen vraagt een eigen ADR (0030, 0029 stap 7).
7. **Ongewijzigd** (agentvoorstel): `.claude/decisions.json` en `requiredChecks`, `canRecordStatus` en `currentDecision`
   (`rails/hooks/lib/task-authority.mjs:86`, :78), het broncodemandaat `canWriteProtected` (:103) en `verifyScope`
   (`scripts/kit/check-document-status.mjs:133`). Een in-PR-status geeft geen mandaat. Een record met `--path` geeft pas rechten
   na de merge op main (0029 punt 2). Ook gelijk: diff-guard en CODEOWNERS (`/docs/adr/`, `/docs/specs/`); de eigenaar ziet de
   statusregel in de diff.
8. **P2: een benoemde uitzondering** (agentvoorstel; de eigenaar aanvaardt de P2-uitzondering met zijn merge van dit ADR). Dit ADR
   zwakt een check af; dat staat hier eerlijk.
   - **Vandaag** vangt (c) elke status die een agent via een gewone git-commit zet, ook buiten het rolhek om.
   - **De omweg.** Een Bash-schrijfactie gaat via `bashTarget` (`rails/hooks/lib/rolhek.mjs:445-455`) naar `decideFile` met
     `after: null`. Daardoor worden `recordedStatus` (:259), de toets op :239 en `approvesSpec` (:276) overgeslagen.
     `docs/adr/**` en `docs/specs/**` staan niet in `voorReview` (`.claude/gates.json:54-89`), en de architect heeft daar
     schrijfrecht (`.claude/gates.json:117`). `node -e`, `bash -c` en `$(…)` herkent het rolhek niet (`shell.mjs:3`).
     Ook een Edit of Write met `..` in pad of cwd ontloopt `recordedStatus` en :239 (`scopedContext` :183-186, punt 4). Voor een
     ADR geldt `approvesSpec` dan evenmin.
   - **Na 0035** accepteert (c) de vorm van elke committer. Stel dat de hoofdsessie of de architect via Bash of `node -e` de
     statusregel met de vaste vorm schrijft, dat apart commit en de kop "Akkoord in de sessie" in de PR zet. Dan is de guard
     groen zonder dat er ooit een prompt verscheen. Detectie (i) uit punt 9 ziet zo'n agent niet. (c) vangt dus minder dan nu.
   - **Ook verzwakt:**
     - de handeling van de eigenaar in de PR zelf verdwijnt; er blijven een klik (zonder spoor in git) en de merge, en een merge
       zonder lezen keurt een status goed die de eigenaar niet typte;
     - "eigenaar zette de status" is in git geen apart spoor meer;
     - de werkafspraak "de agent zet die regel nooit" vervalt;
     - buiten Claude Code is er geen prompt.
   - **Compensatie, niet sluitend:**
     - de merge door de eigenaar, met de statusregel in de diff;
     - de steekproef (ii) uit punt 9;
     - de prompt op de normale route;
     - de guardmelding;
     - geen agent-merge (punt 6).
   - **Aanvullend, ook niet sluitend** (agentvoorstel): het rolhek weigert subagents elke herkenbare Bash-schrijfactie naar
     `docs/adr/**` en `docs/specs/**` (redirect, `tee`, `cp`, `mv`, `sed -i`; `writeTargets` in `decideBash` :428). De architect
     schrijft daar dan alleen nog via Edit/Write, waar `recordedStatus` geldt. Voor de hoofdsessie blijft het een melding. Niet
     gedekt: `node -e`, `bash -c`, `$(…)`, en een Edit of Write met `..` in pad of cwd (`authority` is dan `null`).
   - **Afweging:** de geciteerde antwoorden bewijzen niet dat de eigenaar deze P2-uitzondering besloot. Ze volgt uit optie B en
     optie A zoals hier uitgewerkt; de eigenaar bevestigt haar met zijn merge van dit ADR, of wijst haar daarvóór af. Ze is
     begrensd tot statusregels van ADR's en specs in de bestaande lanes; elke andere rail blijft gelijk.
9. **Risico, vaststelling en herziening** (agentvoorstel). Risico: de agent claimt ten onrechte akkoord, door een fout, een
   verkeerd gelezen bericht, injectie via tool- of subagenttekst, of de omweg uit punt 8. Hoe de eigenaar "status zonder echt
   akkoord" vaststelt:
   - (i) een prompt voor `--sessieakkoord` die hij niet verwachtte; dan weigert hij, en dat telt als voorval;
   - (ii) vóór de merge een steekproef van het citaat onder "Akkoord in de sessie", tegen zijn eigen bericht. Alleen (ii) ziet de
     omweg uit punt 8.

   Herzien direct bij één voorval, of bij één status op main via sessieakkoord waarvoor de eigenaar geen akkoord gaf. Tot de
   herziening geldt dan alleen de webeditor. In **0029 punt 13** vervangt dit alleen de zin "direct bij één status op main zonder
   statuscommit van de eigenaar in de PR" door "direct bij één status op main zonder statuscommit van de eigenaar (web-flow) of
   zonder geldig sessieakkoord (ADR 0035 punt 9)". De nulmeting en de andere herzieningsgronden van punt 13 blijven staan.
10. **Vervolg buiten dit ADR** (agentvoorstel):
    - meer dan één document per PR met sessieakkoord (#209); de lanes blijven hier gelijk;
    - overgangen vanaf een eigenaarstatus (`geaccepteerd` → `vervangen door NNNN`/`vervallen`); die vragen nu een record
      (`vanVoorstel`, `check-document-status.mjs:73`), ook via de webeditor;
    - het citaat als inhoudelijke eis; de guard toetst alleen of het er is.

## Alternatieven

- **Huidige route houden (webeditor, 0029 punt 1):** verworpen met de keuze voor optie B (antwoord 1). De route kost per
  inhoudsfix een handmatige stap (#208) of een extra PR (#205 → #206).
- **Sessieakkoord zonder prompt:** verworpen met de keuze voor optie A. Op de normale route is er dan niets dat een
  eigenaarhandeling onderscheidt van ingevoegde tekst.
- **Alleen ADR's:** niet gekozen; de eigenaar antwoordde "beide" (antwoord 2). Specs gaven de meeste rondes (#208, #209).
- **Agent zet status en merget** (agentvoorstel: verworpen): dan valt het enige anker weg. De framework-lane blijft
  eigenaarmerge (0029 punt 14).
- **Mandaat zoals op 2026-10-10/11** (agentvoorstel: verworpen): daar koos de agent zelf (0025 punt 10, Context).
- **Verantwoording als aparte regel of frontmatterveld** (agentvoorstel: verworpen): dat is inhoud in de digest, breekt (a)/(b)
  en de record-digests.
- **Record per chatakkoord in het register** (agentvoorstel: verworpen): een record geeft pas rechten op main, dus blijft het
  twee PR's (0029 Context).
- **Akkoord als PR-commentaar van de eigenaar** (agentvoorstel: verworpen): onder hetzelfde account niet te onderscheiden van de
  agent.

## Gevolgen

**Bootstrap.** De route werkt pas als PR 1 en PR 2 op main staan. `guard.yml` draait `check-document-status` uit main. "Nooit"
staat nu in 0029:56 en `docs/operations/agent-doorloop.md:33`. `AGENTS.md:73` laat statussen alleen toe "uitsluitend met
bewezen eigenaarbesluit of bouwbewijs", en een sessieakkoord is geen bewezen besluit uit main. Dit ADR zelf krijgt zijn status
dus via de webeditor (0029 punt 1).

**Bouwvolgorde** (agentvoorstel). Kleine PR's, elk met label `gate-wijziging` en eigenaarreview. PR 1 en 2 blijven gescheiden:
PR 1 bevat de gedragswijziging plus de tekst die dat gedrag beschrijft (P7, één bron voor de huidige werking). PR 2 bevat de
normatieve teksten die de agent de route toestaan. Staat PR 1 op main en PR 2 nog niet, dan zijn de regels strenger dan de check
en kan er niets mis. Zo leest de eigenaar de toestemming los van de techniek.

- **PR 1, checks, hooks, prompt en beschrijvende docs (test-eerst).**
  - Tests vooraf:
    - `test/hooks/adr-statusregel.test.ts`: het deel achter `geaccepteerd` slaagt; achter `voorgesteld`, als vrije variant of met
      een ongeldige datum is het rood.
    - `test/rails/lane-status.test.ts`: een andere committer met de vorm en een citaatkop slaagt. Rood: zonder de vorm, zonder
      citaatkop of met een leeg citaat, met inhoud in of na de statuscommit, met een datum na `%cs`, met twee documenten, en een
      volledige spec met code.
    - `test/hooks/rolhek-script.test.ts`, elke vorm uit punt 4 met `--sessieakkoord`: `ask` voor de hoofdsessie (ook in
      onderhoud) en `deny` voor elke subagent. Zonder de vlag is het gedrag ongewijzigd. De vals-positieven uit punt 4 worden
      vastgelegd: `git commit -m '… --sessieakkoord …'` en `git log --grep=--sessieakkoord` geven `ask` (hoofdsessie) of `deny`
      (subagent). Een Bash-redirect van een subagent naar
      `docs/adr/**`/`docs/specs/**` geeft `deny` (punt 8, aanvullend).
    - Een test voor `docs:status --sessieakkoord`: schrijft exact de vorm; weigert vanaf `geaccepteerd` en bij `gebouwd`.
    - Een test dat `check-docs` (`SPEC_STATUS`, `scripts/kit/check-docs.mjs:21`) en `scripts/kit/feiten.mjs` (:46)
      `status: goedgekeurd # akkoord eigenaar in de sessie (…)` als `goedgekeurd` lezen.
  - Daarna: `rails/hooks/lib/document-state.mjs`, `scripts/kit/check-document-status.mjs`, `scripts/kit/document-status.mjs`,
    `rails/hooks/lib/rolhek.mjs`, `ask` in `.claude/settings.json` (beschermd, `altijdVragen`: de eigenaar geeft akkoord in de
    PR), `docs/framework.md` §10 "Besluit en status" (:423-431; de regel over het statusregelformaat op :429-430 krijgt het
    nieuwe deel) en `docs/operations/agent-doorloop.md` (:33-35, met de kop "Akkoord in de sessie").
- **PR 2, normatieve teksten.**
  - `AGENTS.md` (:10, :73);
  - `docs/framework.md` §8 stap 1 en 6 (:280-282, :300);
  - `docs/dod.md:14` (sessieakkoord naast "bewijs uit main");
  - `.claude/agents/architect.md:16` (de architect gebruikt geen sessieakkoord);
  - `.claude/skills/spec/SKILL.md:9` ("administratief vastgelegd met bewezen eigenaarbesluit uit main");
  - `.claude/skills/opleveren/SKILL.md` (de kop "Akkoord in de sessie" in de PR-beschrijving);
  - de sjabloonopmerking "alleen de eigenaar zet goedgekeurd" in `docs/specs/_template.md` en `_mini.md` wordt "de eigenaar
    beslist goedgekeurd; de regel zet de eigenaar of, na zijn akkoord, de hoofdsessie (ADR 0035)". In de 9 bestaande specs met
    die opmerking blijft hij staan; `changeStatus` haalt hem bij de volgende overgang weg (punt 3);
  - verwijslink `[0035](0035-statusakkoord-in-de-sessie.md)` achter de statuswaarde van 0025, 0029 en 0031 (0031 besluit 3
    spoor 2).

  In `.claude/rules/` staat geen statusregel; daar verandert niets.
- **PR 3, agent-merge** (voorwaarde vóór stap C, punt 6; volgorde A → B → C in `docs/specs/agent-merge.md:70`): de uitsluiting in
  de merge-toets van de spec én in zijn code: `agentMerge` in de diff-guard (A4, :214) en de merge-toets in het rolhek (B1, :281),
  beide via `rails/hooks/lib/lane.mjs`. Met een nieuw akkoord van de eigenaar.

**Beschermd** (CODEOWNERS): `.claude/`, `scripts/`, `rails/`, `test/`, `AGENTS.md`, `docs/framework.md`, `docs/dod.md`,
`docs/adr/` en `docs/specs/`. In `voorReview`: `.claude/**`, `scripts/**`, `rails/**`, `AGENTS.md`, `docs/framework.md` en
`docs/dod.md`. In `altijdVragen`: `.claude/settings.json`. Geen wijziging aan `.claude/gates.json`, `.claude/decisions.json` of
`.github/`. Geen dependency, route, migratie of permissie, dus geen spec.
