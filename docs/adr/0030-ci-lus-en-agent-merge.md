# 0030 — CI-lus tot groen en optionele agent-merge na akkoord

Status: geaccepteerd

Vervangt het alternatief "Auto-merge na groen: verworpen (E-2)" uit [0025](0025-werkstraat-tot-de-merge.md) en wijzigt 0025 punt 6
(mergen dicht voor de hoofdsessie) voor één exacte vorm. Wijzigt de "Vertrouwensgrens" van [0027](0027-taakmandaat-voor-frameworkwerk.md).
Besluiten van de eigenaar: 2026-10-12 (E-2 herzien) en 2026-10-14 (punten 1–7 hieronder).

## Context

ADR 0025 gaf de hoofdsessie stap 6 "Opleveren" (framework §8), met een CI-lus maar zonder stopregel; de skill `opleveren` (plan WS-04b,
`docs/reviews/2026-10-12-werkstraat.md` WS-04 punt 1) bestaat nog niet. ADR 0027 punt 6 laat de hoofdsessie wachten met
`pnpm pr:verify <nummer> --watch`. CLAUDE.md "Stoppen en vragen" zegt "na twee mislukte correctiepogingen: stop", wat een CI-lus na
twee rode rondes afbreekt. Mergen is voor elke rol dicht: `ghForbidden` in `.claude/hooks/lib/rolhek.mjs` (`gh pr merge` ook `--auto`,
`gh api …/merge`, GraphQL-merge) en deny-regels `Bash(gh pr merge*)` en `Bash(gh api *merge*)` in `.claude/settings.json`. De
eigenaar wil per PR kunnen kiezen om de agent te laten mergen, zonder dat de agent zichzelf dat akkoord kan geven.

## Besluit

1. **CI-lus tot groen** (binnen 0025 stap 6, skill `opleveren`). Na de PR wacht de hoofdsessie met `pnpm pr:verify <nr> --watch`
   (controleert SHA, branch en dat elke verplichte check van GitHub Actions komt; geen kale `gh pr checks --watch`). Rood →
   `gh run view <run-id> --log-failed`, fixen, committen, pushen, opnieuw, tot `pr:verify` groen is. Geen vast aantal rondes.
   Stoppen en de eigenaar vragen bij: (a) de fix zou een regel, check, hook of test afzwakken; (b) dezelfde fout drie keer achter
   elkaar; (c) een oorzaak buiten de code (runner, GitHub-storing); (d) een gate-pad of beschermd pad moet wijzigen.
   Na de review gemaakte fixes bekijkt de reviewer opnieuw met `git diff <reviewer-sha>..HEAD`. De lus leeft alleen binnen de
   sessie: geen timer, token of credentialwerk (0025 W-3 blijft uitgesteld). CLAUDE.md krijgt een uitzondering op "na twee
   mislukte correctiepogingen" voor deze lus; stopgrond (b) vervangt plan WS-04 punt 9 ("3 fix-rondes of 2 identieke fouten").
2. **Merge-modus als instelling.** Nieuwe sleutel in `.claude/gates.json`: `merge: "eigenaar" | "agent-na-akkoord"`; ontbreekt hij,
   dan geldt `"eigenaar"`. `.claude/**` is een gate-pad, dus alleen de eigenaar zet hem. `check-docs` faalt op een andere waarde.
   Het rolhek leest de sleutel uit `origin/main`, zoals `autoRunner` (ADR 0027 punt 6), nooit uit de werkmap; onleesbaar → `"eigenaar"`.
3. **Voorwaarde: bewezen ruleset.** `"agent-na-akkoord"` kan pas aan als aantoonbaar is dat de ruleset op `main` groene verplichte
   checks eist, via `scripts/check-github.mjs` tegen `.github/settings/main-protection.json` (framework §10). Beide bestaan nog niet
   en komen in PR 2 zelf (punt 7). Tot ze er zijn, kan de modus niet aan: `check-docs` faalt op `"agent-na-akkoord"` zolang
   `scripts/check-github.mjs` ontbreekt. De check draait één keer: bij de gate-wijziging die de waarde op `"agent-na-akkoord"` zet,
   niet bij elke merge.
