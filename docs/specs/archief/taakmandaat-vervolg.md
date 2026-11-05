---
status: vervallen
namespace: mandate-follow-up
---

# Taakmandaat: vervolg op de review van PR #130

## Doel

Een taak onder een taakmandaat kan haar eigen roadmap-vinkje en `gebouwd`-status in één stap en één PR afronden, met één
bewijsvorm die `check:roadmap` en `check-document-status` gelijk lezen, en de runner-hostbestanden lopen niet ongemerkt uiteen.

Achtergrond: [spec taakmandaat](taakmandaat-frameworkwerk.md), [ADR 0046](../adr/0046-werkstraat-en-beslisroute.md),
[spec roadmap-vinkjes](roadmap-vinkjes.md). Eigenaarbesluiten (2026-10-13, na de review van PR #130):

- **B1** — Binnen een taakmandaat mag `docs/roadmap.md` meewijzigen, maar alleen het vinkje van het item van de taak.
- **B2** — Eén bewijsvorm voor gebouwd: `check-document-status` en `check:roadmap`/`docs/dod.md:10` accepteren hetzelfde; `docs/dod.md` gaat mee.
- **B3** — `HOST_FILES` staat dubbel (`.claude/hooks/lib/runner-authority.mjs:4-6`, `scripts/runner.sh:12-13`): één bron of een check die ze gelijk houdt.

De uitwerking is met de eigenaarbesluiten OV-1 t/m OV-10 vastgelegd (onderaan); er staan geen vragen meer open. De
spec blijft `voorstel` tot de eigenaar hem zelf op `goedgekeurd` zet.

### Huidige stand (origin/main `f290a76`)

1. `verifyScopedFile` (`scripts/kit/check-document-status.mjs:63-77`) laat bij een actief mandaat een gate-pad dat geen
   spec/ADR met gelijke digest is alleen door via `canWriteProtected`. `docs/roadmap.md` is een gate-pad (`.claude/gates.json`)
   en staat niet in de `paths` van het besluit, dus elk vinkje faalt met `docs/roadmap.md: buiten het broncodemandaat; bewaking blijft beschermd`.
   `check:roadmap` eist intussen dat een spec die "roadmap stuk N" of "ST-n" noemt bij `gebouwd` de roadmap laat meewijzigen.
2. Ook `statusOnlyDiff` (`scripts/kit/status-git.mjs:15-33`) weigert na de gevalideerde SHA elke wijziging die geen spec/ADR
   met gelijke digest is. Een vinkje in de administratiecommit (na de groene broncommit) maakt `gebouwd` dus ongeldig, met
   of zonder mandaat (`verifyBuilt`, `check-document-status.mjs:19-31`).
3. `builtReference` (`.claude/hooks/lib/document-state.mjs:78-83`) accepteert alleen
   `status: gebouwd # #<PR>; gevalideerd: <40 hex>`. `statusBewijs` (`scripts/kit/check-roadmap.mjs:143-151`) accepteert
   een PR-nummer, testpad of checknaam ergens in het commentaar, en `specMeldingen` (`:158-182`) laat een nieuw afgevinkt
   roadmap-item met bewijs gelden in plaats van bewijs achter de status. `check:roadmap` kan dus groen zijn terwijl
   `check-document-status` dezelfde spec weigert.
4. `pnpm docs:status` (`scripts/kit/document-status.mjs`, `changeStatus` in `document-state.mjs:63-75`) schrijft alleen de
   statusregel; het vinkje moet nu met de hand.
5. De twee `HOST_FILES`-lijsten zijn nu inhoudelijk gelijk, maar niets houdt ze gelijk. In `runner.sh` staat
   `compose.*.yaml` ongequote in een bash-array: bash expandeert het naar de bestanden die nu bestaan, zodat een op de branch
   verwijderd `compose.<x>.yaml` uit de vergelijking valt. De hook geeft het als git-pathspec door. De hook
   (`trustedRunner`, `runner-authority.mjs:25-37`) weigert ook genegeerde bestanden en onveilige paden
   (`safeRepositoryPath`, `authority-context.mjs:30-44`); `runner.sh` (`check_host_files`, `:25-44`) niet.

## Rollen en wie wat ziet

- Eigenaar: keurt deze spec goed; reviewt en merget de PR. Het vinkje blijft een eigenaarakkoord via de PR-review
  (`docs/dod.md:7`). De export van `HOST_FILES` raakt `.claude/hooks/`: die wijziging vraagt een handeling van de eigenaar
  (zelf aanbrengen of een taakmandaat met dat exacte pad), want developer en sandbox schrijven daar niet.
- Hoofdsessie: zet status en vinkje samen met `pnpm docs:status <spec> gebouwd --pr <nummer> --roadmap` (OV-3).
- Developer: geen nieuw recht. Het lokale rolhek voor `docs/roadmap.md` blijft zoals het is (gate-pad).
- CI (`guard.yml`, versie uit main): `check-document-status` past B1 toe; `gate:fast` draait `check:roadmap`;
  `gate:slow` draait `scripts/runner.sh` met de aangescherpte hostcontrole.

## Datawijzigingen (met grants)

n.v.t. — geen database. Het register `.claude/decisions.json` krijgt geen nieuw veld; de koppeling tussen taak en
roadmap-item loopt via de tekst van het item (OV-2).

## Routes en foutcodes

n.v.t. — geen HTTP-route, permissie of applicatiefoutcode. Wel nieuwe en gewijzigde CLI-meldingen (letterlijk, onder "Hergebruik en UX").

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| n.v.t. | n.v.t. | n.v.t. | n.v.t. |

## Hergebruik en UX

- Bestaande componenten: n.v.t. — geen scherm. Hergebruikte code: `builtReference`, `changeStatus` en `documentInfo`
  (`.claude/hooks/lib/document-state.mjs`), `heeftBewijs` en `leesItems` (`scripts/kit/check-roadmap.mjs`), `parseNameStatus`
  (`scripts/kit/diff-guard.mjs`), `statusOnlyDiff` (`scripts/kit/status-git.mjs`). Eén gedeelde pure functie voor de
  B1-controle, `taakVinkje({ basis, head, specs, kader })`, gebruikt door `check-document-status`, `statusOnlyDiff` en
  `docs:status`. Geen nieuwe dependency.
- Staten per scherm: n.v.t. — CLI: exit 0 met een succesregel, of exit 1 met één melding (volgorde hieronder).
- Alle zichtbare tekst letterlijk: zie de meldingentabel en de nieuwe teksten voor `docs/dod.md:10`, `docs/framework.md` §8,
  `docs/specs/_template.md:2`, `scripts/kit/gates.mjs:43` en `docs/operations/agent-doorloop.md:80`.
- Focusvolgorde en toetsenbord: n.v.t. — geen scherm.

### B1 — Het vinkje van de taak (OV-2)

**Item van spec S**: het roadmap-item waarvan de tekst (eerste regel plus vervolgregels, zoals `leesItems` het leest) het
pad van S tussen backticks noemt, bijvoorbeeld `` `docs/specs/taakmandaat-vervolg.md` ``. Het pad moet al in de basis in
het item staan; het pad in dezelfde PR toevoegen is een tekstwijziging en valt niet onder de uitzondering.

**Wanneer**: `taakVinkje` wordt alleen aangeroepen als `docs/roadmap.md` tussen `basis` en `head` in de diff staat
(gewijzigd, hernoemd of verwijderd). Staat het bestand niet in de diff, dan is er niets te controleren. Een spec zonder
roadmap-item die naar `gebouwd` gaat, heeft alleen statusbewijs nodig.

**Geraakte spec**: een spec S uit `specs` waarvan een item wijzigt, dus een item dat tussen `basis` en `head` verschilt en
in `basis` het pad van S tussen backticks noemt.

**`taakVinkje({ basis, head, specs, kader })`** slaagt alleen als alles hieronder geldt (regels vergeleken na
normalisatie van `\r\n`):

1. Voor elke geraakte spec staat in `basis` precies één open item (`[ ]`) dat het pad van S noemt, en geen afgevinkt
   item dat het noemt. Anders: "geen eenduidig open item". Specs uit `specs` zonder gewijzigd item hoeven geen item te
   hebben. Deze eis geldt overal in deze spec: in CI, in `statusOnlyDiff` en in `docs:status` (daar is de ene spec uit de
   opdracht per definitie geraakt).
2. Elk item dat tussen `basis` en `head` wijzigt, is het item van een geraakte spec. In `head` is het `[x]`; de tekst in
   `basis` is een prefix van de tekst in `head` (alleen aanvullen aan het einde, op dezelfde regel of op nieuwe
   vervolgregels). Een aanvulling bevat geen regel die zelf een item is (`- [ ]`, `- [x]` of `- [X]`, op elke inspringing).
3. Elke andere regel van het bestand is gelijk aan `basis`; er komen geen regels bij of af buiten die items.
   Hernoemen of verwijderen van `docs/roadmap.md` slaagt nooit.
4. Elk afgevinkt item heeft bewijs volgens `heeftBewijs` (zelfde functie als `check:roadmap`, zie B2), met `kader`.

**Waar `basis`, `head`, `specs` en `kader` vandaan komen:**

| Aanroep | `basis` | `head` | `specs` | `kader` (scripts / bestanden / testpaden) |
|---|---|---|---|---|
| `check-document-status` → `verifyScopedFile` (alleen bij een actief mandaat) | merge-base (`split`) | `HEAD_SHA` | elke spec met een actief mandaat op deze repository en branch die in `split..HEAD_SHA` naar `gebouwd` gaat (OV-9) | `package.json` uit `HEAD_SHA` (`git show`) / `git ls-tree -r --name-only HEAD_SHA` / `testpaden` uit `.claude/gates.json` van `BASE_SHA` |
| `statusOnlyDiff(from, to)` (via `verifyBuilt`, ook zonder mandaat) | `from` (gevalideerde SHA) | `to` | elke spec die in `from` niet `gebouwd` is en in `to` wel, ongeacht mandaat | `package.json` uit `to` / `git ls-tree -r --name-only to` / `testpaden` uit `.claude/gates.json` van de vertrouwde basis die de aanroeper meegeeft (CI: `BASE_SHA`; `docs:status`: `origin/main`) |
| `docs:status … --roadmap` | `HEAD` (werkmap gelijk aan HEAD) | de nieuwe tekst | de ene spec uit de opdracht | uit `HEAD` / `git ls-tree -r --name-only HEAD` / `.claude/gates.json` van `origin/main` |

`register` (de checknamen voor `heeftBewijs`, nu `gates.map((gate) => gate.script)` in `roadmapMeldingen`) komt in elke
aanroep uit `scripts/kit/gates.mjs` van de draaiende code; in CI is dat de versie uit main.

`statusOnlyDiff` krijgt daarvoor een derde parameter: `statusOnlyDiff(root, commits, { testpaden })`. Beide SHA's in
`commits` blijven 40 tekens (zoals nu). Aanroepen die mee wijzigen: `check-document-status.mjs:28` en
`document-status.mjs:35` (daar is `from === to`, dus `docs/roadmap.md` staat niet in de diff en `taakVinkje` wordt niet
aangeroepen).

`statusOnlyDiff` accepteert het vinkje van een spec die in `from..to` naar `gebouwd` gaat ook zonder mandaat (AC-7): het
leest het register niet. Dat versoepelt ADR 0027 punt 4 en task-mandate/AC-9 ("uitsluitend statusregels"); besloten in OV-10.

Twee mandaten op één branch mogen elk hun eigen item afvinken, in dezelfde PR, als beide specs in die PR naar `gebouwd`
gaan. Onder een mandaat wijzigt het vinkje alleen mee als de spec in dezelfde PR naar `gebouwd` gaat (OV-9): blijft de
spec op `goedgekeurd`, dan is ze geen geraakte spec, hoort het gewijzigde item bij niemand en volgt "buiten het
taakmandaat". Het vinkje mag wel in een eerdere commit van die PR staan dan de statusregel; `verifyScopedFile` kijkt naar
de hele PR-diff (`split..HEAD_SHA`). In `statusOnlyDiff` geldt hetzelfde vanzelf: `specs` zijn daar alleen specs die in
`from..to` naar `gebouwd` gaan. "Naar `gebouwd`" betekent: in de basis (oud pad bij rename) niet `gebouwd`, in `head` wel
(`documentInfo`).

**Volgorde van meldingen** (de eerste die geldt, wordt gemeld; `check-document-status` stopt bij de eerste fout):
(1) hernoemd of verwijderd → "buiten het taakmandaat"; (2) geen eenduidig open item; (3) een andere regel of een ander
item gewijzigd, of een item-regel in de aanvulling → "buiten het taakmandaat"; (4) vinkje zonder bewijs.

### B1 — Vinkje en status in één stap (OV-3)

`pnpm docs:status <spec> gebouwd --pr <nummer> --roadmap` doet wat `pnpm docs:status <spec> gebouwd --pr <nummer>` nu
doet, plus het vinkje:

1. `--roadmap` mag alleen met een spec, status `gebouwd` en `--pr`. Anders: gebruiksfout, niets geschreven.
2. `docs/roadmap.md` moet een veilig pad zijn (`authority.safe`) en in de werkmap gelijk aan HEAD (de bestaande
   `unchanged`-controle dekt de hele werkmap).
3. Het item wordt gezocht met `taakVinkje`-regel 1 op `HEAD`.
4. Nieuwe roadmaptekst: `[ ]` wordt `[x]` en achter de laatste regel van het item komt ` (#<nummer>)` (besloten in OV-7). Daarna moet
   `taakVinkje` slagen met de bronnen uit de tabel; de helper schrijft nooit iets wat CI zou weigeren.
5. Alle bewijscontroles van `gebouwd` blijven ongewijzigd (PR, checks op HEAD, `canRecordBuilt`). Pas als alles slaagt en
   de werkmap tijdens de controle niet veranderde, schrijft de helper de spec en `docs/roadmap.md`; faalt één stap, dan
   wijzigt geen van beide bestanden.

### B2 — Eén bewijsvorm (OV-1)

- **Spec naar `gebouwd`**: alleen de vorm die `pnpm docs:status` schrijft: `status: gebouwd # #<PR>; gevalideerd: <40 hex>`.
  Of een spec "naar `gebouwd` gaat", bepaalt `check:roadmap` zoals nu: met `SPEC_STATUS` (eerste `status:`-regel) in
  `basis` (oud pad bij rename) en `head`; was de basis al `gebouwd`, dan volgt nooit een melding, ook als `documentInfo`
  die spec afwijst (AC-13). Alleen bij een overgang leest hij het bewijs met `documentInfo` (precies één statusregel,
  geldige frontmatter) en `builtReference` op die ene regel. Geeft `documentInfo` `null` (twee statusregels, ongeldige
  frontmatter), dan telt dat als geen bewijs: `spec:bewijs`. Zijn eigen `statusBewijs` en de `roadmapBewijs`-route in
  `specMeldingen` vervallen.
  `check:roadmap` controleert alleen de vorm (offline); `check-document-status` controleert daarnaast PR, SHA en checks
  live (ongewijzigd, task-mandate/AC-9).
- **Roadmap-vinkje**: ongewijzigd: een testpad, een checknaam (`` `pnpm …` ``) of een PR-nummer (`#…`), gelezen door
  `heeftBewijs`, dat `check-roadmap.mjs` exporteert.

### B3 — Hostbestanden (OV-4, OV-5)

- Twee lijsten blijven; `runner-authority.mjs` exporteert `HOST_FILES`. Een unit-test leest de `HOST_FILES=( … )`-array
  letterlijk uit `scripts/runner.sh` (tot de sluitende `)`, `#`-commentaar genegeerd, enkele en dubbele quotes rond een
  entry gestript, zonder bash-expansie) en vergelijkt beide als verzameling.
- `runner.sh` quote `'compose.*.yaml'`, zodat git het als pathspec leest, net als de hook.
- `check_host_files` krijgt twee nieuwe controles, die vóór de bestaande `git status`-controle (`runner.sh:27-32`) draaien,
  dus lokaal én met `CI=true`:
  - (a) **Genegeerd**: `git ls-files --others --ignored --exclude-standard -- "${HOST_FILES[@]}"` is niet leeg → stop.
  - (b) **Onveilig pad**, voor elk pad uit `git ls-files -z -- "${HOST_FILES[@]}"`: stop als het pad niet voldoet aan
    `^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$`, een deel `.` of `..` heeft, of als het pad zelf of een map erin een symlink is
    (`[[ -L <voorvoegsel> ]]`, van links naar rechts). Bestaat een voorvoegsel niet (`! -e` en `! -L`), dan stopt de
    controle voor dat pad zonder fout. Stop ook als `pwd -P` afwijkt van `$PWD` (repository via een symlink).
  - Verschil met `safeRepositoryPath` dat blijft: bash onderscheidt een niet-leesbaar voorvoegsel (bijvoorbeeld `EACCES`)
    niet van een ontbrekend; de hook weigert dat, `runner.sh` laat het door. Bash leest de werkmap, de hook ook.
- `--sta-wijzigingen-toe` slaat ook deze controles over, zoals nu.
- **Risico**: controle (a) draait ook met `CI=true`. Maakt een CI-stap vóór `runner.sh` een genegeerd bestand onder een
  hostpad (bijvoorbeeld een `*.log` in `scripts/`, of een cache onder `db/docker`), dan wordt `gate:slow` rood zonder dat de
  PR iets fout doet. Niet nagegaan of dat nu gebeurt; de eerste CI-run van de implementatie-PR toont het. Een
  CI-uitzondering hoort er niet in zonder besluit van de eigenaar.

### Letterlijke meldingen

| Waar | Situatie | Tekst |
|---|---|---|
| `check:roadmap` | `spec:bewijs:<bestand>` (vervangt de huidige tekst) | `<bestand>: naar gebouwd zonder bouwbewijs; zet de status met pnpm docs:status (status: gebouwd # #<PR>; gevalideerd: <sha>)` |
| `check-document-status` | B1 regel 2, 3 of hernoemd/verwijderd | `docs/roadmap.md: buiten het taakmandaat; alleen het vinkje van het item van een spec met mandaat mag wijzigen` |
| `check-document-status`, `docs:status` | B1 regel 1 | `docs/roadmap.md: geen eenduidig open item dat <spec-pad> noemt; vraag de eigenaar` |
| `check-document-status` | B1 regel 4 | `docs/roadmap.md:<regel>: vinkje zonder bewijs; zet er een testpad, checknaam (pnpm …) of PR-nummer (#…) achter` |
| `docs:status` | gebruik | `Gebruik: pnpm docs:status <document> <status> [--pr <nummer> [--roadmap]]` |
| `docs:status` | `--roadmap` zonder spec, `gebouwd` of `--pr` | `--roadmap kan alleen met een spec, status gebouwd en --pr` |
| `docs:status` | gelukt met `--roadmap` | `<spec>: gebouwd; bewijs gecontroleerd, alleen de statusregel en het vinkje van het item gewijzigd` |
| `runner.sh` | (a) genegeerd | `✗ Genegeerde bestanden in hostpaden; de host zou ze ongezien gebruiken:` + lijst + `  → verwijder ze of gebruik de wegwerp-CI (ADR 0027).` |
| `runner.sh` | (b) onveilig pad | `✗ Hostpad is een symlink of geen veilig pad: <pad>` + `  → gebruik de wegwerp-CI (ADR 0027); geen agentoverride.` |

### Nieuwe documentatieteksten

`docs/dod.md:10` (vervangt de huidige regel):

> - [ ] Is het bewijs voor een roadmap-item beschikbaar (checkuitslag of test, eventueel met PR-nummer), dan vinkt dezelfde PR dat item af, met een verwijzing achter het vinkje (testpad, checknaam of PR-nummer; de uitslag staat in de PR) en met akkoord van de eigenaar. Een spec naar `gebouwd` heeft één vorm, die `pnpm docs:status` schrijft: `status: gebouwd # #<PR>; gevalideerd: <sha>`; een afgevinkt roadmap-item vervangt die niet. Binnen een taakmandaat wijzigt in `docs/roadmap.md` alleen het vinkje van het item dat de spec van het mandaat tussen backticks noemt (precies één open item per spec); `pnpm docs:status <spec> gebouwd --pr <nummer> --roadmap` zet status en vinkje samen (ADR 0046). Een item dat deze PR afrondt maar open blijft, is een bevinding van de reviewer, net als een vinkje zonder bewijs. `pnpm check:roadmap` (in `gate:fast`) en `check-document-status` (CI) lezen beide vormen met dezelfde code; of het juiste item is afgevinkt blijft een oordeel van de reviewer.

`docs/framework.md` §8, na "roadmap-vinkjes met eigenaarakkoord." (`docs/framework.md:297`); in `framework.md` zelf is
`dod.md` de juiste relatieve link:

> Binnen een taakmandaat mag `docs/roadmap.md` alleen het vinkje van het item van de taak meewijzigen; de precieze regel staat in `docs/dod.md`.

`docs/specs/_template.md:2`, het commentaar na `gebouwd:` wordt: `gebouwd: # #<PR>; gevalideerd: <sha> (pnpm docs:status)`.
`scripts/kit/templates/spec.md.tmpl:2` noemt de gebouwd-vorm niet en blijft ongewijzigd (gecontroleerd).

`scripts/kit/gates.mjs:43` (beschrijving van `check:roadmap`, ook in `node scripts/kit/feiten.mjs`):
`een nieuw of gewijzigd [x] in docs/roadmap.md verwijst naar bewijs (testpad, checknaam of PR-nummer) en een spec die naar gebouwd gaat heeft status: gebouwd # #<PR>; gevalideerd: <sha>, t.o.v. origin/main (framework §8)`.

`docs/operations/agent-doorloop.md:77-80`: voorbeeld wordt `pnpm docs:status docs/specs/voorbeeld.md gebouwd --pr 123 --roadmap`
en de zin "Schrijft alleen de statusregel met PR en gevalideerde bron-SHA." wordt "Schrijft alleen de statusregel met PR en
gevalideerde bron-SHA, en met `--roadmap` het vinkje van het item dat de spec noemt."

Besloten in OV-10; de implementatie-PR wijzigt deze documenten (ze hebben een goedkeuringsstatus; deze spec-PR raakt ze niet):

- `docs/adr/0027-taakmandaat-voor-frameworkwerk.md:31`: "Daarna mogen uitsluitend statusregels veranderen;" wordt
  "Daarna mogen uitsluitend statusregels en het vinkje van het roadmap-item van de eigen spec veranderen (spec taakmandaat-vervolg);".
- `docs/specs/taakmandaat-frameworkwerk.md:37`: "`pnpm docs:status` wijzigt alleen de statusregel;" wordt
  "`pnpm docs:status` wijzigt alleen de statusregel, met `--roadmap` ook het vinkje van de eigen taak;".
- `docs/specs/taakmandaat-frameworkwerk.md:59-61` (task-mandate/AC-9): "uitsluitend latere statuswijzigingen" wordt
  "uitsluitend latere statuswijzigingen en het vinkje van het roadmap-item van de eigen spec".
- `docs/operations/agent-doorloop.md:81`: "als de latere diff uitsluitend statusregels wijzigt" wordt "als de latere diff
  uitsluitend statusregels en het vinkje van de eigen taak wijzigt".

`docs/specs/roadmap-vinkjes.md`, direct onder de titel: de notitie uit OV-8.

## Acceptatiecriteria

- **mandate-follow-up/AC-1** — Gegeven een actief mandaat voor spec S en een PR die S van `goedgekeurd` naar `gebouwd`
  zet en in `docs/roadmap.md` (t.o.v. de merge-base) alleen het enige open item dat `` `S` `` noemt afvinkt met een
  PR-nummer erachter, dan slaagt `verifyScopedFile` voor dat bestand. In AC-2 t/m AC-5, AC-19, AC-21 en AC-22 gaat elke
  genoemde spec met mandaat in de PR naar `gebouwd`, tenzij anders vermeld.
- **mandate-follow-up/AC-2** — Gegeven hetzelfde mandaat, dan faalt `check-document-status` met de melding "buiten het
  taakmandaat" als de PR daarnaast één andere regel van `docs/roadmap.md` wijzigt, een item van een spec zonder actief
  mandaat afvinkt, een regel toevoegt of verwijdert buiten het item, tekst van het item wijzigt in plaats van aanvult,
  in de aanvulling een regel `- [ ] …` of `- [x] …` (ook ingesprongen) toevoegt, een ander item
  heropent, of het bestand hernoemt of verwijdert.
- **mandate-follow-up/AC-3** — Gegeven een actief mandaat voor S en in de merge-base meer dan één open item dat `` `S` ``
  noemt, of daarnaast een afgevinkt item dat het noemt, dan faalt een wijziging van een van die items met "geen eenduidig
  open item". Noemt in de merge-base geen item `` `S` `` (ook als de PR het pad zelf aan een item toevoegt), dan is een
  gewijzigd item van niemand en faalt de wijziging met "buiten het taakmandaat".
- **mandate-follow-up/AC-4** — Gegeven het afgevinkte item van de taak zonder bewijs volgens `heeftBewijs`, dan faalt
  `check-document-status` met "vinkje zonder bewijs", en `check:roadmap` meldt `roadmap:bewijs:<regel>`. Bij meerdere
  overtredingen meldt `check-document-status` alleen de eerste volgens de vastgelegde volgorde.
- **mandate-follow-up/AC-5** — Gegeven actieve mandaten voor S1 en S2 op dezelfde branch en een PR die het item van S1 en
  het item van S2 afvinkt (elk met bewijs), dan slaagt `check-document-status`; vinkt de PR daarnaast een derde item af,
  dan faalt hij.
- **mandate-follow-up/AC-6** — Gegeven een gevalideerde commit `from` en een commit `to` die alleen de statusregel van S van
  `goedgekeurd` naar `gebouwd` zet en het enige open item van S afvinkt, dan geeft `statusOnlyDiff(from, to)` `true`; met
  daarnaast één andere gewijzigde regel in `docs/roadmap.md`, het vinkje van een item van een spec die in `from..to` niet
  naar `gebouwd` gaat, of één ander gewijzigd bestand: `false`.
- **mandate-follow-up/AC-7** — `statusOnlyDiff` hangt niet af van het register: in een repository zonder enig besluit
  geeft AC-6 dezelfde uitkomsten. Zonder actief mandaat doet `verifyScope` niets met `docs/roadmap.md` (zoals nu).
- **mandate-follow-up/AC-8** — Gegeven een schone werkmap, een open item dat `` `S` `` noemt en geldig bouwbewijs, dan
  zet `pnpm docs:status S gebouwd --pr <n> --roadmap` de statusregel op `status: gebouwd # #<n>; gevalideerd: <HEAD>` en
  het item op `[x]` met ` (#<n>)` erachter; `git diff` toont alleen die twee wijzigingen, en stdout is letterlijk
  `S: gebouwd; bewijs gecontroleerd, alleen de statusregel en het vinkje van het item gewijzigd`. Na commit accepteren
  `statusOnlyDiff(root, { from: <volledige SHA van HEAD~1>, to: <volledige SHA van HEAD> }, { testpaden })`,
  `check-document-status` en `check:roadmap` het resultaat, met en zonder actief mandaat voor S.
- **mandate-follow-up/AC-9** — `pnpm docs:status … --roadmap` faalt met exit 1 en wijzigt geen enkel bestand als: geen of
  meerdere open items S noemen; het item al `[x]` is; `--roadmap` gebruikt wordt met een ADR, een andere status of zonder
  `--pr`; `docs/roadmap.md` afwijkt van HEAD of een symlink is; of het bouwbewijs ontbreekt (bestaande controles).
- **mandate-follow-up/AC-10** — Gegeven een spec die naar `gebouwd` gaat met `status: gebouwd # #130; gevalideerd: <40 hex>`,
  dan meldt `check:roadmap` niets over die spec; met `status: gebouwd # #130`, `status: gebouwd # test/rails/x.test.ts`,
  `` status: gebouwd # `pnpm test:unit` ``, `status: gebouwd # gebouwd in PR #51` of `status: gebouwd` meldt hij
  `spec:bewijs:<bestand>` met de nieuwe tekst.
- **mandate-follow-up/AC-11** — Gegeven een spec die naar `gebouwd` gaat zonder geldig statusbewijs maar met een nieuw
  afgevinkt roadmap-item met bewijs, dan meldt `check:roadmap` `spec:bewijs:<bestand>`.
- **mandate-follow-up/AC-12** — `check-roadmap.mjs` heeft geen eigen parser voor het statuscommentaar: hij gebruikt
  `documentInfo` en `builtReference`. Een spec met een geldige gebouwd-regel in de frontmatter én een tweede regel die met
  `status:` begint, meldt `spec:bewijs`; voor elke statusregel uit AC-10 geven `check-document-status`-vorm
  (`builtReference` op de enige statusregel) en "geen `spec:bewijs`-melding" dezelfde uitkomst.
- **mandate-follow-up/AC-13** — Een spec die in de basis al `gebouwd` was (ook in een oude vorm, zoals
  `docs/specs/roadmap-vinkjes.md` en `docs/specs/design-system.md`), geeft geen melding; alleen de overgang wordt
  gecontroleerd (roadmap/AC-12 blijft gelden).
- **mandate-follow-up/AC-14** — De teksten onder "Nieuwe documentatieteksten" staan letterlijk in `docs/dod.md:10`,
  `docs/framework.md` §8, `docs/specs/_template.md:2`, `scripts/kit/gates.mjs:43` en `docs/operations/agent-doorloop.md`;
  `pnpm ratchet` (check-docs) en `pnpm format:check` blijven groen.
- **mandate-follow-up/AC-15** — Een unit-test faalt zodra `HOST_FILES` in `scripts/runner.sh` (quotes gestript) en de
  export uit `.claude/hooks/lib/runner-authority.mjs` als verzameling verschillen (bewezen met een fixture waarin één entry
  ontbreekt), en slaagt op de nieuwe stand.
- **mandate-follow-up/AC-16** — Gegeven een basis (origin/main) met `compose.a.yaml` en `compose.b.yaml` als getrackte
  bestanden en een branch die `compose.a.yaml` verwijdert in een commit, dan stopt `scripts/runner.sh db` lokaal vóór de
  eerste `docker`-aanroep met "wijken af van origin/main (merge-base)" en een regel `D	compose.a.yaml`. Deze test faalt op
  de huidige `runner.sh` (bash expandeert naar `compose.b.yaml`).
- **mandate-follow-up/AC-17** — `scripts/runner.sh db` stopt vóór de eerste `docker`-aanroep met de letterlijke melding als
  (a) een genegeerd bestand onder een hostpad staat (bijv. `scripts/x.log`), (b) een in de basis gecommit hostbestand een
  symlink is (bijv. `scripts/link.sh` → `elders.sh`), of (c) een in de basis gecommitte map in het pad van een hostbestand
  een symlink is; telkens zonder verschil met HEAD of de merge-base, lokaal en met `CI=true`. Met `--sta-wijzigingen-toe`
  gaat hij door.
- **mandate-follow-up/AC-18** — De bestaande tests in `test/scripts/runner-guard.test.ts` en
  `test/hooks/runner-authority.test.ts` blijven groen.
- **mandate-follow-up/AC-19** — Gegeven actieve mandaten voor S1 (met een open item) en S2 (zonder item) en een PR die
  alleen het item van S1 afvinkt, dan slaagt `check-document-status` (`verifyScopedFile`); er volgt geen melding over S2.
- **mandate-follow-up/AC-20** — Gegeven `from` waarin S1 (met een open item) en S2 (zonder item) `goedgekeurd` zijn, en `to`
  waarin beide `gebouwd` zijn en alleen het item van S1 is afgevinkt, dan geeft `statusOnlyDiff` `true`. Zet `to` alleen de
  statusregel van S2 op `gebouwd` en staat `docs/roadmap.md` niet in de diff, dan ook `true` en wordt `taakVinkje` niet aangeroepen.
- **mandate-follow-up/AC-21** — Gegeven een item dat het pad van S1 en van S2 noemt, beide met actief mandaat en elk
  zonder ander item, dan slaagt het afvinken van dat item; noemt een tweede open item ook `` `S2` ``, dan faalt het met
  "geen eenduidig open item" voor S2.
- **mandate-follow-up/AC-22** — Gegeven het item van S met het bewijs `(#130)` op een nieuwe, ingesprongen vervolgregel
  (geen itemregel), dan slagen `taakVinkje`, `check-document-status` en `check:roadmap`.
- **mandate-follow-up/AC-23** — `pnpm docs:status a b c` (onjuist aantal argumenten) en
  `pnpm docs:status docs/specs/x.md gebouwd --roadmap --pr 1` (verkeerde volgorde) eindigen met exit 1 en stderr letterlijk
  `Gebruik: pnpm docs:status <document> <status> [--pr <nummer> [--roadmap]]`; `--roadmap` met een ADR of status
  `goedgekeurd` geeft letterlijk `--roadmap kan alleen met een spec, status gebouwd en --pr`.
- **mandate-follow-up/AC-24** — `scripts/runner.sh db` stopt vóór de eerste `docker`-aanroep met de melding "Hostpad is een
  symlink of geen veilig pad" als een in de basis gecommit hostbestand een naam buiten `[A-Za-z0-9_.-]` heeft (bijv.
  `scripts/a b.sh`), en als de repository via een symlink wordt aangeroepen (`pwd -P` ≠ `$PWD`); lokaal en met `CI=true`.
