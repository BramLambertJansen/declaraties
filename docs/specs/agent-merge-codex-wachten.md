---
status: gebouwd # #483
namespace: agent-merge-codex-wachten
---

# Agent-merge wacht op een lopende Codex-review

## Doel

`pnpm pr:merge` wacht op elk zichtbaar teken dat Codex bezig is: een 👀 van Codex of een Codex-samenvatting die nog bezig is,
telt als spoor, zodat de agent-merge wacht tot Codex de head afrondt of de eigenaar merget. Of Codex tijdens een ronde zo'n
teken zet, is nog niet gezien (zie "Wat Codex laat zien terwijl het bezig is"); zet het er geen, dan verandert dit besluit in
de praktijk niets en blijft het venster van ADR 0069 Gevolgen even groot. De nameting in het Testplan maakt dat zichtbaar
([ADR 0069](../adr/0069-agent-merge-niet-kritiek.md) punt 3, herzien 2026-11-03). Aanleiding: besluit van de eigenaar op
3 november 2026 (keuzekaart over OV-1 van [agent-merge-zonder-codex](agent-merge-zonder-codex.md), optie (a) "Ja, wachten op
Codex"). Deze spec vervangt alleen de delen van die gebouwde spec die AC-6 hieronder noemt; de rest blijft gelden.

## Rollen en wie wat ziet

n.v.t. — geen app-gebruikers. Zoals in [agent-merge-niet-kritiek](agent-merge-niet-kritiek.md): alleen de hoofdsessie mag
`pnpm pr:merge`; de eigenaar merget alles wat het script weigert.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes. `pnpm pr:merge` stopt met exit 1 en één regel per niet-vervulde voorwaarde, zoals nu; er komt één
reden bij (zie "Hergebruik en UX").

## Kopieer de vorm van

- `scripts/kit/pr-merge.mjs` — `codexSpoorOp()` (lijsten van één PR, alleen `chatgpt-codex-connector[bot]`, onleesbaar gooit),
  `codexStand()` (de marker lezen) en `codexVoorwaarde()` (stand plus redenen)
- `test/scripts/pr-merge-zonder-codex.test.ts` — de wereld `goed()`, `zet()` en `anderePr()` voor nagebootste REST-antwoorden

## Hergebruik en UX

n.v.t. — geen UI. Letterlijke nieuwe regel van `pr:merge`:

- `Codex-review loopt nog op deze PR: wacht of laat de eigenaar mergen`

## Wat Codex laat zien terwijl het bezig is

Nagegaan met `gh api` (alleen lezen) op 3 november 2026, alleen eindstanden: #443 (afgerond zonder punten) heeft een 👍 van
`chatgpt-codex-connector[bot]` op de PR en geen 👀; de twee commentaren `@codex review` van de eigenaar op #445 hebben in de
rollup `reactions` van de commentaarlijst 0 👀 en 0 👍; #447 tot en met #453 hebben geen reactie (tegoed op); #460 heeft alleen
een limietmelding zonder marker; #464 een marker `failed` en een limietmelding; #460 en #464 hebben geen reactie op de PR en
0 👀 in de rollup van hun commentaren. Dat strookt met: Codex haalt zijn 👀 weg na
afronden. Niet nagegaan, want tijdens een ronde niet gezien: dat Codex een 👀 zet op de PR of op het commentaar
`@codex review`, en welke tussenstatus de marker dan heeft (de bestaande test in `test/scripts/pr-merge.test.ts` gebruikt
`running`; `pending` en `in_progress` zijn niet gezien). Daarom telt elke status behalve `completed` en `failed` als bezig
(AC-1, OV-3).

## Acceptatiecriteria

- **agent-merge-codex-wachten/AC-1** — Codex is bezig op PR `nummer` als ten minste één geldt, op welke SHA of welk moment ook:
  (1) een reactie `eyes` van `chatgpt-codex-connector[bot]` in `GET …/issues/<nr>/reactions`; (2) een reactie `eyes` van die
  bot op een issue-commentaar van die PR (ook het commentaar `@codex review`): voor elk commentaar uit
  `…/issues/<nr>/comments` waarvan `reactions.eyes` een geheel getal ≥ 1 is, leest het script
  `GET …/issues/comments/<id>/reactions`; ontbreekt die rollup of is ze 0, dan leest het niets voor dat commentaar (OV-4);
  (3) de nieuwste samenvatting van die bot met marker `codex-review-state:v1` (zoals `codexRedenen()` de nieuwste neemt) heeft
  een `code_review.status` anders dan `"completed"` of `"failed"`, ook leeg, ontbrekend of onbekend. Niet bezig: een 👀 van een
  ander account, een 👍 op een commentaar, een marker `"completed"` of `"failed"`, een commentaar zonder marker. Een onleesbare
  reactielijst gooit (geen merge), zoals de andere lijsten.
- **agent-merge-codex-wachten/AC-2** — `codexSpoorOp()` geeft `true` als Codex bezig is (AC-1), naast de sporen van een
  afgeronde review uit agent-merge-zonder-codex AC-4. Dat geldt dus ook op een andere PR van dezelfde head-branch die open is
  of zonder merge gesloten; een gemergde PR van de branch telt niet, zoals nu. Bij `"indien-aanwezig"` is de stand van
  `codexVoorwaarde()` dan `voldaan` en geldt `codexRedenen()` voor de head.
- **agent-merge-codex-wachten/AC-3** — `codexVoorwaarde()` voegt de reden uit "Hergebruik en UX" toe als Codex bezig is op
  deze PR (`nummer`), bij `codex: true` en bij `"indien-aanwezig"`; de redenen van `codexRedenen()` blijven daarnaast staan.
  Bij `false` niet (geen Codex-voorwaarde, stand `uit`). Is Codex alleen bezig op een andere PR van de branch, dan geen
  wachtreden maar wel de stand `voldaan` (AC-2). Bij `true` verandert de uitslag alleen als Codex de head al afrondde (👍 na
  ontvangst of samenvatting `completed` zonder open punten) en tegelijk een 👀 staat, bijvoorbeeld na een nieuwe
  `@codex review` op dezelfde head: dan wacht de merge.
- **agent-merge-codex-wachten/AC-4** — Bij tegoed op verandert niets: de wereld van #447 tot en met #453 (marker `"failed"`
  plus limietmelding, geen reactie) en die van #460 (alleen limietmelding, geen reactie) geven bij `"indien-aanwezig"` stand `verviel`,
  geen Codex-reden, en na de merge de steekproefregel `STEEKPROEF_VERVIEL`.
