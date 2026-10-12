---
status: goedgekeurd # voorstel | goedgekeurd | gebouwd | vervallen — alleen de eigenaar zet goedgekeurd
namespace: roadmap
---

# Roadmap-vinkjes afdwingen: `check:roadmap`

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

Een blokkerende check in `gate:fast` meldt elk nieuw of gewijzigd `[x]` in `docs/roadmap.md` zonder verwijzing naar bewijs, en elke spec die
naar `gebouwd` gaat zonder bewijs (ook een spec zonder roadmap-item, OV-10); noemt de spec een roadmap-item, dan ook als de roadmap niet meewijzigt. Zo wordt de regel uit `docs/framework.md` §8 ("Docs horen bij de
wijziging") en `docs/dod.md` (Altijd, vierde punt) een check (roadmap stuk 4, item "Roadmap-vinkjes afdwingen").

## Rollen en wie wat ziet

| Rol | Ziet | Mag |
|---|---|---|
| developer / hoofdsessie | de meldingen lokaal (`pnpm check:roadmap`, `pnpm gate:fast`, pre-push via lefthook) en in CI | vinkjes en statussen voorstellen; `docs/roadmap.md` en `docs/specs/` zijn gate-paden, dus alleen met akkoord van de eigenaar |
| reviewer | de uitslag als bewijs bij `docs/dod.md` Altijd | alleen lezen en de check draaien (`pnpm check:*`, `pnpm gate:*`) |
| eigenaar | de meldingen in de PR | vinkt af of heropent |
| CI (`ci.yml`, job `gate:fast`) | draait de check via `pnpm gate:fast` met `fetch-depth: 0` (staat er al voor `check:migrations`) | — |

## Datawijzigingen (met grants)

n.v.t. — geen migratie, tabel of rol; de check leest alleen git en bestanden.

## Routes en foutcodes

n.v.t. — geen route, permissie of foutcode; het is een script in `scripts/kit/`.

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| — | — | — | — |

## Ontwerp van de check

### Plek: nieuw script, geen uitbreiding van een bestaand

`scripts/kit/check-roadmap.mjs`, met package-script `check:roadmap`, als snelle gate in `scripts/kit/gates.mjs` en in `gate:fast` (besluit OV-1).
Afgewogen:

- **Niet in `check-docs.mjs`**: die check kijkt naar de toestand van de repo (via de ratchet, tegen `.kit/baseline.json`), zonder base.
  "Nieuw vinkje" en "naar `gebouwd`" zijn overgangen en vragen een vergelijking met het afsplitspunt. Bovendien staan er 91 bestaande `[x]`-items,
  waarvan een deel zonder verwijzing (bijv. `docs/roadmap.md:82`); een toestandscheck zou die allemaal in de baseline zetten.
- **Niet in `check-docs-drift.mjs`**: die is per ontwerp nooit een blokkade (kop van het script: "Nooit een blokkade (exit 0)") en kijkt alleen
  naar gewijzigde paden, niet naar inhoud. Deze check leest de inhoud op twee revisies en blokkeert (OV-1).
- **Hergebruik** (geen nieuwe dependency):
  - afsplitspunt: hetzelfde patroon als `driftVanRepo` in `scripts/kit/check-docs-drift.mjs` en `check-migrations.mjs`
    (`git merge-base origin/main HEAD`, daarna `git show <afsplitsing>:<pad>`);
  - padherkenning: `looksLikePath` en `pathExists` uit `scripts/kit/check-docs.mjs` (nu niet geëxporteerd; de PR exporteert ze zonder
    gedragswijziging), plus de normalisatie van `target` uit `pathExists` (`scripts/kit/check-docs.mjs:101`–`104`: aliasstap
    `#core/…` → `src/core/…` én de afsluitende `/` weghalen) als eigen export `doelPad`, die `pathExists` zelf ook gebruikt (geen
    gedragswijziging);
  - scripts uit `package.json`: `packageScripts` uit `check-docs.mjs` (zelfde export);
  - specstatus: de regex `SPEC_STATUS` uit `check-docs.mjs` (zelfde export);
  - testpaden: `testpaden` uit `.claude/gates.json` (gelezen naast het script, `import.meta.dirname`, zoals `scripts/kit/diff-guard.mjs`) met
    `globMatch` uit `.claude/hooks/lib/rolhek.mjs`;
  - het gate-register `scripts/kit/gates.mjs` voor de checknamen (zie Bewijs).

De kern is een pure functie (geen git, geen fs) zodat de fixtures haar direct voeden:
`roadmapMeldingen({ basis, head, scripts, testpaden })` → `{ key, message }[]` (zelfde vorm als `Violation` in `check-docs.mjs`), waarbij
`basis` en `head` elk `{ lees(pad): string | null, bestanden: string[] }` zijn en `head` daarnaast `hernoemd: Record<nieuwPad, oudPad>` heeft
(voor specs, zie "Spec naar `gebouwd`"). Een dunne laag `roadmapVanRepo(root, base)` vult die uit git:
`head.bestanden` = `git ls-files` met inhoud van schijf (zoals `check-docs`), `basis` via `git show <afsplitsing>:<pad>` en `git ls-tree`,
`hernoemd` uit `git diff -M --name-status -z <afsplitsing>` (NUL-gesplitst, zoals `check-migrations`, `check-docs-drift` en de diff-guard;
records `R<score>`, oud pad, nieuw pad). `scripts` = `packageScripts(lees('package.json'))` in een
`try/catch` bij de aanroeper: ontbreekt `package.json` of is het geen geldige JSON (`JSON.parse` gooit), dan is `scripts` leeg.

### Een item

- Een item begint met een regel `- [x] ` of `- [ ] ` (ook `[X]`; voorloopspaties toegestaan) in `docs/roadmap.md`.
- Het loopt door over de volgende regels die verder ingesprongen zijn dan het streepje, tot een lege regel, een kop (`#`), een nieuw streepje op
  dezelfde of een lagere inspringing, of een regel die **in kolom 0** met `**` begint (zoals `**Klaar als:**` en `**3a. Backend-kern**`).
  Een ingesprongen `**…**`-regel hoort bij het item: de ST-items hebben vervolgregels als `  **Doel:**`, `  **Klaar als:**` en
  `  **Stand 2026-10-12:**` (`docs/roadmap.md:335`–`348`) en worden dus niet afgekapt.
- De **vergeleken tekst** van een item: alles na het vakje (`[x] `, `[X] ` of `[ ] `) op de beginregel plus de vervolgregels, met elke reeks
  witruimte (ook regelafbrekingen en inspringing) samengevoegd tot één spatie en de randen getrimd. Het streepje, het vakje (en dus `x`
  tegenover `X`) en de inspringing van het item horen er niet bij.
- Een item is **nieuw afgevinkt** als het in `head` `[x]` of `[X]` is en er in `basis` geen afgevinkt item met dezelfde vergeleken tekst is.
  Dat dekt `[ ]` → `[x]`, een nieuw item dat meteen `[x]` is, en een bestaand `[x]`-item waarvan de tekst wijzigt (OV-2).
  Alleen een andere regelafbreking of inspringing is geen wijziging (de witruimte is samengevoegd); elke andere tekstwijziging, ook een
  tikfout herstellen in een oud item zonder bewijs, maakt het item nieuw afgevinkt: dat is de prijs van OV-2.
- Alleen nieuw afgevinkte items worden gecontroleerd; bestaande `[x]`-items die niet wijzigen nooit.
- Het regelnummer van een melding is dat van de beginregel van het item in `head`.

### Bewijs

Een nieuw afgevinkt item heeft bewijs als zijn tekst (buiten `~~…~~`) minstens één van deze bevat:

| Soort | Herkend als | Voorwaarde |
|---|---|---|
| PR-nummer | regex `(?<!\w)#\d+(?![\w-])`: `#`, cijfers, niet direct na een woordteken en niet gevolgd door een woordteken of `-` (`#9`, `(#34)`, `#9: `, `#60);`) | alleen de vorm (OV-7). Een anker van een genummerde kop, zoals `(#4-rails-afronden)`, telt dus niet |
| testpad | een token tussen backticks dat matcht op een glob uit `testpaden` in `.claude/gates.json` (een afsluitende `/` wordt weggehaald en telt als map) | bestaat in `head` volgens "Bestaan" hieronder; een map telt als er minstens één bestand in git onder staat |
| checknaam | een token tussen backticks `pnpm <naam>` of `<naam>` | `<naam>` is een script in `package.json` (`scripts`) én valt in een van deze groepen: staat in het gate-register (`scripts/kit/gates.mjs`), is `gate:fast` of `gate:slow`, of begint met `check:` of `test:` (OV-6). Een naam die alleen het patroon heeft maar geen script is (`check:bestaat-niet`), telt niet |

Een **vervallen** item (tekst na het vakje begint met `~~`) heeft bewijs als het een PR-nummer bevat of `ADR NNNN` waarvoor
`docs/adr/NNNN-*.md` in `head` bestaat (OV-5).

### Bestaan

- Een token **met** `/` wordt eerst genormaliseerd met `doelPad` (aliasstap en afsluitende `/` weg, dus `scripts/kit/templates/` →
  `scripts/kit/templates`). Het bestaat als een bestand in `head.bestanden` precies dat pad is, of ermee begint gevolgd door `/` (een map,
  zoals `scripts/kit/templates/` in `docs/roadmap.md:173`–`174`). Geen achtervoegsel-match: anders maakt `test/rails/fixtures/roadmap/<geval>/head/db/tests/weg.sql` in de echte
  repo het niet-bestaande `db/tests/weg.sql` "bestaand".
- Een token **zonder** `/` (een kale naam als `mise.toml` of `excluded-commands.test.ts`) gebruikt `pathExists` zoals in `check-docs`
  (een bestand in git eindigt erop). Kale namen blijven dus vatbaar voor een match in de fixtures; dat is de bewuste prijs van gelijk gedrag
  met `check-docs`.
- Niet gekozen: `test/rails/fixtures/**` uitsluiten van `head.bestanden`. De roadmap verwijst zelf naar fixturemappen als bewijs
  (`test/rails/fixtures/secdef/` en `test/rails/fixtures/secdef-views/`, `docs/roadmap.md:210` en `:214`); die zouden dan niet bestaan.
- `pathExists` in `check-docs.mjs` verandert niet.

### Genoemde bestanden (OV-9)

Elk token tussen backticks in een nieuw afgevinkt item (buiten `~~…~~`) waarvoor `looksLikePath` waar is, moet in `head` bestaan volgens
"Bestaan". Globs (`*`), `<…>` en URL-paden (`/route`) vallen er al buiten via `looksLikePath`.

### Spec naar `gebouwd`

Voor elk bestand `docs/specs/<naam>.md` (niet `_template.md`) met in `head` status `gebouwd`. De status in `basis` wordt gelezen op het oude
pad als het bestand hernoemd is (`hernoemd`, rename-detectie met `git diff -M`), anders op hetzelfde pad. Is die status ook `gebouwd`, dan
volgt geen melding (hernoemen of bewerken van een gebouwde spec is geen overgang). Anders (andere status, of geen bestand in `basis`):

- **R4 — roadmap mee**: noemt de spec een roadmap-item (tekst `roadmap stuk <n>` of `ST-<nn>`, hoofdletterongevoelig), dan moet
  `docs/roadmap.md` in deze PR wijzigen (de tekst in `basis` en `head` verschilt). Een spec zonder zo'n verwijzing is de bewuste uitzondering.
- **R3 — bewijs** (spec mét roadmap-verwijzing: OV-4; spec zonder roadmap-verwijzing: OV-10): goed als (a) deze PR minstens één nieuw afgevinkt roadmap-item met bewijs bevat, of
  (b) het commentaar achter de status (`status: gebouwd # …`, precedent `docs/specs/design-system.md:2` "gebouwd in PR #51") bewijs bevat
  volgens de tabel hierboven (OV-3). Bij een spec met roadmap-verwijzing gelden R3 en R4 allebei (OV-4).
- **Bewuste grens van R3(a)**: de check koppelt het nieuwe vinkje niet aan de spec. Elk nieuw afgevinkt item met bewijs in dezelfde PR telt,
  ook een item over iets anders. Of het juiste item is afgevinkt, blijft een oordeel van de reviewer (`docs/dod.md`, Altijd).

### Uitvoer en exitcode (besluit OV-1: blokkeren)

- Geen meldingen: exit 0, op stdout `✓ check:roadmap: elk nieuw vinkje en elke gebouwde spec verwijst naar bewijs`.
- Meldingen: exit 1; elke melding op een eigen regel op stderr, lokaal met `✗ check:roadmap: ` ervoor, in CI (`GITHUB_ACTIONS=true`) met
  `::error::` ervoor.
- `origin/main` niet te lezen: exit 1 met de tekst hieronder, met dezelfde voorvoegsels (onleesbaar telt als fout, zoals `check:migrations`).
- Er is geen waarschuwende variant (`⚠`, `::warning::`); die is met OV-1 vervallen.

## Hergebruik en UX

- **Bestaande componenten:** n.v.t. — geen scherm. Hergebruikte code: `looksLikePath`, `pathExists`, `packageScripts`, `SPEC_STATUS` en de
  aliasstap (`doelPad`) uit `scripts/kit/check-docs.mjs`, `globMatch` (`.claude/hooks/lib/rolhek.mjs`), het gate-register
  (`scripts/kit/gates.mjs`), het afsplitspuntpatroon van `scripts/kit/check-docs-drift.mjs` en `scripts/kit/check-migrations.mjs`, en de
  fixture-opzet onder `test/rails/fixtures/` (bestanden als data, buiten Vitest, ESLint en `tsc`).
- **Staten per scherm:** n.v.t. — geen scherm; de uitkomsten van de check zijn: niets te melden, meldingen, base onleesbaar.
- **Alle zichtbare tekst letterlijk** (`<regel>` = regelnummer van de beginregel van het item in `head`; `<…>` wordt ingevuld; de
  backticks in de tweede rij horen bij de tekst):

| Key | Tekst |
|---|---|
| `roadmap:bewijs:<regel>` | `docs/roadmap.md:<regel>: vinkje zonder bewijs; zet er een testpad, checknaam (pnpm …) of PR-nummer (#…) achter` |
| `roadmap:pad:<regel>:<pad>` | `` docs/roadmap.md:<regel>: vinkje noemt `<pad>`, dat niet bestaat `` |
| `spec:bewijs:<bestand>` | `<bestand>: naar gebouwd zonder bewijs; vink het roadmap-item af met bewijs, of zet bewijs achter de status (status: gebouwd # #<PR> of een testpad)` |
| `spec:roadmap:<bestand>` | `<bestand>: naar gebouwd en noemt <verwijzing>, maar docs/roadmap.md wijzigt niet in deze PR` |
| (base onleesbaar) | `origin/main is niet te lezen; roadmap-vinkjes niet gecontroleerd (git fetch origin main of fetch-depth: 0)` |
| (niets te melden) | `✓ check:roadmap: elk nieuw vinkje en elke gebouwde spec verwijst naar bewijs` |

  Voor elke melding en voor de tekst bij een onleesbare base: lokaal `✗ check:roadmap: `, in CI `::error::`.
- **Focusvolgorde en toetsenbord:** n.v.t. — geen scherm.

## Acceptatiecriteria

- **roadmap/AC-1** — Gegeven een item dat in de basis `[ ]` is, wanneer de PR het op `[x]` zet zonder PR-nummer, testpad of checknaam, dan
  meldt de check `roadmap:bewijs:<regel>`.
- **roadmap/AC-2** — Gegeven een item dat de PR op `[x]` zet met `(#123)`, of met een bestaand testpad (`db/tests/rls.sql`, of een map als
  `test/rails/` met een bestand erin), of met `` `pnpm check:migrations` `` of `` `gate:fast` ``, dan meldt de check niets voor dat item.
- **roadmap/AC-3** — Gegeven een nieuw afgevinkt item waarvan het enige "bewijs" een testpad is dat niet bestaat, dan meldt de check zowel
  `roadmap:bewijs:<regel>` als `roadmap:pad:<regel>:<pad>`; ook als een bestand elders in de repo op dat pad eindigt (bijv. onder
  `test/rails/fixtures/`).
- **roadmap/AC-4** — Gegeven een nieuw afgevinkt item met een checknaam die geen script is (`` `pnpm check:bestaat-niet` ``) of een script dat
  geen check is (`` `pnpm dev` ``), dan telt die niet als bewijs: zonder ander bewijs `roadmap:bewijs:<regel>`.
- **roadmap/AC-5** (OV-9) — Gegeven een nieuw afgevinkt item met bewijs dat een bestand noemt dat in `head` niet bestaat
  (`` `src/api/weg.ts` ``), dan meldt de check `roadmap:pad:<regel>:src/api/weg.ts`; een glob (`` `eslint.config.*` ``), een URL-pad
  (`` `/design-system` ``), een bestaande kale naam (`` `mise.toml` ``) en een bestaande map met afsluitende `/`
  (`` `scripts/kit/templates/` ``) geven geen melding.
- **roadmap/AC-6** — Gegeven een `[x]`-item dat in de basis al zo stond (zelfde vergeleken tekst), ook zonder bewijs, dan meldt de check niets;
  ook niet als alleen de regelafbreking of inspringing verandert, of `[x]` in `[X]`.
- **roadmap/AC-7** — Gegeven een `[x]`-item waarvan de PR de tekst wijzigt en daarbij geen bewijs heeft, dan meldt de check
  `roadmap:bewijs:<regel>`.
- **roadmap/AC-8** — Gegeven een nieuw item over meer regels waarvan het bewijs alleen op een vervolgregel staat, dan meldt de check niets;
  staat het bewijs alleen in het volgende item, na een lege regel of na een `**…**`-regel in kolom 0, dan wel.
- **roadmap/AC-9** — Gegeven een nieuw vervallen item `- [x] ~~…~~ — vervallen: …`, dan is `ADR NNNN` met een bestaand ADR-bestand of een
  PR-nummer bewijs; een niet-bestaand ADR-nummer niet; paden tussen `~~` worden niet op bestaan gecontroleerd.
- **roadmap/AC-10** (OV-10: spec zonder roadmap-verwijzing) — Gegeven een spec die van `goedgekeurd` naar `gebouwd` gaat, zonder roadmap-verwijzing,
  zonder nieuw afgevinkt item en zonder bewijs achter de status, dan meldt de check `spec:bewijs:<bestand>`; met
  `status: gebouwd # gebouwd in PR #51` niets.
- **roadmap/AC-11** — Gegeven een spec die naar `gebouwd` gaat en "roadmap stuk 3f" noemt, terwijl `docs/roadmap.md` niet wijzigt, dan meldt de
  check `spec:roadmap:<bestand>` (ook als het statuscommentaar bewijs heeft); wijzigt de roadmap en vinkt hij een item af met bewijs, dan niets.
- **roadmap/AC-12** — Gegeven een spec die al `gebouwd` was in de basis (ook na `git mv` naar een nieuwe naam),
  of een nieuwe spec met status `voorstel`, of `_template.md`, dan meldt de check niets over specs.
- **roadmap/AC-13** (voor een spec zonder roadmap-verwijzing: OV-10) — Gegeven een nieuwe spec (niet in de basis, niet
  hernoemd) die meteen `gebouwd` is, dan geldt hij als overgang naar `gebouwd` (AC-10, AC-11).
- **roadmap/AC-14** — Gegeven een branch die achterloopt op `main` (op `main` is na het afsplitsen een item afgevinkt), dan meldt de check dat
  item niet: hij vergelijkt met het afsplitspunt, niet met de kop van `main`.
- **roadmap/AC-15** — Gegeven het script als commando: zonder meldingen exit 0 en de ✓-tekst op stdout; met een melding exit 1 en
  `✗ check:roadmap: docs/roadmap.md:<regel>: vinkje zonder bewijs; …` op stderr, met `GITHUB_ACTIONS=true` in plaats daarvan
  `::error::docs/roadmap.md:<regel>: …`; bij een onleesbare base exit 1 met `✗ check:roadmap: origin/main is niet te lezen; …`
  (in CI `::error::origin/main is niet te lezen; …`).
- **roadmap/AC-16** — Gegeven de echte `docs/roadmap.md`, dan herkent de parser evenveel items als er regels `- [ ]`/`- [x]` zijn, en elk
  ST-item loopt door tot en met zijn `**Klaar als:**`-regel(s); en `pnpm check:roadmap` is groen op `main` (geen diff met het afsplitspunt).
- **roadmap/AC-17** — Gegeven een nieuw afgevinkt item waarvan het enige "bewijs" een anker van een genummerde kop is (`(#4-rails-afronden)`),
  dan meldt de check `roadmap:bewijs:<regel>`.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| `[x]` → `[ ]` (heropenen) | geen melding van deze check; de diff-guard eist al akkoord van de eigenaar voor `docs/roadmap.md` (gate-pad) | n.v.t. |
| item verwijderd | geen melding | n.v.t. |
| item alleen verplaatst (zelfde tekst, andere regel of sectie) | geen melding (vergelijking op tekst, niet op regel) | n.v.t. |
| item alleen anders afgebroken of ingesprongen | geen melding (witruimte samengevoegd) | n.v.t. |
| twee identieke `[x]`-items in head, één in basis | geen melding (de tekst bestond al als afgevinkt) | n.v.t. |
| `[X]` hoofdletter | telt als afgevinkt; `[x]` ↔ `[X]` is geen wijziging | n.v.t. |
| anker van een kop, `(#agenttaken-uit-de-starter-beoordeling-2026-10-11)` of `(#4-rails-afronden)`; `§10` | geen PR-nummer: na `#` volgt een letter, of na de cijfers een `-`; `§` is geen `#` | n.v.t. |
| PR-nummer dat niet bestaat (`#99999`) | telt als bewijs; alleen de vorm wordt gecontroleerd (OV-7) | n.v.t. |
| testpad met `/` dat alleen als achtervoegsel bestaat (onder `test/rails/fixtures/`) | bestaat niet (zie "Bestaan") | n.v.t. |
| kale bestandsnaam (`excluded-commands.test.ts`) | `pathExists` zoals in `check-docs` | n.v.t. |
| ST-item met ingesprongen `  **Stand …:**`-regels | hoort bij het item; alleen `**` in kolom 0 sluit het af | n.v.t. |
| `docs/roadmap.md` bestaat niet in basis of head (app zonder roadmap) | geen roadmap-meldingen; R3 kan alleen via het statuscommentaar; R4 meldt zodra een spec naar de roadmap verwijst | n.v.t. |
| gebouwde spec hernoemd (`git mv`), status blijft `gebouwd` | geen melding (rename-detectie, `git diff -M`) | n.v.t. |
| spec hernoemd én naar `gebouwd` | overgang; status in `basis` gelezen op het oude pad | n.v.t. |
| spec gekopieerd onder nieuwe naam (geen rename) en `gebouwd` | geldt als nieuwe spec (AC-13) | n.v.t. |
| spec naar `vervallen` | geen melding | n.v.t. |
| werkmap met niet-gecommitte wijzigingen | head = de bestanden die git volgt (`git ls-files`) met de inhoud van schijf, zoals `check-docs`; lokaal telt de werkmap dus mee, in CI is die gelijk aan `HEAD` | n.v.t. |
| `package.json` ontbreekt of is geen geldige JSON | `packageScripts` gooit; de aanroeper vangt dat en gebruikt geen checknamen; PR-nummer en testpad werken nog | n.v.t. |
| lokaal pre-push (lefthook, `gate:fast`) zonder leesbare `origin/main` | faalt met de tekst "origin/main is niet te lezen; …" (zoals `check:migrations`); oplossing `git fetch origin main` | n.v.t. |

## Raakt ook

Gate-paden uit `.claude/gates.json` die de bouw-PR raakt (dus label `gate-wijziging` en goedkeuring van de eigenaar op de head-SHA via de
diff-guard; de hoofdsessie schrijft ze alleen na `ask`):

| Pad | Gate | Wijziging |
|---|---|---|
| `scripts/kit/check-roadmap.mjs` (nieuw) | `scripts/**` | de check |
| `scripts/kit/check-docs.mjs` | `scripts/**` | `looksLikePath`, `pathExists`, `packageScripts`, `SPEC_STATUS` exporteren en de aliasstap als `doelPad`; geen gedragswijziging |
| `scripts/kit/gates.mjs` | `scripts/**` | `check:roadmap` als snelle gate; `feiten.mjs` toont hem dan vanzelf |
| `package.json` → `scripts` | `jsonGates` | `check:roadmap`, en in `gate:fast` (`test/rails/gates.test.ts` eist dat `gate:fast` precies de snelle gates uit het register draait) |
| `test/rails/check-roadmap.test.ts` (nieuw) | `test/**`, `**/*.test.*` | de tests (tester) |
| `test/rails/fixtures/roadmap/**` (nieuw) | `test/**` | de fixtures (tester); toevoegen mag, later wijzigen meldt het rolhek |
| `docs/framework.md` §8 ("Docs horen bij de wijziging") | gate | naast `check:docs-drift` (waarschuwt) noemen dat `check:roadmap` in `gate:fast` blokkeert |
| `docs/framework.md:111` (Feedbacklus, inhoud van `gate:fast`) | gate | `check-roadmap` toevoegen aan de opsomming |
| `docs/dod.md` (Altijd, vierde punt) | gate | verwijzen naar `pnpm check:roadmap` |
| `docs/roadmap.md` stuk 4 | gate | het item afvinken met bewijs (`test/rails/check-roadmap.test.ts`, PR-nummer), in dezelfde PR |

Niet geraakt: `.github/workflows/ci.yml` (de check draait via `pnpm gate:fast`, dat er al staat), `.claude/gates.json` (alle paden vallen al
onder bestaande gates), `.kit/baseline.json` (de check zit niet in de ratchet), CODEOWNERS en `ask` (geen nieuwe gate), `vitest.config.ts`
(sluit `test/rails/fixtures/**` al uit, `vitest.config.ts:19`). `CHANGELOG.md` krijgt een regel.

## Buiten scope

- Controleren of een PR-nummer bestaat of gemerged is (vraagt de GitHub API; `gate:fast` draait zonder netwerk) (OV-7).
- Controleren of het genoemde bewijs groen is: de uitslag staat in de PR (`docs/dod.md`); de check ziet alleen de verwijzing.
- Inhoudelijk oordelen of een item echt af is, of het juiste item is afgevinkt (R3(a)), of of een open item afgevinkt had moeten worden:
  blijft een bevinding van de reviewer (`docs/dod.md`, Altijd).
- Heropenen (`[x]` → `[ ]`) melden: de diff-guard eist al akkoord van de eigenaar voor elke wijziging van `docs/roadmap.md`.
- Bestaande `[x]`-items zonder bewijs achteraf aanvullen.
- Vinkjes in andere bestanden (`docs/dod.md`, `docs/operations/…`).
- Draaien in `guard.yml` (de versie van `main`): niet nodig, want de check zelf staat in `scripts/**`, een gate-pad (OV-8).
- Een waarschuwende variant (`⚠`, `::warning::`): vervallen met OV-1.

## Testplan

Unit (`test/rails/check-roadmap.test.ts`, Vitest-project `unit`, dus in `test:unit` en `gate:fast`).

**Fixtures** in `test/rails/fixtures/roadmap/<geval>/`, per geval een eigen map `basis/` en `head/` (anders dan `fixtures/depcruise/`, dat één
gedeelde mini-repo is): `docs/roadmap.md`, waar nodig `docs/specs/*.md`, `docs/adr/*.md`, `package.json`, `db/tests/*.sql`, `test/rails/x/*`,
en bij een hernoeming `hernoemd.json` (`{ "nieuw": "oud" }`). De test leest beide mappen in als `basis` en `head` voor `roadmapMeldingen` en
geeft vaste `testpaden` (die uit `.claude/gates.json`) mee. Vitest, ESLint en `tsc` slaan `test/rails/fixtures/**` al over
(`vitest.config.ts:19`, `eslint.config.js:213`, `tsconfig.node.json:20`). Toch heet geen fixturebestand `*.test.*` of `*.spec.*`: zo'n naam
matcht op `testpaden` (`**/*.test.*`), dus de diff-guard en het rolhek zouden hem als test behandelen. Testpaden in fixtures zijn daarom
`db/tests/*.sql` of een map. `*.md` staat in `.prettierignore`.

**Bewijsmatrix** (één test per rij; verwachte keys exact met `toStrictEqual`):

| Geval (map) | AC | Verwacht |
|---|---|---|
| `schoon` (basis = head) | AC-6 | `[]` |
| `oud-vinkje-zonder-bewijs` (bestaand `[x]` zonder bewijs, ongewijzigd) | AC-6 | `[]` |
| `alleen-herafgebroken` (zelfde tekst, andere regelafbreking en inspringing, `[x]` → `[X]`) | AC-6 | `[]` |
| `vinkje-zonder-bewijs` | AC-1 | `['roadmap:bewijs:<r>']` |
| `vinkje-met-pr` | AC-2 | `[]` |
| `vinkje-met-testpad` (`db/tests/rls.sql` bestaat) | AC-2 | `[]` |
| `vinkje-met-testmap` (`test/rails/` met een bestand) | AC-2 | `[]` |
| `vinkje-met-checknaam` (`pnpm check:migrations` en kaal `gate:fast`) | AC-2 | `[]` |
| `vinkje-testpad-bestaat-niet` | AC-3 | `['roadmap:bewijs:<r>', 'roadmap:pad:<r>:db/tests/weg.sql']` |
| `testpad-alleen-als-achtervoegsel` (head heeft `elders/db/tests/weg.sql`, item noemt `db/tests/weg.sql`) | AC-3 | `['roadmap:bewijs:<r>', 'roadmap:pad:<r>:db/tests/weg.sql']` |
| `vinkje-onbekend-script` (`pnpm check:bestaat-niet`) | AC-4 | `['roadmap:bewijs:<r>']` |
| `vinkje-geen-check` (`pnpm dev`) | AC-4 | `['roadmap:bewijs:<r>']` |
| `vinkje-pad-bestaat-niet` (`#12` en `src/api/weg.ts`) | AC-5 | `['roadmap:pad:<r>:src/api/weg.ts']` |
| `vinkje-glob-url-kale-naam` | AC-5 | `[]` |
| `vinkje-map-met-slash` (`#12` en `scripts/kit/templates/`, head heeft `scripts/kit/templates/a.ts.tpl`) | AC-5 | `[]` |
| `nieuw-item-afgevinkt` (nieuwe regel, meteen `[x]`, zonder bewijs) | AC-1 | `['roadmap:bewijs:<r>']` |
| `vinkje-tekst-gewijzigd` (bestaand `[x]`, tekst anders, geen bewijs) | AC-7 | `['roadmap:bewijs:<r>']` |
| `bewijs-op-vervolgregel` | AC-8 | `[]` |
| `bewijs-na-lege-regel` | AC-8 | `['roadmap:bewijs:<r>']` |
| `bewijs-na-kop-in-kolom-0` (`**Klaar als:** … (#12)` in kolom 0 na het item) | AC-8 | `['roadmap:bewijs:<r>']` |
| `st-item` (ST-item `[ ]` → `[x]`, bewijs alleen in `  **Stand …:** (#93)` na `  **Klaar als:**`) | AC-8, AC-16 | `[]` |
| `anker-is-geen-pr` (`(#agenttaken-…)` en `§10` als enige "bewijs") | AC-1 | `['roadmap:bewijs:<r>']` |
| `anker-genummerde-kop` (`(#4-rails-afronden)` als enige "bewijs") | AC-17 | `['roadmap:bewijs:<r>']` |
| `vervallen-met-adr` (ADR bestaat; pad tussen `~~` bestaat niet) | AC-9 | `[]` |
| `vervallen-adr-bestaat-niet` | AC-9 | `['roadmap:bewijs:<r>']` |
| `verplaatst` (zelfde `[x]`-tekst, andere sectie) | randgeval | `[]` |
| `heropend` (`[x]` → `[ ]`) | randgeval | `[]` |
| `package-json-ongeldig` (`pnpm check:migrations` als enige bewijs, `package.json` geen JSON) | randgeval | `['roadmap:bewijs:<r>']` |
| `spec-gebouwd-zonder-bewijs` | AC-10 | `['spec:bewijs:docs/specs/a.md']` |
| `spec-gebouwd-bewijs-in-status` | AC-10 | `[]` |
| `spec-gebouwd-met-roadmapvinkje` (roadmap wijzigt, vinkje met bewijs) | AC-11 | `[]` |
| `spec-roadmapverwijzing-roadmap-ongewijzigd` (bewijs in status) | AC-11 | `['spec:roadmap:docs/specs/a.md']` |
| `spec-al-gebouwd` / `spec-nieuw-voorstel` / `template` | AC-12 | `[]` |
| `spec-gebouwd-hernoemd` (`hernoemd.json`: `b.md` ← `a.md`, beide `gebouwd`) | AC-12 | `[]` |
| `spec-nieuw-gebouwd` (geen basis, geen bewijs) | AC-13 | `['spec:bewijs:docs/specs/a.md']` |

**Git-laag** (tijdelijke repo zoals `test/rails/check-migrations.test.ts`, met `origin/main` via `git update-ref refs/remotes/origin/main`):
AC-14 (branch achter `main`); `roadmapVanRepo('.', 'bestaat-niet-ref')` bevat "niet te lezen"; één doorloop van `[ ]` → `[x]` in een commit
op de branch die `roadmap:bewijs` geeft; `git mv` van een gebouwde spec geeft geen melding (rename-detectie echt via git).

**CLI** (AC-15; `node scripts/kit/check-roadmap.mjs` als child process met `cwd` = een tijdelijke repo, exitcode, stdout en stderr):

| Geval | Omgeving | Exit | Uitvoer |
|---|---|---|---|
| geen meldingen | lokaal | 0 | stdout `✓ check:roadmap: elk nieuw vinkje en elke gebouwde spec verwijst naar bewijs` |
| vinkje zonder bewijs | lokaal | 1 | stderr `✗ check:roadmap: docs/roadmap.md:<r>: vinkje zonder bewijs; …` |
| vinkje zonder bewijs | `GITHUB_ACTIONS=true` | 1 | stderr `::error::docs/roadmap.md:<r>: vinkje zonder bewijs; …` |
| geen `origin/main` | lokaal | 1 | stderr `✗ check:roadmap: origin/main is niet te lezen; …` |
| geen `origin/main` | `GITHUB_ACTIONS=true` | 1 | stderr `::error::origin/main is niet te lezen; …` |

**Echte repo** (AC-16, aparte test in hetzelfde bestand, geen git-diff nodig): de parser op de echte `docs/roadmap.md` geeft evenveel items
als er regels zijn die matchen op `^\s*- \[[ xX]\] `, en de tekst van elk item onder `## Agenttaken uit de starter-beoordeling` bevat
`Klaar als:`. Daarnaast draait `pnpm check:roadmap` via `gate:fast` in CI op elke push; op `main` en op de bouw-PR (die het item in stuk 4
afvinkt met `test/rails/check-roadmap.test.ts`) moet die groen zijn, met de uitslag in de PR.

Na de bouw: `pnpm gate:fast` groen; uitslag in de PR.

## Besluiten eigenaar (2026-10-12 en 2026-10-13)

OV-1 t/m OV-8 gegeven in het gesprek met de eigenaar ("volg alle aanbevelingen"), OV-9 en OV-10 op 2026-10-13 ("akkoord"). De status van de spec zet de eigenaar zelf.

- **OV-1 Blokkeren of waarschuwen — besluit: blokkeren**, exit 1, als snelle gate in `gate:fast` en `scripts/kit/gates.mjs`; een
  onleesbare base is een fout (zoals `check:migrations`). Afweging, voor later:
  - *Voor blokkeren*: de vraag is objectief (staat er een verwijzing, bestaat het pad), anders dan bij `check:docs-drift` ("raakt dit
    gedrag?" is een oordeel); de check kijkt alleen naar nieuwe of gewijzigde vinkjes, dus de oude achterstand blokkeert niets; een
    waarschuwing in CI wordt makkelijk gemist, en een vinkje zonder bewijs is volgens `docs/dod.md` al een bevinding.
  - *Tegen blokkeren*: vals alarm kost een extra commit. Bij R4 is dat een wijziging van `docs/roadmap.md`, een gate-pad, dus label
    `gate-wijziging` en goedkeuring van de eigenaar; R4 herkent een roadmap-verwijzing op een tekstpatroon (`roadmap stuk <n>`, `ST-<nn>`),
    dus een spec die de roadmap alleen terloops noemt, moet de roadmap toch laten meewijzigen of de verwijzing herformuleren.
    Lokaal faalt pre-push (lefthook draait `gate:fast`) zonder leesbare `origin/main`, net als nu bij `check:migrations`.
  - *Voor waarschuwen* (niet gekozen): geen vals alarm dat werk tegenhoudt; past bij `check:docs-drift`. *Tegen*: een waarschuwing dwingt
    niets af, en de regel staat dan feitelijk nog steeds alleen in proza.
- **OV-2 Gewijzigd, al afgevinkt item — besluit: telt als nieuw vinkje** (AC-7). Prijs: elke tekstwijziging aan een oud `[x]`-item zonder
  bewijs vraagt nu bewijs; alleen herafbreken en inspringen niet (witruimte samengevoegd).
- **OV-3 Bewijs in een spec — besluit: in het commentaar achter `status: gebouwd # …`** (precedent `docs/specs/design-system.md`). De hele spec
  kan niet: het Testplan noemt altijd `pnpm test:db` en testpaden. Het commentaar in `docs/specs/_template.md` krijgt de aanwijzing
  ("gebouwd: # PR-nummer of testpad") in de bouw-PR.
- **OV-4 Spec met roadmap-verwijzing — besluit: R3 én R4**: noemt de spec een roadmap-item, dan wijzigt de roadmap mee (afvinken, of een regel
  "Deels gebouwd: …"); het bewijs mag in de roadmap of in de spec staan.
- **OV-5 Vervallen items — besluit: bewijs is een bestaand ADR-nummer of een PR-nummer** (AC-9); "besluit eigenaar JJJJ-MM-DD" telt niet.
- **OV-6 Checknamen — besluit**: een script dat in `package.json` bestaat én in het gate-register staat, `gate:fast`/`gate:slow` is, of met
  `check:` of `test:` begint; niet `dev`, `build`, `db:*`, `new:resource`; workflow-jobnamen (CodeQL, osv-scanner, `secrets`) niet.
- **OV-7 PR-nummer — besluit: alleen op vorm.** Bestaan of gemerged zijn vraagt de GitHub API en hoort, als dat ooit komt, in `guard.yml`.
- **OV-8 Plek in CI — besluit: alleen via `gate:fast`, niet in `guard.yml`**: het script staat onder `scripts/**`, dus een PR die het afzwakt,
  vraagt al het label `gate-wijziging` en de goedkeuring van de eigenaar.
- **OV-9 Genoemde bestanden — besluit: erin** (AC-5). Een `[x]`-item dat een bestand tussen backticks noemt dat niet bestaat, wordt gemeld; de uitweg voor een bewust verwijderd of hernoemd bestand is `~~…~~` of het pad zonder backticks. Besluit eigenaar op 2026-10-13, volgens de aanbeveling.
- **OV-10 R3 voor een spec zonder roadmap-verwijzing — besluit: erin** (AC-10, AC-13). Ook zo'n spec heeft bij de overgang naar `gebouwd` een PR-nummer of testpad nodig, in het statuscommentaar of als nieuw vinkje met bewijs. Besluit eigenaar op 2026-10-13, volgens de aanbeveling.