- **mandate-follow-up/AC-25** (OV-9) — Gegeven een actief mandaat voor S en een PR die het enige open item dat `` `S` ``
  noemt afvinkt (met bewijs) terwijl S `goedgekeurd` blijft, dan faalt `check-document-status` met "buiten het
  taakmandaat". Zet een latere commit in dezelfde PR S op `gebouwd`, dan slaagt `verifyScopedFile` (vinkje in een eerdere
  commit dan de status). Gegeven mandaten voor S1 en S2 waarvan alleen S1 naar `gebouwd` gaat, en een PR die beide items
  afvinkt, dan faalt hij.
- **mandate-follow-up/AC-26** (OV-8, OV-10) — In de implementatie-PR staan de notitie uit OV-8 letterlijk onder de titel
  van `docs/specs/roadmap-vinkjes.md` en de vier teksten uit OV-10 letterlijk in ADR 0027, `taakmandaat-frameworkwerk.md`
  en `agent-doorloop.md`; `pnpm ratchet` blijft groen.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Item noemt de spec alleen zonder backticks of via een markdownlink | Geen match; uitzondering geldt niet (AC-3) | n.v.t. |
| Pad van de spec staat pas in deze PR in het item | Item hoort in de basis bij geen spec; "buiten het taakmandaat" (AC-3) | n.v.t. |
| Item was in de basis al `[x]` en wijzigt | Geen eenduidig open item; wijziging faalt (AC-3, AC-9) | n.v.t. |
| Spec met mandaat zonder roadmap-item gaat naar `gebouwd` | Alleen statusbewijs; geen itemeis (AC-19, AC-20) | n.v.t. |
| Eén item noemt de paden van twee specs met mandaat | Het is het item van beide; voor elk geldt precies één open item | n.v.t. |
| Bewijs op een nieuwe vervolgregel van het item | Toegestaan als aanvulling, mits geen itemregel (B1 regel 2) | n.v.t. |
| CRLF in `docs/roadmap.md` | Vergelijking per regel na normalisatie van `\r\n`, zoals `documentInfo` | n.v.t. |
| Vinkje vóór de gevalideerde SHA gezet (met de hand) | Toegestaan als de spec in dezelfde PR naar `gebouwd` gaat; B1 via `verifyScopedFile` (AC-25) | n.v.t. |
| Vinkje onder een mandaat, spec blijft `goedgekeurd` | "buiten het taakmandaat" (OV-9, AC-25) | n.v.t. |
| `--roadmap` zonder actief mandaat | Zelfde itemregels; `statusOnlyDiff` accepteert het (AC-7, AC-8) | n.v.t. |
| Spec in oude vorm al `gebouwd` op main | Geen melding, geen omzetting van oude statusregels (AC-13) | n.v.t. |
| Spec naar `gebouwd` zonder roadmap-item | Alleen statusbewijs nodig; `--roadmap` faalt (AC-9) | n.v.t. |
| Genegeerd bestand onder een hostpad in CI | `runner.sh` stopt ook in CI (AC-17); geen uitzondering | n.v.t. |

