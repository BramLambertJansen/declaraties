# Inventaris tegen de principes P1–P7 (2026-10-15)

Stap 1 van de opdracht "autonomie zonder kwaliteitsverlies", gecontroleerd op `origin/main` `01cca15`. Dit is ook de
eerste deel van de opruiminventaris die ST-14 vraagt (`docs/roadmap.md:524`): roadmap en documentatie. Codecommentaar, gebruikers- en mailteksten, scripts en GitHub-templates (`docs/roadmap.md:524-527`) zijn hier niet geïnventariseerd; die blijven open onder ST-14. Deze PR verwijdert niets. Elk voorstel
is een voorstel; de kolom **Besluit** vult de eigenaar in.

Principes: **P1** bewijs vóór uitbreiding · **P2** rails blijven · **P3** prompts alleen voor wat werkt vóór review ·
**P4** één ronde per besluit · **P5** wat een check kan, is een check · **P6** meten vóór en na · **P7** één bron per feit,
over de huidige werking.

Acties: houden · herschrijven · samenvoegen · parkeren (met "terug als") · vervallen. "Status" betekent hier altijd: via
`pnpm docs:status`, met eigenaarbesluit of bouwbewijs (ADR 0027). Niets in deze lijst stelt voor tests, fixtures,
migraties, gates, veiligheidsregels, ADR's of `.claude/decisions.json` te verwijderen.

## Correcties op de opdracht

De opdracht noemde bekende kandidaten; bij controle wijken deze af:

1. **"framework §1 regel 4"** is `docs/framework.md:4` (inleiding: "Wijzigen alleen via een PR met ADR"). §1 punt 4 is
   "Lokaal is gelijk aan productie" (`docs/framework.md:13`) en botst nergens mee. ADR 0029 noemt de juiste regel
   (`docs/adr/0029-snellere-beslisroute.md:68`).
2. **ADR 0023 punt 2** is `pnpm tokens`: tokens en context per sessie (`docs/adr/0023-tokenzuinige-werkstraat.md:25`), niet
   prompts of weigeringen. `scripts/kit/tokens.mjs` bestaat niet. De meting uit stap 3 is dus een verbreding van punt 2.
3. **ADR 0030 en 0031 zijn `geaccepteerd`**, niet voorgesteld. "Parkeren" gaat over het bouwen van hun PR 2, niet over de
   ADR-status. Ze staan nu niet op de roadmap (geen treffer voor `0030`/`0031` in `docs/roadmap.md`).
4. **De spiegel in `check-docs`** staat in `mirrorViolations` (`scripts/kit/check-docs.mjs:202-226`): CODEOWNERS ↔ `ask`,
   min `OWNERS_ONLY` (testpaden en `docs/specs/**`, `scripts/kit/check-docs.mjs:21`). `ask` telt 64 regels, ook commando's.
5. **Het audit-log-besluit** (`docs/roadmap.md:35`) staat niet open omdat er werk ontbreekt. Het staat open omdat ADR 0021
   "geaccepteerd (agent, onder mandaat; ter herziening)" is (`docs/adr/0021-audit-log.md:3`). Dat is een eigenaarbesluit.

## A. Roadmap — dubbel en gedateerd (P7)

