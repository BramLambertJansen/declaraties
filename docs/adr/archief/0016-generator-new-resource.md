# 0016 — Generator `pnpm new:resource`

Status: vervangen door 0047
via de coördinator); geaccepteerd door de eigenaar.

## Context

Roadmap stuk 5 vraagt `pnpm new:resource <naam>`, "afgeleid uit het gouden pad", en is klaar als "code uit `pnpm new:resource` haalt
`gate:fast`". `docs/dod.md` verwijst er al naar. Het gouden pad is accountbeheer ([gouden-pad.md](../gouden-pad.md), 11 stappen); de skills
`spec`, `migratie`, `nieuw-route` en `nieuw-scherm` beschrijven dezelfde stappen. Wat de repo nu laat zien en het ontwerp bepaalt:

1. **Accountbeheer is geen gewone resource.** De data komt uit de view `app.accounts` over `better_auth` en uit security definer-functies
   (ADR 0014); er is geen eigen tabel met een eigenaar en policies voor insert, update en delete. Een generator kopieert het gouden pad dus
   niet, maar leidt er een nieuw patroon uit af (tabel met `owner_id`), dat zelf nog nergens is gereviewd.
2. **Twee gegenereerde bestanden.** `src/api/db/schema.ts` ontstaat alleen via `pnpm db:generate` (runner, buiten de sandbox). Een
   handler die de nieuwe tabel opvraagt, compileert daarvóór niet. `src/web/routeTree.gen.ts` schrijft de router-plugin van Vite; een nieuwe
   bestandsroute compileert pas daarna. `gate:fast` (met `typecheck`) faalt dus op beide, tenzij de generator ze vermijdt of opnieuw maakt.
3. **Een nieuwe permissie maakt een bestaande test rood.** `src/shared/permissions.test.ts` eist dat de tabel precies de verwachte
   permissies bevat. Zonder een extra regel in die test faalt `test:unit`; met die regel wijzigt een bestaande test (reden in de PR).
4. **Registraties zijn gate-paden.** `src/shared/permissions.ts`, `src/api/app.ts`, tests, `e2e/**` en `db/tests/**` staan in
   `.claude/gates.json`. De rolhek-hook ziet alleen de tekst van een Bash-commando; wat een script schrijft, ziet hij niet (net als
   `node -e`). Alleen de diff-guard in CI vangt dat.
5. **Werkstraat (framework §8).** Stap 2 "Contract" geeft routes die `501` teruggeven; de tester schrijft daarna de tests, onafhankelijk
   van de bouwer. De feiten kennen geen foutcode voor 501 (de basiscodes staan in `src/core/shared`).

## Besluit

### Besluiten

Besluiten van de eigenaar (2026-10-10, doorgegeven via de coördinator): bij elke vraag de aanbeveling van de architect.

| Vraag | Besluit | Verworpen |
|---|---|---|
| OV-1 Wat de generator maakt | (b) werkstraat-stap 2: contract, 501-handlers, permissie (+ regel in de tabeltest), migratie, `queries.ts`, scherm, guard-route, menu-item, teksten; geen tests. `NOT_IMPLEMENTED` (501) wordt een basisfoutcode in core; het tabelpatroon krijgt eerst één volledige security-review | (a) alles met tests; (c) lege testbestanden |
| OV-2 Spec-plicht | (b) twee fasen: zonder spec alleen het spec-skelet; bij `voorstel` weigeren; bij `goedgekeurd` de rest | (a) alleen weigeren; (c) spec achteraf |
| OV-3 Templates | In `scripts/kit/templates/` (beschermd via `scripts/**`); synchroon via de test uit OV-7 en een test op het bestandsplan tegen skills en `gouden-pad.md` | `src/core/`; `.claude/`; alleen een snapshot |
| OV-4 Rolhek en rollen | (a) met (b): alleen de hoofdsessie (`ask`, rolhek weigert subagents); gate-bestanden als afgedrukte wijziging die de hoofdsessie met Edit zet; de architect draait alleen fase 1 | (c) rolhek leest het bestandsplan |
| OV-5 Naam en invoer | Eén naam (meervoud, kebab-case, Engels, geen verbuiging); verplichte `--rollen` in fase 2 zonder standaard; geen velden; niet interactief; weigeren als een doel bestaat, met `--dry-run` | `--enkelvoud`; rollen uit de spec; `--veld`; bestaande bestanden overslaan |
| OV-6 Dependencies | Geen; route-tree via de al geïnstalleerde `@tanstack/router-plugin`. Kan dat niet zonder Vite, dan apart voorleggen | Plop of Hygen; meteen `@tanstack/router-cli` |
| OV-7 Bewijs `gate:fast` | (a) test die in een tijdelijke kopie (`git ls-files`) genereert en daar de stappen van `gate:fast` draait, als eigen check in CI | (b) fixture met snapshot; (c) genereren in de werkmap |

### Opties per vraag

