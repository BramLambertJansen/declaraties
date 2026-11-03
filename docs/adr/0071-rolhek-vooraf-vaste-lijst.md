# 0071 — Rolhek vooraf alleen voor wat de toets op effect niet ziet

Status: geaccepteerd

Wijzigt [0066](0066-schrijfgrens-op-effect.md) punt 3 ("de toets vooraf blijft") en de buitenscope "de hoofdsessie als dader"
van spec rolhek-effect (OV-1); vult [0045](0045-railwerk.md) aan. Drempel: A3 (een check vooraf vervalt; de controle verschuift naar achteraf) en A4. Uitwerking:
[spec](../specs/rolhek-vooraf-krimp.md).

## Context

Sinds 0066 toetst een hook na elk Bash-commando van een subagent wat er echt veranderde, met dezelfde beslissing als een Edit
(`decideFile`). Daarnaast leidt het rolhek vooraf nog steeds uit de shelltekst af welke paden een commando schrijft:
`writeTargets` in `rails/hooks/lib/shell.mjs` (ruim 200 regels) en in `rails/hooks/lib/rolhek.mjs` de pad-, boom-, archief-,
formatter- en `--output`-regels (ruim 200 regels), met hun tabeltests. Voor subagents neemt die toets geen beslissing meer die
de toets op effect niet ook neemt. Wel geeft hij valse positieven (R-ROL-11: `find … -delete`, `cp -r`, `git checkout -- <map>`,
`git restore <map>`) en houdt hij gaten open die een tekstcontrole nooit dicht krijgt (roadmap "Bekende gaten in het rolhek":
globs, links, `find -exec`, `git -C`). Voor de hoofdsessie is hij de enige padtoets op Bash, want 0066 toetst haar niet.

De review van 3 november 2026 (bevinding P3) stelde voor de toets vooraf te krimpen tot wat onomkeerbaar is. Telling bij het
opstellen van dit besluit: van de 2.318 regels in `rolhek.mjs` en `shell.mjs` zijn er ongeveer 450 padtoets. Het grootste deel
(gh, git, verborgen commandowoorden, de leeslijst van de reviewer) bewaakt acties buiten de werkmap. Die ziet de toets op
effect niet, dus die blijven. Het doel uit de review ("onder 600 regels, `shell.mjs` weg") is daarom niet haalbaar zonder
bescherming te verliezen. Dit besluit kiest de krimp die wel kan.

## Besluit

1. **Vooraf toetst het rolhek alleen wat de toets op effect niet kan zien of niet op tijd ziet.** Dat is een vaste lijst:
   schrijfacties op GitHub (review, label, status, merge buiten `pnpm pr:merge`, `gh alias`), GitHub en tokens voor subagents,
   de leerpunt-regels, git-acties met gevolg buiten de werkmap of bij de volgende git-aanroep (push naar `main`, force-push,
   `--no-verify`, `LEFTHOOK=0`, `core.hooksPath`, `git config` behalve lezen, `git -c alias.*`, `git init` met template,
   nieuwe branch alleen vanaf verse `origin/main`), een programma starten via een optie (`git grep -O`), schrijven in `.git`
   via een redirect, de trucs die deze lijst omzeilen (niet-letterlijke commandowoorden, globs naar `gh`, `env -S`,
   substituties, omhulsels), en de vaste leeslijst van de reviewer (rolhek-lezen). Edit, Write en MCP blijven vooraf exact
   getoetst; daar is de toets vooraf geen tekstcontrole.
2. **Elke padbeslissing over een Bash-commando valt onder de toets op effect.** `writeTargets` en de padregels vooraf
   vervallen. Wat een commando schrijft, verwijdert, verplaatst of formatteert, krijgt achteraf de beslissing van een Edit.
3. **De toets op effect toetst ook de hoofdsessie.** Een weigering en een vraag (gate, `altijdVragen`) komen op de open lijst.
   Die houdt de Stop-hook en `pnpm pr:verify` tegen tot het pad terug is of de eigenaar het overneemt (`pnpm rolhek:overnemen`).
   Overnemen is dan het akkoord dat vooraf een vraag was. Een melding blijft een melding. Een gegenereerd pad dat via Bash
   verandert, telt niet als weigering: generatoren draaien via Bash, en CI controleert de uitkomst.
4. **Uitkomstbehoud is de voorwaarde voor elke verwijdering.** Elk bestaand testgeval dat vooraf een pad weigert, vraagt of
   meldt, draait als echt commando in een tijdelijke repository door de toets op effect en geeft dezelfde uitkomst voor
   dezelfde rol. Een geval dat vooraf doorging, geeft achteraf geen blokkade. Pas als dat corpus groen is, mag de regel vooraf
   weg. Een gat dat alleen nog vooraf dicht zat, houdt zijn regel en komt in punt 1.
5. **Meten en terugvallen.** `pnpm meting` telt blokkades op effect en overnames apart. Verdubbelt hun aantal per PR over de
   tien PR's na de verwijdering ten opzichte van de tien ervoor, of bereikt een padwijziging een PR die de oude toets had
   geweigerd zonder dat de toets op effect hem blokkeerde, dan stopt de reeks. De verwijdering wordt dan teruggedraaid (één
   revert-PR) en de eigenaar beslist.

## Alternatieven

- **Alles laten zoals het is.** Elke nieuwe shellvorm blijft een vals positief of een gat, en de hoofdsessie blijft zonder
  toets op wat ze echt schrijft. De twee padtoetsen moeten bovendien gelijk blijven lopen.
- **Alleen de subagents krimpen, de hoofdsessie houdt `writeTargets`.** Minder risico, maar de lexer-padlogica en haar
  tests blijven, en de gaten van de hoofdsessie blijven open.
- **De hoofdsessie zonder padtoets op Bash.** Grootste krimp, maar een vraag op `altijdVragen` verdwijnt dan zonder opvolger.
  Dat is verlies, geen verschuiving.
- **`.git/hooks` en `.git/config` in `sandbox.filesystem.denyWrite`.** Sterker dan een tekstcontrole, maar `git push -u` en
  `lefthook install` schrijven daar legitiem. Kan later, na een meting.

## Gevolgen

- Per Bash-commando van de hoofdsessie twee keer `git status` en een hash per afwijkend pad, net als bij subagents
  (ongeveer 12 ms op deze repo). Het groeit met het aantal afwijkende paden, niet met het aantal programma's.
- De hoofdsessie krijgt een vraag op een beschermd pad pas achteraf, als open overtreding. Daar staat tegenover dat elk
  programma meetelt, ook `node -e`, globs en links.
- De vier pad-items in R-ROL-11 vervallen, en het schrijfdeel van de roadmap-gaten ook voor de hoofdsessie. Wat geen pad
  schrijft (een programma starten, `curl -K`, `gh` onder een andere naam) blijft open.
- Ongeveer 450 regels code en de bijbehorende tabeltests verdwijnen. Hun gevallen blijven bestaan als corpus op effect.
  Een test vervalt alleen met eigenaarakkoord in de PR (R-TEST-02).
- Wat binnen een genegeerde map verandert, ziet ook de hoofdsessie-toets niet, behalve de vaste lijst uit spec rolhek-effect.
  Vooraf zag `writeTargets` daar alleen de paden die het kende; geen gate valt daaronder.