## Raakt ook

| Bestand | Gate-pad | Wijziging |
|---|---|---|
| `scripts/kit/check-document-status.mjs` | ja | B1 in `verifyScopedFile` via `taakVinkje`, kader uit `HEAD_SHA`/`BASE_SHA` |
| `scripts/kit/status-git.mjs` | ja | `statusOnlyDiff(root, commits, { testpaden })` roept `taakVinkje` aan voor de specs die in `from..to` naar `gebouwd` gaan, alleen als `docs/roadmap.md` in de diff staat; aanroepen in `check-document-status.mjs:28` en `document-status.mjs:35` mee |
| `scripts/kit/document-status.mjs` | ja | optie `--roadmap`, nieuwe gebruikstekst en succesregel |
| `scripts/kit/check-roadmap.mjs` | ja | `documentInfo` + `builtReference`, `statusBewijs` en `roadmapBewijs`-route weg, nieuwe meldingstekst, `heeftBewijs` en `leesItems` exporteren, kopcommentaar `:1-4` bijwerken |
| nieuw: module met `taakVinkje` (bijv. `scripts/kit/roadmap-item.mjs`) | ja | gedeelde B1-controle |
| `.claude/hooks/lib/runner-authority.mjs` | ja | `HOST_FILES` exporteren — handeling van de eigenaar nodig (rolhek en sandbox) |
| `scripts/runner.sh` | ja | `'compose.*.yaml'` quoten; controles (a) en (b) vóór regel 27 |
| `scripts/kit/gates.mjs` | ja | beschrijving `:43` |
| `docs/dod.md` | ja | regel 10 |
| `docs/framework.md` | ja | één zin in §8 (regel 297) |
| `docs/specs/_template.md` | ja | regel 2, commentaar |
| `docs/operations/agent-doorloop.md` | nee | `:77-80` en `:81` (OV-10) |
| `docs/adr/0027-taakmandaat-voor-frameworkwerk.md` | ja | `:31` (punt 4), besloten in OV-10; in de implementatie-PR |
| `docs/specs/taakmandaat-frameworkwerk.md` | ja | `:37` en `:59-61` (task-mandate/AC-9), besloten in OV-10; in de implementatie-PR |
| `docs/specs/roadmap-vinkjes.md` | ja | notitie onder de titel (OV-8); in de implementatie-PR |
| `test/rails/check-roadmap.test.ts` + fixtures | ja | zie hieronder |

