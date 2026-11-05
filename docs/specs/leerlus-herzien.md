---
status: gebouwd # #545
namespace: leerlus-herzien
---

# Leerlus ook voor schrappen en vereenvoudigen (stap 3)

## Doel

Een les dat code, een check, regel, hook, skill of doc inefficiënt is, sneller kan, omgeschreven of weg moet, wordt een
volwaardig leerpunt met een verplichte, vaste onderbouwing en een meting als sluitbewijs. Besluit:
[ADR 0081](../adr/0081-leerlus-schrappen-en-vereenvoudigen.md); stap 2 is [leerlus-bewijs](leerlus-bewijs.md).

**Toets aan framework §1.** Aanleiding: vraag van de eigenaar van 5 november 2026. Nulmeting op main `19592eb`: 0 van 40
leerpunten stelt schrappen of vereenvoudigen voor; het sjabloon heeft geen keuze daarvoor; `leerpunt-bewijs` kent geen
sluitbewijs zonder test die op de basis faalt, behalve `geen test:` bij drie treden.

Dit is kritiek werk (ADR, `.github/`, skills, agentinstructies; R-WERK-05): deze besluit-PR bevat ADR en spec; de bouw volgt
in een eigen PR zodra deze op main staat.

## Rollen en wie wat ziet

| Rol | Doet | Mag niet |
|---|---|---|
| hoofdsessie | dient een schrap-leerpunt in met onderbouwing; schrijft in een schrap-PR de regel `bewijs meting:` | een schrap-PR zelf mergen |
| reviewer | mag een stuk dat merkbaar tijd, rondes of tokens kost zonder iets te vangen als bevinding melden met `Leerpunt: ja (<soort>)` en plek "Schrappen of vereenvoudigen"; toetst in een schrap-PR of de overname klopt | iets indienen of sluiten (ongewijzigd) |
| workflow `leerpunt-check` | toetst bij deze plek de drie delen van `Onderbouwing` | sluiten, heropenen, de body bewerken (ongewijzigd) |
| CI-job `leerpunt-bewijs` | toetst de vorm van `bewijs meting:`; draait dan geen test | iets schrijven (ongewijzigd) |
| routine "Leerpunten voorsorteren" | eigen bak, clustervraag, de drie langzaamste CI-jobs van de week | iets indienen, labelen of commenten (ongewijzigd) |
| eigenaar | merget elke schrap-PR na toets van meting en overname; telt na tien gesloten schrap-leerpunten de terugkomers | — |

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen HTTP-route.

## Koppeling

n.v.t. — geen externe dienst; de routine leest GitHub Actions via de bestaande GitHub MCP, alleen lezend.

## Kopieer de vorm van

n.v.t. voor `docs/gouden-pad.md` (geen resource); railwerk volgt bestaande vormen:

- `scripts/kit/leerpunt.mjs` — `toetsBody` en `regelFout` krijgen elk één tak; `leesLeerpuntSectie` en het type `Regel`
  krijgen een veld `meting` (dezelfde parser, één vorm erbij)
- `scripts/kit/diff-guard.mjs` — de reden `leerpunt zonder test` voor agent-merge `nee` wordt hergebruikt

## Hergebruik en UX

- Bestaande onderdelen: issue form `leerpunt.yml`, `leerpunt-check`, `leerpunt-bewijs`, `pr-merge.mjs`. Geen nieuwe workflow,
  recht of dependency.
- Nieuwe optie in `Voorstel voor de plek`, letterlijk en als eerste: `Schrappen of vereenvoudigen`. In code een eigen
  constante (`PLEK_SCHRAPPEN`), niet in `LADDER`; de opties van het sjabloon zijn `[PLEK_SCHRAPPEN, ...LADDER]`.
- Nieuw veld na `Voorstel voor de plek`, niet verplicht in het formulier (GitHub kent geen voorwaardelijk verplicht veld),
  label letterlijk `Onderbouwing`, beschrijving letterlijk:
  `Alleen bij Schrappen of vereenvoudigen, dan verplicht. Drie regels - Meting: nu en verwacht, elk een getal of onbekend met reden, en de bron. Overname: welk risico het stuk dekt en wat dat daarna dekt, of waarom het weg is. Terugval: signaal dat het fout was en hoe terug. Geen appcode, appdata of geheimen.`
  In het YAML-bestand tussen dubbele aanhalingstekens, zonder `"` erbinnen (vaste opmaak van `leerpunt-sjabloon.test.ts`).
- Regelvorm in `## Leerpunt`, letterlijk (`<voor>` en `<na>` zijn getallen, eventueel met eenheid; `<bron>` niet leeg):

  ```text
  - #<nr>: trede Schrappen of vereenvoudigen; bewijs meting: <voor> → <na> (<bron>)
  ```

- Nieuwe foutregels in de comment van `leerpunt-onvolledig`: `onderbouwing ontbreekt: Meting`, idem `Overname` en
  `Terugval`.
- Focusvolgorde en toetsenbord: n.v.t. — geen eigen UI.

