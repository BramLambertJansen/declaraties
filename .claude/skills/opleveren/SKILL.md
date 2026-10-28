---
name: opleveren
description: Een gereviewde branch opleveren (push, PR, CI-lus tot groen) en na de merge opruimen. Alleen de hoofdsessie, pas na de review.
allowed-tools: Bash(node scripts/kit/feiten.mjs *), Bash(pnpm pr:verify *), Bash(gh pr view *), Bash(gh run view *)
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
4. Na fixes bekijkt de reviewer alleen het verschil: `git diff <reviewer-sha>..HEAD`.
5. Stop en vraag de eigenaar bij: (a) een fix die een regel, check, hook of test zou afzwakken; (b) dezelfde fout drie keer achter elkaar (voer dan eerst de leerpuntstap uit Opruimen stap 8 uit);
   (c) een oorzaak buiten de code (runner, GitHub-storing); (d) een gate-pad of beschermd pad dat moet wijzigen.
6. De lus leeft alleen binnen de sessie: geen timer, token of credentialwerk.
7. Noemt de PR een spec die naar `gebouwd` gaat: eerst groen op HEAD, dan `pnpm docs:status <spec> gebouwd --pr <nr> --roadmap`
   (zonder `--roadmap` als geen roadmap-item de spec noemt) als laatste commit (het vinkje hoort in die commit, niet in de
   implementatie), en pas na groen op die commit mag de eigenaar mergen of auto-merge aanzetten. Staat auto-merge al aan,
   vraag de eigenaar hem uit te zetten. Is er een taakmandaat en noemt het roadmap-item het specpad niet tussen
   backticks (dan kan `--roadmap` het niet afvinken), of is er geen `gh`-auth: stop en meld het. Zonder mandaat komt de
   roadmapwijziging in de implementatie, niet in de statuscommit; een commit na de statuscommit maakt `document-status`
   rood (leerpunt #314; `docs/operations/agent-doorloop.md`, "PR en statussen afronden").

## Mergen

Bij modus "eigenaar" reviewt en merget de eigenaar; de hoofdsessie merget nooit. Een agent-modus komt er pas als ADR 0046 punt 30 aanstaat.

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
   <Type, Check, Gouden pad of generator, Skill, Padregel of AGENTS.md>
   ### Template-SHA van de app
   <git merge-base HEAD template/main; in de template zelf HEAD>
   ### Eerder
   <eerder: #nnn bij een terugkerende fout, anders leeg>
   ```

   Zet de body in een tijdelijk bestand en geef het mee met `--body-file`: backticks of `$(` in het commando zelf geven een vraag.
   Bestaat het label nog niet, dan meld je dat; het label maakt de eigenaar. Triage en oppakken zijn van de eigenaar.
