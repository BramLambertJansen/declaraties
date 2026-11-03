---
status: goedgekeurd
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
  binair bestand onder `docs/`, en ontbrekende `regels`.
- **agent-merge-zonder-codex/AC-3** — `voorwaarden()` in `scripts/kit/pr-merge.mjs` leest `agentMerge` van `.claude/gates.json`
  op de kop van `main` (zoals de modus) en weigert als dat `null` is. Het telt `additions + deletions` uit het bestaande
  `GET …/pulls/<nr>`-antwoord en leest `GET …/pulls/<nr>/files`; het weigert als de som groter is dan `maxRegels` of niet
  leesbaar is, en als een bestand geen `patch` heeft (binair, of te groot voor GitHub om te tonen). Unittest met nagebootste
  REST-antwoorden: 400 en 401 regels bij grens 400, een bestand zonder `patch`, en `agentMerge` zonder `maxRegels`.
- **agent-merge-zonder-codex/AC-4** — Codex-voorwaarde in `pr-merge.mjs`: bij `codex: true` (ook ontbrekend of onleesbaar)
  geldt `codexRedenen()` zoals nu; bij `false` geen Codex-voorwaarde; bij `"indien-aanwezig"` geldt `codexRedenen()` volledig
  als `chatgpt-codex-connector[bot]` een spoor heeft: een issue-commentaar (met of zonder marker), een PR-review, een
  inline-reviewcommentaar (`pulls/<nr>/comments`) of een reactie `+1`, op deze PR of op een andere PR (open of gesloten) met
  dezelfde head-branch (`GET …/pulls?head=<owner>:<branch>&state=all`), op welke SHA of welk moment ook. Anders vervalt de
  voorwaarde. Een reactie `eyes` alleen, of een spoor van een ander account, is geen spoor. Is een van die lijsten niet
  leesbaar, dan geldt de voorwaarde (dicht). Unittest (tabel): geen spoor → geen Codex-reden; alleen 👀 → geen Codex-reden;
  samenvatting op een oudere SHA → reden "niet afgerond beoordeeld"; samenvatting op de head met open punten → reden "open
  punten"; 👍 van vóór de push van de head → reden; alleen een inline-reviewcommentaar → reden; alleen een commentaar zonder
  marker → reden; spoor alleen op een gesloten PR van dezelfde branch → reden; marker van een ander account → geen
  Codex-reden; lijst met reviews geeft HTTP 500 → reden; `codex: "ja"` → zoals `true`.
- **agent-merge-zonder-codex/AC-5** — Na een geslaagde merge waarbij de Codex-voorwaarde verviel, drukt `pr-merge.mjs` de
  steekproefregel uit "Hergebruik en UX" af; met een Codex-spoor of bij `codex: true` niet. Het script telt niet (ADR 0069
  punt 5: de eigenaar telt). Unittest op de uitvoer van de functie die de slotregels bouwt (geen echte merge).
- **agent-merge-zonder-codex/AC-6** — `.claude/gates.json` krijgt `agentMerge.codex: "indien-aanwezig"` en
  `agentMerge.maxRegels: 400`; de `$comment` noemt beide. `agentMergeViolations()` in `scripts/kit/check-docs.mjs` toetst de
  vorm van `codex` en `maxRegels` op het ruwe `agentMerge`-blok, vóór de vroege return op `leesAgentMerge() === null`
  (nu `scripts/kit/check-docs.mjs:736`), en weigert een `codex` buiten `true`, `false` en `"indien-aanwezig"` en een
  `maxRegels` die ontbreekt of geen geheel getal ≥ 1 is (de vorm moet zichtbaar fout zijn, ook al leest het script hem
  dicht). Test met `codex: "ja"`, `maxRegels` ontbrekend, `"400"` en `0`.