## Acceptatiecriteria

- **leerlus-herzien/AC-1** — `leerpunt.yml` heeft in `Voorstel voor de plek` als eerste optie `Schrappen of vereenvoudigen`,
  daarna de zes treden ongewijzigd; `LADDER` blijft zes treden, `PLEK_SCHRAPPEN` is een eigen constante. Na `Voorstel voor de
  plek` staat het veld `onderbouwing` (textarea, label `Onderbouwing`, niet verplicht) met de beschrijving uit "Hergebruik en
  UX". De tests van leerlus/AC-1 en AC-2 (`VELDEN`, "precies de zeven velden") gaan naar acht velden; de waarborg blijft: elk
  ander extra veld laat de test falen, en de beschrijving van `onderbouwing` sluit appcode, appdata en geheimen uit.
- **leerlus-herzien/AC-2** — Bij plek `Schrappen of vereenvoudigen` geeft `toetsBody` per ontbrekend of leeg deel een fout
  `onderbouwing ontbreekt: <deel>` voor de delen `Meting`, `Overname` en `Terugval` (in die volgorde). Een deel telt als
  aanwezig als een regel in het veld begint met `<deel>:` (hoofdletters gelijk, eventueel na `- ` of `**`) en daarna niet leeg
  is. De volgordetoets van `toetsBody` geldt ook voor dit veld als het er staat. Bij een andere plek mag het veld ontbreken, leeg zijn of `_No response_` bevatten. Tabeltest: alle drie aanwezig (geen
  fout), elk deel apart weg, veld leeg, andere plek met leeg veld (geen fout).
- **leerlus-herzien/AC-3** — `leesLeerpuntSectie` leest `bewijs meting: <tekst>` als meting. `regelFout` geeft bij
  `trede Schrappen of vereenvoudigen` alleen null als het bewijs een meting is van de vorm `<voor> → <na> (<bron>)` (ook
  `->`), waarbij `<voor>` en `<na>` elk met een cijfer beginnen en `<bron>` niet leeg is; `onbekend`, een testpad of
  `geen test:` bij deze trede is rood, en een meting bij een andere trede ook. De voorbereidende stap van de job haalt naast
  de labels ook de body van elk gesloten leerpunt op; staat in `Voorstel voor de plek` van het issue niet
  `Schrappen of vereenvoudigen`, dan is een regel met deze trede rood (`#<nr>: het issue heeft een andere plek`). De job draait
  bij een meting geen test. Tabeltest per geval.
- **leerlus-herzien/AC-4** — Een regel met `bewijs meting:` geeft agent-merge `nee` met reden `leerpunt zonder test`, in de
  diff-guard en in `pr-merge.mjs` bij het mergen (dezelfde parser, zoals leerlus-bewijs AC-4); `bewijsPlan` zet dan ook
  `zonderTest`.
- **leerlus-herzien/AC-5** — `sluitOordeel` telt een gemergde PR met een regel `bewijs meting:` voor dat nummer als bewijs
  (al waar op de basis; regressietest).
- **leerlus-herzien/AC-6** — De skill `opleveren` stap 8 krijgt het signaal uit ADR 0081 punt 4 als eigen zin na de
  signaalmomenten (stap, check, hook of instructie die merkbaar tijd, rondes of tokens kostte zonder iets te vangen, of code
  die bij gelijk gedrag veel korter of sneller kan); in het CLI-blok noemt `### Voorstel voor de plek` ook
  `Schrappen of vereenvoudigen` en volgt `### Onderbouwing` direct daarna; de regelvorm `bewijs meting:` staat bij de sectie
  `## Leerpunt`. `.github/pull_request_template.md` houdt de bestaande regel en krijgt de regelvorm uit "Hergebruik en UX"
  als extra regel. `.claude/agents/reviewer.md` noemt dat de reviewer zo'n stuk mag melden met plek "Schrappen of vereenvoudigen".
  `AGENTS.md` en `CLAUDE.md` groeien niet.
- **leerlus-herzien/AC-7** — `docs/operations/leerpunten-voorsorteren.md` noemt ADR 0081 in stap 1 en heeft een bak
  "Schrappen of vereenvoudigen" (gesorteerd op de gemeten winst uit `Meting:`; een issue met deze plek komt alleen daar, nooit
  in "Klein"), vraagt per cluster van herhalingen welke oudere regel of check overbodig
  wordt, toont paren van een schrap-leerpunt en een later leerpunt met `eerder:` ernaar bovenaan, en noemt de drie
  langzaamste jobs van de workflows op `main` in de laatste zeven dagen tegen de zeven dagen ervoor (mediane duur per job uit
  GitHub Actions, alleen lezen); bij meer dan 20 procent groei een voorgesteld leerpunt in het verslag. Zijn er tien of meer
  schrap-leerpunten gesloten, dan noemt het verslag dat aantal en het aantal terugkomers (ADR 0081 punt 6). De uitvoer blijft
  hooguit 40 regels.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Plek Schrappen, onderbouwing als vrije tekst zonder de drie labels | `leerpunt-onvolledig` met drie fouten | n.v.t. |
