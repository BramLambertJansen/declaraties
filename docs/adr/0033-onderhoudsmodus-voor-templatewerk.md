# 0033 — Onderhoudsmodus voor templatewerk

Status: voorgesteld

Wijzigt [0029](0029-snellere-beslisroute.md) punt 9 (`ask` = `voorReview`) en [0032](0032-developer-volgt-hoofdsessie-buiten-voorreview.md)
punt 2 (laatste opsomming) alleen in de template-repo, en de plek van de hooks uit [0011](0011-railwerk.md). Drempel (0029 punt 4):
A1 (`.claude/`, `scripts/`, `docs/`) en A3 (verruimt rechten van agent en rol). Besluitherkomst: eigenaar, 2026-10-17, in de sessie
("Ik wil je heel graag iets vrijer laten tijdens het bouwen van het framework").

## Context

De rails zijn gemaakt om een agent die een **app** bouwt binnen de kaders te houden. In deze repo bouwt de agent de rails zelf,
en bijna al dat werk valt onder `voorReview`: `.claude/**`, `scripts/**`, `docs/framework.md`, `AGENTS.md`, `CLAUDE.md`,
`package.json` en de configs. Gevolg op `0dbc2aa`:

1. **Hoofdsessie**: elke Edit op `voorReview` is een prompt, twee keer: `permissions.ask` in `.claude/settings.json` (= `voorReview`,
   0029 punt 9) en `gate()` in `.claude/hooks/lib/rolhek.mjs`.
2. **Developer-subagent**: deny op elk `voorReview`-pad buiten een taakmandaat (0032 punt 2). De werkstraat (framework §8 stap 4)
   wil dat de developer bouwt, maar die kan het meeste frameworkwerk niet aanraken; het werk schuift naar de hoofdsessie of blijft half af.
3. **Lokale instellingen helpen niet.** Claude Code beoordeelt regels in de volgorde deny → ask → allow, en voegt de lijsten van
   project- en lokale instellingen samen. Een `allow` in `.claude/settings.local.json` heft een `ask` uit `.claude/settings.json`
   dus niet op. `bypassPermissions` staat uit (`disableBypassPermissionsMode`).
4. **Sandbox van Claude Code zelf.** Bash mag `.claude/settings*.json`, `.claude/hooks/`, `.claude/skills/` en `.git/config` niet
   schrijven (vaste maskering, los van deze repo). `git worktree add -b` en `git push -u` falen daardoor op de upstream-config.
5. **Waarom de lokale laag er is.** Een hook die de agent op zijn branch wijzigt, werkt direct in de lopende sessie. Zonder de
   prompt op `.claude/**` kan de agent zijn eigen rolhek dus versoepelen voordat de eigenaar iets ziet. Die grens moet blijven,
   maar hoeft niet via een prompt per bestand.

De echte grens is al de diff-guard (`guard.yml`, draait van `main`) plus de merge door de eigenaar (ADR 0017, 0027
"Vertrouwensgrens"). De lokale prompts voegen voor templatewerk wrijving toe, geen bewijs.

## Besluit