Bestaande tests die wijzigen, met reden (B2 verandert het geteste gedrag; noemen in de PR):

| Test (`test/rails/check-roadmap.test.ts`) | Nu | Straks | Reden |
|---|---|---|---|
| tabel `spec-gebouwd-bewijs-in-status` (`:175`) | geen melding | `spec:bewijs` | vrij commentaar ("gebouwd in PR #51") is geen geldige vorm meer |
| tabel `spec-gebouwd-met-vinkje-zonder-verwijzing` (`:176`) | geen melding | `spec:bewijs` | een roadmap-vinkje vervangt het statusbewijs niet meer |
| tabel `spec-gebouwd-met-roadmapvinkje` (`:177`) | geen melding | `spec:bewijs` | idem |
| tabel `spec-roadmapverwijzing-roadmap-ongewijzigd` en `spec-st-verwijzing-roadmap-ongewijzigd` (`:178-183`) | alleen `spec:roadmap` | fixture-statusregel wordt `# #51; gevalideerd: <40 hex>`, verwachting blijft alleen `spec:roadmap` | de test bewijst AC-11 van roadmap-vinkjes; de oude statusvorm is ongeldig |
| `spec naar gebouwd zonder bewijs` (`:219-228`) | oude meldingstekst | nieuwe meldingstekst | letterlijke tekst wijzigt |

