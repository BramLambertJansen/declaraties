# 0071 — Rolhek vooraf alleen voor wat de toets op effect niet ziet

Status: geaccepteerd

Wijzigt [0066](0066-schrijfgrens-op-effect.md) punt 3 ("de toets vooraf blijft"), de buitenscope "de hoofdsessie als dader"
van spec rolhek-effect (OV-1) en in spec rolhek-lezen AC-2 en AC-5 het `--output`-verbod (voortaan op effect); vult
[0045](0045-railwerk.md) aan. Drempel: A3 (een check vooraf vervalt; de controle verschuift naar achteraf) en A4. Uitwerking:
[spec](../specs/rolhek-vooraf-krimp.md).

## Context

Sinds 0066 toetst een hook na elk Bash-commando van een subagent wat er echt veranderde, met dezelfde beslissing als een Edit
(`decideFile`). Daarnaast leidt het rolhek vooraf nog steeds uit de shelltekst af welke paden een commando schrijft:
`writeTargets` in `rails/hooks/lib/shell.mjs` (ongeveer 225 regels) en in `rails/hooks/lib/rolhek.mjs` de pad-, boom-,
archief-, formatter- en `--output`-regels (ongeveer 190 regels), met hun tabeltests. Voor subagents neemt die toets op paden in
de werkmap geen beslissing die de toets op effect niet ook neemt. Wel geeft hij valse positieven (R-ROL-11: `find … -delete`,
`cp -r`, `git checkout -- <map>`, `git restore <map>`) en houdt hij gaten open die een tekstcontrole nooit dicht krijgt (roadmap
"Bekende gaten in het rolhek": globs, links, `find -exec`, `git -C`). Voor de hoofdsessie is hij de enige padtoets op Bash,
want 0066 toetst haar niet.

De review van main op 3 november 2026 stelde voor de toets vooraf te krimpen tot wat onomkeerbaar is. Van de 2.318 regels in
`rolhek.mjs` en `shell.mjs` zijn er ongeveer 415 padtoets. Het grootste deel (gh, git, verborgen commandowoorden, de leeslijst
van de reviewer) bewaakt acties buiten de werkmap. Die ziet de toets op effect niet, dus die blijven. Het doel uit de review
("onder 600 regels, `shell.mjs` weg") is daarom niet haalbaar zonder bescherming te verliezen. De lexer blijft nodig voor de
vaste lijst. Dit besluit kiest de krimp die wel kan.

Een spec-review vond drie soorten paden waar "achteraf" te laat is: `.git` (een hook draait bij de volgende git-aanroep;
`refs/remotes` en `packed-refs` ziet de toets op effect niet), de bestanden die Claude Code of git zelf laden vóór de volgende
toets (de stubs in `.claude/hooks/`, `.claude/settings.json`, `lefthook.yml`, `.pnpmfile.cjs`; een vervangen `effect.mjs`-stub
schakelt de toets van datzelfde commando uit), en git-acties van de hoofdsessie die HEAD of de index verplaatsen.

## Besluit

1. **Vooraf toetst het rolhek alleen wat de toets op effect niet kan zien of niet op tijd ziet.** Dat is een vaste lijst:
   schrijfacties op GitHub (review, label, status, merge buiten `pnpm pr:merge`, `gh alias`), GitHub en tokens voor subagents,
   de leerpunt-regels, git-acties met gevolg buiten de werkmap of bij de volgende git-aanroep (push naar `main`, force-push,
   `--no-verify`, `LEFTHOOK=0`, `core.hooksPath`, `git config` behalve lezen, `git -c alias.*`, git-omgeving, `git init` met
   template, nieuwe branch alleen vanaf verse `origin/main`), een programma starten via een optie (`git grep -O`), de trucs die
   deze lijst omzeilen (niet-letterlijke commandowoorden, globs naar `gh`, `env -S`, substituties, omhulsels), en de vaste
   leeslijst van de reviewer (rolhek-lezen). Edit, Write en MCP blijven vooraf exact getoetst.
2. **Paden die vóór de toets op effect schade doen, zijn dicht zonder dat het rolhek de schrijfvorm hoeft te kennen.** Een
   commando dat een pad in `.git` noemt, is `deny` voor elke rol, behalve een git-subcommando of een leesprogramma uit een vaste
   lijst. De stubs in `.claude/hooks/`, `.claude/settings.json`, `lefthook.yml` en `.pnpmfile.cjs` gaan in
   `sandbox.filesystem.denyWrite`: dan weigert het besturingssysteem elk Bash-programma, en Edit (buiten de sandbox, vooraf
   exact getoetst) blijft de enige weg. Beide regels zijn een gesloten lijst die niet groeit met nieuwe programma's.
