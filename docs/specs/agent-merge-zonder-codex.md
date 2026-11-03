---
status: gebouwd # #483
namespace: agent-merge-zonder-codex
model: opus
---

# Agent-merge zonder Codex-tegoed, met een omvanggrens

## Doel

De hoofdsessie kan niet-kritiek werk weer zelf mergen als het Codex-reviewtegoed op is: `agentMerge.codex` krijgt de waarde
`"indien-aanwezig"`, en een omvanggrens `agentMerge.maxRegels` geldt altijd als vervangend vangnet
([ADR 0069](../adr/0069-agent-merge-niet-kritiek.md), herzien 2026-11-03). Aanleiding: review van 3 november 2026, bevinding
P2 (`agentMerge.codex: true` en een op tegoed wachtende Codex maken elke agent-merge onmogelijk), akkoord van de eigenaar.

## Rollen en wie wat ziet

n.v.t. — geen app-gebruikers. Zoals in [agent-merge-niet-kritiek](agent-merge-niet-kritiek.md): alleen de hoofdsessie mag
`pnpm pr:merge`; de eigenaar merget alles wat het oordeel niet toelaat, zet de modus en kijkt de steekproef na (AC-6).

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes. `pnpm pr:merge` stopt met exit 1 en één regel per niet-vervulde voorwaarde, zoals nu.

## Kopieer de vorm van

- `scripts/kit/agent-merge.mjs` — `leesAgentMerge()` (faalt dicht op vorm) en `agentMergeOordeel()` (één reden per uitsluiting)
- `scripts/kit/pr-merge.mjs` — `codexRedenen()` en `voorwaarden()` (REST-antwoorden in, redenen uit; Codex-bot en marker)
- `scripts/kit/diff-guard.mjs` — `leesPr()` (git op de merge-base) en `agentMerge()`
- `scripts/kit/check-docs.mjs` — `agentMergeViolations()` (vormtoets op `.claude/gates.json`)

## Hergebruik en UX

n.v.t. — geen UI. Meldingen van `pr:merge` en de diff-guard zijn Nederlands en noemen de voorwaarde en ADR 0069. Letterlijke
nieuwe regels:

- `PR te groot voor een agent-merge: <n> regels, grens <maxRegels> (agentMerge.maxRegels)`
- `binair bestand in de PR: geen agent-merge (<pad>)`
- `omvang van de PR niet leesbaar of agentMerge.maxRegels ontbreekt: geen agent-merge`
- na een merge zonder Codex-spoor, achter de bestaande slotregel: `Geen Codex-spoor op deze PR of zijn branch: de Codex-voorwaarde verviel (indien-aanwezig). Meld deze merge als steekproef (ADR 0069 punt 5).`
- na een merge bij `codex: false`, op dezelfde plek: `Geen Codex-voorwaarde (agentMerge.codex: false). Meld deze merge als steekproef (ADR 0069 punt 5).`

## Wat Codex achterlaat als het tegoed op is

Nagegaan met `gh api` (alleen lezen) op PR #447 tot en met #453 van 3 november 2026, alle geopend na het opraken van het
tegoed: `chatgpt-codex-connector[bot]` plaatst bij het openen van de PR twee issue-commentaren en geen reactie, review of
inline-commentaar:

1. een samenvatting mét marker, `<!-- codex-review-state:v1 {"code_review":{"commit_sha":"<head>","has_any_findings":true,"has_unresolved_findings":true,"status":"failed"},…} -->`,
   met in de tabel "Failed — We couldn't complete this review";
2. een melding zonder marker: "You have reached your Codex usage limits for code reviews. …".