- **agent-merge-codex-wachten/AC-5** — Tests in `test/scripts/pr-merge-zonder-codex.test.ts` via `beoordeelMerge()` (tabel):
  alleen 👀 op de PR → wachtreden, stand `voldaan`; 👀 van een ander account → `verviel`, geen reden; marker `in_progress` op
  een oudere SHA → wachtreden; marker zonder `status` → wachtreden; 👀 van Codex op het commentaar `@codex review`
  (`reactions.eyes: 1`) → wachtreden; `reactions.eyes: 1` maar alleen 👀 van een ander account → `verviel`; 👍 van Codex op
  het commentaar `@codex review` → `verviel` (geen spoor, geen afronding); 👀 alleen op een niet-gemergde andere PR van de
  branch → `voldaan`, reden "niet afgerond beoordeeld", geen wachtreden; 👀 alleen op een gemergde PR van de branch →
  `verviel`; `codex: true` met samenvatting `completed` op de head zonder open punten plus 👀 op de PR → wachtreden;
  `codex: false` met 👀 → stand `uit`, geen reden; reactielijst van een commentaar geeft HTTP 500 → fout, geen merge; de
  werelden uit AC-4 → `verviel`. De bestaande tabelrij "alleen 👀" in de `describe` van agent-merge-zonder-codex/AC-4 gaat
  van de lijst zonder reden naar de lijst met reden: een bestaande test gewijzigd omdat deze spec het gedrag verandert, met
  die reden in de PR (R-TEST-02). De test "Codex loopt nog (👀)" in `test/scripts/pr-merge.test.ts` blijft ongewijzigd groen.
  Elke negatieve rij hierboven met wachtreden faalt op de huidige code (R-PRINC-04): die geeft `verviel` of geen reden.