## Buiten scope

- `checks: read` in `.github/workflows/guard.yml` (de eigenaar wacht af of het nodig is).
- De spec- en ADR-statussen van PR #130 (de eigenaar bevestigt die zelf).
- Het lokale rolhek voor `docs/roadmap.md` (blijft gate-pad).
- Bestaande gebouwde specs omzetten naar de nieuwe vorm.
- Eén gedeeld bestand voor `HOST_FILES` (OV-4 kiest twee lijsten plus test).
- `docs/specs/roadmap-vinkjes.md` verder bewerken dan de notitie uit OV-8.
- Een vinkje onder een mandaat zonder dat de spec in dezelfde PR naar `gebouwd` gaat (OV-9).
- ADR 0029 (snellere beslisroute, `voorgesteld`): deze spec bouwt er niet op.

## Testplan

- Nieuwe AC's: AC-19 en AC-21 in de Git-repo-tests van `check-document-status`, AC-20 bij `statusOnlyDiff`, AC-22 bij
  `taakVinkje` en beide checks, AC-23 bij `docs:status`, AC-24 bij `runner.sh` met de docker-stub, AC-25 in de
  Git-repo-tests van `check-document-status` (vinkje zonder overgang, vinkje in een eerdere commit dan de status, twee
  mandaten waarvan één overgaat). AC-14 en AC-26 zijn een documentcontrole van de reviewer plus `pnpm ratchet`.
