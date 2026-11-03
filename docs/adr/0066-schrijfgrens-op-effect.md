# 0066 — Schrijfgrens van subagents op effect, niet op de shellvorm

Status: geaccepteerd

Herzien: 2026-11-03 (#454): punt 3 en de buitenscope "hoofdsessie" volgen [0071](0071-rolhek-vooraf-vaste-lijst.md)

Vult [0045](0045-railwerk.md) aan: het rolhek blijft vooraf toetsen, en toetst daarnaast achteraf wat een Bash-commando
van een subagent echt veranderde. Uitwerking: spec [rolhek-effect](../specs/rolhek-effect.md).

## Context

Het rolhek leidt vooraf uit de shelltekst af welke bestanden een commando schrijft (`writeTargets` in `rails/hooks/lib/shell.mjs`).
Dat werkt alleen voor programma's die het kent. De review van main op 2 november 2026 (bevinding R2) vond dat `git reset --har`,
`git clean -fdx`, `git stash`, `git checkout -f`, `git apply`, `sed --in-place=.bak`, `shred`, `rsync`, `unzip -d`, `curl -o`,
`tar -C` en `patch` voor elke subagent doorgaan. `node -e` en `python3 -c` schrijven elk bestand, ook in `rails/`. In #260 schreef een
developer zo `.claude/**`, `.github/**`, `scripts/**` en `rails/**` via een Python-script. Twee roadmap-items noemen deze gaten.
Sinds 27 oktober kostten nieuwe gaten vijf PR's en drie leerpunten. Een lijst per programma, optie en afkorting is nooit af. Een
interpreter is niet dicht te zetten zonder de developer zijn werk af te nemen. Dat schaalt niet.

## Besluit

1. **Na elk Bash-commando van een subagent toetst een hook het effect.** Vóór het commando legt de hook vast welke paden in de
   werkmap afwijken van HEAD en met welke inhoud. Erna vergelijkt hij opnieuw, inclusief een verschoven HEAD. Elk pad dat
   veranderde, krijgt dezelfde beslissing als een Edit van die rol op dat pad (`decideFile`). Welk programma schreef, doet er niet toe.
2. **Een weigering blokkeert, tot het pad terug is of de eigenaar het overneemt.** De hook meldt pad, rol en commando aan de
   subagent. Bij zijn einde vergelijkt de subagent-hook nog eens met de stand bij zijn start, zodat ook achtergrondcommando's
   meetellen. Een open overtreding houdt daarna de hoofdsessie tegen tot het pad terug is of de eigenaar de wijziging overneemt.
   De hook draait niets zelf terug, want terugzetten kan goed werk wissen. De diff-guard in CI blijft de harde grens.
3. **De toets vooraf blijft, maar groeit niet meer.** `writeTargets` en de bestaande git-regels blijven als vroege waarschuwing.
   Een nieuw schrijfgat in een programma krijgt geen nieuwe regel meer, maar valt onder punt 1. De twee roadmap-items over
   schrijven buiten `fileTargets` en via interpreters vervallen voor subagents.
4. **De vastlegging staat buiten wat Bash in de sandbox mag schrijven.** Anders kan het commando zijn eigen vergelijkingspunt
   herschrijven.

## Alternatieven

- **De lijst uit R2 dichtzetten.** Snel, maar `node -e` en `python3` blijven open, en het volgende programma vraagt de volgende
  regel. De eigenaar koos hiertegen (projectthread, 2 november 2026).
- **De Claude Code-sandbox per pad.** De sandbox geldt voor de hele sessie, niet per subagent. De hoofdsessie moet `rails/`
  kunnen schrijven, dus per rol afbakenen kan hij niet.
- **Een alleen-lezen worktree per rol.** Sterk voor de reviewer, maar de tester en de developer moeten in de werkmap schrijven.
  Dit kan later naast punt 1 bestaan.

## Gevolgen

- Werk per Bash-aanroep van een subagent: twee keer `git status` en een hash per afwijkend pad. Op deze repo kost `git status`
  ongeveer 12 ms. Dat groeit met het aantal afwijkende paden, niet met het aantal programma's of regels.
- Het effect wordt pas na het commando gezien. Een overtreding is dus al gebeurd, maar valt direct op en blokkeert de oplevering.
- Wat binnen een genegeerde map verandert (`node_modules/`), ziet de toets niet, behalve een vaste lijst die het rolhek zelf stuurt (`.git/config`,
  `.git/hooks`, `.git/info`, `settings.local.json`, de hook-cache) en de index-vlaggen. `.env*` blijft beschermd via de sandbox
  en R-SEC-05.
- Wat de hoofdsessie of een andere agent in hetzelfde venster schrijft (Edit, Write of Bash), telt niet mee. Alleen twee
  Bash-commando's van verschillende subagents tegelijk kunnen elkaars wijziging krijgen. Dat is een geaccepteerd vals positief aan de veilige kant.
- Anders dan de toets vooraf valt deze toets dicht bij een fout, een timeout of een te grote werkmap. De eigenaar heft een
  overtreding op door de wijziging over te nemen; `pnpm pr:verify` faalt zolang er een openstaat.