- **agent-merge-zonder-codex/AC-7** — Regelboek en instructies, netto niet groeiend, gemeten in bytes van `docs/framework.md`,
  `.claude/skills/opleveren/SKILL.md` en `AGENTS.md` tegen `main` (samen niet groter; `AGENTS.md` zit al op 85 % van zijn
  budget, `docs:AGENTS.md:budget` in `check-docs`): R-REPO-01 noemt de omvanggrens (`agentMerge.maxRegels`) naast de
  toegestane lijst; R-ROL-10 blijft gelijk (er staat geen zin over Codex in); stap 3 van "Mergen" in
  `.claude/skills/opleveren/SKILL.md` wordt: Codex-punten tellen als Codex een spoor op de PR of zijn branch liet; zonder spoor
  meldt de hoofdsessie de merge als "steekproef"; na een terugvaltrigger geen `pr:merge` meer (ADR 0069 punt 5); `AGENTS.md`
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
| Codex gaf 👀 en daarna niets (tegoed op of nog bezig) | geen spoor: voorwaarde vervalt (AC-4); zie OV-1 | n.v.t. |
| Codex gaf eerder een 👍 op een oudere head, daarna een push | spoor aanwezig: 👍 telt alleen na ontvangst van de head, dus geen merge tot Codex de head afrondt (AC-4) | n.v.t. |
| Codex vond open punten op een oudere SHA, nieuwe push zonder nieuwe Codex-ronde | spoor aanwezig, samenvatting niet op de head: geen merge (AC-4) | n.v.t. |
| Codex plaatst een commentaar zonder marker (bijvoorbeeld dat het tegoed op is) | spoor aanwezig: voorwaarde geldt, geen merge tot Codex de head afrondt; de eigenaar merget (AC-4) | n.v.t. |
| Codex plaatst alleen een inline-reviewcommentaar of een PR-review, geen samenvatting | spoor aanwezig: geen merge (AC-4) | n.v.t. |
| Agent sluit de PR met open Codex-punten en opent een nieuwe PR van dezelfde branch | spoor op de gesloten PR telt: voorwaarde geldt op de nieuwe PR (AC-4) | n.v.t. |
| Nieuwe branch met dezelfde inhoud, na een gesloten PR met Codex-punten | geen spoor op die branch: voorwaarde vervalt; bewuste omzeiling, restrisico (ADR 0069 Gevolgen); OV-5 | n.v.t. |
| Sessie verwijdert of bewerkt een Codex-commentaar onder het eigenaaraccount | het rolhek weigert dat nu niet; spoor kan verdwijnen; bewuste omzeiling, restrisico (ADR 0069 Gevolgen); OV-5 | n.v.t. |
| Reviews of inline-commentaar van de PR niet leesbaar (HTTP-fout) | voorwaarde geldt: geen merge (AC-4) | n.v.t. |
| PR van precies 400 regels | toegestaan (AC-2, AC-3) | n.v.t. |
| PR van 401 regels, verder agent-mergebaar | `agent-merge: nee`; de eigenaar merget, of de agent splitst in PR's onder de grens, elk met eigen verse review (AC-2) | n.v.t. |
| PR met een binair bestand (bijvoorbeeld een afbeelding onder `docs/`) | `agent-merge: nee`, `pr:merge` weigert (AC-2, AC-3); zie OV-4 | n.v.t. |
| Gegenereerd bestand in de PR (`src/web/routeTree.gen.ts`) | telt mee in `regels` | n.v.t. |
| Lockfile in de PR (`pnpm-lock.yaml`) | is een gate: al `nee` (agent-merge-niet-kritiek AC-1) | n.v.t. |
| Zuivere hernoeming | telt 0 regels; beide paden worden wel op de lijsten getoetst | n.v.t. |
| PR groeide na het diff-guard-oordeel (nieuwe push) | nieuwe diff-guard-run op de nieuwe head; `pr:merge` telt zelf opnieuw via REST (AC-3) | n.v.t. |
| `maxRegels` ontbreekt, is `"400"` of `0` | `agent-merge: nee` en geen merge (AC-1); `check-docs` rood (AC-6) | n.v.t. |
| `codex` is `"ja"` of ontbreekt | gelezen als `true`; `check-docs` rood bij `"ja"` (AC-1, AC-6) | n.v.t. |
| App zonder Codex | `codex: false` of `"indien-aanwezig"`; omvanggrens geldt (AC-4) | n.v.t. |
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

- **OV-1** — Telt een 👀 van Codex zonder afronding als spoor (dan wacht de agent tot Codex klaar is of de eigenaar merget),
  of niet (zoals het ontwerp: dan kan een agent-merge vallen in het venster waarin Codex nog bezig is)? Aanbeveling: geen
  signaal, zoals beslist; zonder tegoed laat Codex mogelijk alleen een 👀 staan en zou de agent-merge weer vastlopen. Het
  venster is een aanvaard restrisico; de steekproef en de terugval vangen het op (ADR 0069 Gevolgen).
- **OV-2** — Grens 400 regels of ruimer (Ona: < 1.000)? Aanbeveling: 400, omdat hier geen mens meekijkt; na de steekproef van
  tien kan de eigenaar de waarde in `.claude/gates.json` met één regel verruimen.
- **OV-3** — Telt de steekproef ook merges mét Codex-spoor? Aanbeveling: nee, alleen zonder; daar valt het vangnet weg.
- **OV-4** — Hoe ver reikt het Codex-spoor, en wat met binaire bestanden? Deze spec wijkt af van het oorspronkelijke ontwerp
  ("samenvatting met marker of 👍 op deze PR") en neemt elk commentaar, elke review en elk inline-commentaar van de bot mee,
  ook op andere PR's van dezelfde branch; een binair bestand sluit uit. Reden: beide falen dicht, en het smalle signaal liet
  de voorwaarde vervallen na sluiten en heropenen of bij alleen inline-punten (review van deze spec). Prijs: een
  Codex-melding "tegoed op" zonder marker blokkeert ook; dan merget de eigenaar. Alternatieven: alleen deze PR, of binaire
  bestanden naar bytes tellen. Aanbeveling: zoals de spec.
- **OV-5** — Verwijderen of bewerken van Codex-commentaar onder het eigenaaraccount, en een nieuwe branch met dezelfde
  inhoud: (a) aanvaarden als bewuste omzeiling en zo benoemen (ADR 0069 Gevolgen, zoals nu), of (b) het rolhek in een eigen
  PR `gh api -X DELETE/PATCH` op `issues/comments` en `pulls/comments` laten weigeren. Aanbeveling: (a) nu, (b) als
  roadmap-item als de eigenaar dat wil.
- **OV-6** — Steekproef: zonder teller (de eigenaar telt in de thread, zoals de spec) of een teller in `pr:merge` uit een
  marker op gemergde PR's? Deze spec wijkt af van "steekproef n/10": niets in de kit telt agent-merges, en een sessie
  onthoudt het niet, dus n zou verzonnen zijn. Aanbeveling: zonder teller nu; een teller als het tellen te weinig blijkt.