De waarden `has_any_findings` en `has_unresolved_findings` zijn daar `true` zonder dat er een bevinding is. Een spoor dat elk
commentaar of elke marker meetelt (de eerste versie van deze spec, en ook het oorspronkelijke ontwerp "samenvatting met
marker") blokkeert dus precies het geval waarvoor deze spec bestaat. Een afgeronde review is herkenbaar aan `"status":"completed"`
(gezien op o.a. #443 en eerdere PR's), aan een 👍 (afgerond zonder punten) of aan een PR-review met inline-commentaar (afgerond
met punten). De samenvatting is één commentaar dat Codex bijwerkt; een latere mislukte ronde overschrijft de stand, maar de 👍
of de PR-review van een eerdere afgeronde ronde blijft staan. Niet nagegaan is of een afronding zonder punten altijd ook een
👍 geeft (`codexRedenen()` behandelt de samenvatting `completed` en de 👍 als alternatieven); zo niet, dan kan een latere
`failed` het spoor van een ronde zonder punten wissen (randgeval, restrisico). AC-4 telt daarom alleen afgeronde reviews als
spoor. Een 👀 is bij tegoed op niet gezien. Een 👀 van Codex of een samenvatting die nog bezig is, is wel een spoor: op deze
PR wacht de agent-merge dan met een wachtreden (besluit van de eigenaar, OV-1, [agent-merge-codex-wachten](agent-merge-codex-wachten.md)).

## Acceptatiecriteria

- **agent-merge-zonder-codex/AC-1** — `leesAgentMerge()` in `scripts/kit/agent-merge.mjs` leest `codex` als `true`, `false`
  of `"indien-aanwezig"`; elke andere of ontbrekende waarde wordt `true`. Het leest `maxRegels` als positief geheel getal;
  ontbreekt het, of is het geen geheel getal ≥ 1 (`0`, `-1`, `400.5`, `"400"`, `null`), dan is het hele resultaat `null`
  (zoals nu bij een fout in `toegestaan` of `kritiek`), dus oordeel `nee` en geen merge. Tabeltest met elk van die waarden.
  Let op, in de PR te noemen: `codex: "ja"` geeft nu `null` (overal `nee`) en na AC-1 `true`; het oordeel faalt daar dus
  minder dicht, met `check-docs` rood als vangnet (AC-6).
- **agent-merge-zonder-codex/AC-2** — `agentMergeOordeel()` krijgt in de invoer `regels` (toegevoegd plus verwijderd) en
  `binair` (lijst van paden). Het geeft `nee` met de reden uit "Hergebruik en UX" als `regels > maxRegels`, als `binair` niet
  leeg is, en als `regels` ontbreekt of geen geheel getal ≥ 0 is. `regels === maxRegels` geeft geen reden. `leesPr()` in
  `scripts/kit/diff-guard.mjs` telt met `git diff --numstat -z --find-renames --no-ext-diff --no-textconv <merge-base> <head>`
  op dezelfde merge-base die het al gebruikt; een regel met `-` voor toegevoegd of verwijderd is een binair bestand. Geen
  nieuwe REST-aanroep (de helper `api()` leest alleen lijsten), dus geen nieuwe netwerkfout; de uitslag van de diff-guard zelf
  verandert niet en de job `agent-merge` volgt dit oordeel ongewijzigd. Tabeltest: 399, 400 en 401 regels bij grens 400, een
  binair bestand onder `docs/`, ontbrekende `regels`, een zuivere hernoeming (numstat `-z` geeft dan `0\t0\t\0oud\0nieuw\0`:
  0 regels, beide paden op de lijsten getoetst) en een nieuw leeg bestand (0 regels, `ja`).
- **agent-merge-zonder-codex/AC-3** — `voorwaarden()` in `scripts/kit/pr-merge.mjs` leest `agentMerge` van `.claude/gates.json`
  op de kop van `main` (zoals de modus) en weigert als dat `null` is. Het telt `additions + deletions` uit het bestaande
  `GET …/pulls/<nr>`-antwoord en leest `GET …/pulls/<nr>/files`; het weigert als de som groter is dan `maxRegels` of niet
  leesbaar is, en als een bestand geen `patch` heeft, behalve bij `status: "renamed"` met `changes: 0` (zuivere hernoeming).
  Een binair bestand en een nieuw of verwijderd leeg bestand zien er in REST hetzelfde uit (`changes: 0`, geen `patch`); beide
  worden geweigerd, ook al geeft de diff-guard bij een leeg bestand `ja` (numstat `0 0`). Dat verschil faalt dicht en is
  bewust. Een hernoemd én gewijzigd binair bestand ziet er in REST uit als een zuivere hernoeming en komt hier door; het
  vangnet is dan de voorwaarde dat de job `agent-merge` slaagt (`guardRedenen()`), want numstat geeft daar `-` en het oordeel
  `nee` (AC-2). Die jobvoorwaarde is dus niet overbodig naast deze telling. Unittest met nagebootste REST-antwoorden: 400 en 401 regels bij grens 400, een bestand zonder `patch` met
  `changes: 3`, een binair bestand (`changes: 0`, geen `patch`), een zuivere hernoeming (`renamed`, `changes: 0`, geen
  `patch`: geen reden), en `agentMerge` zonder `maxRegels`.
- **agent-merge-zonder-codex/AC-4** — Codex-voorwaarde in `pr-merge.mjs`: bij `codex: true` (ook ontbrekend of onleesbaar)
  geldt `codexRedenen()` zoals nu; bij `false` geen Codex-voorwaarde; bij `"indien-aanwezig"` geldt `codexRedenen()` volledig
  als `chatgpt-codex-connector[bot]` een spoor heeft (van een afgeronde review, of Codex is bezig: agent-merge-codex-wachten/AC-2): een samenvatting met marker waarin
  `code_review.status` `"completed"` is, een PR-review, een inline-reviewcommentaar (`pulls/<nr>/comments`) of een reactie
  `+1`, op welke SHA of welk moment ook. Dat geldt op deze PR en op elke andere PR met dezelfde head-branch
  (`GET …/pulls?head=<owner>:<branch>&state=all`) die open is of gesloten zonder merge (`merged_at` is `null`); een gemergde
  PR van dezelfde branch telt niet. Anders vervalt de voorwaarde. Geen spoor zijn: een samenvatting met een andere `status`
  (`"failed"`), een commentaar zonder marker (zoals de limietmelding), en alles van een ander account. Een 👀 van Codex of
  een samenvatting met een andere status dan `"completed"` of `"failed"` (ook leeg of ontbrekend) is wel een spoor (stand
  `voldaan`); op deze PR geeft het bovendien de wachtreden, op een andere PR van de branch niet ([agent-merge-codex-wachten](agent-merge-codex-wachten.md)
  AC-1 tot en met AC-3). Een lijst die niet leesbaar is, geeft een reden of een fout met exit 1 (`gh()` gooit bij een HTTP-fout): in beide
  gevallen geen merge. Unittest (tabel): geen spoor → geen Codex-reden; alleen 👀 → wachtreden; de twee commentaren van
  "Wat Codex achterlaat" (marker met `"failed"` plus limietmelding) → geen Codex-reden; samenvatting `completed` op een oudere
  SHA → reden "niet afgerond beoordeeld"; samenvatting `completed` op de head met open punten → reden "open punten"; 👍 van
  vóór de push van de head → reden; 👍 van een eerdere ronde en daarna een samenvatting `failed` op de head → reden; alleen
  een inline-reviewcommentaar → reden; spoor alleen op een PR van dezelfde branch die zonder merge is gesloten → reden; spoor
  alleen op een gemergde PR van dezelfde branch → geen Codex-reden; marker van een ander account → geen Codex-reden; lijst
  met reviews geeft HTTP 500 → reden of fout, geen merge; `codex: "ja"` → zoals `true`.
- **agent-merge-zonder-codex/AC-5** — Na een geslaagde merge waarbij de Codex-voorwaarde verviel, en na elke geslaagde merge
  bij `codex: false`, drukt `pr-merge.mjs` de passende steekproefregel uit "Hergebruik en UX" af; met een Codex-spoor of bij
  `codex: true` niet. Het script telt niet (ADR 0069
  punt 5: de eigenaar telt). Unittest op de uitvoer van de functie die de slotregels bouwt (geen echte merge).
- **agent-merge-zonder-codex/AC-6** — `.claude/gates.json` krijgt `agentMerge.codex: "indien-aanwezig"` en
  `agentMerge.maxRegels: 400`; de `$comment` noemt beide. `agentMergeViolations()` in `scripts/kit/check-docs.mjs` toetst de
  vorm van `codex` en `maxRegels` op het ruwe `agentMerge`-blok, vóór de vroege return op `agentMerge === null`
  (nu `scripts/kit/check-docs.mjs:737`), en weigert een `codex` buiten `true`, `false` en `"indien-aanwezig"` en een
  `maxRegels` die ontbreekt of geen geheel getal ≥ 1 is (de vorm moet zichtbaar fout zijn, ook al leest het script hem
  dicht). Test met `codex: "ja"`, `maxRegels` ontbrekend, `"400"` en `0`.
- **agent-merge-zonder-codex/AC-7** — Regelboek en instructies, netto niet groeiend, gemeten in bytes van `docs/framework.md`,
  `.claude/skills/opleveren/SKILL.md` en `AGENTS.md` tegen `main` (samen niet groter; `AGENTS.md` zit al op 85 % van zijn
  budget, `docs:AGENTS.md:budget` in `check-docs`): R-REPO-01 noemt de omvanggrens (`agentMerge.maxRegels`) naast de
  toegestane lijst; R-ROL-10 blijft gelijk (er staat geen zin over Codex in); stap 3 van "Mergen" in
  `.claude/skills/opleveren/SKILL.md` wordt: Codex-punten tellen als Codex een afgeronde review op de PR of op een niet-gemergde
  PR van zijn branch liet;
  dan vraagt de hoofdsessie na een push `@codex review` op de nieuwe head; zonder spoor vraagt ze geen extra review en ontwijkt
  ze Codex niet (geen draft om de automatische review te mijden, geen commentaar weghalen); zonder spoor meldt ze de merge als
  "steekproef"; na een terugvaltrigger geen `pr:merge` meer (ADR 0069 punt 5); `AGENTS.md`
  alleen als een zin daar anders onjuist wordt (nu niet). De docs-tests op de regels uit agent-merge-niet-kritiek AC-6 blijven
  groen.
- **agent-merge-zonder-codex/AC-8** — De gebouwde spec [agent-merge-niet-kritiek](agent-merge-niet-kritiek.md) wordt in de
  bouw-PR bijgewerkt (een gebouwde spec wijzigt alleen in een PR met code, ADR 0062): AC-1 noemt de omvanggrens in het oordeel,
  AC-3 de drie Codex-waarden en de omvanggrens in `pr:merge`, AC-5 de nieuwe vorm van `agentMerge`; elk met een verwijzing
  naar deze spec. Status blijft `gebouwd`.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Codex-tegoed op, Codex reageert niet, PR van 120 regels, review-commentaar op de head | merge; steekproefregel (AC-4, AC-5) | n.v.t. |
| Codex-tegoed op: samenvatting met marker `"status":"failed"` en een limietmelding (zoals #447–#453) | geen spoor: voorwaarde vervalt; merge met steekproefregel (AC-4, AC-5) | n.v.t. |
| Codex gaf 👀 en daarna niets, of de samenvatting staat nog op bezig | spoor: geen merge met wachtreden; een hangende 👀 faalt dicht, de eigenaar merget (AC-4, OV-1) | n.v.t. |
| Codex rondde een eerdere ronde af met alleen een samenvatting `completed` (geen 👍), daarna overschreven door `failed` | spoor verdwenen: voorwaarde vervalt; restrisico, die ronde had geen punten (AC-4) | n.v.t. |
| Hernoemd én gewijzigd binair bestand | REST: als zuivere hernoeming; diff-guard: numstat `-`, `nee`, dus `pr:merge` weigert via de job `agent-merge` (AC-2, AC-3) | n.v.t. |
| Codex rondde een eerdere head af (👍 of PR-review), daarna een push en een mislukte ronde (`failed`) op de head | spoor aanwezig: voorwaarde geldt, geen merge; de eigenaar merget of Codex rondt de head alsnog af (AC-4) | n.v.t. |
| Codex gaf eerder een 👍 op een oudere head, daarna een push | spoor aanwezig: 👍 telt alleen na ontvangst van de head, dus geen merge tot Codex de head afrondt (AC-4) | n.v.t. |
| Codex vond open punten op een oudere SHA, nieuwe push zonder nieuwe Codex-ronde | spoor aanwezig, samenvatting niet op de head: geen merge (AC-4) | n.v.t. |
| Codex plaatst een commentaar zonder marker (bijvoorbeeld de limietmelding) | geen spoor (AC-4) | n.v.t. |
| Codex plaatst alleen een inline-reviewcommentaar of een PR-review, geen samenvatting | spoor aanwezig: geen merge (AC-4) | n.v.t. |
| Agent sluit de PR met open Codex-punten en opent een nieuwe PR van dezelfde branch | spoor op de zonder merge gesloten PR telt: voorwaarde geldt op de nieuwe PR (AC-4) | n.v.t. |
| Eerdere PR van dezelfde branch kreeg een Codex-review en is gemergd; de volgende PR van die branch (een thread werkt op één branch, zoals #446, #447, #450 en #452) | spoor op de gemergde PR telt niet: alleen het spoor op de nieuwe PR beslist (AC-4) | n.v.t. |
| Hoofdsessie opent de PR als draft of vraagt geen review om een spoor te vermijden | niet toegestaan (AC-7, ADR 0069 punt 5); afspraak, geen gate; restrisico (ADR 0069 Gevolgen) | n.v.t. |
| Nieuwe branch met dezelfde inhoud, na een gesloten PR met Codex-punten | geen spoor op die branch: voorwaarde vervalt; bewuste omzeiling, restrisico (ADR 0069 Gevolgen); OV-5 | n.v.t. |
| Sessie verwijdert of bewerkt een Codex-commentaar onder het eigenaaraccount | het rolhek weigert dat nu niet; spoor kan verdwijnen; bewuste omzeiling, restrisico (ADR 0069 Gevolgen); OV-5 | n.v.t. |
| Reviews of inline-commentaar van de PR niet leesbaar (HTTP-fout) | reden of exit 1: geen merge (AC-4) | n.v.t. |
| PR van precies 400 regels | toegestaan (AC-2, AC-3) | n.v.t. |
| PR van 401 regels, verder agent-mergebaar | `agent-merge: nee`; de eigenaar merget, of de agent splitst in PR's onder de grens, elk met eigen verse review (AC-2) | n.v.t. |
| PR met een binair bestand (bijvoorbeeld een afbeelding onder `docs/`) | `agent-merge: nee`, `pr:merge` weigert (AC-2, AC-3); zie OV-4 | n.v.t. |
| Gegenereerd bestand in de PR (`src/web/routeTree.gen.ts`) | telt mee in `regels` | n.v.t. |
| Lockfile in de PR (`pnpm-lock.yaml`) | is een gate: al `nee` (agent-merge-niet-kritiek AC-1) | n.v.t. |
| Zuivere hernoeming | telt 0 regels in beide; beide paden worden wel op de lijsten getoetst (AC-2, AC-3) | n.v.t. |
| Nieuw of verwijderd leeg bestand | diff-guard: 0 regels, `ja`; `pr:merge` weigert (geen `patch`, niet te onderscheiden van binair); de eigenaar merget (AC-3) | n.v.t. |
| PR groeide na het diff-guard-oordeel (nieuwe push) | nieuwe diff-guard-run op de nieuwe head; `pr:merge` telt zelf opnieuw via REST (AC-3) | n.v.t. |
| `maxRegels` ontbreekt, is `"400"` of `0` | `agent-merge: nee` en geen merge (AC-1); `check-docs` rood (AC-6) | n.v.t. |
| `codex` is `"ja"` of ontbreekt | gelezen als `true`; `check-docs` rood bij `"ja"` (AC-1, AC-6) | n.v.t. |
| App zonder Codex | `codex: false` of `"indien-aanwezig"`; omvanggrens geldt; elke merge krijgt een steekproefregel (AC-4, AC-5) | n.v.t. |
| Agent-merge wordt gerevert, maakt `main` rood of blijkt kritiek | hoofdsessie merget niets meer via `pr:merge`, opent de PR die `merge` op `"eigenaar"` zet en meldt het; verder pas na de merge daarvan of een ander besluit (ADR 0069 punt 5; afspraak) | n.v.t. |
| Besluit-PR gemerged, bouw-PR nog niet | gates.json staat nog op `codex: true` zonder grens; de hoofdsessie merget geen PR boven 400 regels (ADR 0069 punt 5, overgang; afspraak) | n.v.t. |

## Raakt ook

`scripts/kit/agent-merge.mjs`, `scripts/kit/diff-guard.mjs`, `scripts/kit/pr-merge.mjs`, `scripts/kit/check-docs.mjs`,
`.claude/gates.json` (`altijdVragen`), `test/scripts/pr-merge.test.ts`, `test/rails/diff-guard.test.ts` en de bestaande
check-docs-test op `agentMerge` (bestaande tests; toevoegen, wijzigen alleen waar de vorm van `agentMerge` verandert, met reden
in de PR: het gates-fixture in `test/scripts/pr-merge.test.ts` mist `maxRegels`, dus elke test op het gelukte pad krijgt het
erbij; een test die `codex: "ja"` als `null` verwacht, gaat naar `true`, AC-1), `docs/framework.md` (R-REPO-01), `.claude/skills/opleveren/SKILL.md`, `docs/specs/agent-merge-niet-kritiek.md`
(AC-8). Geen migratie, route, permissie of resource: `check:migrations`, `check:secdef`, `test:db` en
`test/security/resources.ts` n.v.t. De bouw-PR is kritiek (`.claude/**`, besluitscripts): de eigenaar merget hem; met die merge
wordt `"indien-aanwezig"` actief. `.github/workflows/guard.yml` verandert niet (de job leest het oordeel al uit het script).

## Buiten scope

Een andere externe reviewer in plaats van Codex; de steekproef, de terugval of de overgang als gate (afspraken, ADR 0069
punt 5); een teller voor de steekproef; het rolhek DELETE/PATCH op Codex-commentaar laten weigeren (OV-5); de omvanggrens
per padsoort; wachten op Codex met een tijdslimiet (OV-1); de GitHub App (ST-01).

## Testplan

Tabeltests voor `leesAgentMerge()` (AC-1) en het oordeel op `regels` (AC-2); unittests met nagebootste REST-antwoorden voor de
omvang en binaire bestanden in `voorwaarden()` (AC-3) en voor de Codex-spoortabel (AC-4); uitvoertest voor de steekproefregel (AC-5);
check-docs-test op de vorm (AC-6); de bestaande docs-tests uit agent-merge-niet-kritiek AC-6 (AC-7). Elke negatieve test faalt
op de huidige code (R-PRINC-04): nu kent het oordeel geen omvang of binair bestand, leest `leesAgentMerge()` `"indien-aanwezig"` als `null` en stopt
`agentMergeViolations()` vóór de vormtoets.

## Open vragen

- **OV-1 ✅ besloten: (a)** — Telt een 👀 van Codex of een samenvatting die nog bezig is, op deze PR, als spoor? (a) Ja: dan wacht de agent
  tot Codex de head afrondt, of de eigenaar merget. Dat sluit het venster waarin de agent mergt terwijl Codex met tegoed nog
  bezig is, en blokkeert bij tegoed op niet, want daar komt geen reactie (#447–#453). Prijs: blijft een 👀 hangen na een
  mislukte ronde met tegoed, dan faalt het dicht en merget de eigenaar. Te wijzigen: AC-4 (👀 en bezig als spoor, tabelrij
  "alleen 👀" naar reden), de randgevalrij over 👀, ADR 0069 punt 3 en Gevolgen. (b) Nee, zoals het ontwerp van de opdracht
  ("een 👀 alleen is geen signaal") en zoals deze spec vóór dit besluit: dan wordt Codex ook mét tegoed in de praktijk optioneel voor een
  snelle agent (checks groen en verse review vóór de afronding van Codex). Dat venster is dan een aanvaard restrisico, niet
  omdat Codex bij tegoed op alleen een 👀 zou laten staan (dat is niet gezien, zie "Wat Codex achterlaat"). De spec volgde (b)
  omdat de opdracht het zo beslist; aanbeveling na de bevinding: (a). Besluit van de eigenaar, 3 november 2026: (a) "Ja,
  wachten op Codex", uitgewerkt in [agent-merge-codex-wachten](agent-merge-codex-wachten.md).
- **OV-2** — Grens 400 regels of ruimer (Ona: < 1.000)? Aanbeveling: 400, omdat hier geen mens meekijkt; na de steekproef van
  tien kan de eigenaar de waarde in `.claude/gates.json` met één regel verruimen.
- **OV-3** — Telt de steekproef ook merges mét Codex-spoor? Aanbeveling: nee, alleen zonder; daar valt het vangnet weg.
- **OV-4** — Wat is een Codex-spoor, en wat met binaire bestanden? Deze spec wijkt af van het oorspronkelijke ontwerp
  ("samenvatting met marker of 👍 op deze PR"): een spoor is een afgeronde review (marker met `"completed"`, 👍, PR-review of
  inline-commentaar), op deze PR of op een niet-gemergde PR van dezelfde branch; een binair bestand sluit uit. Reden: bij
  tegoed op zet Codex zelf een marker (`"failed"`) en een limietmelding (zie "Wat Codex achterlaat"), dus "elke marker" of
  "elk commentaar" blokkeert altijd; een gemergde PR van de branch meetellen blokkeert elke volgende PR in een thread; zonder
  de andere PR's van de branch viel de voorwaarde weg na sluiten en heropenen. Prijs: een Codex-review die mislukt terwijl er
  wel tegoed is, laat ook geen spoor na en de merge gaat door (steekproef en terugval vangen dat op). Alternatieven: (a)
  gemergde PR's van de branch wel meetellen (strengst; blokkeert threads); (b) elk commentaar meetellen (blokkeert altijd bij
  tegoed op); (c) binaire bestanden naar bytes tellen. Aanbeveling: zoals de spec.
- **OV-5** — Verwijderen of bewerken van Codex-commentaar onder het eigenaaraccount, en een nieuwe branch met dezelfde
  inhoud: (a) aanvaarden als bewuste omzeiling en zo benoemen (ADR 0069 Gevolgen, zoals nu), of (b) het rolhek in een eigen
  PR `gh api -X DELETE/PATCH` op `issues/comments` en `pulls/comments` laten weigeren. Aanbeveling: (a) nu, (b) als
  roadmap-item als de eigenaar dat wil.
- **OV-6** — Steekproef: zonder teller (de eigenaar telt in de thread, zoals de spec) of een teller in `pr:merge` uit een
  marker op gemergde PR's? Deze spec wijkt af van "steekproef n/10": niets in de kit telt agent-merges, en een sessie
  onthoudt het niet, dus n zou verzonnen zijn. Aanbeveling: zonder teller nu; een teller als het tellen te weinig blijkt.
  Ook bij `codex: false` komt de steekproefregel (AC-5), zodat elke merge zonder Codex-oordeel zichtbaar is.
- **OV-7** — Mag of moet de hoofdsessie `@codex review` vragen bij `"indien-aanwezig"`? Een gevraagde review die afrondt,
  maakt de Codex-voorwaarde bindend, dus een agent heeft belang bij niet vragen. Opties: (a) zoals de spec (AC-7): alleen
  de automatische review bij het openen telt; zonder spoor vraagt de hoofdsessie geen extra review; met spoor vraagt ze er
  een op elke nieuwe head; ontwijken (draft, commentaar weghalen) is verboden, als afspraak; (b) altijd vragen (bij tegoed op
  levert dat alleen een nieuwe `failed`-marker op, dus geen blokkade, maar met tegoed een extra ronde per push); (c) open
  laten. Aanbeveling: (a); het ontwijken staat als restrisico in ADR 0069 Gevolgen.
