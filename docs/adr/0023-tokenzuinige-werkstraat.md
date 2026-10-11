# 0023 — Tokenzuinige werkstraat: in de repo, meten, sessiebudget

Status: voorgesteld

## Context

Grootste sessie van de template-PR-reeks: 3.215 beurten op Opus 5.5, mediane context ≈ 368k per beurt (250k–700k), ≈ 1,17 miljard
cache-read tokens. Tool-uitvoer was maar ≈ 350k tokens, de altijd-geladen basis ≈ 2,5k: de kosten zijn **context × beurten**.

Hoofdoorzaak: de sessie startte in `~`, niet in de repo. Daardoor golden `.claude/settings.json`, hooks, rolhek, padregels en
project-agents niet (vandaar 550× `cd … &&` en één subagent-aanroep), en liepen tientallen PR's door één context. De rest van de
regels in proza ("Zuinig met context" in `CLAUDE.md`) wordt in zo'n sessie niet gevolgd. De Claude Code-documentatie noemt "context rot"
zonder drempel, compact standaard pas rond 967k (`autoCompactWindow`, 100k–1M), en geeft hooks `transcript_path` en in subagents `agent_type`,
maar geen veld voor contextgebruik. Een cache-hit kost 0,05× de invoerprijs; subagents cachen 5 minuten, de hoofdsessie 1 uur.

## Besluit

Eerst in de repo werken en meten, dan afdwingen waar een hook of check het kan. Geen maatregel zwakt een gate, het rolhek, de
reviewer of een test af. Nieuwe hooks zijn fail-open en lossen af met `additionalContext`; het rolhek (fail-closed) krijgt alleen schrijfregels.
Elke hook en elk script krijgt een tabeltest (`test/hooks/`, `test/rails/`), en framework §8/§9 gaat mee in dezelfde PR.

1. **Start in de repo.** Een sessie start in `~/code/template` of een worktree daarvan (VS Code: die map openen; terminal: `cd` en dan
   `claude`). `docs/nieuwe-app.md` en de README zeggen dat; `autoCompactWindow` staat ook in de gebruikersinstellingen van de eigenaar
   (`~/.claude/settings.json`, eigenaar plaatst), zodat de grens buiten de repo ook geldt.
2. **Meten — `pnpm tokens`** (`scripts/kit/tokens.mjs`): per sessie beurten, mediane en p95-context, cache-read, aandeel beurten in de
   hoofdsessie, herhaalde volledige reads, uitvoer per commandoprefix. Leest de transcriptmappen van de repo, de worktrees en `~`; drukt
   alleen getallen en bestandsnamen af, nooit inhoud. Dit is de nulmeting.
3. **Sessiebudget.** `autoCompactWindow: 200000` in `.claude/settings.json` is de harde grens. Een fail-open hook `context-budget`
   (UserPromptSubmit, en PostToolUse gedrosseld: elke 25 calls of bij +25k) leest de staart van `transcript_path` en meldt vanaf 150k:
   "rond af, `pnpm stand`, stel een verse sessie voor". Wisselt de branch binnen een sessie (bijgehouden in de git-dir per `session_id`),
   dan meldt hij "nieuwe branch, nieuwe sessie". Drempels in `.claude/gates.json` (`tokenBudget`).
4. **Overdracht — `pnpm stand`** (`scripts/kit/stand.mjs`, ≤ 40 regels): branch, PR- en checkstatus, diffstat, open reviewbevindingen, spec en
   volgende stap. SessionStart toont het; het is ook de vaste kop van elke opdracht aan de developer-agent, zodat keuzes uit de chat meegaan
   (wat besloten is en niet in spec of PR staat, zet de hoofdsessie eerst daar). Het agent-geheugen houdt alleen werkafspraken.
