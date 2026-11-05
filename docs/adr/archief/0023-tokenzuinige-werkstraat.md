# 0023 — Tokenzuinige werkstraat: in de repo, meten, sessiebudget

Status: vervangen door 0029

## Context

Grootste sessie van de template-PR-reeks: 3.215 beurten op Opus 5.5, mediane context ≈ 368k per beurt (250k–700k), ≈ 1,17 miljard
cache-read tokens. Tool-uitvoer was maar ≈ 350k tokens, de altijd-geladen basis ≈ 2,5k: de kosten zijn **context × beurten**.

Hoofdoorzaak: de sessie startte in `~`, niet in de repo. Daardoor golden `.claude/settings.json`, hooks, rolhek, padregels en
project-agents niet (550× `cd … &&`, één subagent-aanroep), en liepen tientallen PR's door één context; de regels in proza
("Zuinig met context" in `CLAUDE.md`) werden niet gevolgd. Claude Code compact standaard pas rond 967k (`autoCompactWindow`, 100k–1M)
en geeft hooks `transcript_path` en in subagents `agent_type`, maar geen veld voor contextgebruik. Een cache-hit kost 0,05× de
invoerprijs; subagents cachen 5 minuten, de hoofdsessie 1 uur.

## Besluit

Breidt ADR 0011 uit: vijf subagents worden zeven (`developer-kritiek`, `onderzoek`); het rolhek kent zes subagentrollen, plus de hoofdsessie. Eerst in de repo
werken en meten, dan afdwingen waar een hook of check het kan. Geen maatregel zwakt een gate, het rolhek, de reviewer of een test af.
Nieuwe hooks melden alleen: zonder netwerk, en bij een fout exit 0 in plaats van `trap 'exit 2' ERR` (framework §8, gaat mee); het rolhek (fail-closed) krijgt alleen schrijfregels.
Elk script en elke hook krijgt een tabeltest (`test/hooks/`, `test/rails/`, `test/scripts/`); framework §8/§9 gaat mee in dezelfde PR.

1. **Start in de repo** of een worktree daarvan (VS Code: die map openen; terminal: `cd`, dan `claude`). `docs/nieuwe-app.md` en de
   README zeggen dat; de eigenaar zet `autoCompactWindow` ook in `~/.claude/settings.json`, zodat de grens buiten de repo geldt.
2. **Meten — `pnpm tokens`** (`scripts/kit/tokens.mjs`). Per sessie: beurten, mediane en p95-context, cache-read, aandeel beurten in de
   hoofdsessie, herhaalde volledige reads, uitvoer per commandoprefix. Per branch: cache-read, aandeel `src/`-regels dat de hoofdsessie
   schreef (Edit/Write in het hoofdtranscript, niet in de subagent-transcripten), reviewer-runs (correctierondes = runs − 1) en
   blokkerende bevindingen.
   - Een beurt is een unieke `message.id`: transcriptregels met dezelfde id (één per content-block) tellen één keer.
   - Context van een beurt is `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` uit de usage van die beurt;
     `context-budget` (punt 3) neemt dezelfde som van de laatste beurt.
   - De reviewer (`.claude/agents/reviewer.md`) schrijft onder `## Bevindingen` per bevinding één kopregel
     `- blokkerend|niet-blokkerend|suggestie — bestand:regel — reden`, bij blokkerend gevolgd door ingesprongen regels met het pad van
     invoer naar fout; "Geen blokkerende bevindingen" telt als 0.
   - Leest alleen de transcriptmappen van de repo en de worktrees, niet die van `~`, en drukt alleen getallen en bestandsnamen af.
     Sessies die buiten de repo startten vallen erbuiten; de nulmeting zijn de eerste sessies in de repo.
3. **Sessiebudget.** `autoCompactWindow: 200000` in `.claude/settings.json` is de harde grens. De fail-open hook `context-budget`
   (UserPromptSubmit, en PostToolUse gedrosseld: elke 25 calls of bij +25k) leest de staart van `transcript_path` en meldt vanaf 150k
   "rond af, `pnpm stand`, stel een verse sessie voor". Wisselt de branch binnen een sessie (bijgehouden in de git-dir per
   `session_id`), dan meldt hij "nieuwe branch, nieuwe sessie". De drempels staan in `.claude/gates.json` (`tokenBudget`): bewust in de
   lijst met gate-paden, zodat de grens alleen via een gate-wijziging verandert.
4. **Overdracht — `pnpm stand`** (`scripts/kit/stand.mjs`, ≤ 40 regels): branch, diffstat, spec, PR- en checkstatus, open
   reviewbevindingen en volgende stap. Open bevindingen zijn alleen de kopregels onder `## Bevindingen` van het laatste reviewer-rapport
   van de branch, uit dezelfde transcriptmappen als `pnpm tokens`; een nieuwe reviewer-run vervangt ze. PR- en checkstatus komen via
   `gh` met een timeout van 5 s; zonder netwerk meldt `stand` "PR-status onbekend". SessionStart draait `stand --offline` (zonder `gh`).
   `stand` is ook de vaste kop van elke opdracht aan een bouwagent; wat in de chat besloten is, zet de hoofdsessie eerst in spec of PR.
5. **Gericht lezen.** `feiten.mjs adr` krijgt een samenvatting per ADR, plus `deel <doc> <§>` voor `framework.md`, `roadmap.md` en
   `nieuwe-app.md`. `check-docs` krijgt een documentbudget per bestand en per `##`-deel, met ratchet in `.kit/baseline.json`. Een
   volledige `Read` van die drie, of lezen in `node_modules/` door de hoofdsessie, krijgt een melding van een fail-open hook.
