---
status: voorstel
namespace: rolhek-vooraf-krimp
---

# Rolhek vooraf: alleen de vaste lijst, paden op effect

## Doel

Het rolhek toetst vooraf alleen nog wat de toets op effect niet ziet; elke padbeslissing over een Bash-commando, ook van de hoofdsessie, valt onder de toets op effect, zonder dat een bestaande uitkomst verloren gaat ([ADR 0071](../adr/0071-rolhek-vooraf-vaste-lijst.md)). Aanleiding: bevinding P3 van de review van 3 november 2026.

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

- **rolhek-vooraf-krimp/AC-1** — Corpus eerst. Elk bestaand testgeval in `test/hooks/` dat een Bash-commando op een pad laat weigeren, vragen, melden of doorlaten (onder meer `rolhek-schrijfgaten`, `rolhek-indirect-writes`, `rolhek-archief-bash`, `rolhek-git-map`, `rolhek-migratie`, `rolhek-voorreview`, `rolhek-onderhoud`, `rolhek.test.ts`), staat als rij in één corpus `test/hooks/rolhek-padcorpus.ts`: commando, rol, beginstand van de repository, verwachte uitkomst. Deze stap verplaatst alleen; het aantal gevallen en elke uitkomst blijven gelijk, en de PR noemt per bronbestand het aantal rijen voor en na.
- **rolhek-vooraf-krimp/AC-2** — Uitkomstbehoud. Elke corpusrij draait als echt commando in een tijdelijke git-repository door de hooks als proces (PreToolUse, het commando, PostToolUse, voor subagents ook SubagentStop). Een rij met vooraf `deny` geeft achteraf een blokkade op hetzelfde pad. Een rij met `ask` geeft voor een subagent een blokkade en voor de hoofdsessie een open overtreding. Een rij met een melding geeft dezelfde melding als context. Een rij die vooraf doorging, geeft geen blokkade. Een rij die vooraf een aanroep zonder pad weigerde (een brede `prettier --write` of `eslint --fix` van een subagent), krijgt in de beginstand een beschermd bestand dat de aanroep verandert, en geeft achteraf een blokkade op dat pad. Dit corpus is groen vóór de verwijdering van AC-4, en blijft daarna in `gate:fast`.
- **rolhek-vooraf-krimp/AC-3** — De hoofdsessie is dader. Een Bash-commando van de hoofdsessie krijgt per veranderd pad `decideFile` met rol `hoofdsessie`. `deny` en `ask` komen op de open lijst (spec rolhek-effect AC-5); een melding wordt context. Een pad onder `gegenereerd` dat via Bash verandert, krijgt geen `deny`. Wat in hetzelfde venster door een subagent veranderde (zijn Edit, Write of Bash), telt niet voor de hoofdsessie (rolhek-effect AC-2). Bewijs: `sed -i` op `AGENTS.md` buiten onderhoud geeft een open overtreding; `pnpm db:generate` op `db/schema.snapshot.sql` niet; `node -e` dat `rails/x.mjs` schrijft in onderhoudsmodus geeft een melding.
- **rolhek-vooraf-krimp/AC-4** — Verwijdering. `writeTargets` en `fileTargets` verdwijnen uit `rails/hooks/lib/shell.mjs`; in `rails/hooks/lib/rolhek.mjs` verdwijnen `bashTarget`, `treeTarget`, `archiefViaBash`, `subagentFormatting`, `broadFormat`, `formatterCall` en de `--output`/`format-patch -o`-tak van `gitWriteOptions`. Een redirect naar een pad in `.git` blijft vooraf `deny` voor elke rol, via de redirects die `parseCommands` al geeft. `git grep -O` blijft vooraf `deny`.
- **rolhek-vooraf-krimp/AC-5** — Wat vooraf blijft (de vaste lijst van ADR 0071 punt 1), houdt al zijn tests ongewijzigd: `rolhek-gh-allowlist`, `rolhek-label`, `rolhek-leerpunt`, `rolhek-git-config`, `rolhek-verse-main`, `rolhek-lezen`, `rolhek-reviewer-opties`, `rolhek-reviewer-feiten`, `rolhek-volledig-pad`, `rolhek-railgaten` en de niet-padgevallen uit `rolhek.test.ts`. Een gewijzigde of verwijderde test buiten het corpus faalt de PR, tenzij de PR de reden noemt en de eigenaar akkoord geeft (R-TEST-02).
- **rolhek-vooraf-krimp/AC-6** — Meting. `pnpm meting` en `pnpm meting --pr-tabel` tellen per sessie en per branch `blokkades op effect` (PostToolUse- en SubagentStop-blokkades van de toets op effect) en `overnames` (`pnpm rolhek:overnemen`) apart van de weigeringen. Een PR-tabel van vóór deze spec toont daar `onbekend`, nooit 0.
- **rolhek-vooraf-krimp/AC-7** — Regelboek en roadmap. R-ROL-08 noemt alleen de vaste lijst; de zin over schrijven op beschermd pad wordt "padbeslissingen over Bash: toets op effect, voor elke rol". R-ROL-10 noemt de hoofdsessie bij de toets op effect. R-ROL-11 verliest `find … -delete`, `cp -r`, `git checkout -- <map>` en `git restore <map>`. Het roadmap-item "Bekende gaten in het rolhek" houdt alleen wat geen pad schrijft. De krimp van R-ROL-08 staat met een normeninventaris in de PR (ADR 0065 punt 6).
- **rolhek-vooraf-krimp/AC-8** — Volgorde in drie bouw-PR's, elk met `pnpm meting --trend` vóór en na in de PR-beschrijving: (1) AC-1 en AC-2, (2) AC-3 en AC-6, (3) AC-4, AC-5 en AC-7. PR 3 opent pas als PR 1 en 2 gemerged zijn en het corpus op `main` groen is.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Corpusrij die achteraf een andere uitkomst geeft dan vooraf | PR 1 faalt; de regel vooraf blijft en komt in de vaste lijst, of de toets op effect wordt eerst gelijkgetrokken | n.v.t. |
| `git mv docs/adr/x.md docs/adr/archief/x.md` (zelfde naam) | geen blokkade, net als vooraf | n.v.t. |
| `cp docs/adr/archief/a.md docs/adr/archief/b.md` | blokkade op `b.md` (archief onwijzigbaar), net als vooraf | n.v.t. |
| `pnpm format` door een subagent over beschermde paden | blokkade per veranderd beschermd pad; een pad dat niet verandert, telt niet (vooraf: weigering op de brede aanroep) | n.v.t. |
| `echo x > .git/hooks/pre-commit` | vooraf `deny`, voor elke rol | n.v.t. |
| `pnpm install` door de hoofdsessie die `pnpm-lock.yaml` verandert | open overtreding (gate); overnemen is het akkoord | n.v.t. |
| Hoofdsessie `git commit` | geen padwijziging in de werkmap; de verschoven HEAD verklaart haar eigen venster | n.v.t. |
| Hoofdsessie en subagent tegelijk een Bash-commando | kan aan de verkeerde worden toegeschreven; geaccepteerd vals positief, aan de veilige kant (R-ROL-11) | n.v.t. |
| Werkmap met meer dan 5000 afwijkende paden in de hoofdsessie | valt dicht zoals rolhek-effect AC-7 | n.v.t. |

