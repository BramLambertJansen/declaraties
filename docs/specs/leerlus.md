---
status: goedgekeurd
namespace: leerlus
---

# Leerlus: leerpunten uit apps terug naar de template (stap 1)

## Doel

Een les uit het bouwen van een app komt als issue met label `leerpunt` in de template-repo terecht, met reproductie en
zonder appdata, zodat de eigenaar haar kan oppakken en de volgende app ervan profiteert, zonder dat altijd-geladen proza groeit.

**Toets aan framework §1 (P1, punt 5 en 9).** Aanleiding: ST09-08, ST09-09 en ST09-11 in
[het ST-09-protocol](../operations/st-09-praktijkproef.md) vragen dat templatebevindingen terugkomen, maar er is geen vast
kanaal; de slotvraag van `opleveren` heeft geen vervolg. Nulmeting: nul teruggebrachte templateverbeteringen uit apps.
Besluit: [ADR 0059](../adr/0059-leerlus-van-app-naar-template.md) (eigenaar, 2026-10-27). Geen nieuw roadmap-item: uitvoering binnen ST-09.

## Rollen en wie wat ziet

| Rol | Doet | Mag niet |
|---|---|---|
| hoofdsessie (app of template) | verzamelt in de slotstap de signaalmomenten van de sessie, beslist per les generiek of app-specifiek, dient een generiek leerpunt in met `gh issue create` en toont de tekst in de eindmelding | zonder vraag een issue aanmaken in een andere repo of zonder label `leerpunt` (dat blijft de gewone permissievraag); triageren (een afspraak: alleen de permissievraag houdt het tegen, het rolhek dwingt het niet af) |
| reviewer | noemt bij elke blokkerende bevinding of het een leerpunt is, en welke soort | iets schrijven of indienen (ongewijzigd) |
| overige subagents | niets nieuws | `gh issue create` en elke andere schrijvende `gh issue`-opdracht (deny); schrijvende `gh api` blijft deny (bestaande regel) |
| eigenaar | maakt het label `leerpunt` aan, triageert, sluit, maakt een roadmap-item met het issue als aanleiding | — |

**Signaalmomenten en hun bron** (ADR 0059 punt 1); de slotstap loopt ze alle vijf af:

| Moment | Bron in de sessie |
|---|---|
| Slotvraag na de merge | de bestaande slotregel van `opleveren` |
| Derde CI-ronde op dezelfde oorzaak | stopgrond (b) van `opleveren`; CI-rondes uit `pnpm meting` |
| Eigenaarcorrectie | correcties uit `pnpm meting` en de berichten van de eigenaar in de sessie |
| Blokkerende reviewbevinding | de regels `Leerpunt: ja (<soort>)` in het reviewerrapport |
| Tweede mislukte correctiepoging | de stop-en-vraag uit `CLAUDE.md` ("Na twee mislukte correctiepogingen") in de sessie |

De template-repo is de waarde van `onderhoud.repository` in `.claude/gates.json` (één bron; in een app geërfd via de
template-merge). Het issue is zichtbaar voor iedereen met leesrecht op de template-repo; daarom geen appdata.

## Datawijzigingen (met grants)

n.v.t. — geen database. Nieuwe bestanden en regels staan onder "Raakt ook".

## Routes en foutcodes

n.v.t. — geen HTTP-route, permissie of foutcode. De rolhekuitslagen staan in de randgevallen.

## Kopieer de vorm van

n.v.t. voor `docs/gouden-pad.md` (geen resource); railwerk volgt de bestaande vormen:

- `.claude/skills/opleveren/SKILL.md` — de vaste slotregel na het opruimen; de leerpuntstap komt direct daarna, in dezelfde skill
- `.github/pull_request_template.md` — kopjes als vaste structuur die een agent invult
- `rails/hooks/lib/rolhek.mjs` — `ghForbidden` en de subagentregel voor `gh pr create` in `forbidden`; uitbreiden, geen tweede hek
- `test/hooks/rolhek.test.ts` — tabeltest met echte stdin-payloads per rol
- `test/rails/opleveren-skill.test.ts` — tekstasserties op skill en framework

## Hergebruik en UX

- Bestaande componenten: n.v.t. — geen app-UI. Hergebruikt: GitHub issue forms, `gh issue create`, `pnpm meting`
  (tellingen), de slotvraag van `opleveren`, `onderhoud.repository`. Geen nieuwe dependency.