| # | Kandidaat | Principe | Waarom | Actie | Hangt af van | Risico | Besluit (zie onder) |
|---|---|---|---|---|---|---|---|
| R-1 | Sectie "Agenttaken uit de starter-beoordeling" ST-01..ST-14 | P7 | Werkt fase-items opnieuw uit, die ook blijven staan: ST-02 ↔ 3e (`roadmap.md:357` ↔ `:171`), ST-03 ↔ stuk 7 (`:372` ↔ `:299`), ST-04 ↔ Beslissingen/3f (`:385` ↔ `:35`, `:197`), ST-05 ↔ `:37`, ST-09 ↔ `:280`, ST-12 ↔ `:201`, `:276`, ST-01 ↔ `:268`–`:273`, ST-08 ↔ fase 2 `:313` | samenvoegen in stap 4: één item per onderwerp; de scope en "Klaar als" uit ST-n gaan mee in het item | `check:roadmap`; `roadmap-item.mjs` (zoekt open items); `docs/specs/audit-log.md:13`, `:262`, `roadmap-vinkjes.md`, ADR 0025/0029, reviews en `nieuwe-app.md` noemen ST-nummers | ST-verwijzingen breken; behoud de ST-id als label in het samengevoegde item | |
| R-2 | "Stand 2026-10-12" in ST-02, ST-04, ST-06, ST-07 | P7 | Verouderd: ST-04 (`:389`) zegt dat bewijs voor audit ontbreekt, maar #128 is gemerged; ST-07 (`:434`) noemt toasts open, maar #129 is gemerged | herschrijven: status alleen in vinkje, specstatus en PR-nummer | fixture `test/rails/fixtures/roadmap/st-item/` gebruikt "Stand 2026-10-12" (`test/rails/check-roadmap.test.ts:163`); stap 4-regel 3 moet die fixture respecteren | nieuwe check faalt op bestaande fixture; fixture eerst beoordelen (niet verwijderen) | |
| R-3 | Item "ADR 0027" bovenaan fase 1 (`roadmap.md:63`) | P7 | ADR 0027 is geaccepteerd (2026-10-13) en gebouwd in #130 en #144; de specs `taakmandaat-frameworkwerk` en `taakmandaat-vervolg` staan nog op `goedgekeurd` | afvinken met bewijs (#130, #144); beide specs naar `gebouwd` via `pnpm docs:status --pr` | `check:roadmap`, `check-document-status` (bouwbewijs, ADR 0031 "Gevolg voor gebouwd") | bouwbewijs op een oude SHA kan falen; dan eerst `origin/main` mergen | |
| R-4 | Spec `audit-log` op `goedgekeurd` (`docs/specs/audit-log.md:2`) | P7 | Alle drie deel-PR's (A–C, `audit-log.md:23-31`) zitten in #128 | spec naar `gebouwd` via `pnpm docs:status --pr 128`; ST-04-audit afvinken | idem R-3; README:19 | idem R-3 | |
| R-5 | Besluit "Audit log" (`roadmap.md:35`), "AVG" (`:37`), "Achtergrondtaken" (`:30`) | P7 | Open vanwege "ter herziening", niet vanwege ontbrekend werk; de toelichting zegt "geaccepteerd" | herschrijven: één regel "ADR 00xx — ter herziening door de eigenaar" | ADR 0018–0022, 0024 | geen | |
| R-6 | Werk dat wel gebeurd is maar niet op de roadmap staat: ui-kit-basics (#145), ui-collections (#150), ui-data-display (voorstel), ADR 0029/0030/0031 | P7 | Geen treffer in `docs/roadmap.md`; de roadmap toont de werkelijke volgorde dus niet | toevoegen: gebouwd als afgevinkt met PR; open als item (zie B) | — | geen | |
| R-7 | "Volgorde vanaf 2026-10-10" (`roadmap.md:70-76`) | P1 | Zet de proef-app (punt 4) vóór uitbreiding; daarna kwamen #129, #131, #145, #146, #150, #151, #152 en vier meta-ADR's | vervalt als tekst; wordt `## Nu` met ST-09 op 1, afgedwongen door `check:roadmap` (stap 4) | stap 4 | geen | |
| R-8 | Werkwijze-blok ST (`roadmap.md:333-342`) | P7 | Herhaalt AGENTS.md, framework §8 en de DoD | samenvoegen: één verwijsregel | — | agentinstructie verdwijnt uit roadmap-context; staat al in AGENTS.md | |

## B. Roadmap — uitbreiding vóór de proef-app (P1)

Voorstel: parkeren onder `## Geparkeerd` met een "terug als". Niets verdwijnt.

| # | Kandidaat | Waarom | Terug als (voorstel) | Hangt af van | Risico | Besluit (zie onder) |
|---|---|---|---|---|---|---|
| B-1 | Spec `ui-data-display` (`voorstel`; mandaatrecord voor `codex/ui-data-display` op main via #152) | Uitbreiding zonder app-aanleiding. **De eigenaar vroeg hier zelf om** (`docs/specs/ui-data-display.md:10`). Let op: het record staat op `goedgekeurd`, de spec op `voorstel` | de proef-app een tabel, tabs, galerij of carousel nodig heeft | `.claude/decisions.json` (record blijft) | geen; record blijft geldig of de eigenaar laat het vervallen | **eigenaarvraag** |
| B-2 | Vier toast-opvolgingen (`roadmap.md:156-163`) | Verbeteringen zonder gemeten probleem; WCAG 2.2.1 (pauze, fout blijft staan) is wel een toegankelijkheidsfout | WCAG-deel: houden in `Volgende`. Rest: de proef-app toasts gebruikt | `.claude/rules/web.md` | WCAG-punt parkeren laat een bekende a11y-fout staan | |
| B-3 | Screenshot-baselines (`:152`) | Geen aanleiding | een visuele regressie doorglipt | — | geen | |
| B-4 | Rest ST-07 (`:431`) | Zegt zelf "op basis van de proef-app" | ST-09 heeft ontbrekende patronen vastgelegd | — | geen | |
| B-5 | ST-06 generator CRUD (`:416`) | Zegt zelf "na de proef-app" | ST-09 klaar | ADR 0016 | geen | |
| B-6 | ST-08, ST-11, ST-12, ST-13 | P1/P2-items zonder app | ST-08: eerste app naar staging; ST-11/13: concrete app-behoefte; ST-12: eerste template-update (ST-09) | — | geen | |
| B-7 | sonarjs, better-tailwindcss, squawk (`:80`, `:212`, `:234`) | Nieuwe dependency/tool zonder aanleiding; staat al "op aanleiding" | een fout die deze tool had gevangen glipt door | ratchet | geen | |
| B-8 | ADR 0030 PR 2 (merge-modus) | Meta-werk; agent-merge vóór bewezen proef-app | criteria uit de opdracht §6: ≥ 10 feature-PR's zonder gevolgfout, AC-check en risico-overzicht actief, ST-01 besloten | `opleveren/SKILL.md:27`, `agent-doorloop.md` | geen | |
| B-9 | ADR 0031 PR 2 (twee jobs, de eigenaar pusht) | Overgangsfase; PR 1 (#154) dekt de leesbaarheid | ST-01 besloten, of een guard-uitslag misleidt opnieuw (meting) | `agent-doorloop.md:115` | `gebouwd` na PR 2 eist extra check (ADR 0031:132) | |
| B-10 | Focus na lazy route (`:192`) | Bekende fout, geen uitbreiding | houden in `Volgende` (fout, geen capability) | — | — | |
| B-11 | Fase 1 3e-rest (backupcodes, uitnodiging intrekken, resetlink), versie/build-SHA, `security.txt`, LICENSE, ontwikkelplatform | Basis, geen rail; de meeste wachten op een eigenaarwaarde | `Volgende`; LICENSE, `security.txt`, platform: eigenaarbesluit | — | — | |

## C. Overige documenten

| # | Kandidaat | Principe | Waarom | Actie | Hangt af van | Risico | Besluit (zie onder) |
|---|---|---|---|---|---|---|---|
| D-1 | ADR 0018–0022 en 0024, specs `accountbeheer-uitbreiding`, `eigen-account`, `rate-limit` (en `lijstpagina`, volgens W-6) "ter herziening" | P7 | Sinds 2026-10-12 open (`docs/reviews/2026-10-12-werkstraat.md:43`); `lijstpagina` noemt het niet in zijn frontmatter; "ter herziening" staat alleen in het frontmatter-commentaar, dus `feiten.mjs` toont de ADR's als `geaccepteerd`, `accountbeheer-uitbreiding` als `goedgekeurd` en `eigen-account` en `rate-limit` als `gebouwd` | **open eigenaarbesluit**; de agent beslist niet | `check-docs` statuswoordenlijst (werkstraat-review :485) | — | **eigenaar** |
| D-2 | ADR 0023 (`voorgesteld`) | P1/P6 | Alleen punt 2 (meten) is nodig; punten 1, 3–9 zijn niet gebouwd en deels achterhaald (agent `onderzoek`, `pnpm stand`) | punt 2 (verbreed, zie correctie 2) gaat naar ADR 0029 punt "Meten"; 0023 naar `vervallen` of `vervangen door 0029` | stap 2; ADR 0029 punt 6 meet al per besluit | informatie in 0023 blijft in de ADR zelf staan | |
| D-3 | `docs/framework.md:4` "Wijzigen alleen via een PR met ADR" | P4 | Botst met ADR 0029 punt 4 (ADR-drempel) | herschrijven in stap 5, pas na acceptatie van 0029 | stap 2 | — | |
| D-4 | `ask` in `.claude/settings.json` spiegelt CODEOWNERS min `OWNERS_ONLY` (testpaden, `docs/specs/**`); `check-docs` dwingt dat af | P3 | Een prompt voor bijvoorbeeld `docs/roadmap.md` of `eslint.config.*` voegt niets toe dat de PR-review niet al ziet | stap 2 (lijst `voorReview`) en stap 7; nu niets wijzigen | `mirrorViolations`, `gates.json`, rolhek, `test/rails/sandbox-settings.test.ts` | afzwakken mag niet (P2): CODEOWNERS en diff-guard blijven gelijk | |
| D-5 | `docs/framework.md` §10 "Meten" (`:441-444`) | P6 | "dezelfde drie testopdrachten" bestaan niet als vast script | herschrijven na stap 3 | stap 3 | — | |
| D-6 | `README.md:19` "auditlogging … staan op de roadmap" | P7 | Gebouwd in #128 | herschrijven | `app:init` gebruikt README | `app-init.test.ts` kan op tekst rekenen; controleren | |
| D-7 | `AGENTS.md:8` "Fundering in opbouw (fase 0/1)" | P7 | Fase 1 is grotendeels gebouwd; de echte stand is "vóór de proef-app" | herschrijven (stap 5), binnen budget (nu 94/100) | — | — | |
| D-8 | `docs/dod.md:9` en `:35` ("als `check-docs`/`ui:check` bestaat") | P7 | Beide bestaan (`scripts/kit/check-docs.mjs`, `package.json:41`) | herschrijven: voorwaarde weg | beschermd pad | — | |
| D-9 | `.claude/rules/web.md:29-47` "Besloten, nog niet gebouwd" | P7 | Mist Toast (#129) en de controls uit #145 en #150 | herschrijven | rolhek (beschermd) | agentcontext; samen met `check:catalogus` als bron | |
| D-10 | `docs/operations/agent-doorloop.md:90` "eerste invoering heeft nog geen nieuwe guard op main" | P7 | Ingevoerd in #130, #144 | herschrijven | — | — | |
| D-11 | `CHANGELOG.md` [Unreleased] "Toegevoegd" | P7 | Mist #128, #127, #145, #146, #150 (alleen deels onder "Bij een update") | aanvullen | `app:init` | — | |
| D-12 | `docs/reviews/2026-10-09-framework.md`, `2026-10-09-fundering.md` | P7 | Alleen gelinkt vanuit `roadmap.md:5` | houden; link verplaatsen naar `docs/README.md` als de roadmapkop wegvalt | `check-docs` (links) | — | |
| D-13 | `docs/reviews/2026-10-10-tabelpatroon.md` | — | Actieve bron: `gouden-pad.md:16`, `new-resource.mjs`, `migratie.sql.tmpl`, `db/tests/invarianten.sql` | houden | generator | verplaatsen breekt generator | |
| D-14 | `docs/reviews/2026-10-11-keuzes-agent.md`, `2026-10-12-werkstraat.md` | P7 | Nodig voor D-1 (herziening) en ADR 0025/0030 | houden tot D-1 besloten; daarna besliste punten in de ADR's | specs, ADR's | — | |
| D-15 | `docs/reviews/2026-10-13-wrijving.md` | — | Genoemd in commentaar in `test/hooks/werkstraat.test.ts:185` en `test/rails/sandbox-settings.test.ts:9` (onderbouwing, geen afhankelijkheid) | houden | twee testcommentaren | verwijderen breekt geen test, wel de onderbouwing in die commentaren | |
| D-16 | `docs/reviews/2026-10-14-ui-expansion-review.md`, `design-system-coverage.md` | — | Gelinkt vanuit `ui-collections.md`, `design-system-catalogue.md` en `roadmap.md:151` (bewijs) | houden | `check:roadmap` (bewijs) | — | |
| D-17 | `.claude/decisions.json` record `codex/ui-data-display` (`goedgekeurd`) naast spec op `voorstel` | P7 | Mandaat zonder goedgekeurde spec (zie B-1) | **eigenaarvraag**; niet aanraken | ADR 0027 | — | **eigenaar** |

Geen verouderde claims gevonden in `CLAUDE.md`, `.claude/agents/*`, `.claude/rules/api.md`, `database.md`, `docs/README.md`,
`gouden-pad.md`, `nieuwe-app.md` en de UI-docs. Nog juist (geen actie): `core.md:9,24` (`check-core` nog niet gebouwd),
`opleveren/SKILL.md:27` en `agent-doorloop.md:115` (PR 2 van 0030/0031 komt nog).

## Open eigenaarbesluiten

1. Herziening van ADR 0018–0022, 0024 en de specs onder mandaat (D-1).
2. `ui-data-display`: bouwen of parkeren, en wat met het record (B-1, D-17).
3. ST-01 (GitHub App en bescherming): voorwaarde voor B-8 (B-9 staat in `## Volgende`, zie besluit 2).
4. ADR 0023: vervallen of opgaan in 0029 (D-2).

## Besluiten van de eigenaar (2026-10-15, in de sessie)

1. **Roadmap A (R-1 t/m R-8): akkoord, alles.** ST-01..ST-14 gaan op in de fase-items, met de ST-id als label; de
   "Stand"-proza vervalt. ADR 0027 wordt afgevinkt (#130, #144); `audit-log` (#128), `taakmandaat-frameworkwerk` (#130) en
   `taakmandaat-vervolg` (#144) gaan naar `gebouwd` via `pnpm docs:status --pr`. Uitvoering in stap 4.
2. **Parkeren (B-2 t/m B-8): akkoord.** Uitzondering: twee bestaande toegankelijkheidsfouten van toasts komen als open
   fout in `## Volgende`: WCAG 2.2.1 (pauze bij hover/focus, fout blijft staan) en de dubbele aankondiging in NVDA (`role`
   binnen een `aria-live`-container). B-10 en B-11 komen in `## Volgende`. **B-9 (ADR 0031 PR 2) wordt niet geparkeerd maar
   komt in `## Volgende`** (herzien na de Codex-review van #158): `check-document-status` draait als stap in de niet-verplichte
   job `diff-guard` (`.github/workflows/guard.yml:67-71`) en staat niet in `requiredChecks` van `.claude/decisions.json`, dus
   `pnpm pr:verify` kan groen melden terwijl de documentstatus rood is. Dat is een fout in een rail (P2), geen meta-werk.
3. **`ui-data-display` (B-1, D-17): parkeren tot de proef-app.** De spec blijft `voorstel`; het record in
   `.claude/decisions.json` blijft staan maar wordt niet gebruikt. Terug als de proef-app een tabel, tabs, galerij,
   filterbalk of carousel nodig heeft.
4. **ADR 0023 (D-2): vervangen door 0029.** Het meetpunt (verbreed tot prompts, weigeringen, beurten, CI-rondes en
   correcties) gaat in de herziening van ADR 0029 (stap 2). **Herziening (D-1): later**, als open eigenaarbesluit op de roadmap.

5. **Verwijderen van ADR's en specs.** ADR's worden nooit verwijderd, alleen `vervallen` of `vervangen door NNNN` (nummering,
   verwijzingen en afgewezen alternatieven blijven vindbaar). Een spec mag weg als hij `vervallen` is of in een gebouwde
   spec of ADR is opgegaan en niets er meer naar verwijst; elk geval wordt apart aan de eigenaar voorgelegd.

Categorie C (D-3 t/m D-16) is niet apart voorgelegd en blijft voorstel. Elke wijziging op een beschermd pad daaruit
(onder meer `docs/framework.md`, `AGENTS.md`, `docs/dod.md`, `.claude/rules/`) vraagt in stap 5 een eigen akkoord van de eigenaar.