Per vraag de opties, de gevolgen en de aanbeveling van de architect, zoals voorgelegd.

**OV-1 — Wat de generator maakt.**

- (a) Alles uit de 11 stappen, met werkende handlers, tests en e2e. Gevolg: de tester is niet meer onafhankelijk (de generator schrijft
  de tests). De handlers vragen eerst `pnpm db:generate` en de route eerst een nieuwe `routeTree.gen.ts` (context 2).
- (b) Stap 2 van de werkstraat: contract (`src/shared/contracts/<naam>.ts` + `index.ts`), handlers met `defineRoute` die 501 geven
  (`src/api/routes/<naam>.ts` + `app.ts`), permissies (+ regel in `permissions.test.ts`), migratie (tabel met `id`, `owner_id`,
  `created_at`; RLS aan en geforceerd; grants; policies per actie met `(select app.current_user_id())`; `db/ids.json`), `queries.ts`,
  een scherm met `AsyncView` en `PageHeader`, teksten in `src/web/copy/ui.ts`, een bestandsroute met `guard()` en een menu-item.
  Gevolg: de code compileert zonder `schema.ts`; de tester en de developer volgen zoals nu. Vraagt een 501-code in core (context 5).
- (c) Als (b), plus lege testbestanden. Gevolg: lege of `todo`-tests geven vals groen en botsen met het rolhek.
- Bewust niet, in elke optie: foutcodes, security definer-functies, `ctx.services`, nieuwe componenten, gegenereerde bestanden (`schema.ts`,
  snapshot) en lezen uit `better_auth`. Dat volgt uit de spec.
- Aanbeveling: (b). Laat het nieuwe tabelpatroon (context 1) één keer volledig reviewen (security-review) voordat het in een template komt.
  Beslis daarbij ook of 501 een nieuwe basiscode `NOT_IMPLEMENTED` in core wordt.

**OV-2 — Verhouding tot de spec-plicht.**

- (a) Weigeren zonder `docs/specs/<naam>.md` met `status: goedgekeurd`.
- (b) Twee fasen: zonder spec maakt de generator alleen het spec-skelet (kopie van `_template.md`, `status: voorstel`, met de afgeleide
  routes, permissies en policies ingevuld en rollen en teksten als open vraag); bij een goedgekeurde spec maakt hij de rest (OV-1).
  Bij een spec met status `voorstel` weigert hij.
- (c) Alles meteen, spec achteraf. Gevolg: botst met AGENTS.md en de skills (`nieuw-route`, `migratie`: "alleen met een goedgekeurde spec").
- Aanbeveling: (b). De generator leest de status alleen lokaal uit het bestand. Dat de eigenaar hem zette, bewijst pas `check-spec-approval`
  (stuk 6, nog niet gebouwd).

**OV-3 — Templates: plek, synchroon blijven en bescherming.**

- Plek: (a) `scripts/kit/templates/` naast `scripts/kit/new-resource.mjs`; (b) `src/core/`: komt mee naar een app, maar het is geen
  runtimecode en botst met ADR 0008; (c) `.claude/`: werkt alleen in Claude Code, niet in Codex of andere runtimes.
- Synchroon: (a) de test uit OV-7 haalt gegenereerde code door `gate:fast`, zodat een template die achterloopt rood wordt; (b) de generator
  exporteert zijn bestandsplan en een test vergelijkt dat met de paden in de skills en `gouden-pad.md`; (c) alleen een snapshot van de
  uitvoer: die bewijst niet dat de uitvoer compileert.
- Bescherming: onder `scripts/**` zijn templates al een gate-pad (CODEOWNERS, `ask`, diff-guard). Ze komen via een template-update naar een app.
- Aanbeveling: plek (a); synchroon (a) en (b) samen. Templates blijven beschermd zoals de rest van `scripts/`.

**OV-4 — Rolhek en rollen.**

- (a) Alleen de hoofdsessie, met `ask` op `Bash(pnpm new:resource *)` in `.claude/settings.json`; het rolhek weigert het commando voor
  subagents. Gevolg: de eigenaar keurt elke run goed, maar ziet niet welke gate-bestanden wijzigen.
- (b) De generator schrijft alleen wat geen gate is. Voor `permissions.ts`, `permissions.test.ts` en `app.ts` drukt hij de exacte
  wijziging af; de hoofdsessie zet die met Edit, en dan vraagt het rolhek per bestand akkoord. Dan mag de developer hem ook draaien.
- (c) Het rolhek leest het bestandsplan van de generator (dry-run) en beoordeelt elk doel als Edit. Gevolg: de hook importeert een script
  en wordt groter, terwijl hooks kort en deterministisch moeten blijven (framework §8).
- Fase 1 (spec-skelet) schrijft alleen in `docs/specs/`: die mag de architect draaien, of de architect kopieert het skelet zoals nu.
- Aanbeveling: (a) met (b). De architect draait alleen fase 1, de hoofdsessie fase 2. De diff-guard blijft de echte grens.

