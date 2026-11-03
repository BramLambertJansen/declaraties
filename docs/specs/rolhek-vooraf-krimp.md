---
status: goedgekeurd
namespace: rolhek-vooraf-krimp
---

# Rolhek vooraf: alleen de vaste lijst, paden op effect

## Doel

Het rolhek toetst vooraf alleen nog wat de toets op effect niet (op tijd) ziet; elke andere padbeslissing over een Bash-commando, ook van de hoofdsessie, valt onder de toets op effect, zonder dat een bestaande uitkomst verloren gaat ([ADR 0071](../adr/0071-rolhek-vooraf-vaste-lijst.md)). Aanleiding: de review van main op 3 november 2026.

## Rollen en wie wat ziet

n.v.t. — het rolhek, voor de hoofdsessie en de subagents developer, tester, reviewer, architect, docs en een onbekende subagent (telt als reviewer, R-ROL-02); geen app-gebruikers.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes.

## Kopieer de vorm van

- `rails/hooks/lib/effect-hooks.mjs` — `actorVan` en de PostToolUse-uitslag (`decision: block`), nu ook voor de hoofdsessie
- `rails/hooks/lib/rolhek.mjs` — `decideFile` en `decideChange` (dezelfde beslissing als een Edit)
- `test/hooks/rolhek-effect.test.ts` — een echt commando in een tijdelijke repository, de hooks als proces

## Hergebruik en UX

n.v.t. — geen UI. De melding van de toets op effect blijft zoals in spec rolhek-effect. Voor een vraag-uitkomst van de hoofdsessie zegt de melding: `<pad> is een beschermd pad (framework §10): de wijziging staat op de open lijst tot je hem terugzet of de eigenaar hem overneemt met pnpm rolhek:overnemen <pad>`.

## Acceptatiecriteria

