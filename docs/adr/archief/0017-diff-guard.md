# 0017 — Diff-guard en de identiteit van de agent

Status: vervangen door 0045

## Context

De diff-guard is inhoudelijk al besloten (framework §10, ADR 0011 punt 9): raakt een PR een pad uit `gates` in `.claude/gates.json`, de
sleutel `scripts` in `package.json`, of wijzigt hij een bestaande test, dan faalt de check tenzij de PR het label `gate-wijziging` heeft én
de laatste beslissende review van een goedkeurder (niet de auteur) APPROVED is op exact de head-SHA. Hij draait in `guard.yml`
(`pull_request_target`, de versie van `main`; PR-code alleen als git-data). Wat de repo nu laat zien en het ontwerp bepaalt:

1. **De agent is de eigenaar.** Hij pusht en opent PR's met het account `BramLambertJansen`, dat ook de enige goedkeurder is
   (`goedkeurders` in `.claude/gates.json`). GitHub laat een auteur zijn eigen PR niet goedkeuren, dus "goedkeurder, niet de auteur" kan
   bij geen enkele PR van de agent slagen. Een strikte guard blokkeert dan elke gate-PR; een label alleen kan de agent met hetzelfde token
   zelf zetten (de deny-regel in `.claude/settings.json` geldt alleen in Claude Code). Daarom vraagt de agent het label nu niet meer.
2. **De bot-identiteit is besloten maar niet gebouwd.** ADR 0005: een GitHub App zonder `workflows`-recht en zonder admin; ADR 0006: tot
   die App bestaat, een tussentijdse ruleset met 0 goedkeuringen. De roadmap zet de App in stuk 6. De repo is publiek en van een
   persoonlijk account; een App en een ruleset op repo-niveau werken daar, een ruleset op organisatieniveau niet.
3. **Een review start geen `pull_request_target`.** Na een goedkeuring draait de guard pas opnieuw bij een nieuw event. `pull_request_review`
   draait de workflow uit de PR-branch: alleen veilig als de pusher geen `workflows`-recht heeft, en dat geldt pas met de App.
4. **De bouwstenen zijn er.** `.claude/gates.json` (gates, testpaden, `jsonGates`, goedkeurders), `scripts/kit/gates.mjs` en het
   globpatroon van het rolhek (`globMatch`, tabelgetest).

## Opties per vraag

**OV-1 — Volgorde van guard en App.**

- (a) Guard nu bouwen (script, tabeltests, `guard.yml`), nog niet verplicht; de eigenaar maakt intussen de App (OV-5); bij de overstap op
  de App wordt de guard een verplichte check. Gevolg: de logica is bewezen en zichtbaar voordat hij iets blokkeert.
- (b) Eerst de App, dan pas de guard. Gevolg: niets bewaakt de gate-paden tot beide er zijn; de App vraagt handwerk van de eigenaar.
- (c) Guard nu verplicht. Gevolg: blokkeert elke gate-PR (context 1), of vraagt een uitzondering die het doel ondergraaft.
- Aanbeveling: (a).

**OV-2 — Gedrag zolang de auteur zelf goedkeurder is.**

- (a) Strikt: de guard faalt (rood, maar niet verplicht). Gevolg: bijna elke PR is rood; rood gaat dan niets meer betekenen.
- (b) Overgang, afgeleid uit de feiten: is de auteur van de PR een goedkeurder, dan kan geen onafhankelijke goedkeuring bestaan; de guard
  slaagt met een waarschuwing en een samenvatting (welke gate-paden en tests geraakt zijn). Is de auteur geen goedkeurder (de App), dan geldt
  de volle regel. Geen schakelaar: de overgang eindigt vanzelf zodra de agent als App pusht.
- (c) Label genoeg zolang de App er niet is. Gevolg: de agent kan het label met hetzelfde token zelf zetten (context 1).
- Aanbeveling: (b). De samenvatting in de check maakt zichtbaar wat de eigenaar moet lezen; dat vervangt de lijst in de PR-beschrijving niet.

**OV-3 — Opnieuw draaien na een goedkeuring.**

- (a) `guard.yml` op `pull_request_target` met `opened`, `reopened`, `synchronize`, `labeled` en `unlabeled`. Werkwijze van de eigenaar:
  eerst goedkeuren, dan het label zetten; dat event draait de guard op de goedgekeurde head. Een nieuwe push laat hem opnieuw falen.
- (b) Ook `pull_request_review`. Gevolg: draait de workflow uit de PR-branch (context 3); pas veilig met de App zonder `workflows`-recht.
- (c) Handmatig "Re-run" door de eigenaar na de goedkeuring.
- Aanbeveling: (a), met (c) als uitweg. (b) heroverwegen na de App.