- Staten per scherm: n.v.t. — GitHub toont het formulier; de CLI-uitkomst is aangemaakt (issue-URL), gevraagd of geweigerd.
- Alle zichtbare tekst letterlijk, voor `.github/ISSUE_TEMPLATE/leerpunt.yml` (issue form, `labels: [leerpunt]`, titel `Leerpunt: `):
  - Naam: `Leerpunt`. Beschrijving: `Een les uit het bouwen van een app die de template kan verbeteren. Alleen in de template-repo; geen appcode, appdata of geheimen.`
  - `soort` (keuzelijst, verplicht), label `Soort`, opties in deze volgorde: `Doorgeglipte fout`, `Herhaald handwerk`,
    `Onduidelijke instructie`, `Ontbrekend component`, `Wrijving in de werkstraat`, `Valkuil zonder check`,
    `Efficiëntie van de code`, `Kracht van de coding agent`, `Tokenefficiëntie`.
  - `bron` (tekst, verplicht), label `Bron`, uitleg: `App-PR-nummer, checknaam of signaalmoment (slotvraag, derde CI-ronde, eigenaarcorrectie, reviewbevinding, tweede correctiepoging). Geen appdata, logs of schermafbeeldingen.`
  - `kosten` (tekst, verplicht), label `Kosten`, uitleg: `Alleen tellingen uit pnpm meting of de PR: CI-rondes, beurten, prompts, minuten. Onbekend is onbekend.`
  - `reproductie` (tekst, verplicht), label `Generieke reproductie`, uitleg: `Stappen op een verse kopie van de template, zonder appcode of appdata. Zonder reproductie geen leerpunt.`
  - `ladder` (keuzelijst, verplicht), label `Voorstel voor de plek`, opties: `Type`, `Check`, `Gouden pad of generator`, `Skill`, `Padregel`, `AGENTS.md`.
  - `template_sha` (regel, verplicht), label `Template-SHA van de app`, uitleg: `Uitvoer van git merge-base HEAD template/main (40 tekens); in de template zelf: HEAD.`
  - `eerder` (regel, optioneel), label `Eerder`, uitleg: `Bij een terugkerende fout: eerder: #nnn. Anders leeg.`
- Via de CLI gebruikt de agent dezelfde opbouw als GitHub een ingevuld formulier weergeeft: per veld `### <label>` met de
  waarde eronder, in de volgorde hierboven. Titel: `Leerpunt: <soort>: <één zin>`.
- Slotstap in `opleveren` (na de bestaande slotregel), letterlijk: `Loop de signaalmomenten van deze sessie af: slotvraag, derde CI-ronde, eigenaarcorrectie (pnpm meting), blokkerende reviewbevinding (Leerpunt: ja), tweede mislukte correctiepoging. Per les: Leerpunt? Generiek: dien het in volgens het sjabloon leerpunt (gh issue create naar onderhoud.repository met --label leerpunt) en toon de tekst. Alleen voor deze app: een padregel, spec of ADR (vanaf 0100) in de app, geen issue. Niets: zeg "geen leerpunt".`
- Reviewer, per blokkerende bevinding de regel: `Leerpunt: ja (<soort>)` of `Leerpunt: nee`.
- Focusvolgorde en toetsenbord: n.v.t. — geen eigen UI.

## Acceptatiecriteria

- **leerlus/AC-1** — `.github/ISSUE_TEMPLATE/leerpunt.yml` heeft precies de velden `soort`, `bron`, `kosten`, `reproductie`,
  `ladder`, `template_sha` en `eerder` met de labels uit "Hergebruik en UX"; alle behalve `eerder` zijn verplicht; `soort` heeft
  exact de negen opties en `ladder` de zes, in die volgorde; `labels` is `[leerpunt]`. Een ontbrekend, extra of hernoemd veld,
  een ontbrekende optie of een niet-verplicht verplicht veld laat de test falen.
- **leerlus/AC-2** — Het sjabloon vraagt geen appdata: buiten de zeven veld-id's is er geen invoerveld, geen veld heeft het
  type voor bijlagen of logs, en de beschrijving en de uitleg van `bron` en `reproductie` sluiten appcode, appdata of geheimen
  uitdrukkelijk uit. Een extra veld (bijvoorbeeld `appnaam` of `logs`) laat de test falen.
- **leerlus/AC-3** — De skill `opleveren` houdt de bestaande slotregel en heeft direct daarna de slotstap uit "Hergebruik en
  UX", met `gh issue create`, `--label leerpunt`, `onderhoud.repository` en de uitzondering voor een app-specifieke les
  (padregel, spec of ADR vanaf 0100, geen issue). De koppen voor de CLI-tekst in de skill zijn gelijk aan de labels van het
  sjabloon, in dezelfde volgorde; de test vergelijkt beide bestanden. Ook de stopgrond (b) verwijst naar deze stap.
- **leerlus/AC-4** — `.claude/agents/reviewer.md` vraagt per blokkerende bevinding de regel `Leerpunt: ja (<soort>)` of
  `Leerpunt: nee`, met dezelfde soortenlijst als het sjabloon (de test vergelijkt).