**OV-5 — Naamgeving en invoer.**

- Naam: (a) één argument, meervoud, kebab-case, Engels (`invoices`), gecontroleerd met een vaste regex. Daaruit volgen tabel
  (`public.invoices`), pad (`/api/invoices`), permissies (`invoices:read`, `invoices:write`), map (`features/invoices`) en component
  (`InvoicesPage`). Geen verbuiging (enkelvoud raden is onbetrouwbaar). (b) Ook `--enkelvoud` voor typenamen.
- Rollen: (a) verplichte vlag `--rollen user,admin` in fase 2, zonder standaardwaarde; (b) uit de spec lezen: proza parsen is breekbaar.
- Velden: (a) geen; kolommen en zod-velden voegt de developer toe volgens de spec; (b) `--veld naam:type`: vraagt een typemapping
  (SQL, zod, Drizzle, formulier) die het gouden pad nog niet heeft.
- Interactief: nee; een agent kan geen prompt beantwoorden.
- Idempotent: (a) weigeren als een van de doelen bestaat, zonder iets te schrijven, plus `--dry-run` dat het plan toont; (b) bestaande
  bestanden overslaan. Gevolg van (b): een half resultaat dat niemand ziet.
- Aanbeveling: naam (a), rollen (a), velden (a), niet interactief, idempotent (a).

**OV-6 — Nieuwe dependencies.**

- (a) Geen: `node:fs`, `node:util` (`parseArgs`) en tekstvervanging. De uitvoer gaat door Prettier (al een devDependency).
- (b) Plop of Hygen: een eigen templatetaal en een dependency voor iets wat met string-vervanging kan.
- `routeTree.gen.ts` (context 2): (a) de generator van de al geïnstalleerde `@tanstack/router-plugin` aanroepen (nog te controleren of dat
  zonder Vite kan); (b) `@tanstack/router-cli` toevoegen (nieuwe dependency); (c) niet regenereren: dan haalt de uitvoer `typecheck` niet.
- Aanbeveling: geen dependency; voor de route-tree optie (a). Kan dat niet zonder Vite, dan legt de architect (b) apart voor.

**OV-7 — Bewijs dat de uitvoer `gate:fast` haalt.**

- (a) Een test die de repo (`git ls-files`) naar een tijdelijke map kopieert, met een link naar `node_modules`, de generator met een vaste
  naam draait en daar de stappen van `gate:fast` uitvoert. Gevolg: echt bewijs zonder database (past in de sandbox), maar het duurt
  minuten. Daarom als eigen check in CI, niet in elke `gate:fast`.
- (b) Een gecommitte fixture van de uitvoer met een snapshottest. Gevolg: snel, maar de fixture wordt niet gelint of getypecheckt in de
  context van de app, en dat is precies wat bewezen moet worden.
- (c) Tijdelijk genereren in de werkmap zelf. Gevolg: risico op achtergebleven bestanden in de echte repo.
- Aanbeveling: (a), in CI bij elke wijziging in `scripts/kit/` of in een bestand dat een template nadoet. `gate:slow` hoort er bewust niet
  bij: `check-policies` faalt tot de tester de pgTAP-tests schrijft.

## Alternatieven

- **Geen generator, alleen skills en `gouden-pad.md`.** Er komt niets bij om te onderhouden, maar elke resource is handwerk en de roadmap
  vraagt de generator.
- **Generator als npm-pakket** (ADR 0006): pas zinvol als de gedeelde code stabiel is (fase 2).
- **Werkende CRUD-resource genereren** (OV-1a): de snelste weg naar iets zichtbaars, maar de tester is dan niet meer onafhankelijk en de
  spec wordt een formaliteit.

## Gevolgen

- Beschermde paden met akkoord van de eigenaar en label `gate-wijziging`: `scripts/kit/`, `package.json` (`scripts`: `new:resource`),
  `.claude/settings.json` (OV-4) en `src/core/shared` (basisfoutcode `NOT_IMPLEMENTED`, OV-1).
- `docs/gouden-pad.md`, `docs/dod.md` en de skills `spec`, `migratie`, `nieuw-route` en `nieuw-scherm` krijgen een stap "begin met
  `pnpm new:resource`". `.claude/skills/` is beschermd; elke tekst daar moet overeenkomen met het bestandsplan van de generator (OV-3b).
- Elke run die een permissie toevoegt, wijzigt `src/shared/permissions.test.ts`; de PR noemt die wijziging met reden.
- Het tabelpatroon met `owner_id` (context 1) wordt de standaard voor elke app. Een fout erin zit dan in elke resource, dus eerst één
  volledige security-review.
- Twee gate-wijzigingen, door de eigenaar goedgekeurd, in een eigen PR (niet in dit ADR uitgewerkt): het rolhek rekent paden vanaf de
  worktree-root in plaats van `CLAUDE_PROJECT_DIR`; ESLint, Prettier en dependency-cruiser negeren `.claude/worktrees/`.