1. **Hooks draaien van `main`.** De broncode van de hooks verhuist van `.claude/hooks/` naar `rails/hooks/` (entry's en `lib/`).
   `.claude/hooks/*.mjs` worden kleine stubs: ze pakken `rails/hooks/` uit `origin/main` uit
   (`git archive origin/main rails/hooks`) naar een cache per SHA in de gedeelde git-dir en starten die versie.
   - De hook die de sessie bewaakt is dus altijd die van `main`; een wijziging op de branch werkt pas na de merge door de eigenaar.
   - De rolhek-stub faalt dicht (exit 2) als `origin/main` of `rails/hooks/` onleesbaar is; de meldende hooks falen open (exit 0).
   - Tests en scripts importeren de branchversie uit `rails/hooks/`, zodat wijzigingen vóór de merge getest worden.
   - `rails/**` komt in `gates` en in `voorReview`. Skills en agents blijven in `.claude/` (daar laadt Claude Code ze);
     de agent wijzigt ze met Edit/Write, niet met Bash.
2. **Modus `onderhoud`, gebonden aan de template-repo.** Nieuwe sleutel in `.claude/gates.json`:
   `onderhoud: { "repository": "BramLambertJansen/template" }`. Het rolhek leest hem uit `origin/main` (zoals `autoRunner`, ADR 0027
   punt 6), nooit uit de werkmap, en zet de modus alleen aan als `repositoryName()` (`.claude/hooks/lib/authority-context.mjs`) van
   `git remote get-url origin` gelijk is aan die waarde, hoofdletterongevoelig (GitHub-namen zijn dat ook). Een app uit
   "Use this template" heeft een andere origin, en daar staat de modus dus vanzelf uit. Onleesbaar → uit. `check-docs` faalt op een andere vorm.
3. **In `onderhoud`** behandelt het rolhek `voorReview` voor de hoofdsessie en de developer-subagent zoals de overige gate-paden
   (0032 punt 1): geen prompt en geen deny, wel de melding "gate-pad: eigenaarreview in de PR". Uitgezonderd is de nieuwe lijst
   `altijdVragen` in `.claude/gates.json`: `.github/**`, `.claude/hooks/**` (de stubs uit punt 1: wie die vervangt, omzeilt de
   versie van `main`), `.claude/settings.json`, `.claude/gates.json`, `.claude/decisions.json`, `package.json` en `pnpm-lock.yaml`
   (een nieuwe dependency vraagt akkoord, AGENTS.md). Daar blijft de huidige `voorReview`-behandeling (hoofdsessie ask, subagent deny).
4. **`ask` in `.claude/settings.json` = `altijdVragen`.** De Edit-regels voor de overige `voorReview`-paden vervallen; het rolhek
   vraagt daar zelf (buiten `onderhoud`) en faalt dicht bij een crash. De commando-regels in `ask` blijven. De spiegelregel in
   `check-docs` wordt "`ask` = `altijdVragen`"; CODEOWNERS blijft `gates` + `jsonGates`.
5. **Ongewijzigd, ook in `onderhoud`:**
   - deny-regels in `.claude/settings.json` en `ghForbidden` in het rolhek (push naar `main`, force-push, `--no-verify`, mergen,
     reviews, het label `gate-wijziging`, check-statussen, `docker`);
   - bestaande tests verwijderen of skippen, gecommitte migraties, gegenereerde bestanden en `.env*`;
   - `jsonGates` (`package.json` → `scripts`): `decideByRole` handelt die af vóór `voorReview`, en dat blijft zo;
   - `schrijfrecht` van architect, tester, reviewer en docs; een onbekende subagent houdt deny;
   - de diff-guard, `check-document-status`, de statusregels (de agent zet nooit `goedgekeurd`/`geaccepteerd`) en de merge door de eigenaar;
   - een app: daar staat `onderhoud` uit (punt 2), dus `src/core` en `voorReview` houden er hun huidige behandeling. Dit ADR leunt
     niet op `check-core`; die is nog niet gebouwd (`docs/roadmap.md`, `.claude/rules/core.md`).
6. **Lokale instellingen van de eigenaar.** Voor onderhoudssessies zet de eigenaar `.claude/settings.local.json` (in `.gitignore`)
   met `defaultMode: acceptEdits` en `allow` voor de snelle checks, pushen naar een feature-branch zonder `-u` en lezend `gh`-werk.
   Het bestand verruimt alleen wat geen deny of ask heeft. De agent schrijft het niet (de sandbox maskeert het). Een worktree heeft
   een eigen kopie nodig.
7. **Volgorde: compensatie vóór versoepeling.** Punt 1 komt in een eigen PR en staat op `main` voordat punt 2–4 gebouwd worden.
   De bootstrap-PR van punt 1 kan zichzelf nog niet vanaf `main` controleren en krijgt eigenaarreview vóór de merge.

## Alternatieven

- **Alleen `settings.local.json`.** Verworpen: een lokale `allow` heft een project-`ask` niet op (deny → ask → allow).
- **Hooks lokaal uitzetten** (`disableAllHooks`). Verworpen: dan vallen ook de deny's van het rolhek weg (merge, label, tests skippen).
- **Rails als eigen pakket of repo** dat de template als dependency binnenhaalt. Zuiverste scheiding, maar nu te vroeg: de rails
  veranderen dagelijks, en versiebeheer per wijziging kost meer dan het oplevert. Heroverwegen als de rails stabiel zijn.
- **`voorReview` inkorten voor iedereen.** Verworpen: in een app moet `.claude/**` en `scripts/**` dicht blijven. Daarom is de modus
  gebonden aan de repository.
- **Mandaat per taak** (ADR 0027 register). Blijft bestaan, maar vraagt per taak een besluit-PR; voor dagelijks railwerk is dat de
  wrijving die dit ADR wegneemt.

## Gevolgen

- In de template-repo bouwt de developer-subagent frameworkwerk zelf; de eigenaar ziet het in de PR via de diff-guard en reviewt
  daar. Er is één akkoordmoment per PR in plaats van een prompt per bestand.
- Een hookwijziging is pas na de merge in de sessie actief. Live proberen vóór de merge kan niet; de tabeltests in `test/hooks/`
  zijn het bewijs.
- Verhuizing naar `rails/hooks/`: imports in `scripts/`, `test/hooks/`, `test/rails/` en paden in docs gaan mee in dezelfde PR (punt 1).
- In andere runtimes (Codex, cloud) werken de hooks niet; daar verandert niets, want CI en GitHub zijn daar al de enige grens.
- `.git/config` blijft onschrijfbaar in de sandbox: geen upstream-tracking; pushen gaat met `git push origin <branch>`.
- Geen nieuwe dependency, route, migratie of databaserecht.
