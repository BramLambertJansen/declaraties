---
status: gebouwd # #436
namespace: rolhek-effect
---

# Rolhek: schrijfgrens van subagents op effect

## Doel

Een Bash-commando van een subagent mag alleen bestanden veranderen die die rol ook met Edit mag schrijven, welk programma ook schrijft ([ADR 0066](../adr/0066-schrijfgrens-op-effect.md)). Aanleiding: bevinding R2 van de review van main op 2 november 2026 (`node -e`, `python3 -c`, `git reset --har`, `git clean`, `shred`, `curl -o` en meer schrijven buiten de rol), en #260.

## Rollen en wie wat ziet

n.v.t. — het rolhek, voor de subagents developer, tester, reviewer, architect, docs en een onbekende subagent (die telt als reviewer, R-ROL-02); geen app-gebruikers. De hoofdsessie valt erbuiten (OV-1).

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes.

## Kopieer de vorm van

- `rails/hooks/lib/rolhek.mjs` — `decideFile` (dezelfde beslissing als een Edit) en `roleOf`
- `rails/hooks/lib/werkstraat.mjs` — `postEdit` (PostToolUse-uitslag) en `subagentStop` (blokkeren met `decision: block`)

## Hergebruik en UX

n.v.t. — geen UI. De melding noemt per pad de rol, het pad, de regel uit `decideFile` en het commando, zegt dat de hook niets terugzet, en noemt de twee uitwegen uit AC-5.

## Acceptatiecriteria