3. **Elke andere padbeslissing over een Bash-commando valt onder de toets op effect.** `writeTargets` en de padregels vooraf
   vervallen, ook de `pnpm format`-regel en het `--output`-verbod. Wat een commando schrijft, verwijdert, verplaatst of
   formatteert, krijgt achteraf de beslissing van een Edit. Een verhuizing naar het ADR-archief met dezelfde naam en inhoud
   telt als verhuizing, niet als nieuw archiefbestand.
4. **De toets op effect toetst ook de hoofdsessie, op de werkmap.** Bij de hoofdsessie telt alleen een pad waarvan de inhoud
   in de werkmap veranderde. Een verschoven HEAD, een indexwijziging en een commando dat alleen uit git-subcommando's bestaat,
   tellen niet: wat zo binnenkomt, kwam via Edit (vooraf getoetst) of van `main` (CI). `deny` blokkeert en komt op de open
   lijst; `ask` komt op de open lijst, en overnemen (`pnpm rolhek:overnemen`) is het akkoord dat vooraf een vraag was; een
   melding blijft een melding. Een gegenereerd pad blijft `deny`, behalve na een generator uit een vaste lijst in
   `.claude/gates.json`. Vallen een venster van de hoofdsessie en een Bash-commando van een subagent samen, dan geldt voor dat
   pad de strengste beslissing van beide rollen.
5. **Uitkomstbehoud is de voorwaarde voor elke verwijdering.** Elk bestaand testgeval dat een Bash-commando op een pad laat
   weigeren, vragen, melden of doorlaten, wordt een rij in één corpus en draait als echt commando in een tijdelijke repository
   door de toets op effect, met dezelfde uitkomst voor dezelfde rol. De merge van dit besluit is het eigenaarakkoord om die
   gevallen uit hun testbestand naar het corpus te verplaatsen (R-TEST-02); hun aantal en uitkomst veranderen niet. Een geval
   dat alleen vooraf dicht kan, houdt zijn regel en komt in punt 1 of 2.
6. **Eerst schaduw, dan inschakelen, dan meten.** De toets op de hoofdsessie draait eerst alleen als teller: hij meldt en
   telt wat hij zou beslissen, naast de toets vooraf. Pas daarna vervalt de toets vooraf. `pnpm meting` telt blokkades op
   effect en overnames apart. De reeks stopt en de verwijdering wordt teruggedraaid (één revert-PR, de eigenaar beslist) als
   over tien PR's na de verwijdering gemiddeld meer dan twee blokkades plus overnames per PR vallen, of als de eigenaar of
   een reviewer een padwijziging op een beschermd pad vindt die geen melding, vraag of blokkade kreeg.

## Alternatieven

- **Alles laten zoals het is.** Elke nieuwe shellvorm blijft een vals positief of een gat, en de hoofdsessie blijft zonder
  toets op wat ze echt schrijft. De twee padtoetsen moeten bovendien gelijk blijven lopen.
- **Alleen de subagents krimpen, de hoofdsessie houdt `writeTargets`.** Minder risico, maar de padlogica in de lexer en haar
  tests blijven, en de gaten van de hoofdsessie blijven open.
- **De hoofdsessie zonder padtoets op Bash.** Grootste krimp, maar een vraag op `altijdVragen` verdwijnt zonder opvolger.
  Dat is verlies, geen verschuiving.
- **De hoofdsessie ook op HEAD en index toetsen.** Elke `git commit`, `pull` en `rebase` geeft dan een beslissing per
  beschermd pad; de open lijst zou bijna elke PR tegenhouden.
- **Heel `.git` in `denyWrite`.** `git` zelf schrijft daar (`fetch`, `push -u`, `lefthook install`). Daarom de tekstregel van
  punt 2 voor `.git` en `denyWrite` alleen voor bestanden die Bash nooit legitiem schrijft.

## Gevolgen

- Per Bash-commando van de hoofdsessie twee keer `git status` en een hash per afwijkend pad, net als bij subagents
  (ongeveer 12 ms op deze repo). Het groeit met het aantal afwijkende paden, niet met het aantal programma's.
- De hoofdsessie krijgt een vraag op een beschermd pad pas achteraf, als open overtreding. Daar staat tegenover dat elk
  programma meetelt, ook `node -e`, globs en links.
- `git checkout <ref> -- <pad>` en `git restore --source` van de hoofdsessie tellen niet (alleen git); hun inhoud komt uit de
  geschiedenis. `git stash pop` ook niet.
- De vier pad-items in R-ROL-11 vervallen, en het schrijfdeel van de roadmap-gaten ook voor de hoofdsessie. Wat geen pad
  schrijft (een programma starten, `curl -K`, `gh` onder een andere naam) blijft open.
- Ongeveer 415 regels code verdwijnen. Hun testgevallen blijven bestaan als corpus op effect.
- Wat binnen een genegeerde map verandert, ziet ook de toets op de hoofdsessie niet, behalve de vaste lijst uit spec
  rolhek-effect. Geen gate valt daaronder.
