# Changelog

Hier staan wijzigingen die van belang zijn bij het gebruiken of bijwerken van de template. Releaseversies volgen zodra de template releases krijgt. Oudere bouwstappen en reviews zijn terug te vinden in Git en de pull requests.

## [Unreleased]

### Toegevoegd

- Een React-webapp en Hono-API met een aparte core- en app-laag.
- Inloggen, uitnodigingen en tweestapsverificatie met Better Auth. Beheerders kunnen accounts bekijken, rollen wijzigen en uitnodigingen opnieuw versturen.
- Postgres-migraties, row-level security en tests voor datatoegang.
- Een UI-kit met componentcatalogus, formulieren, bevestigingsdialogen en toegankelijke navigatie.
- Een lokale omgeving met Postgres en Mailpit, installatie- en diagnosecommando's en demoaccounts.
- Een resourcegenerator die eerst een featurespec maakt en na goedkeuring een implementatieskelet. De handlers moeten nog worden ingevuld.
- Een setup-playbook en hernoemscript voor nieuwe apps. Template-updates gebruiken merge-commits om de geschiedenis te behouden.
- Requestlogging, health- en readinessroutes, gecontroleerd stoppen en een containerimage voor de webapp en API.
- Controles voor codekwaliteit, architectuur, migraties, database- en schermgedrag, kwetsbaarheden en secrets, lokaal en in GitHub Actions.
- Uitgewerkte roadmaptaken voor de verdere ontwikkeling van de starter.

### Documentatie

- De README beschrijft de huidige basis, lokale installatie en beschikbare controles.
- Een leeswijzer maakt onderscheid tussen gebruiksdocumentatie, ontwikkelafspraken en agentinstructies.

### Bij een update

De template heeft nog geen releaseversies. Controleer bij een update de gewijzigde migraties, architectuurbesluiten en instellingen. Een volledige upgradecontrole staat op de roadmap.

- **MCP-tools onder het rolhek (WS-06).** De rolhek-matcher vangt nu ook `mcp__.*` (`.claude/settings.json:129`). Een MCP-tool die niet exact in de nieuwe lijst `mcpLezen` in `.claude/gates.json` staat, vraagt in de hoofdsessie goedkeuring en wordt voor elke subagent geweigerd (`.claude/hooks/lib/rolhek.mjs:115`); ontbreekt de sleutel, dan faalt het rolhek dicht. Architect, tester en docs hebben daarnaast `disallowedTools: mcp__*`. Wat verandert voor een app: connectors (bijv. Supabase, Vercel) zijn voor subagents dicht en vragen in de hoofdsessie elke keer akkoord. Wat de eigenaar moet doen: read-only tools die vrij mogen, met exacte naam in `mcpLezen` zetten (gate-wijziging). Conflicten: alleen als de app `.claude/gates.json`, `.claude/settings.json`, `.claude/hooks/` of `.claude/agents/` zelf aanpaste.
- **Werkstraat-hooks in de juiste map; uitgesloten commando's kloppen met `package.json` (WS-03).** De werkstraat-hooks nemen hun root, net als het rolhek, uit de git-root van `cwd` in de payload (terugval `CLAUDE_PROJECT_DIR`), dus in een worktree draaien Stop en "groen vóór klaar" op de gewijzigde code (`.claude/hooks/lib/root.mjs`). `excludedCommands` en `ask`: `db:reset` en `db:types` (bestonden niet) weg, `db:generate` en `check:snapshot` erbij; `test/rails/excluded-commands.test.ts` bewaakt dat. Reviewer en security-review diffen tegen `origin/main`. Wat verandert voor een app: `pnpm db:generate` en `pnpm check:snapshot` vragen nu goedkeuring en draaien buiten de sandbox. Wat de eigenaar moet doen: vóór een review `git fetch origin`. Conflicten: alleen als de app `.claude/settings.json`, `.claude/hooks/` of `.claude/agents/reviewer.md` zelf aanpaste.
- **`.claude/settings.json`: dode deny-regels `Read(!.env.example)` en `Edit(!.env.example)` weg.** Claude Code las de `!` als letterlijke padnaam, niet als uitzondering. Wat verandert voor een app: niets in gedrag; `.env.example` was en blijft voor agents onleesbaar via `.env.*` (permissieregel én sandbox). Wat de eigenaar moet doen: niets. Conflicten: alleen als de app deze regels in `.claude/settings.json` zelf aanpaste.
- **ADR 0025 (voorgesteld): werkstraat tot de merge en modelkeuze per spec.** Wat verandert voor een app: nog niets. Alleen besluittekst; rails, hooks, settings en skills volgen in aparte PR's, elk met een eigen notitie. Wat de eigenaar moet doen: niets bij deze update. Conflicten: geen bij app-ADR's vanaf `0100` (ADR 0006); `docs/adr/0009-…` kreeg één regel, en die geeft alleen een conflict als de app die ADR zelf wijzigde.
- **`docs/nieuwe-app.md` bij de repo: bootstrap, `pnpm dev`, `pnpm db:migrate` en een ruleset met verplichte checks.** Wat verandert voor een app: niets aan de code; alleen het playbook. Wat de eigenaar moet doen: een app die vóór deze versie is opgezet, heeft mogelijk geen git-hooks (`scripts/doctor.sh` meldt dat; dan `scripts/bootstrap.sh`) en een ruleset zonder verplichte checks (vergelijk met fase 6.2). Conflicten: geen, de app wijzigt `docs/nieuwe-app.md` niet.
- **`scripts/cloud-setup.sh` en README-sectie Cloud.** Setup-script voor een cloudomgeving van Claude Code: mise (gepind, van github.com), `mise install`, `pnpm install --frozen-lockfile`, `lefthook install`. Wat verandert voor een app: niets lokaal. Wat de eigenaar moet doen: alleen voor cloudsessies de omgeving instellen (README, Cloud). Conflicten: alleen als de app de README-sectie **Controles** direct erboven wijzigde.
- **`scripts/github-ruleset.sh`: ruleset `main` voor een app-repo.** Zet via `gh api` PR-plicht, geen force push of delete, opgeloste gesprekken, merge en squash, en de verplichte checks uit `.github/workflows/` (`--zonder-codeql` voor een private repo zonder GHAS). Wat verandert voor een app: niets vanzelf. Wat de eigenaar moet doen: een bestaande app kan het script één keer draaien (`scripts/github-ruleset.sh <owner>/<repo>`); opnieuw draaien werkt de ruleset bij. Conflicten: geen.
- **`scripts/runner.sh`: images eerst binnenhalen, met time-out en herkansing.** `pnpm test:db`, `pnpm ui:check` en `pnpm db:generate` doen eerst `docker compose pull` (300 s per poging, drie pogingen) en stoppen met een duidelijke fout als de registry blijft hangen, in plaats van de 30 minuten van `gate:slow` op te maken. Wat verandert voor een app: niets aan het testgedrag. Wat de eigenaar moet doen: niets. Conflicten: alleen als de app `scripts/runner.sh` zelf wijzigde.