- **rolhek-effect/AC-1** — Vóór elk Bash-commando, van een subagent en van de hoofdsessie, legt de PreToolUse-hook een momentopname vast onder de `tool_use_id`; bij de hoofdsessie dient die alleen om haar venster te verklaren (AC-2). Daarnaast legt de SubagentStart-hook één vast onder de `agent_id`. Een momentopname bevat HEAD, alle refs (`git for-each-ref`), elk pad dat `git status --porcelain=v1 -z --untracked-files=all` noemt, de genegeerde paden uit `git status --porcelain=v1 -z --ignored=traditional --untracked-files=normal` (een genegeerde map als één regel; zo verschijnt ook een `.gitignore` die zichzelf negeert, zoals `rails/.gitignore` met `*`), de index met objectnaam en mode per pad uit `git ls-files --stage`, de index-vlaggen uit `git ls-files -v` (`h`, `S`), en altijd, ook als git ze negeert: `config`, `hooks/**` en `info/**` onder `git rev-parse --git-common-dir` (ook in een worktree), `.claude/settings.local.json` en `.claude/hooks/.cache/**`. Een pad dat al een index-vlag had, hasht hij altijd. Per pad legt hij de hash van inhoud en mode vast (een symlink zelf, via lstat), of "weg". Van elk pad dat afwijkt van HEAD bewaart hij ook de inhoud zelf (het voorbeeld), zodat AC-3 de beslissing op de inhoud van vóór het commando kan baseren. De momentopname komt na het uitpakken door de stub-lader, zodat die schrijfactie niet meetelt. Git draait met `-c core.fsmonitor=false -c diff.external=` en zonder `GIT_*`-omgeving.
- **rolhek-effect/AC-2** — Na het commando maakt de PostToolUse-hook dezelfde momentopname. Een pad telt als veranderd als het nieuw afwijkt, een andere hash, indexobject of index-vlag heeft of verdween; een nieuwe regel in de genegeerde lijst telt ook. Is HEAD verschoven, dan tellen ook de paden uit `git diff --name-only <oud> <nieuw>`. Een pad dat al afweek en gelijk bleef, telt niet. Elke Edit, Write en elk Bash-commando van de hoofdsessie of een andere agent legt zijn veranderde paden vast met tijdvenster. Een pad dat zo'n ander venster verklaart, telt niet voor deze subagent. Een verschoven HEAD telt, tenzij het venster van een ander hem verklaart. Een andere ref dan de huidige branch die verandert (`git branch -f`, `git tag`, `update-ref`), krijgt `deny`.
- **rolhek-effect/AC-3** — Elk veranderd pad krijgt de beslissing van `decideFile` voor die rol, met de nieuwe inhoud (of verwijderen) en met een `ctx.read` die de inhoud van vóór het commando geeft (het bewaarde voorbeeld, anders de index of HEAD). Zo ziet `existingTest` ook een `test.skip` in een testbestand dat al gewijzigd was; een pad in `.git` of een index-vlag krijgt `deny` (R-ROL-03). Een `deny` wordt een PostToolUse-uitslag `decision: block` met de melding en wordt vastgelegd als overtreding. Een melding (`context`) wordt extra context. Dit geldt los van het programma: in een echte tijdelijke repository leveren `node -e` met `writeFileSync`, `python3 -c`, `git reset --har`, `git checkout -f`, `git clean -fd`, `git stash`, `git apply`, `git update-index --skip-worktree`, `sed --in-place=.bak`, `shred -u`, `curl -o` (lokaal bestand via `file://`), `tar -x -C` en `patch` voor de tester een blokkade op op een pad buiten zijn testpaden, en voor de developer op `rails/**`. Elk van die gevallen gaat vandaag vooraf door; weigert de toets vooraf een geval later toch, dan telt dat ook als geslaagd.
- **rolhek-effect/AC-4** — De SubagentStop-hook vergelijkt de werkmap met de momentopname uit SubagentStart, met de regels van AC-2 en AC-3. Zo vangt hij ook wat na PostToolUse doorliep (`run_in_background`, `nohup`, `&`, `setsid`) of waarvoor PostToolUse niet draaide (afbreken, timeout, PostToolUseFailure). De momentopname uit SubagentStart blijft bewaard tot het einde van de sessie. De Stop-hook van de hoofdsessie en `pnpm pr:verify` doen dezelfde vergelijking opnieuw voor elke subagent van de sessie, zodat ook een schrijfactie die pas na SubagentStop gebeurt op de lijst komt. Zijn er overtredingen, dan blokkeert hij één keer (niet bij `stop_hook_active`) met de lijst paden, en zet hij ze op de lijst voor de hoofdsessie. Deze SubagentStop-hook is een aparte entry zonder matcher, met alleen deze toets en een timeout van 30 s; de bestaande entry voor `developer|tester|reviewer` blijft.
- **rolhek-effect/AC-5** — Zolang de lijst voor de hoofdsessie niet leeg is, geeft de rolhek-hook bij elke tool-aanroep van de hoofdsessie de lijst als context. De Stop-hook van de hoofdsessie blokkeert één keer per stop (hij volgt `stop_hook_active`, geen lus), en `pnpm pr:verify` faalt; dat laatste is de echte rem vóór oplevering. Een overtreding vervalt als het pad weer gelijk is aan de momentopname van vóór de overtreding, of als de eigenaar de wijziging overneemt via `pnpm rolhek:overnemen <pad>` (of `--alles`, dat elke openstaande overtreding wist, ook die zonder pad uit AC-7). Dat commando staat in `sandbox.excludedCommands`, zodat het buiten de sandbox de lijst kan schrijven; het rolhek vraagt de hoofdsessie altijd (ask) en weigert het voor een subagent. Terugzetten naar de momentopname telt nooit als nieuwe overtreding.
- **rolhek-effect/AC-6** — Momentopnamen, de vastgelegde Edit- en Write-paden en de lijst staan in `<git-common-dir>/rolhek-effect/`. `.claude/settings.json` zet dat pad letterlijk in `sandbox.filesystem.denyWrite` (`./.git/rolhek-effect`), zodat een commando zijn eigen vergelijkingspunt niet kan herschrijven. In een worktree is `.git` een bestand; daar ligt `<git-common-dir>` buiten de werkmap en dus al buiten de schrijfrechten van de sandbox. Ontbreekt de momentopname van vóór het commando, dan toetst de hook elk afwijkend pad en meldt dat hij zonder vergelijkingspunt toetste.
- **rolhek-effect/AC-7** — Een momentopname met meer dan 5000 paden, of een toets die langer duurt dan 5 s, valt dicht: blokkade met de melding dat de toets niet rond kwam. Zo'n overtreding heeft geen pad en vervalt alleen via `rolhek:overnemen --alles`. Een hook-fout valt ook dicht: een catch-all geeft zelf `decision: block` uit, want exit 1 laat Claude Code door. De timeout van deze hooks in `.claude/settings.json` is 30 s, ruim boven de 5 s plus laadtijd; een kill door Claude Code zelf valt open, en dat vangt de eindvergelijking van AC-4 op.
- **rolhek-effect/AC-8** — Een commando dat alleen leest of binnen de rol schrijft, geeft geen uitslag: `pnpm test:unit` van de tester, `git status` van de reviewer, en een `node`-script van de developer dat `src/web/lib/voorbeeld.ts` schrijft.
- **rolhek-effect/AC-9** — `writeTargets` en de bestaande regels vooraf blijven ongewijzigd, met al hun tests. De roadmap-items "Schrijven via een programma buiten `fileTargets`" en het schrijfdeel van "Bekende gaten in het rolhek" gaan voor subagents op afgevinkt, met verwijzing naar deze spec. R-ROL-10 noemt de toets op effect, R-ROL-11 het gelijktijdige Bash-commando van twee subagents als geaccepteerd vals positief, en R-ROL-09 de uitzondering: deze toets valt dicht.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| `node -e 'fs.writeFileSync("rails/x","")'` door de developer | blokkade (voorReview-pad) | n.v.t. |
| `git commit` na schrijven, zodat de werkmap schoon is | blokkade via de verschoven HEAD | n.v.t. |
| `git update-index --assume-unchanged` of een regel in `.git/info/exclude` | blokkade (index-vlag of `.git/info/**`) | n.v.t. |
| `python3 -c` schrijft `.claude/settings.local.json` | blokkade (vaste lijst in AC-1) | n.v.t. |
| `run_in_background` of `nohup … &` dat na PostToolUse schrijft | blokkade bij SubagentStop (AC-4) | n.v.t. |
| Achtergrondproces dat pas na SubagentStop schrijft | op de lijst bij de volgende Stop van de hoofdsessie of `pr:verify` (AC-4) | n.v.t. |
| Beschermd bestand met al gestagede wijziging; de subagent vervangt alleen de gestagede inhoud | blokkade (indexobject, AC-1) | n.v.t. |
| Tester zet `test.skip` in een testbestand dat al gewijzigd was | blokkade (voorbeeld, AC-3) | n.v.t. |
| Edit van de hoofdsessie tijdens een Bash-commando van een subagent | telt niet voor de subagent (AC-2) | n.v.t. |
| `git commit` of `pnpm format` door de hoofdsessie terwijl een subagent loopt | telt niet voor de subagent (eigen venster van de hoofdsessie, AC-2) | n.v.t. |
| `git pull` of `git rebase` door de developer die `rails/**` verandert | blokkade; de eigenaar neemt over of de hoofdsessie doet de pull | n.v.t. |
| Nieuwe `rails/.gitignore` met `*` (negeert zichzelf) en `rails/nieuw.mjs` | blokkade op beide (genegeerde lijst, AC-1) | n.v.t. |
| Twee subagents met tegelijk een Bash-commando | kan aan de verkeerde worden toegeschreven; geaccepteerd vals positief (R-ROL-11) | n.v.t. |
| Commando faalt (PostToolUseFailure) | vastleggen en context; de blokkade loopt via AC-4 | n.v.t. |
| Wijziging binnen een genegeerde map (`node_modules/`) | niet gezien (buiten scope) | n.v.t. |