4. **Akkoord per PR, in de sessie (O-1a).** Bij `"agent-na-akkoord"` gaat het rolhek alleen voor de hoofdsessie van `deny` naar `ask`
   voor exact `gh pr merge <nr> --squash`: de permissieprompt is het akkoord, de agent kan hem niet zelf beantwoorden. Elke andere vorm
   blijft deny voor elke rol: andere of extra vlaggen, en expliciet `--admin` (omzeilt de ruleset voor een beheerder; het account van de
   eigenaar is dat) en `--auto`, elk met een tabeltest in `test/hooks/`; ook `gh api …/merge`, GraphQL-merge en force-push.
   Subagents blijven deny. Bij `"eigenaar"` verandert er niets.
5. **Voorwaarden vóór de merge**: de instelling staat aan (op `origin/main`); de eigenaar gaf in de sessie akkoord voor dit PR-nummer;
   de reviewer zag de huidige head; `pnpm pr:verify <nr>` is groen op de huidige head; de PR raakt geen gate-pad.
   Verdeling van de toetsing:
   - rolhek (technisch): modus uit `origin/main`; exacte commandovorm; geen `--admin` of `--auto`; de PR raakt geen gate-pad, getoetst
     met de diff van de branch tegen `origin/main` en de lijst `gates` (zoals de diff-guard);
   - skill `opleveren` (procedureel): akkoord voor dit PR-nummer; reviewer-SHA gelijk aan de head; `pr:verify` groen.
6. **De harde grens is GitHub.** De ruleset op `main` eist groene checks (punt 3); een PR met `gate-wijziging` eist via de diff-guard
   een eigenaarreview op de head-SHA. De agent zet geen review (`gh pr review`) en geen label rechtstreeks; alleen
   `pnpm pr:label-gate` op documentatie-PR's (`gateMarker: docs`, ADR 0027 punt 5) blijft toegestaan, en dat label is administratie,
   geen akkoord. Spec `goedgekeurd` en ADR `geaccepteerd` blijven inhoudelijke eigenaarbesluiten (0027 punt 1).
7. **Uitvoering in twee PR's**, beide gate-wijzigingen die de eigenaar leest en merget; geen spec (geen migratie, route of permissie).
   PR 1, CI-lus en opruimen: skill `opleveren` (met de stap "Opruimen", punt 8), framework §8 stap 6, CLAUDE.md-uitzondering.
   PR 2, merge-modus: eerst tabeltests in `test/hooks/`, dan het rolhek, `.github/settings/main-protection.json` en
   `scripts/check-github.mjs` (punt 3), de sleutel in `.claude/gates.json` met `check-docs` (punten 2 en 3), `.claude/settings.json`
   (`Bash(gh pr merge*)` van `deny` naar `ask`; `--auto`, `--admin` en `gh api *merge*` blijven `deny`), framework §8 stap 6/7 en §10
   "De eigenaar merget", AGENTS.md "merge nooit", CLAUDE.md werkstraat. De modus aanzetten is een aparte eigenaarwijziging na punt 3.
8. **Opruimen na de merge** (hoofdsessie, skill `opleveren`, in beide modi, ook als de eigenaar zelf merget).
   - Trigger: `gh pr view <nr> --json merged,mergeCommit,headRefName,headRefOid` geeft `merged: true`. Zonder dat: niets opruimen.
   - Vooraf stoppen en melden (niet forceren) als: de werkmap niet-gecommitte wijzigingen heeft (`git status --porcelain` niet leeg);
     de lokale branch niet `headRefName` is; of de lokale branch commits heeft die niet in `headRefOid` zitten (ongepusht werk).
   - Main bijwerken: `git switch main`, of `git switch --detach origin/main` in een worktree waar `main` al elders is uitgecheckt;
     dan `git fetch origin` en `git merge --ff-only origin/main`. Geen rebase: `main` wordt squash-gemerged en lokaal heeft `main` geen
     eigen commits, dus fast-forward is de juiste vorm. Faalt `--ff-only`, dan stoppen en melden; nooit `reset --hard`.
   - Lokale branch: `git branch -D <headRefName>` (na de merged-controle; `-d` faalt na een squash-merge). Alleen die branch.
   - Remote branch: bij voorkeur de GitHub-instelling "Automatically delete head branches" (zet de eigenaar). Staat de branch er na
     de merge nog, dan `git push origin --delete <headRefName>`, alleen voor die branch en nooit `main`.
   - Worktree: hoort de branch bij een andere worktree dan de huidige, dan `git worktree remove <pad>` (zonder `--force`); de
     worktree waarin de sessie zelf draait, ruimt de runtime of de eigenaar op.
   - De eindmelding noemt wat is opgeruimd (lokale branch, remote branch, worktree) en de nieuwe SHA van `main`.

