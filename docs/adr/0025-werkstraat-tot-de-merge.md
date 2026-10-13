# 0025 — Werkstraat tot aan de merge en modelkeuze per spec

Status: geaccepteerd (2026-10-12) — voorgesteld door de architect, geaccepteerd door de eigenaar.
Vervangt 0023 punt 7.
Wijzigt 0009 (punt 4 hieronder).

Gewijzigd door [0027](0027-taakmandaat-voor-frameworkwerk.md): taakgebonden broncode, bewijsgebonden statusadministratie, documentatielabel en automatische veilige runner/CI-opvolging. De oorspronkelijke beperkingen hieronder gelden met die afgebakende uitzonderingen.

## Context

De werkstraat (framework §8) stopt na de reviewer; pushen, de PR, de CI-lus en conflicten liggen bij de eigenaar, die alleen wil mergen.
Het model van de bouwagent hangt nu aan de rol (`developer: inherit`, ADR 0023 punt 7 met een tweede bouwagent `developer-kritiek`),
niet aan het werk. Meer autonomie vraagt eerst kloppende rails; de review van 2026-10-12 (`docs/reviews/2026-10-12-werkstraat.md`, WS-01..WS-06)
vond gaten: `scripts/runner.sh:24` toetst alleen tegen `HEAD`, `committed` in `.claude/hooks/rolhek.mjs:47` kijkt naar `HEAD` terwijl
`check:migrations` de merge-base met `origin/main` neemt (`scripts/kit/check-migrations.mjs:55`), en mergen is voor de hoofdsessie
alleen een permissieregel (`.claude/hooks/lib/rolhek.mjs:441`). Besluiten van de eigenaar op 2026-10-12: E-1..E-4 en W-1..W-7 uit het plan.

## Besluit

1. **Stap "Opleveren"** in framework §8, tussen reviewer (5) en eigenaar (6), alleen door de hoofdsessie: featurebranch pushen, PR openen,
   CI-lus, conflicten oplossen, eindmelding. Mergen, goedkeuren, labels, check-statussen en statusovergangen blijven van de eigenaar;
   push naar `main` en force-push blijven verboden. Uitwerking: plan WS-04.
2. **Conflicten via `git merge origin/main`**, nooit rebase: rebase vraagt een force-push.
3. **Modelkeuze per spec.** Frontmatter `model: sonnet | opus`, bij opus een `modelreden`; gezet door de architect, goedgekeurd met de spec.
   Het veld geldt voor developer én tester (W-2); reviewer en architect blijven opus. Opus alleen bij: (a) gelijktijdigheid of geld;
   (b) datamigratie op bestaande rijen; (c) de kern van auth, MFA, sessies of `src/core`; (d) een `security definer`-functie of -view (W-1).
   Escalatie op bewijs: na 2 rode correctierondes of 2 gelijke blokkerende reviewbevindingen één keer opus, met reden in de PR.
   Vervangt ADR 0023 punt 7 (`developer-kritiek`). De hoofdsessie draait standaard op Sonnet: een werkafspraak, niet afdwingbaar (W-4).
   Uitwerking: plan WS-05.
4. **Wijzigt ADR 0009.** `scripts/runner.sh` vergelijkt de host-bestanden lokaal met de merge-base met `origin/main`; is die onleesbaar,
   dan weigert het script met de melding `git fetch origin`. In CI (`CI=true`) blijft de huidige controle tegen `HEAD`.
   `--sta-wijzigingen-toe` blijft de uitweg van de eigenaar.
5. **Rolhek: "gecommitte migratie"** = staat in de merge-base met `origin/main`, zoals `check:migrations`; zonder `origin/main`
   terugval op `HEAD` met melding.
6. **Mergen en force-push ook voor de hoofdsessie dicht in het rolhek**: `gh pr merge` (ook `--auto`), `gh api …/merge`, de
   GraphQL-merge-mutaties en elke vorm van force-push.
7. **Railgaten dichten** binnen ADR 0009 en 0011 (geen nieuw besluit): testpaden-hulpbestanden, configs als gate, de docs-rol zonder
   gate-paden (WS-02); hooks met de root uit de payload, `excludedCommands` gelijk aan `package.json`, reviewer diffs tegen `origin/main` (WS-03).
8. **MCP-tools onder het rolhek**, met een allowlist `mcpLezen` voor leestools (WS-06).
9. **Rood bewijzen bij migraties.** Bij een spec met een migratie bewijst de tester rood met één `pnpm test:db`-run (`ask`; de eigenaar
   leest de tests vooraf); de uitslag staat in de PR (W-5).
10. **Einde mandaat** (W-6). Het mandaat van 2026-10-10/11 is beëindigd tot `check-spec-approval` bestaat. De agent zet geen spec op
    `goedgekeurd` en geen ADR op `geaccepteerd`. De specs onder mandaat (`accountbeheer-uitbreiding`, `eigen-account`, `lijstpagina`,
    `rate-limit`) en ADR 0018–0022 en 0024 zijn ter herziening door de eigenaar (`docs/reviews/2026-10-11-keuzes-agent.md`);
    deze PR wijzigt hun status niet.

## Alternatieven

- **Auto-merge na groen**: verworpen, de eigenaar merget (E-2).
- **Rebase met `--force-with-lease`**: verworpen, zie punt 2.
- **Tweede bouwagent `developer-kritiek`** (ADR 0023 punt 7): verworpen, vervangen door punt 3.
- **Model per rol vast**: verworpen, de keuze hangt aan het werk (E-3).
- **Gescopet token of GitHub App nu**: uitgesteld, zie Niet beslist.

## Gevolgen

- Volgorde (aanbeveling, plan §4): eerst de omgeving door de eigenaar (toolchain en hooks, een GitHub-account met pushrecht voor `gh`,
  CodeQL-check in de ruleset); dan WS-03 en WS-06, WS-02, WS-04 (rails, daarna skill); WS-05 pas met meting of als bewust
  ongemeten besparing; daarna de proef-app (ST-09).
- Framework §8 (stap Opleveren, licht pad, rolhektabel, Claude Code-implementatie), §10 en §11 wijzigen in de PR's van de pakketten
  WS-02..WS-06: één pakket per PR, elk test-eerst (framework §1.5), elk een gate-wijziging die de eigenaar leest en merget.
- Tot de GitHub App bestaat, pusht de agent onder het GitHub-account van de eigenaar, via `gh` (framework §6 Agentveiligheid,
  `docs/framework.md:230`); de diff-guard blijft `overgang` (ADR 0017).
- ADR 0009 krijgt alleen een verwijsregel; ADR 0023 blijft ongewijzigd, punt 7 vervalt via deze ADR.

## Niet beslist

W-3 is uitgesteld: geen token, App, timer, sleutel of credentialwerk; ook niet `denyRead` op `~/.config/gh` (plan WS-04 punt 6).
Verder open: `scripts/check-github.mjs` en ST-01; onbeheerd werken in fases; ask-runs en het restrisico van de docker-groep.
Zie `docs/reviews/2026-10-12-werkstraat.md` §9 "Geparkeerd, nog uit te werken".