- **leerlus/AC-5** — Rolhek, hoofdsessie: `gh issue create` met `--repo`/`-R` exact gelijk aan `onderhoud.repository`
  (hoofdletterongevoelig, vorm `<owner>/<repo>`) en precies één label `leerpunt` geeft geen deny en geen ask. Ontbreekt
  `--repo`, wijst het naar een andere repo of andere vorm (URL, host), ontbreekt het label, staat er een ander label naast,
  of zet het commando `GH_REPO`/`GH_HOST`, dan is de uitslag ask met een reden.
- **leerlus/AC-6** — Rolhek, elke subagent (ook een onbekende): `gh issue create` geeft deny, ook met de juiste repo en het
  juiste label.
- **leerlus/AC-7** — Rolhek, elke subagent: `gh issue edit|close|reopen|delete|transfer|lock|unlock|pin|unpin|comment|develop`
  geeft deny, en `gh api` met een schrijvende methode naar `…/issues…` blijft deny (bestaande regel, nu ook in de tabeltest);
  `gh issue view|list|status` blijven toegestaan. Voor de hoofdsessie verandert de uitslag van deze opdrachten niet.
- **leerlus/AC-8** — `.claude/settings.json` staat de exacte vorm `gh issue create --repo <onderhoud.repository> --label leerpunt …`
  toe (geen permissieprompt); elke andere `gh issue create` valt niet onder een allow-regel. Een test leest de regel en
  vergelijkt de repo met `onderhoud.repository`.
- **leerlus/AC-9** — `docs/framework.md` §10 (Template-updates naar een app) en `docs/operations/st-09-praktijkproef.md`
  (bij ST09-08, ST09-09 en ST09-11 en in het eindrapport) noemen het label `leerpunt` als kanaal met een link naar ADR 0059;
  framework §8 (rolhektabel) noemt de nieuwe `gh issue`-regels. Het protocol zegt bij ST09-09 expliciet dat het bewijs de
  keten leerpunt-issue → roadmap-item met dat issue als aanleiding → template-PR met merge-commit is. Ontbreekt een van de
  vermeldingen of die keten, dan faalt de test.
- **leerlus/AC-11** — De slotstap van `opleveren` noemt alle vijf signaalmomenten (slotvraag, derde CI-ronde,
  eigenaarcorrectie, blokkerende reviewbevinding, tweede mislukte correctiepoging) met hun bron uit de tabel onder "Rollen en
  wie wat ziet" (`pnpm meting` voor CI-rondes en correcties, `Leerpunt: ja` uit het reviewerrapport). Ontbreekt een moment of
  zijn bron, dan faalt de test.
- **leerlus/AC-10** — `docs/operations/st-09-praktijkproef.md` vraagt in het eindrapport de drie tellingen uit de
  meetafspraak onder "Testplan" (totaal, opgepakt, herhalingen), met het commando `gh issue list --label leerpunt --state all`
  en de nulmeting 0. Ontbreekt een telling, het commando of de nulmeting, dan faalt de test.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Les geldt alleen voor deze app | Geen issue; voorstel voor padregel, spec of ADR (vanaf 0100) in de app | n.v.t. |
| Geen reproductie zonder appdata mogelijk | Geen issue; in de eindmelding "geen leerpunt: niet generiek te reproduceren" | n.v.t. |
| Label `leerpunt` bestaat nog niet | `gh issue create` faalt; de agent meldt het, maakt het label niet zelf aan | n.v.t. |
| Fout keert terug na een opgepakt leerpunt | Nieuw issue met `eerder: #nnn`; het oude issue blijft dicht | n.v.t. |
| Sessie in de template zelf | Zelfde stap; `template_sha` is `HEAD`, bron is de template-PR | n.v.t. |
| Formulier verschijnt ook in de app-repo (via de template-merge) | De beschrijving zegt "Alleen in de template-repo"; de eigenaar verwijst een app-issue door | n.v.t. |
| PR wordt nooit gemerged | Stopt de lus op stopgrond (b), dan voert `opleveren` de slotstap direct uit, met de momenten tot dan toe; anders volgt de slotstap pas bij het opruimen na de merge | n.v.t. |
| Andere `gh issue create` door de hoofdsessie (geen leerpunt) | Gewone permissievraag aan de eigenaar; geen deny | n.v.t. |
| Body bevat toch appdata | Niet technisch af te dwingen; de agent toont de tekst, de eigenaar bewerkt of sluit bij triage | n.v.t. |
| Runtime zonder Claude-hooks (Codex, cloud) | Rolhek en permissieregels gelden niet; de beperking tot repo en label is daar een afspraak | n.v.t. |
| Eigenaar pakt een leerpunt op | Roadmap-item met `aanleiding: #nnn` (issue in dezelfde repo; `check:roadmap` accepteert `#nnn` al) | n.v.t. |