5. **Gericht lezen.** `feiten.mjs adr` krijgt een samenvatting per ADR, plus een subcommando `deel <doc> <§>` voor `framework.md`,
   `roadmap.md` en `nieuwe-app.md`. `check-docs` krijgt een documentbudget per bestand en per `##`-deel met ratchet in `.kit/baseline.json`.
   Een volledige `Read` van die drie, en lezen in `node_modules/` in de hoofdsessie, krijgt een melding van de fail-open hook, geen weigering.
6. **Agent `onderzoek`** (sonnet, `maxTurns: 30`, conclusie ≤ 40 regels met `bestand:regel`) voor onderzoek in dependencies en docs.
   Read-only afgedwongen: `schrijfrecht.onderzoek: []` in `gates.json`, in `SUBAGENT_ROLES` van het rolhek, Bash zoals de reviewer.
7. **Model per rol.** Twee bouwagents: `developer` (sonnet) en `developer-kritiek` (opus) voor migraties, policies en auth. `tester` en `docs`
   blijven sonnet, `reviewer` en `architect` opus: zij zijn het vangnet. Vóór de overstap een A/B-meting volgens framework §10 met de drie
   testopdrachten (sonnet tegen `inherit`); `developer` gaat pas naar sonnet als blokkerende bevindingen en correctierondes niet stijgen.
8. **Bouwen via een bouwagent in het volledige pad.** Het rolhek weigert de hoofdsessie (geen `agent_type`) nieuwe bestanden in
   `db/migrations/**` en wijzigingen in `src/shared/contracts/**` en `src/api/routes/**`; `pnpm new:resource` blijft van de hoofdsessie
   (ADR 0016). Dit is een sturing, geen grens: `node -e` en ingebouwde subagents gaan er langs, en CI ziet niet wie schreef. De meting
   (aandeel `src/`-regels door de hoofdsessie) is de controle. Het lichte pad blijft vrij.
9. **Aanscherpen of terugdraaien** na 10 gemergde PR's, alleen op signaal uit `pnpm tokens`: mediane context > 150k → grens omlaag;
   hoofdsessie > 30% van de `src/`-regels → punt 8 uitbreiden; meer blokkerende bevindingen of correctierondes dan de nulmeting → de
   laatste besparing terug. Een grens van 100k wint ≈ 7 procentpunt tegen twee keer zoveel overdrachten; dat doen we niet zonder signaal.

## Doelen

Mediane context ≤ 150k en p95 ≤ 300k (nu ≈ 368k en ≈ 650k); cache-read per PR −60% t.o.v. de nulmeting; aandeel beurten in de
hoofdsessie omlaag; blokkerende reviewbevindingen per PR niet hoger. Simulatie op de gemeten sessie: −65% cache-read bij 200k, −72% bij 150k.

## Alternatieven

- **Alleen proza**: werd niet gevolgd en voldoet niet aan §9. **Hard `/clear`**: kan geen hook; `autoCompactWindow` wel.
- **Leesweigering in het rolhek**: fail-closed (één crash blokkeert elke Read) voor ≈ 140k tokens winst; daarom alleen melden.
- **Alles op sonnet of grens 100k**: kost kwaliteit of overdrachten voor weinig winst.

## Gevolgen

- Vier PR's, elk met tests en de bijbehorende tekst in framework §8/§9: (1) `pnpm tokens`, nulmeting, documentbudget; (2) `pnpm stand`,
  `feiten.mjs`, SessionStart; (3) `autoCompactWindow`, `context-budget`, agent `onderzoek`; (4) bouwagents, rolhekregel punt 8, A/B-meting.
- Gate-wijziging: label `gate-wijziging`; de gebruikersinstelling uit punt 1 plaatst de eigenaar zelf.
- Keuzes (aanbeveling, de eigenaar beslist): **OV-1** 200k grens, melding vanaf 150k; **OV-2** twee bouwagents, sonnet pas na A/B;
  **OV-3** volledige reads alleen melden; **OV-4** `pnpm tokens` leest transcripten, alleen getallen; **OV-5** punt 8 als sturing op pad.