- **rolhek-vooraf-krimp/AC-1** — Corpus. Elk bestaand testgeval in `test/hooks/` dat een Bash-commando op een pad laat weigeren, vragen, melden of doorlaten, staat als rij in één corpus `test/hooks/rolhek-padcorpus.ts`. Bronnen: `rolhek-schrijfgaten`, `rolhek-indirect-writes`, `rolhek-archief-bash`, `rolhek-git-map`, `rolhek-migratie`, `rolhek-voorreview`, `rolhek-onderhoud`, `rolhek-onbekende-rol`, `rolhek-script`, de padgevallen uit `rolhek-volledig-pad`, `rolhek-railgaten` en `rolhek-lezen` (`--output`, `format-patch -o`), en de padgevallen uit `rolhek.test.ts`. Een rij heeft: commando, rol, beginstand van de repository (zo dat het commando het pad echt verandert), en de uitkomst die de huidige code geeft (`deny`, `ask`, melding of doorlaten). Een relationele verwachting ("niet `allow`", "dezelfde uitslag als `echo x > f`") wordt bij het verplaatsen vastgezet op de uitkomst die de huidige code geeft. De PR noemt per bronbestand het aantal gevallen voor en na; het totaal verandert niet.
- **rolhek-vooraf-krimp/AC-2** — Uitkomstbehoud. Elke corpusrij draait als echt commando in een tijdelijke git-repository, het commando zelf in de kooi (spec kooi, ADR 0072), door de hooks als proces (PreToolUse, het commando, PostToolUse, voor subagents ook SubagentStop). `deny` geeft achteraf een blokkade op hetzelfde pad, voor elke rol. `ask` geeft voor een subagent een blokkade en voor de hoofdsessie een open overtreding. Een melding geeft dezelfde melding als context. Doorlaten geeft geen blokkade. Een rij die vooraf een aanroep zonder pad weigerde (een brede `prettier --write`, `eslint --fix` of `pnpm format`), krijgt in de beginstand een beschermd bestand dat de aanroep verandert, en geeft achteraf een blokkade of open overtreding op dat pad. Een rij uit punt 2 van de ADR (zelfladende paden) geeft dezelfde weigering vooraf (AC-3). Dit corpus is groen vóór AC-5 en blijft daarna in `gate:fast`.
- **rolhek-vooraf-krimp/AC-3** — Zelfladende paden. Een vaste lijst `zelfladend` in `.claude/gates.json`, relatief aan de root van de repository: `.git/**`, `.claude/hooks/**` behalve `.claude/hooks/.cache/**`, `.claude/settings.json`, `lefthook.yml`, `.pnpmfile.cjs`. Een woord wijst naar zo'n pad als het een redirectdoel is (voor elk programma, ook `git` en de leeslijst), een optiewaarde (`--output=…`, `-o …`, `--output-directory`), een ander woord, of een glob die er volgens bash (zonder `dotglob`) op kan passen (`.gi[t]/hooks/x`, `.g?t/…`, `*.yml`); `/tmp/x/.git` telt niet. Uitslag: bij `.git/**` `deny` voor elke rol (R-ROL-03, zoals `rolhek-git-map`); bij de andere paden `deny` voor een subagent en `ask` voor de hoofdsessie. Uitgezonderd: een programma uit de vaste leeslijst (`cat`, `head`, `tail`, `ls`, `stat`, `wc`, `diff`, `grep`, `rg`, `jq`, en `sed` zonder `-i`/`--in-place`) en een git-subcommando dat de werkmap niet schrijft, beide zonder redirect en zonder schrijfoptie naar zo'n pad. Een git-subcommando dat de werkmap schrijft (`checkout`, `switch`, `restore`, `reset`, `stash`, `apply`, `am`, `cherry-pick`, `merge`, `pull`, `rebase`, `revert`, `read-tree`, `checkout-index`), is voor een subagent `deny`, tenzij het alleen expliciete paden buiten `zelfladend` noemt (`git checkout -- src/x.ts` mag) of een branchwissel zonder paden is (`git switch -c x`, `git checkout feat/x`; besluit eigenaar 3 november 2026, zodat AC-6 voor `rolhek-verse-main` klopt); voor de hoofdsessie `ask` als het een zelfladend pad noemt, anders door. Bewijs voor de developer, alle `deny`: `cp x .git/hooks/pre-commit`, `tee .git/config`, `dd of=.git/packed-refs`, `node -e` met `.git/refs/remotes/origin/main`, `cat x > .git/hooks/pre-commit`, `git show HEAD:x > .git/hooks/pre-commit`, `git diff --output=.git/hooks/pre-commit`, `git format-patch -o .git/hooks`, `cp x .gi[t]/hooks/pre-commit`, `node -e` met `.claude/hooks/effect.mjs`, `git checkout <ref> -- .claude/hooks/effect.mjs`, `git restore --source=<ref> lefthook.yml`, `git apply x.patch`, `git stash pop`. Voor de hoofdsessie: `tee .git/config` `deny`; `git checkout <ref> -- .claude/hooks/effect.mjs` `ask`; `git push -u`, `git fetch`, `cat .git/HEAD`, `jq . .claude/settings.json` en `git merge origin/main` met een gewijzigd `.claude/settings.json` op `main` gaan door.
- **rolhek-vooraf-krimp/AC-4** — De hoofdsessie is dader, op de werkmap. Een Bash-commando van de hoofdsessie krijgt `decideFile` met rol `hoofdsessie` voor elk pad waarvan de werkmapinhoud veranderde, behalve paden die een verschoven HEAD verklaart (`git diff --name-only <oud> <nieuw>`) en paden waarvan alleen de index veranderde. `deny` is een PostToolUse-blokkade en komt op de open lijst; `ask` komt op de open lijst; een melding wordt context. Een pad onder `gegenereerd` krijgt `deny`, behalve als het commando exact een generator is uit de nieuwe lijst `generatoren` in `.claude/gates.json` (begin: `pnpm db:generate`). Vallen een venster van de hoofdsessie en een Bash-commando van een subagent samen op een pad, dan krijgt dat pad de strengste beslissing van beide rollen. Bewijs: `sed -i` op `AGENTS.md` buiten onderhoud geeft een open overtreding; `/usr/bin/sed -i … src/api/db/schema.ts` een blokkade; `pnpm db:generate` niets; `node -e` dat `rails/x.mjs` schrijft in onderhoudsmodus een melding; `git commit`, `git add -A`, `git pull`, `git rebase origin/main` en `git checkout -b x origin/main` niets; `git checkout -- <beschermd pad>`, `git restore <beschermd pad>`, `git apply` op een beschermd pad en de reeks `git hash-object -w` → `git update-index --cacheinfo` → `git checkout -- <pad>` wel. Zo houden de corpusrijen van de hoofdsessie met `git checkout --` en `git restore` hun uitkomst (AC-2).
- **rolhek-vooraf-krimp/AC-5** — Verwijdering. `writeTargets` en `fileTargets` verdwijnen uit `rails/hooks/lib/shell.mjs`; in `rails/hooks/lib/rolhek.mjs` verdwijnen `bashTarget`, `treeTarget`, `archiefViaBash`, `subagentFormatting`, `broadFormat`, `formatterCall`, de `pnpm format`-regel in `forbidden` en de `--output`/`format-patch -o`-tak van `gitWriteOptions`. `git grep -O` blijft vooraf `deny`. De toets op effect herkent een verhuizing naar `docs/adr/archief/` met dezelfde naam en dezelfde inhoud (een verwijderd pad plus een nieuw pad met hetzelfde blob) als toegestaan, zoals vooraf; elke andere wijziging in het archief blijft `deny`.
- **rolhek-vooraf-krimp/AC-6** — Wat vooraf blijft, houdt zijn tests ongewijzigd: `rolhek-gh-allowlist`, `rolhek-label`, `rolhek-leerpunt`, `rolhek-git-config`, `rolhek-verse-main`, `rolhek-reviewer-opties`, `rolhek-reviewer-feiten`, en de gevallen die niet naar het corpus gingen uit `rolhek-lezen`, `rolhek-volledig-pad`, `rolhek-railgaten` en `rolhek.test.ts`. Een gewijzigde of verwijderde test buiten AC-1 faalt de PR, tenzij de PR de reden noemt en de eigenaar akkoord geeft (R-TEST-02).
- **rolhek-vooraf-krimp/AC-7** — Meting en schaduw. `pnpm meting` en `pnpm meting --pr-tabel` tellen per sessie en per branch `blokkades op effect` (PostToolUse- en SubagentStop-blokkades van de toets op effect), `overnames` (`pnpm rolhek:overnemen`) en `schaduw` (wat de toets op de hoofdsessie zou beslissen) apart van de weigeringen. Een PR-tabel van vóór deze spec toont daar `onbekend`, nooit 0. In schaduwmodus (vlag `rolhekEffectHoofdsessie: "schaduw"` in `.claude/gates.json`) geeft de toets op de hoofdsessie alleen een melding en een teller, geen open lijst; met `"aan"` geldt AC-4. De schaduwbeslissing wordt per `tool_use_id` naast de beslissing vooraf vastgelegd (alleen uitkomst en paden, geen inhoud, R-ROL-09), zodat PR 3 per geval kan tellen waar ze verschillen.
- **rolhek-vooraf-krimp/AC-8** — Regelboek en roadmap. R-ROL-08 noemt alleen de vaste lijst en de regel voor zelfladende paden; de zin over schrijven op beschermd pad wordt "padbeslissingen over Bash: toets op effect, voor elke rol; zelfladende paden: vooraf (`zelfladend`)". R-ROL-10 noemt de hoofdsessie bij de toets op effect. R-ROL-11 verliest `find … -delete`, `cp -r`, `git checkout -- <map>` en `git restore <map>`, en krijgt de valse positieven van AC-3 (een glob of programma buiten de leeslijst op een zelfladend pad). Spec rolhek-lezen krijgt bij AC-2 en AC-5 een verwijzing naar deze spec. Het roadmap-item "Bekende gaten in het rolhek" houdt alleen wat geen pad schrijft. De krimp van R-ROL-08 staat met een normeninventaris in de PR (ADR 0065 punt 6).
- **rolhek-vooraf-krimp/AC-9** — Volgorde in drie bouw-PR's, elk met `pnpm meting --trend` vóór en na in de PR-beschrijving: (1) AC-1, AC-2 en AC-3; (2) AC-4 en AC-7 in schaduwmodus; (3) na minstens vijf PR's met schaduwcijfers: de vlag op `"aan"`, AC-5, AC-6 en AC-8. PR 3 noemt de schaduwcijfers: hoe vaak de toets achteraf iets anders zou beslissen dan de toets vooraf, per geval.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Corpusrij die achteraf een andere uitkomst geeft dan vooraf | PR 1 faalt; de regel vooraf blijft en komt in de vaste lijst, of de toets op effect wordt eerst gelijkgetrokken | n.v.t. |
| `git mv docs/adr/x.md docs/adr/archief/x.md` (zelfde naam) | geen blokkade, net als vooraf (AC-5) | n.v.t. |
| `cp docs/adr/archief/a.md docs/adr/archief/b.md` | blokkade op `b.md` (archief onwijzigbaar), net als vooraf | n.v.t. |
| `pnpm format` door een subagent over beschermde paden | blokkade per veranderd beschermd pad; een pad dat niet verandert, telt niet | n.v.t. |
| `echo x > .git/hooks/pre-commit` of `cp x .git/hooks/` | vooraf `deny`, voor elke rol (AC-3) | n.v.t. |
| `node -e` schrijft `.claude/hooks/effect.mjs` | vooraf `deny` voor een subagent, `ask` voor de hoofdsessie (AC-3); de toets op effect blijft daardoor werken | n.v.t. |
| `prettier --write *.yml` of `node .claude/hooks/rolhek.mjs` | vooraf `deny` voor een subagent, `ask` voor de hoofdsessie; geaccepteerd vals positief (R-ROL-11), geteld in de schaduwfase | n.v.t. |
| Developer `git pull` of `git rebase` | vooraf `deny` (schrijft de werkmap, AC-3); de hoofdsessie doet de pull, zoals spec rolhek-effect al aanraadt | n.v.t. |
| Stub-lader of `werkstraat session-start` schrijft `.claude/hooks/.cache/` | mag: `.cache/` staat niet in `zelfladend` | n.v.t. |
| `git merge origin/main` die `.claude/settings.json` of een stub bijwerkt | gaat door (noemt het pad niet; inhoud komt van `main`) | n.v.t. |
| Zelfladend pad via een string die het rolhek niet herkent (`node -e` met samengestelde naam) | vooraf niet gezien; de toets op effect ziet `.git/config`, `hooks`, `info` en `.claude/**` achteraf (rolhek-effect AC-1) | n.v.t. |
| `pnpm install` door de hoofdsessie die `pnpm-lock.yaml` verandert | open overtreding (gate); overnemen is het akkoord | n.v.t. |
| Hoofdsessie `git commit`, `pull`, `rebase` | telt niet (HEAD verklaart de paden, AC-4) | n.v.t. |
| Hoofdsessie `git stash pop` op een eerder goedgekeurd beschermd pad | open overtreding opnieuw; geaccepteerd vals positief aan de veilige kant | n.v.t. |
| Hoofdsessie `git merge <feature-branch>` of `cherry-pick` | telt niet (HEAD verschoof); de inhoud zien diff-guard en eigenaarmerge | n.v.t. |
| Hoofdsessie `git pull && sed -i … AGENTS.md` | alleen de werkmapwijziging op `AGENTS.md` telt, niet de HEAD-paden | n.v.t. |
| Hoofdsessie en subagent tegelijk een Bash-commando op hetzelfde pad | strengste beslissing van beide rollen (AC-4) | n.v.t. |
| Werkmap met meer dan 5000 afwijkende paden in de hoofdsessie | valt dicht zoals rolhek-effect AC-7 | n.v.t. |