## Raakt ook

- Nieuw: `.github/ISSUE_TEMPLATE/leerpunt.yml` (beschermd pad `.github/`, eigenaarakkoord).
- `.claude/skills/opleveren/SKILL.md`, `.claude/agents/reviewer.md`, `.claude/settings.json` (`altijdVragen`),
  `rails/hooks/lib/rolhek.mjs`: beschermde paden, diff-guard met label `gate-wijziging` en eigenaarreview. Rolhekwijziging
  werkt pas na de merge (anker op main).
- `docs/framework.md` §8 en §10, `docs/operations/st-09-praktijkproef.md`; `check:docs-drift` (geen `src/`).
- `check-docs` regel 1: in `.claude/**` geen repo-naam `<owner>/<repo>` tussen backticks (leest als pad); verwijs naar `onderhoud.repository`.
- Geen `check:migrations`, `check:secdef`, `test:db`, `test/security/resources.ts` of permissietest: geen database of route.
- `specplicht`: niet geraakt (geen migratie, route, permissie of pagina).

## Buiten scope

`CLAUDE.md` en `AGENTS.md` (geen groei van altijd-geladen proza); een `pnpm leerpunt`-script; een periodieke oogst van open
leerpunten; een terugkeermeting; een check dat een issue-URL als aanleiding telt; het aanmaken van het label door de agent;
telemetrie naar buiten; een register in de app of een tweede register in de template; automatische wijziging van de template.
Voor de hoofdsessie: andere `gh issue`-opdrachten en schrijvende `gh api`-calls naar issues (die ook PR-reacties raken)
blijven zoals ze zijn; deze spec regelt alleen `gh issue create` met label `leerpunt`.

## Testplan

Fase 1, ST-09. De tester schrijft vóór de bouw, rood op asserties:

- `test/rails/leerpunt-sjabloon.test.ts` — AC-1, AC-2, AC-3 (koppen gelijk), AC-4: leest het sjabloon regelgebaseerd
  (geen YAML-dependency; het sjabloon gebruikt één vaste opmaak) en vergelijkt met skill en reviewer.
- `test/rails/opleveren-skill.test.ts` uitbreiden (toevoegen, niets wijzigen) — AC-3 slotstap en stopgrond (b); AC-9; AC-11.
- `test/hooks/rolhek-leerpunt.test.ts` — AC-5 t/m AC-7 met echte stdin-payloads: juiste vorm, `-R`, hoofdletters, URL-vorm,
  andere repo, geen label, `--label leerpunt,x`, twee `--label`, `GH_REPO=`, `GH_HOST=`, `bash -c`, subagent en onbekende rol;
  voor de hoofdsessie ook dat `gh issue close` en `gh api -X POST …/issues/1/comments` geen nieuwe deny krijgen.
- `test/rails/sandbox-settings.test.ts` of een nieuw bestand — AC-8.
- `test/rails/opleveren-skill.test.ts` (dezelfde uitbreiding) — AC-10: de protocoltekst voor de tellingen.

**Meetafspraak** (ADR 0059 punt 7, P6; geen acceptatiecriterium): na ST-09 telt het eindrapport met
`gh issue list --label leerpunt --state all` op de template-repo het totaal, het aantal opgepakte (met een roadmap-item dat
het issue als aanleiding heeft) en het aantal herhalingen (met `eerder:`), tegen de nulmeting 0. De reviewer van het
ST-09-rapport toetst die tellingen.

Daarna `pnpm gate:fast` via pre-push, CI groen op de juiste SHA, eigenaarreview en -merge. Eén keer handmatig in de template:
een proefleerpunt indienen en zien dat formulier en CLI-tekst gelijk worden weergegeven (daarna sluit de eigenaar het).

## Open vragen

- **OV-1 ✅ besloten** — Kanaal, soorten, velden, wie indient (hoofdsessie) en wie triageert (alleen de eigenaar): ADR 0059.
- **OV-2** — Issue form (`.yml`) of markdown-sjabloon (`.md`)? `gh issue create --template` vult alleen markdown-sjablonen;
  een form dwingt in de webinterface verplichte velden af. Aanbeveling: `.yml` zoals besloten, met de CLI-tekst in de
  skill en een test die de koppen gelijk houdt (AC-3).
- **OV-3** — `aanleiding: <issue-url>` of `aanleiding: #nnn` in de roadmap? Het issue staat in dezelfde repo, en
  `check:roadmap` accepteert `#nnn` al. Aanbeveling: `#nnn`; een check voor de URL-vorm vervalt dan als stap 2.
- **OV-4** — Mag een subagent (reviewer) het leerpunt zelf indienen? Aanbeveling: nee; de reviewer schrijft niets, de
  hoofdsessie verzamelt het bij de slotvraag (AC-4, AC-6).