- **agent-merge-codex-wachten/AC-6** — De bouw-PR, of een vervolg-PR zonder kritieke paden die ook code of tests buiten
  `docs/` en `CHANGELOG.md` bevat (zoals #464 bij #460), werkt de gebouwde spec
  [agent-merge-zonder-codex](agent-merge-zonder-codex.md) bij, met een verwijzing naar deze spec en de statusregel
  `gebouwd # #<die PR>` (het nummer van die PR zelf; met `gebouwd # #464` of een PR met alleen docs weigert
  `document-status` de nieuwe inhoud, ADR 0062): in AC-4 vallen uit de zin "Geen spoor zijn" de woorden "leeg, bezig" en "een reactie `eyes`" weg, en de tabelrij
  "alleen 👀 → geen Codex-reden" wordt "alleen 👀 → wachtreden"; de randgevalrij "Codex gaf 👀 en daarna niets, of de
  samenvatting staat nog op bezig" krijgt het gedrag "spoor: geen merge met wachtreden; een hangende 👀 faalt dicht, de
  eigenaar merget"; de slotzin van "Wat Codex achterlaat" over de 👀 en OV-1 krijgen het besluit (OV-1 wordt besloten, optie
  (a)). In [agent-merge-niet-kritiek](agent-merge-niet-kritiek.md) AC-3 krijgt de zin "Een 👀, een lopende review, … telt
  niet" erbij dat een 👀 of een lopende review de wachtreden geeft, ook met statusregel `gebouwd # #<die PR>`. Deze spec
  krijgt in de bouw-PR `gebouwd # #<bouw-PR>`. De doc-commentaren bij `codexRedenen()` en
  `codexSpoorOp()` in `scripts/kit/pr-merge.mjs` ("👀 of een lopende review telt niet", "een 👀 … tellen niet") gaan mee in de
  bouw-PR.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Codex-tegoed op: marker `"failed"` plus limietmelding, geen reactie (#447–#453) | geen spoor: voorwaarde vervalt; merge met steekproefregel (AC-4) | n.v.t. |
| Alleen een limietmelding zonder marker (#460) | geen spoor (AC-4) | n.v.t. |
| Codex met tegoed bezig: 👀 op de PR | wachtreden, geen merge; rondt Codex af, dan geldt agent-merge-zonder-codex AC-4 volledig (AC-2, AC-3) | n.v.t. |
| 👀 blijft hangen na een mislukte ronde met tegoed | faalt dicht: wachtreden; de eigenaar merget (prijs van het besluit; geen tijdslimiet) | n.v.t. |
| 👀 staat nog van een ronde op een oudere head, daarna een push | telt als bezig: wachtreden; rondt Codex de oude ronde af, dan vraagt de hoofdsessie `@codex review` op de nieuwe head (spoor) | n.v.t. |
| Marker met status `running`, `pending`, `in_progress`, leeg of ontbrekend, op welke SHA ook | bezig: wachtreden (AC-1, OV-3) | n.v.t. |
| Marker `in_progress` daarna door Codex bijgewerkt tot `completed` | alleen de nieuwste stand telt: niet bezig (AC-1) | n.v.t. |
| 👀 van Codex op het commentaar `@codex review` | bezig: wachtreden (AC-1, OV-2) | n.v.t. |
| 👍 van Codex op het commentaar `@codex review` | geen spoor en geen afronding, zoals nu (review #460; AC-1) | n.v.t. |
| 👀 van een ander account (de eigenaar of een sessie onder zijn account) | telt niet (AC-1) | n.v.t. |
| Commentaarlijst zonder rollup `reactions` | commentaar niet gelezen: geen 👀 gezien (OV-4) | n.v.t. |
| Codex bezig op een andere, niet-gemergde PR van de branch | spoor: stand `voldaan`, reden "niet afgerond beoordeeld", geen wachtreden (AC-2, AC-3) | n.v.t. |
| Codex bezig op een gemergde PR van de branch | telt niet (AC-2) | n.v.t. |
| `codex: true`, head afgerond zonder punten, daarna een nieuwe `@codex review` met 👀 | wachtreden: geen merge tot Codex klaar is (AC-3) | n.v.t. |
| `codex: false` | geen Codex-voorwaarde, ook niet met 👀 (AC-3) | n.v.t. |
| Codex zet zijn 👀 pas na de controle van `pr:merge` | merge kan vallen; kleiner venster dan voorheen, aanvaard (ADR 0069 Gevolgen) | n.v.t. |
| Reactielijst van een commentaar niet leesbaar (HTTP-fout) | fout, exit 1, geen merge (AC-1) | n.v.t. |
| Besluit-PR gemerged, bouw-PR nog niet | `pr:merge` kent de wachtregel nog niet (bij `"indien-aanwezig"` mogelijk `verviel`); de hoofdsessie kijkt vóór `pnpm pr:merge` zelf met `gh api` naar 👀 en de status van de nieuwste samenvatting en merget niet als Codex bezig is (ADR 0069 punt 5, overgang; afspraak) | n.v.t. |
| De sessie verwijdert haar eigen commentaar `@codex review` met de 👀 van Codex erop | de 👀 verdwijnt met het commentaar; `pr:merge` ziet geen spoor meer en kan mergen. Bewuste omzeiling, net als een Codex-commentaar verwijderen: het rolhek weigert het nu niet (OV-6); afspraak: niet doen (ADR 0069 punt 5 en Gevolgen) | n.v.t. |

## Raakt ook

`scripts/kit/pr-merge.mjs` (kritiek pad, ADR 0069 punt 4: de bouw-PR is kritiek en de eigenaar merget hem; pas met die merge
wacht `pr:merge`), `test/scripts/pr-merge-zonder-codex.test.ts` (één bestaande rij gewijzigd, AC-5),
`docs/specs/agent-merge-zonder-codex.md` en `docs/specs/agent-merge-niet-kritiek.md` (gebouwd, AC-6). Niet geraakt:
`.claude/gates.json`, `scripts/kit/agent-merge.mjs`, `scripts/kit/diff-guard.mjs`, `scripts/kit/check-docs.mjs`,
`.github/workflows/guard.yml`, `docs/framework.md`, `.claude/skills/opleveren/SKILL.md` en `AGENTS.md`. Afweging bij de skill:
stap 3 van "Mergen" (`.claude/skills/opleveren/SKILL.md:50`, "Codex telt als het een afgeronde review … liet") wordt
onvolledig, want Codex telt nu ook (wacht) als het bezig is; de zin blijft toch staan, omdat `pr:merge` het wachten zelf meldt
met de reden uit "Hergebruik en UX" en de skill onder leesbudget staat (agent-merge-zonder-codex/AC-7). Geen migratie, route, permissie of resource: `check:migrations`,
`check:secdef`, `test:db` en `test/security/resources.ts` n.v.t.

## Buiten scope

Een tijdslimiet waarna een hangende 👀 niet meer telt; Codex zelf opnieuw laten starten; het rolhek reacties laten bewaken
(agent-merge-zonder-codex OV-5) of het verwijderen van commentaren laten weigeren (OV-6, aanbeveling (a)); de oordeel-job
`agent-merge` (die leest geen Codex); de steekproef en de terugval (ongewijzigd, ADR 0069 punt 5).

## Testplan

Unittests met nagebootste REST-antwoorden via `beoordeelMerge()` in `test/scripts/pr-merge-zonder-codex.test.ts` (AC-5), in
een eigen `describe('agent-merge-codex-wachten/AC-…')`, met de werelden uit AC-4 als regressie; de bestaande tests in
`test/scripts/pr-merge.test.ts` blijven ongewijzigd groen; AC-6 is docs in de bouw- of vervolg-PR, na te gaan in de diff.
Alle rijen van AC-5 zijn nagebootst. Nameting: bij de eerste PR waarop Codex met tegoed een ronde draait, leest de
hoofdsessie tijdens de ronde (alleen lezen) `gh api repos/{owner}/{repo}/issues/<nr>/reactions`, de rollup `reactions` van
`…/issues/<nr>/comments` en de status van de nieuwste marker `codex-review-state:v1`, en zet het resultaat met datum en
PR-nummer in "Wat Codex laat zien terwijl het bezig is" (in de bouw-PR of een vervolg-PR volgens AC-6). Zet Codex geen 👀 en
geen tussenstatus, dan meldt ze dat de eigenaar: dan sluit dit besluit het venster niet.

## Open vragen

- **OV-1 ✅ besloten** — Een 👀 van Codex of een samenvatting die nog bezig is, op deze PR of op een niet-gemergde PR van de
  branch, telt als spoor; de agent-merge wacht tot Codex de head afrondt, of de eigenaar merget. Bij tegoed op komt geen 👀,
  dus daar vervalt de voorwaarde zoals nu. Prijs: een hangende 👀 faalt dicht. Besluit van de eigenaar, 3 november 2026.
- **OV-2** — Telt een 👀 op een commentaar (zoals `@codex review`) ook, terwijl een 👍 daarop niet telt (review #460)? (a) Ja,
  zoals de spec: wachten mag op elk teken dat Codex bezig is, vrijgeven alleen op het strikte teken van afronding; dat is
  consequent in de richting waarin het faalt (dicht), en een review die de eigenaar of de hoofdsessie met `@codex review`
  vraagt, zet de 👀 op dat commentaar en niet op de PR. Prijs: één extra aanroep per commentaar met een 👀. (b) Nee, alleen de
  PR (symmetrisch met de 👍, geen extra aanroep; dan valt een gevraagde review buiten het wachten). Aanbeveling: (a).
- **OV-3** — Welke markerstatus is bezig? (a) Alles behalve `"completed"` en `"failed"`, ook leeg of onbekend, zoals de spec:
  de tussenstatus is niet gezien, en zo faalt een nieuwe status dicht. (b) Alleen bekende tussenstatussen (`running`,
  `pending`, `in_progress`): een nieuwe status valt dan open. Aanbeveling: (a); de prijs is dat een marker zonder status bij
  tegoed op (niet gezien, #447–#453 en #464 zeggen `"failed"`) elke agent-merge tegenhoudt tot de eigenaar merget.
- **OV-4** — Wat als de rollup `reactions` in de commentaarlijst ontbreekt? (a) Niet lezen, zoals de spec: GitHub stuurt de
  rollup altijd mee (gezien op #425–#464), en de bestaande testfixtures hebben geen rollup en geen `id`, dus die blijven
  ongewijzigd. (b) Dan wel per commentaar de reacties lezen (faalt dicht, maar meer aanroepen en alle fixtures aanpassen).
  Aanbeveling: (a).
- **OV-5** — Geldt de wachtreden ook bij `codex: true`? (a) Ja, zoals de spec: één regel (Codex bezig, geen merge) voor beide
  modi; het verschil zit alleen in een 👀 naast een al afgeronde head (AC-3). (b) Nee, alleen bij `"indien-aanwezig"`, zoals
  de letter van het besluit. Aanbeveling: (a); het besluit wil wachten op Codex, en bij `true` is dat strenger, niet ruimer.
- **OV-6** — Moet het rolhek weigeren dat de sessie onder het eigenaaraccount een issue-commentaar verwijdert of bewerkt
  (`gh pr comment --delete-last`, `gh api -X DELETE …/issues/comments/<id>`), zodat het eigen `@codex review` met de 👀 van
  Codex blijft staan? Een reactie van de bot zelf kan het eigenaaraccount niet weghalen (alleen de auteur mag dat). (a) Nu
  niet: afspraak plus steekproef en terugval, zoals voor een Codex-commentaar (agent-merge-zonder-codex OV-5), en een eigen
  besluit over het rolhek. (b) Ja, in de bouw-PR: `rails/hooks/lib/rolhek.mjs` krijgt een regel; dan raakt de bouw-PR ook het
  rolhek, met eigen tests. Aanbeveling: (a); het rolhek bewaken is in agent-merge-zonder-codex OV-5 al buiten scope gezet.
