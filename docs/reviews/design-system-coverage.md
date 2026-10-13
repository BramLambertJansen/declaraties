# UI-index en catalogusrail

Fase 1, stuk 3c en 4: bestaande UI-kit, hergebruik en afdwinging. Opdracht eigenaar 2026-10-13; besluit in ADR 0027.

- Broninventarisatie: `scripts/kit/catalogus-source.ts`; dekking: `scripts/kit/catalogus-graph.ts` en `scripts/kit/catalogus.mjs`.
- Dezelfde index voor agents (`scripts/kit/feiten.mjs`) en developers (`src/web/features/design-system/component-index.tsx`, via Vite).
- Geen uitzonderingen of baselinegroei. Bestaande CI-gate blijft ongewijzigd aangesloten via `gate:fast`.
- `test/rails/catalogus.test.ts` is aangepast omdat de opdracht de oude eis "voorbeeld of uitzondering" vervangt door volledige dekking;
  de fixtures bevatten nu echte componentbroncode in `.tsx`. Geen test verwijderd of geskipt.
- `src/web/features/design-system/design-system-page.test.tsx` krijgt de QueryClientProvider die ook in de app staat, omdat de catalogus nu
  AsyncView met lokale voorbeelddata rendert, en een echte memoryrouter omdat de componentenindex de bestaande URL-state gebruikt.
  De bestaande toastasserties blijven behouden. `e2e/design-system.spec.ts` bewijst index, herladen, één h1 en zichtbare toasts met axe.
- Nieuwe regressies staan in `test/rails/catalogus-coverage.test.ts`; de eerste zes faalden op de oude check op hun asserties.
- `preview` voorkomt geneste landmarks en documenttitels in catalogusvoorbeelden; normaal schermgedrag blijft gedekt door bestaande tests.

## Verificatie

De actuele wijzigingen zijn gekopieerd naar een tijdelijke ext4-checkout in WSL, met de oorspronkelijke git-bestandsmodi,
dezelfde lockfile en Node 26.11.1/pnpm 11.28.2. Er zijn geen time-outs, budgetten, baselines of checks verruimd.

- `pnpm gate:fast`: geslaagd; 105 testbestanden, 1.186 tests. Inclusief `check:catalogus` (40 componenten), lagen/docs-ratchet,
  lint, typecheck, migratie- en security-definerregels, roadmapcontrole en het oorspronkelijke bundelbudget.
- `pnpm build`: geslaagd; de catalogus blijft een lazy chunk. De index bevat alleen metadata; compiler en scripts zitten niet in de browser.
- `pnpm check:new-resource`: geslaagd (exitcode 0); het gegenereerde resourcepad haalt de volledige snelle gate met de aangescherpte catalogusrail.
- Eigenaarakkoord 2026-10-13 na de host-diff: de drie bestaande runnerchecks zijn uitgevoerd met `--sta-wijzigingen-toe`
  (framework §11). De hostcontrole, runner en package-scripts zijn niet gewijzigd.
- `pnpm test:db --sta-wijzigingen-toe`: geslaagd; 128 pgTAP-tests en 202 integratietests in 16 bestanden, op een verse echte database.
- `pnpm ui:check --sta-wijzigingen-toe`: geslaagd; alle 45 e2e-tests. Inclusief index zoeken/herladen, bron en importnaam,
  foutvoorbeeld opnieuw proberen, succes- en fouttoasts, axe in licht/donker op 375/1280 px, CSP en landmarks.
- `pnpm check:snapshot --sta-wijzigingen-toe`: geslaagd; beide gegenereerde bestanden zijn gelijk aan de migraties.
  Daarmee zijn alle drie onderdelen van `gate:slow` groen; het samengestelde commando zelf is niet uitgevoerd omdat het eigenaarargument
  per runner nodig is.
- `osv-scanner scan source --config osv-scanner.toml --lockfile pnpm-lock.yaml`: geslaagd; 439 packages, geen gevonden kwetsbaarheden.
- `betterleaks git -c scripts/kit/betterleaks.toml --pre-commit --staged --redact --no-banner --ignore-gitleaks-allow`:
  geslaagd; geen gevonden secrets in de gestagede wijziging.
- CodeQL is alleen als GitHub-workflow beschikbaar; lokaal is geen CodeQL-tool of package-script geïnstalleerd. CodeQL en de
  overige remote CI-jobs zijn nog niet uitgevoerd op deze wijziging. `check-docs` draait binnen `pnpm ratchet`.

De developerflow is broncode → AST-index → Vite-metadata → beveiligde `/design-system` → zoeken en hergebruik via de barrel.
De browsertest doorloopt de bestaande admin/MFA-authenticatie tegen de echte API en database. De catalogus zelf doet buiten `/api/me`
geen API-aanroepen (bestaande AC-10-test groen); de componentgegevens komen uit dezelfde broninventarisatie als de agent-CLI.

Een onafhankelijke reviewer met afgedwongen read-onlyrechten is in deze Codex-runtime niet beschikbaar; review door de eigenaar blijft
vereist. Framework §8 stap 5/6 plaatst die review vóór push en PR; de lokale wijziging staat klaar voor die review. Een eigen controle wordt
niet als onafhankelijke review opgevoerd. Geen push, PR, reviewlabel of merge uitgevoerd; geen mergeklare oplevering geclaimd.