## Raakt ook

`rails/hooks/rolhek.mjs` en een nieuwe module in `rails/hooks/lib/`, `rails/hooks/werkstraat.mjs` (Stop van de hoofdsessie), `.claude/settings.json` (PostToolUse en PostToolUseFailure voor Bash, Edit en Write; SubagentStart; SubagentStop zonder matcher; `denyWrite`), `package.json` (`rolhek:overnemen`), `scripts/kit/pr-verify.mjs`, de stub-lader, framework R-ROL-09, R-ROL-10 en R-ROL-11, `docs/roadmap.md`, `test/hooks/`.

## Buiten scope

De hoofdsessie als dader (OV-1); wijzigingen binnen een genegeerde map (die verschijnt als één regel), behalve de vaste lijst uit AC-1; automatisch terugzetten; Edit, Write en MCP-tools (die toetst het rolhek al exact vooraf).

## Testplan

Integratietests met een echte tijdelijke git-repository per geval uit AC-3 en de randgevallen, de hooks als proces met een echte payload (SubagentStart, PreToolUse, het commando, PostToolUse, SubagentStop, Stop). Unittests voor de vergelijking van momentopnamen (AC-2), de grenzen van AC-7 en het vervallen van een overtreding (AC-5). Elke negatieve test faalt op de huidige code (R-PRINC-04).

## Open vragen

- **OV-1** — Ook de hoofdsessie toetsen? Opties: alleen een melding na het commando, of niet. Aanbeveling: niet in deze spec. De hoofdsessie krijgt vooraf al een vraag op beschermde paden, en een melding achteraf zonder blokkade voegt weinig toe. Later te heroverwegen met een leerpunt.