- Unit (`test/rails/`, in `pnpm test:unit`): `taakVinkje` als pure functie per geval van AC-1 t/m AC-6; fixtures voor
  `check:roadmap` per regel van AC-10 t/m AC-12, en voor AC-13 (basis al `gebouwd` in een oude vorm, zoals
  `status: gebouwd # gebouwd in PR #51`, head ongewijzigd of hernoemd: geen melding); de gewijzigde tests uit "Raakt ook"; de gelijkheidstest van AC-15 met een
  negatieve fixture.
- Echte tijdelijke Git-repositories (zoals `test/hooks/authority-git.test.ts`): `check-document-status` met een register
  op main voor AC-1 t/m AC-5 en AC-7; `statusOnlyDiff` met en zonder register voor AC-6 en AC-7; `docs:status --roadmap`
  voor AC-8 en AC-9, met GitHub-gegevens als pure invoer zoals in `test/hooks/pr-evidence.test.ts` (geen live netwerk).
- `scripts/runner.sh` in tijdelijke repo's met de docker-stub uit `test/scripts/runner-guard.test.ts` voor AC-16 (eerst
  rood op de huidige code) en AC-17; regressie AC-18.
- Daarna `pnpm gate:fast`, de verplichte GitHub-checks op de head-SHA en eigenaarreview (diff-guard, label `gate-wijziging`).