## Raakt ook

`rails/hooks/lib/rolhek.mjs`, `rails/hooks/lib/shell.mjs`, `rails/hooks/lib/effect-hooks.mjs`, `rails/hooks/lib/effect.mjs`, `scripts/kit/meting.mjs`, `test/hooks/`, framework R-ROL-08, R-ROL-10 en R-ROL-11, `docs/roadmap.md`, spec rolhek-effect (OV-1 besloten via deze spec).

## Buiten scope

De gh- en git-toets vooraf kleiner maken (bijvoorbeeld GitHub-schrijfacties alleen via scripts); `.git/hooks` in `sandbox.filesystem.denyWrite`; de vraag of `onFailure: "block"` op de rolhek-entry komt (bevinding P9).

## Testplan

PR 1: het corpus en de replay-test, beide groen op de huidige code; de replay faalt als een uitkomst van de toets op effect afwijkt (R-PRINC-04: een rij met bewust verkeerde verwachting faalt). PR 2: integratietests voor AC-3 met de hooks als proces, die falen op de huidige code (de hoofdsessie wordt nu niet getoetst); unittests voor de tellers van AC-6. PR 3: de bestaande vaste-lijsttests blijven ongewijzigd groen; het corpus blijft groen zonder de regels vooraf.

## Open vragen

- **OV-1** — Moet een vraag-uitkomst van de hoofdsessie achteraf op de open lijst, of alleen een melding zijn? Aanbeveling: open lijst, want anders verdwijnt de vraag op `altijdVragen` zonder opvolger; in onderhoudsmodus is het meeste al een melding.
- **OV-2** — Terugvalregel (ADR 0071 punt 5): verdubbeling van blokkades plus overnames per PR over tien PR's. Aanbeveling: zo laten; na tien PR's opnieuw kijken met de cijfers van AC-6.
