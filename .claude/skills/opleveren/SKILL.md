---
name: opleveren
description: Een gereviewde branch opleveren (push, PR, CI-lus tot groen) en na de merge opruimen. Alleen de hoofdsessie, pas na de review.
allowed-tools: Bash(node scripts/kit/feiten.mjs *), Bash(pnpm pr:verify *), Bash(gh pr view *), Bash(gh run view *), Bash(pnpm meting --trend), Bash(pnpm leespad), Bash(pnpm leespad *)
---

# Opleveren

Pas na de reviewer (framework §8 stap 5). Zie ADR 0046 punt 25 en 26.

Toets vóór push of de gekozen route en haar rollen kloppen met framework §8. Geen zelfreview; alle eindchecks blijven.

Feiten nu:

!`node scripts/kit/feiten.mjs gates`

## CI-lus tot groen

1. Push de featurebranch en open de PR. Nooit naar `main`, nooit force-push; conflicten via `git merge origin/main`.
   De bestaande pre-push-hook draait de volledige `pnpm gate:fast`; start die niet nogmaals alleen voor de overdracht.
   Gerichte feedback is geen volledige groene gate. Iedere PR behoudt alle CI-checks; geen oude uitslag hergebruiken.
2. Wacht met `pnpm pr:verify <nr> --watch` (geen kale `gh pr checks --watch`: die toetst SHA, branch en herkomst van de check niet).
   Start pnpm niet of weigert de werkmap ondanks gelijke head-SHA's, volg dan `docs/operations/agent-doorloop.md`,
   "Als pr:verify niet start of de werkmap weigert" (leerpunt #329); dezelfde verificatie blijft vereist.
3. Bij rood: `gh run view <run-id> --log-failed`, de oorzaak fixen, committen, pushen en opnieuw wachten. Geen vast aantal rondes.
4. Na fixes bekijkt de reviewer alleen het verschil: `git diff <reviewer-sha>..HEAD` (uitzonderingen: `docs/operations/review-checklists.md`, "Werkwijze").
5. Stop en vraag de eigenaar bij: (a) een fix die een regel, check, hook of test zou afzwakken; (b) dezelfde fout drie keer achter elkaar (voer dan eerst de leerpuntstap uit Opruimen stap 8 uit);
   (c) een oorzaak buiten de code (runner, GitHub-storing); (d) een gate-pad of beschermd pad dat moet wijzigen.
6. De lus leeft alleen binnen de sessie: geen timer, token of credentialwerk.
7. Bevat de PR de implementatie van een spec: zet na het openen van de PR in een gewone commit `status: gebouwd # #<nr>` met
   het eigen PR-nummer, plus het roadmapvinkje met `#<nr>` als de spec een item noemt (ADR 0062); geen wachten op groen.
   Alleen voor een spec waarvan de implementatie al op main staat: een aparte PR met alleen
   `pnpm docs:status <spec> gebouwd --pr <nr> --roadmap` (zonder `--roadmap` als geen roadmap-item de spec noemt); het
   bouwbewijs (gemergde PR, verplichte checks groen op de head) komt van GitHub, zonder SHA in de statusregel (ADR 0080).
   Zonder `gh`-auth: stop en meld het. Noemt het roadmap-item het specpad niet tussen backticks (dan kan `--roadmap` het
   niet afvinken), dan komt de roadmapwijziging in de implementatie; een status-PR wijzigt alleen statusregels en
   vinkjes, elke andere wijziging erin maakt `document-status` rood (`docs/operations/agent-doorloop.md`, "PR en
   statussen afronden").
8. Draai `pnpm meting --trend` en `pnpm leespad`. Zet elke "let op"-regel (de trend: een echte stap omhoog in reviewrondes,
   CI-rood of Codex-bevindingen; het leespad: groei tegenover de basis) in de PR-beschrijving en noem hem in de oplevermelding
   aan de eigenaar; de eigenaar beslist (R-DOC-08, ADR 0070). "onbekend" meld je als onbekend.

## Mergen

Kritiek of beschermd werk merget de eigenaar, niet-kritiek werk (ADR 0069) de hoofdsessie, alleen zo:

1. De job `agent-merge` van de PR is geslaagd (overgeslagen: de eigenaar merget).
2. Een verse reviewer keurde precies de head goed: PR-commentaar `Review <head-SHA>: geen blokkerende bevindingen`, na
   elke push opnieuw.
3. Codex telt als het een afgeronde review op de PR of een niet-gemergde PR van zijn branch liet; vraag dan na een push
   `@codex review` op de nieuwe head. Zonder spoor: geen extra review, niet ontwijken (draft, commentaar weghalen), meld
   "steekproef". Threads zijn opgelost.
4. `pnpm pr:merge <nr>` toetst alles via GitHub en noemt wat ontbreekt. Nooit `gh pr merge`, `gh api …/merge` of een andere route.
5. Meld PR en SHA aan de eigenaar en volg de CI op `main`; rood: revert-PR. Na revert, rode `main` of
   kritieke merge geen `pr:merge` meer (ADR 0069 punt 5).

## Opruimen

Alleen nadat de PR is gemerged, ook als de eigenaar zelf mergde.

1. Trigger: `gh pr view <nr> --json state,mergedAt,mergeCommit,headRefName,headRefOid` met `state` gelijk aan `MERGED`
   (het veld `merged` bestaat niet in `gh`). Anders niets opruimen.
2. Stop en meld, forceer niets, als: `git status --porcelain` niet leeg is; de lokale branch niet `headRefName` is; of de lokale branch
   commits heeft die niet in `headRefOid` zitten (ongepusht werk).
3. Eerst `git fetch origin` en de controle uit `docs/operations/agent-doorloop.md`, "Branchwissels in een sandbox",
   vóór iedere afzonderlijke wissel of fast-forward. Raakt de stap een door de runtime beschermd bestand (zoals onder
   `.claude/skills/`), probeer de wissel niet: een aparte schone worktree als dat is toegestaan, anders de eigenaar.
   Daarna `git switch main` (of `git switch --detach origin/main` als `main` elders is uitgecheckt) en
   `git merge --ff-only origin/main`, met de controle opnieuw vóór de fast-forward. Geen rebase: `main` wordt squash-gemerged.
   Faalt een wissel of `--ff-only`, stop dan; lees HEAD, branch, werkmap en index volgens die procedure vóór herstel of
   een commit. Nooit `reset --hard`; meld wat nog niet is opgeruimd.
4. Een andere worktree van die branch eerst weghalen: `git worktree remove <pad>` zonder `--force` (git weigert anders de branch te verwijderen).
   De worktree waarin je zelf draait ruimt de runtime of de eigenaar op; heeft stap 3 de branch daar losgemaakt, dan lukt stap 5 gewoon.
5. `git branch -D <headRefName>` (`-d` faalt na een squash-merge). Alleen die branch, nooit `main`.
6. Staat de remote branch er nog: `git push origin --delete <headRefName>`. Nooit `main`.
7. Eindmelding: wat is opgeruimd (lokale branch, remote branch, worktree) en de nieuwe SHA van `main`.
   Vaste slotregel, ook als het antwoord "niets" is: "Wat moet er in het spec-sjabloon, het gouden pad of een check veranderen
   zodat de volgende feature dit niet opnieuw betaalt?"
8. Leerpunt (ADR 0059): Loop de signaalmomenten van deze sessie af: slotvraag, derde CI-ronde, eigenaarcorrectie (pnpm meting),
   blokkerende reviewbevinding (Leerpunt: ja), tweede mislukte correctiepoging. Per les: Leerpunt? Generiek: dien het in volgens
   het sjabloon leerpunt (gh issue create naar onderhoud.repository met --label leerpunt) en toon de tekst. Alleen voor deze app:
   een padregel, spec of ADR (vanaf 0100) in de app, geen issue. Niets: zeg "geen leerpunt".
   Vraag ook (ADR 0081): kostte een stap, check, hook of instructie in deze sessie merkbaar tijd, rondes of tokens zonder iets
   te vangen, of las je code die bij gelijk gedrag veel korter of sneller kan? Dan een leerpunt met plek
   `Schrappen of vereenvoudigen` en een `Onderbouwing` met de regels `Meting:`, `Overname:` en `Terugval:`.
   De repo is `onderhoud.repository` uit `.claude/gates.json`; precies één `--label leerpunt`, geen andere vorm (anders vraagt het rolhek).
   Titel `Leerpunt: <soort>: <één zin>`; body in de volgorde van `.github/ISSUE_TEMPLATE/leerpunt.yml`, zonder appcode, appdata of geheimen:

   ```text
   ### Soort
   <een soort uit het sjabloon>
   ### Bron
   <app-PR-nummer, checknaam of signaalmoment>
   ### Kosten
   <tellingen uit pnpm meting of de PR; onbekend is onbekend>
   ### Generieke reproductie
   <stappen op een verse kopie van de template>
   ### Voorstel voor de plek
   <Schrappen of vereenvoudigen, Type, Check, Gouden pad of generator, Skill, Padregel of AGENTS.md>
   ### Onderbouwing
   <alleen bij Schrappen of vereenvoudigen: Meting:, Overname: en Terugval:, elk op een eigen regel; anders leeg>
   ### Template-SHA van de app
   <git merge-base HEAD template/main; in de template zelf HEAD>
   ### Eerder
   <eerder: #nnn bij een terugkerende fout, anders leeg>
   ```

   Zet de body in een tijdelijk bestand en geef het mee met `--body-file`: backticks of `$(` in het commando zelf geven een vraag.
   Bestaat het label nog niet, dan meld je dat; het label maakt de eigenaar. Triage en oppakken zijn van de eigenaar.
   Cloud, waar `gh` niet kan schrijven (ADR 0078 punt 4): de MCP-tool voor issues, alleen aanmaken, alleen naar
   `onderhoud.repository`, met label `leerpunt` en dezelfde titel en body. Geen andere MCP-schrijfactie.
   Sluit een PR een leerpunt (sluitwoord of koppeling), dan krijgt de beschrijving de sectie `## Leerpunt` met per issue
   `- #<nr>: trede <trede>; bewijs <testpad>`; de job `leerpunt-bewijs` draait die test rood op de basis en groen op de head.
   Alleen bij Skill, Padregel, AGENTS.md of een integratie- of e2e-test: `bewijs geen test: <reden>`, en dan merget de eigenaar.
   Bij `trede Schrappen of vereenvoudigen`: `bewijs meting: <voor> → <na> (<bron>)` met getallen, het issue heeft die plek,
   de bestaande tests blijven groen en de eigenaar merget.