## Alternatieven

- **Auto-merge na groen (`--auto`)**: blijft verworpen; GitHub mergt dan zonder moment waarop de eigenaar deze head ziet.
- **Akkoord via label of PR-comment**: verworpen; de agent pusht onder het account van de eigenaar en kan die zelf zetten.
- **Vast maximum aan CI-rondes**: verworpen; de stopgronden in punt 1 zijn inhoudelijk, niet tellend.
- **Merge-modus uit de werkmap of per sessie**: verworpen; alleen wat de eigenaar op `main` zette, geeft het recht.
- **`gh pr merge --delete-branch`**: verworpen; het breekt de exacte vorm uit punt 4 en schakelt lokaal van branch zonder de
  controles uit punt 8. **Rebase van `main`**: verworpen, zie punt 8.
- **`gh pr checks --watch` als wachtlus**: verworpen; toetst niet of een check van GitHub Actions komt en op de juiste SHA staat.

## Gevolgen

- **Restrisico identiteit.** Tot de GitHub App bestaat, pusht en mergt de agent onder het account van de eigenaar (ADR 0017,
  overgang): een label, comment of merge in GitHub is niet te onderscheiden van de eigenaar. Ook de diff-guard geeft dan
  `overgang` (groen met waarschuwing) als auteur en goedkeurder dezelfde zijn (`scripts/kit/diff-guard.mjs`, `beoordeel`); de
  eigenaarreview uit punt 6 dwingt GitHub in die fase niet af. "PR raakt geen gate-pad" rust dan op het rolhek (punt 5).
- **Restrisico hook.** Het rolhek is fail-open (framework §8: exit 1 of timeout laat door). Doordat `Bash(gh pr merge*)` in
  `.claude/settings.json` `ask` wordt, eindigt een falende hook nog steeds op een prompt; subagents leunen voor hun deny dan op de hook.
- ADR 0027 "Vertrouwensgrens" ("main berust op de afspraak dat alleen de eigenaar merget") geldt bij `"agent-na-akkoord"` als: alleen
  de eigenaar geeft per PR akkoord. 0025 en 0027 krijgen bij acceptatie van 0030 een verwijsregel naar dit ADR, niet eerder;
  hun besluiten blijven verder staan.
- **Restrisico ruleset.** Het ruleset-bewijs (punt 3) is een momentopname bij het aanzetten. Wordt de ruleset daarna versoepeld
  (bijv. een verplichte check eruit), dan merkt de template dat niet automatisch op. Bij elke merge blijft GitHub de harde grens: wat
  de ruleset dan eist, geldt. `pnpm pr:verify` toetst per merge wel dat elke verplichte check uit main van GitHub Actions komt en
  groen is op de head, maar niet dat de ruleset die checks nog eist.
- **Opruimen en het rolhek** (punt 8): `git push origin --delete <branch>` is geen push naar `main` en geen force-push (`pushesMain`,
  `forcePushes` in `.claude/hooks/lib/rolhek.mjs`); `--delete main` blijft geweigerd. `git merge --ff-only origin/main` en
  `git branch -D` raken de vertrouwde basis niet (`movesTrustedBase`). PR 1 bewijst dit met tabeltests in `test/hooks/` voor de
  hoofdsessie, ook dat `git push origin --delete main` deny is. ADR 0025 punt 1 verbiedt alleen push naar `main` en force-push.