**OV-4 — Wat telt als "bestaande test gewijzigd".**

- (a) Elk pad dat matcht met `testpaden` en in de diff gewijzigd, verwijderd of hernoemd is ten opzichte van de merge-base (status
  `M`, `D`, `R`, `T`); toevoegen (`A`) is vrij. Hernoemen telt als wijzigen: anders ontsnapt een verwijderde test via een rename.
- (b) Inhoudelijk: alleen als een `test(`/`it(`-geval verdwijnt of `skip` krijgt (zoals het rolhek lokaal). Gevolg: tekstheuristiek in de
  grens die juist niet te misleiden mag zijn.
- Aanbeveling: (a). Het rolhek blijft lokaal fijnmaziger; de guard is grof en onomzeilbaar.

**OV-5 — De GitHub App (stuk 6, nodig voor de verplichte guard).**

- Rechten: `contents: write`, `pull_requests: write`, `issues: write` (labels, commentaar), `metadata: read`, `checks: read`, `actions: read`.
  Geen `workflows`, geen `administration`, geen `secrets`. Een goedkeuring door de App telt niet: hij staat niet in `goedkeurders`.
- Sleutel: buiten de repo (`~/.config/template-agent/app.pem`, modus 600), nooit in de sandbox leesbaar. Een token van één uur via een
  script zonder dependency (`node:crypto`, JWT RS256) dat als git-credential-helper en als `GH_TOKEN` dient. Het script hoort in de
  App-PR, niet in deze.
- Pas met de App: ruleset met code-owner-review en 1 goedkeuring (ADR 0006), en de guard als verplichte check van GitHub Actions.
- Aanbeveling: zo, in een eigen PR in stuk 6. De eigenaar maakt de App aan (handwerk op github.com); de agent levert het stappenplan.

## Besluit

Besluiten van de eigenaar (2026-10-10): bij elke vraag de aanbeveling.

| Vraag | Besluit | Verworpen |
|---|---|---|
| OV-1 Volgorde | (a) guard nu bouwen, nog niet verplicht; verplicht bij de overstap op de App | (b) eerst de App; (c) nu verplicht |
| OV-2 Overgang | (b) is de auteur een goedkeurder: slagen met waarschuwing en samenvatting; anders de volle regel, zonder schakelaar | (a) strikt; (c) label genoeg |
| OV-3 Opnieuw draaien | (a) `pull_request_target` met `labeled` e.a.; eerst goedkeuren, dan label; (c) Re-run als uitweg | (b) `pull_request_review` (tot de App) |
| OV-4 Gewijzigde test | (a) status `M`, `D`, `R`, `T` op een testpad; toevoegen vrij | (b) inhoudelijk |
| OV-5 GitHub App | Rechten, sleutel en tokenscript zoals hierboven, in een eigen PR in stuk 6 | — |

De volgende PR bouwt:

- `scripts/kit/diff-guard.mjs`: een pure functie (diff met status per pad, `package.json` voor en na, labels, reviews, auteur, head-SHA,
  `.claude/gates.json`) → `{ uitslag: 'groen' | 'overgang' | 'rood', redenen, geraakt }`, met een tabeltest per geval: gate-pad,
  `package.json` alleen buiten `scripts`, nieuwe test, gewijzigde/verwijderde/hernoemde test, label zonder review, review op een oude SHA,
  review door de auteur, `CHANGES_REQUESTED` na `APPROVED`, `COMMENTED` na `APPROVED` (niet beslissend), en paden met spatie of newline.
- `.github/workflows/guard.yml`: checkout van `main` voor de scripts; de PR alleen als git-objecten (`git fetch` van de head-SHA, geen
  checkout van werkbestanden, geen `pnpm install`); `permissions: { contents: read, pull-requests: read }`; base-repo en -branch gecontroleerd,
  beide SHA's 40 tekens. Reviews en labels via de API met `GITHUB_TOKEN`.

## Alternatieven

- **Alleen CODEOWNERS met verplichte code-owner-review.** Doet hetzelfde voor gate-paden, maar kan niet zien of een bestaande test wijzigt
  (CODEOWNERS kent geen diff-status) en werkt pas met de App (context 1).
- **De guard als stap in `ci.yml`.** Draait de workflow van de PR zelf: een PR kan de guard dan uitzetten.

## Gevolgen

- Beschermde paden met akkoord van de eigenaar: `scripts/kit/` en `.github/workflows/guard.yml` (volgende PR), later `.github/settings/`.
- De memo "label niet vragen tot de diff-guard bestaat" vervalt pas als de guard verplicht is, dus met de App.
- `docs/roadmap.md` stuk 4 krijgt de guard als gebouwd-maar-niet-verplicht; stuk 6 de App als voorwaarde om hem verplicht te maken.
