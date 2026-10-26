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
3. Bij rood: `gh run view <run-id> --log-failed`, de oorzaak fixen, committen, pushen en opnieuw wachten. Geen vast aantal rondes.
4. Na fixes bekijkt de reviewer alleen het verschil: `git diff <reviewer-sha>..HEAD`.
5. Stop en vraag de eigenaar bij: (a) een fix die een regel, check, hook of test zou afzwakken; (b) dezelfde fout drie keer achter elkaar;
   (c) een oorzaak buiten de code (runner, GitHub-storing); (d) een gate-pad of beschermd pad dat moet wijzigen.
6. De lus leeft alleen binnen de sessie: geen timer, token of credentialwerk.

## Mergen

Bij modus "eigenaar" reviewt en merget de eigenaar; de hoofdsessie merget nooit. Een agent-modus komt er pas als ADR 0046 punt 30 aanstaat.

## Opruimen

Alleen nadat de PR is gemerged, ook als de eigenaar zelf mergde.

1. Trigger: `gh pr view <nr> --json state,mergedAt,mergeCommit,headRefName,headRefOid` met `state` gelijk aan `MERGED`
   (het veld `merged` bestaat niet in `gh`). Anders niets opruimen.
2. Stop en meld, forceer niets, als: `git status --porcelain` niet leeg is; de lokale branch niet `headRefName` is; of de lokale branch
   commits heeft die niet in `headRefOid` zitten (ongepusht werk).
3. `git switch main` (of `git switch --detach origin/main` als `main` elders is uitgecheckt), `git fetch origin`,
   `git merge --ff-only origin/main`. Geen rebase: `main` wordt squash-gemerged. Faalt `--ff-only`, stop dan; nooit `reset --hard`.
4. Een andere worktree van die branch eerst weghalen: `git worktree remove <pad>` zonder `--force` (git weigert anders de branch te verwijderen).
   De worktree waarin je zelf draait ruimt de runtime of de eigenaar op; heeft stap 3 de branch daar losgemaakt, dan lukt stap 5 gewoon.
5. `git branch -D <headRefName>` (`-d` faalt na een squash-merge). Alleen die branch, nooit `main`.
6. Staat de remote branch er nog: `git push origin --delete <headRefName>`. Nooit `main`.
7. Eindmelding: wat is opgeruimd (lokale branch, remote branch, worktree) en de nieuwe SHA van `main`.
   Vaste slotregel, ook als het antwoord "niets" is: "Wat moet er in het spec-sjabloon, het gouden pad of een check veranderen
   zodat de volgende feature dit niet opnieuw betaalt?"