| Plek gewijzigd van Schrappen naar Check na indienen (`edited`) | Onderbouwing niet meer verplicht; label weg als de rest klopt | n.v.t. |
| Schrap-PR haalt een test weg | Mag alleen met eigenaarakkoord (R-TEST-02); de eigenaarmerge uit AC-4 is dat moment, de PR noemt de test en de reden | n.v.t. |
| Schrap-PR die ook een nieuwe test toevoegt | Bewijs blijft `meting:`; de nieuwe test draait in de gewone CI | n.v.t. |
| Meting onbekend vooraf (bijv. tokens in de cloud) | `Meting: onbekend (<reden>) → <verwachting> (<bron>)` is geldig in het issue; het sluitbewijs eist twee getallen en een bron (AC-3) | n.v.t. |
| Gewone fix voor een Check-leerpunt met `trede Schrappen of vereenvoudigen` | Rood: het issue heeft een andere plek (AC-3) | n.v.t. |
| Bestaande issues zonder veld `Onderbouwing` | Geen fout: het veld is niet verplicht en alleen bij de nieuwe plek getoetst | n.v.t. |
| Routine zonder toegang tot Actions-runs | Zegt dat in één zin en slaat de CI-duur over | n.v.t. |

## Raakt ook

- Gewijzigd: `.github/ISSUE_TEMPLATE/leerpunt.yml`, `scripts/kit/leerpunt.mjs`, `.claude/skills/opleveren/SKILL.md`,
  `.claude/agents/reviewer.md`, `.github/pull_request_template.md`, `docs/operations/leerpunten-voorsorteren.md`.
- `scripts/kit/leerpunt-bewijs.mjs` (voorbereiden haalt de issuebody op, AC-3).
- Bestaande tests die velden, ladder of regelvorm letterlijk lezen, veranderen: `VELDEN`, `LADDER` en de tests op "zeven
  velden" in `test/rails/leerpunt-sjabloon.test.ts`, de slotstap (zinstest, wordt structuurtest volgens R-TEST-02) en het CLI-blok in `test/rails/opleveren-skill.test.ts`. De
  merge van deze besluit-PR is het eigenaarakkoord daarvoor (R-TEST-02), met reden in de bouw-PR.
- Spec `leerlus` AC-1 en AC-2 wijzigen door ADR 0081 (acht velden); de tekst volgt na de bouw van ADR 0080 (zie ADR 0081,
  Gevolgen).

## Buiten scope

Tokens en leespad meten in de routine (alleen lokaal beschikbaar). Agents die zelf schrappen met agent-merge. Bestaande
leerpunten omzetten naar de nieuwe plek. De vereenvoudigingsronde op de leerlus-code zelf: die verandert geen gedrag en gaat
als eigen PR.

## Testplan

Fase 1. De tester schrijft vóór de bouw, rood op asserties:

- `test/scripts/leerpunt-check.test.ts` — AC-2 als tabel; AC-5 als regressietest (al groen op de basis).
- `test/scripts/leerpunt-bewijs.test.ts` — AC-3 en AC-4 met PR-beschrijvingen als tabel.
- `test/rails/leerpunt-sjabloon.test.ts` — AC-1.
- `test/rails/opleveren-skill.test.ts` — AC-6 en AC-7 op structuur (R-TEST-02): de plek `Schrappen of vereenvoudigen`, de
  koppen `### Voorstel voor de plek` en direct daarna `### Onderbouwing` in het CLI-blok, de regelvorm `bewijs meting:`, de bak
  in de prompt en de verwijzing naar ADR 0081; letterlijk alleen wat een machine leest (koppen, labels, regelvorm). Een
  bestaande zinstest die de bouw raakt (de slotstap), wordt omgezet naar zo'n structuurtest, met reden in de bouw-PR.

Handmatig na de merge: één proefleerpunt met plek "Schrappen of vereenvoudigen" zonder `Terugval:` indienen en zien dat het
label en de fout komen; daarna aanvullen en zien dat het label weggaat.

## Open vragen

- **OV-1 ✅ besloten** — Een seintje bij inefficiënt, sneller, omschrijven of weg, met heel sterke onderbouwing, plus een
  vereenvoudigingsronde op de leerlus-code (eigenaar, 5 november 2026).
- **OV-2 ✅ besloten** — Eigen spec of uitbreiding van `leerlus-bewijs`? Eigen spec nu, omdat een gebouwde spec in een
  besluit-PR nog niet kan uitbreiden (ADR 0080 punt 4 is nog niet gebouwd); na die bouw opgaan in `leerlus-bewijs`.
- **OV-3 ✅ besloten** — Grens voor het CI-signaal: meer dan 20 procent groei van de mediane jobduur, week op week; lager
  geeft ruis door wisselende runners.
- **OV-4 ✅ besloten** — In het issue mag `onbekend` met reden; het sluitbewijs eist twee getallen en een bron. De job
  toetst dat de plek van het issue past bij de trede (spec-review, 5 november 2026).
