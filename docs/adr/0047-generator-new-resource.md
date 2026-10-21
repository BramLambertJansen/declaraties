# 0047 — Generator `pnpm new:resource`

Status: geaccepteerd

Vervangt [0016](0016-generator-new-resource.md).
Drempel: A4. Consolidatie zonder inhoudelijke wijziging (eigenaarbesluit 2026-10-21, [0038](0038-beslisroute.md) Gevolgen).

## Context

Een nieuwe resource is elke keer hetzelfde handwerk langs het gouden pad. Accountbeheer, het gouden pad, is geen gewone
resource: de data komt uit een view over `better_auth` en uit security definer-functies, zonder eigen tabel met een eigenaar.
Een generator leidt er dus een nieuw patroon uit af, een tabel met `owner_id`. Twee bestanden zijn gegenereerd
(`src/api/db/schema.ts` via de runner, `src/web/routeTree.gen.ts` via de router-plugin), en wat een script schrijft, ziet
het rolhek niet; alleen de diff-guard in CI vangt dat. De werkstraat (`docs/framework.md` §8) houdt de tester onafhankelijk
van de bouwer. De keuzes OV-1 t/m OV-7 kwamen van de eigenaar (2026-10-10), steeds de aanbeveling van de architect.

## Besluit

1. **Werkstraat-stap 2, geen tests** (was 0016 OV-1). De generator maakt contract, handlers met `defineRoute` die 501 geven,
   permissies (plus de regel in de tabeltest, als afgedrukte wijziging), de migratie met het tabelpatroon, `queries.ts`, een scherm, een route met
   `guard()`, een menu-item en teksten. Tests schrijft de tester. Bewust niet: foutcodes, security definer-functies,
   `ctx.services`, nieuwe componenten, gegenereerde bestanden en lezen uit `better_auth`; dat volgt uit de spec.
2. **`NOT_IMPLEMENTED`** (was 0016 OV-1). 501 is een basisfoutcode in core.
3. **Tabelpatroon eerst gereviewd** (was 0016 OV-1). Het patroon met `owner_id` kwam pas in de templates na één volledige
   security-review ([tabelpatroon](../reviews/2026-10-10-tabelpatroon.md)).
4. **Twee fasen naast de spec-plicht** (was 0016 OV-2). Zonder spec maakt hij alleen het spec-skelet (`status: voorstel`, met
   afgeleide routes, permissies en policies; rollen en teksten als open vraag). Bij `voorstel` weigert hij; bij `goedgekeurd`
   maakt hij de rest. Hij leest de status alleen lokaal uit het bestand.
5. **Templates** (was 0016 OV-3). In `scripts/kit/templates/`, beschermd zoals de rest van `scripts/`. Synchroon via de check
   uit punt 9 en een test die het bestandsplan vergelijkt met de skills en `docs/gouden-pad.md`.
6. **Rollen** (was 0016 OV-4). Alleen de hoofdsessie draait de generator (`ask`); het rolhek weigert hem voor elke subagent
   (alleen in Claude Code; elders geen afdwinging). De architect levert alleen het spec-skelet (fase 1), zonder de generator
   te draaien. Een gate-bestand schrijft de generator niet: hij drukt de exacte wijziging af en de hoofdsessie zet die met
   Edit. Sinds [0029](0029-snellere-beslisroute.md) punt 18 (behouden door [0038](0038-beslisroute.md) punt 8) zijn `src/shared/permissions.ts` en `src/api/app.ts` geen gate meer; de
   generator schrijft die zelf, bestaande tests blijven een afgedrukte wijziging.
7. **Naam en invoer** (was 0016 OV-5). Eén naam: meervoud, kebab-case, Engels, vaste regex, geen verbuiging. Verplichte
   `--rollen` in fase 2 zonder standaard; geen velden; niet interactief. Bestaat een doel, dan schrijft hij niets; `--dry-run`
   toont het plan.
8. **Geen dependency** (was 0016 OV-6). De route-tree via de al geïnstalleerde `@tanstack/router-plugin`; kan dat niet zonder
   Vite, dan komt een nieuwe dependency apart ter beslissing.
9. **Bewijs `gate:fast`** (was 0016 OV-7). Een check genereert in een tijdelijke kopie (`git ls-files`) en draait daar de
   stappen van `gate:fast`, als eigen job in CI, niet in elke `gate:fast`. `gate:slow` hoort er bewust niet bij: zonder
   pgTAP-tests van de tester faalt `check-policies`.

## Alternatieven

- **Geen generator, alleen skills en het gouden pad** (was 0016): niets te onderhouden, maar elke resource blijft handwerk.
- **Werkende CRUD met tests, of lege testbestanden** (was 0016 OV-1): de tester is niet meer onafhankelijk, of lege tests
  geven vals groen.
- **Weigeren zonder spec, of spec achteraf** (was 0016 OV-2): geen hulp bij de spec, of botst met de spec-plicht.
- **Templates in `src/core/` of `.claude/`** (was 0016 OV-3): geen runtimecode in core; `.claude/` werkt alleen in Claude Code.
- **Rolhek leest het bestandsplan** (was 0016 OV-4): de hook wordt groter, terwijl hooks kort en deterministisch blijven.
- **`--enkelvoud`, rollen uit de spec, `--veld`, bestaande bestanden overslaan** (was 0016 OV-5): raden, proza parsen, een
  typemapping die het gouden pad niet heeft, of een half resultaat dat niemand ziet.
- **Plop, Hygen of `@tanstack/router-cli`** (was 0016 OV-6): een dependency voor wat met tekstvervanging kan.
- **Snapshot-fixture of genereren in de werkmap** (was 0016 OV-7): bewijst niet dat de uitvoer compileert, of laat bestanden
  achter in de repo.
- **Generator als npm-pakket** (was 0016): pas zinvol als core stabiel is.

## Gevolgen

- Elke run die een permissie toevoegt, wijzigt `src/shared/permissions.test.ts`; de PR noemt die wijziging met reden.
- Het tabelpatroon zit in elke resource van elke app; een fout erin zit overal.
- De diff-guard is de echte grens voor wat het script schrijft (was 0016 context 4).
- Het bestandsplan, de vlaggen en de stappen staan in `docs/gouden-pad.md`, niet in dit ADR. Latere uitbreidingen van de
  uitvoer volgen uit specs: de declaratie voor de securitysuite als afgedrukte wijziging
  ([security-suite](../specs/security-suite.md)) en het lijstpagina-patroon ([lijstpagina](../specs/lijstpagina.md)).