## Eigenaarbesluiten

Doorgegeven via de hoofdsessie op 2026-10-13; de eigenaar bevestigt ze door deze spec op `goedgekeurd` te zetten.

- **OV-1 (B2)** — Een spec naar `gebouwd` alleen met `status: gebouwd # #<PR>; gevalideerd: <sha>`; een roadmap-vinkje met testpad, checknaam of PR-nummer.
- **OV-2 (B1)** — Het item noemt het spec-pad tussen backticks; precies één open item per spec. Twee mandaten op één branch mogen elk hun eigen item afvinken.
- **OV-3 (B1)** — Een optie in `pnpm docs:status … gebouwd` (`--roadmap`) zet vinkje en status in één stap, met dezelfde smalle controles.
- **OV-4 (B3)** — Twee `HOST_FILES`-lijsten plus een gelijkheidstest; `'compose.*.yaml'` gequote in `runner.sh`.
- **OV-5 (B3)** — `runner.sh` wordt in deze spec gelijkgetrokken met de hook: genegeerde en onveilige hostbestanden weigeren.
- **OV-6** — `docs/framework.md` §8 noemt de uitzondering in één zin, met verwijzing naar `docs/dod.md`.

- **OV-7 (B1)** — `--roadmap` zet ` (#<nummer>)` achter de laatste regel van het item.
- **OV-8 (B2)** — roadmap/AC-10 en de route "vink het roadmap-item af" uit "Spec naar `gebouwd`" in
  `docs/specs/roadmap-vinkjes.md` vervallen deels. De implementatie-PR zet deze notitie direct onder de titel van die spec:
  > Deels vervallen door [taakmandaat-vervolg](taakmandaat-vervolg.md) (B2): roadmap/AC-10 voor zover vrij commentaar
  > achter `status: gebouwd` als bewijs telt, en de route "vink het roadmap-item af" als vervanging van statusbewijs. De
  > enige vorm is nu `status: gebouwd # #<PR>; gevalideerd: <sha>`.
- **OV-9 (B1)** — Nee: onder een mandaat mag het vinkje van de taak alleen meewijzigen als de spec in dezelfde PR naar
  `gebouwd` gaat.
- **OV-10 (B1)** — Ja: ADR 0027 punt 4 (`:31`), `docs/specs/taakmandaat-frameworkwerk.md:37` en `:59-61` (task-mandate/AC-9)
  en `docs/operations/agent-doorloop.md:81` worden versoepeld tot "statusregels én het vinkje van de eigen taak", met de
  teksten onder "Nieuwe documentatieteksten", in de implementatie-PR (niet in deze spec-PR).

## Open vragen voor de eigenaar

Geen.