## Raakt ook

`rails/hooks/lib/rolhek.mjs`, `rails/hooks/lib/shell.mjs`, `rails/hooks/lib/effect-hooks.mjs`, `rails/hooks/lib/effect.mjs`, `rails/hooks/lib/effect-compare.mjs`, `scripts/kit/meting.mjs`, `scripts/kit/rolhek-overnemen.mjs`, `.claude/gates.json` (`zelfladend`, `generatoren`, `rolhekEffectHoofdsessie`), `test/hooks/`, framework R-ROL-08, R-ROL-10 en R-ROL-11, `docs/roadmap.md`, spec rolhek-effect (OV-1 besloten via deze spec), spec rolhek-lezen (AC-2 en AC-5), ADR 0066 punt 3.

## Buiten scope

De gh- en git-toets vooraf kleiner maken (bijvoorbeeld GitHub-schrijfacties alleen via scripts); zelfladende paden in `sandbox.filesystem.denyWrite` (breekt git zelf, ADR 0071 Alternatieven); de vraag of `onFailure: "block"` op de rolhek-entry komt (bevinding P9 van dezelfde review).

## Testplan

PR 1: het corpus en de replay-test, groen op de huidige code; een rij met bewust verkeerde verwachting faalt (R-PRINC-04); de tests van AC-3 falen op de huidige code waar die een vorm doorlaat (`dd of=`, `node -e`, glob, stubs). PR 2: integratietests voor AC-4 met de hooks als proces, die falen op de huidige code (de hoofdsessie wordt nu niet getoetst); unittests voor de tellers en de schaduwvlag van AC-7. PR 3: de tests van AC-6 ongewijzigd groen; het corpus groen zonder de regels vooraf; de archiefverhuizing van AC-5 als integratietest.

## Open vragen

- **OV-1** — Moet een vraag-uitkomst van de hoofdsessie achteraf op de open lijst, of alleen een melding zijn? Aanbeveling: open lijst, want anders verdwijnt de vraag op `altijdVragen` zonder opvolger; in onderhoudsmodus is het meeste al een melding.
- **OV-2** — Terugvaldrempel (ADR 0071 punt 6): gemiddeld meer dan twee blokkades plus overnames per PR over tien PR's. Aanbeveling: zo laten en na tien PR's herijken met de cijfers van AC-7; de schaduwcijfers van PR 2 geven vooraf al een beeld.
- **OV-3** — Welke generatoren komen in `generatoren`? Aanbeveling: begin met `pnpm db:generate`; de router-plugin schrijft `src/web/routeTree.gen.ts` tijdens `vite` en `vitest`. De schaduwcijfers laten zien of die erbij moeten, vóór de vlag op `"aan"` gaat.