6. **Agent `onderzoek`** (sonnet, `maxTurns: 30`, `tools: Read, Grep, Glob`, conclusie ≤ 40 regels met `bestand:regel`) voor onderzoek
   in dependencies en docs. Zonder Bash is geen leesregel nodig; read-only via `schrijfrecht.onderzoek: []` in `gates.json` en de rol in
   `SUBAGENT_ROLES`.
7. **Model per rol.** `developer` (`inherit`, sonnet na de A/B-meting) en `developer-kritiek` (opus) voor migraties, policies en auth.
   `roleOf` behandelt elke onbekende agent al als `developer`, dus voor `developer-kritiek` gelden alle gate-regels en subagentverboden
   zonder rolhekwijziging; geen eigen rol of `schrijfrecht`, en een tabeltest legt dat vast. `subagentStop` in
   `.claude/hooks/lib/werkstraat.mjs` vergelijkt exact en krijgt `developer-kritiek` erbij ("groen vóór klaar"); de tabeltest bewijst
   ook dat de SubagentStop-matcher in `.claude/settings.json` hem raakt. `tester` en `docs` blijven sonnet, `reviewer` en `architect` opus: het vangnet. De
   A/B-meting (framework §10) draait de drie testopdrachten uit stuk 5 (**Klaar als**) eerst met `inherit` als basis, daarna met sonnet;
   `developer` gaat pas naar sonnet als blokkerende bevindingen en correctierondes niet stijgen.
8. **Bouwen via een bouwagent in het volledige pad.** Het rolhek weigert de hoofdsessie (geen `agent_type`) met `deny` een
   Edit/Write of Bash-schrijfdoel naar een **nieuw** bestand (`ctx.read(rel) === null`) in `db/migrations/**`, `src/shared/contracts/**`
   of `src/api/routes/**`, behalve in `testpaden` (de hoofdsessie mag tests toevoegen, framework §8 stap 4). Verwijderen,
   `git restore` en `git checkout -- <pad>` vallen er niet onder; omdat het rolhek die nu ook als `kind: 'write'` ziet, krijgt `Change`
   een herkomstveld. Een bestaand bestand wijzigen blijft vrij, dus een fix in het lichte pad wordt niet geraakt; een nieuw hulpbestand
   onder `src/api/routes/**` wel (bekend gevolg). Een nieuwe route in een bestaand routebestand gaat langs het rolhek; alleen de meting
   vangt dat. Stap 2 van de
   werkstraat doet `pnpm new:resource`, dat alleen de hoofdsessie mag draaien (ADR 0016); zonder generator schrijft de bouwagent het
   contract. Dit is sturing, geen grens: `node -e` en ingebouwde subagents gaan er langs en CI ziet niet wie schreef. De tabeltest
   bewijst `deny`, nieuw tegenover bestaand, testpaden en de niet-schrijfacties.
9. **Aanscherpen of terugdraaien** na 10 gemergde PR's, alleen op signaal uit `pnpm tokens`: mediane context > 150k → grens omlaag;
   hoofdsessie > 30% van de `src/`-regels → punt 8 uitbreiden; meer blokkerende bevindingen of correctierondes dan de nulmeting → de
   laatste besparing terug. Een grens van 100k wint ≈ 7 procentpunt tegen twee keer zoveel overdrachten; niet zonder signaal.

## Alternatieven

- **Alleen proza**: werd niet gevolgd en voldoet niet aan §9. **Hard `/clear`**: kan geen hook; `autoCompactWindow` wel.
- **Leesweigering in het rolhek**: fail-closed (één crash blokkeert elke Read) voor ≈ 140k tokens winst; daarom alleen melden.
- **Alles op sonnet of grens 100k**: kost kwaliteit of overdrachten voor weinig winst.

## Gevolgen

- Doelen, gemeten met `pnpm tokens`: mediane context ≤ 150k en p95 ≤ 300k (nu ≈ 368k en ≈ 650k); cache-read per PR −60% t.o.v. de
  nulmeting; aandeel beurten in de hoofdsessie omlaag; blokkerende bevindingen per PR niet hoger. Simulatie op de gemeten sessie:
  −65% cache-read bij 200k, −72% bij 150k.
- Vier PR's, elk met tests en de tekst in framework §8/§9:
  1. `pnpm tokens`, nulmeting, documentbudget, het reviewerformaat, de items van deze ADR in `docs/roadmap.md` (stuk 5);
  2. `pnpm stand`, `feiten.mjs`, SessionStart, de meldhook voor volledige reads (punt 5);
  3. `autoCompactWindow`, `context-budget`, agent `onderzoek`, de tekst in `docs/nieuwe-app.md` en de README (punt 1);
  4. `developer-kritiek` met `roleOf` en SubagentStop, rolhekregel punt 8, A/B-meting.
- Gate-wijziging: label `gate-wijziging`; de gebruikersinstelling uit punt 1 plaatst de eigenaar zelf.
- Besloten door de eigenaar: **OV-23-1** 200k grens, melding vanaf 150k; **OV-23-2** twee bouwagents, sonnet pas na A/B;
  **OV-23-3** volledige reads alleen melden; **OV-23-4** `pnpm tokens` leest alleen transcripten van de repo en de worktrees en drukt
  alleen getallen af (`stand` toont daarnaast alleen de kopregels van de laatste reviewerbevindingen); **OV-23-5** punt 8 als sturing.
