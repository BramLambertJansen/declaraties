# 0006 — Een app uit de template: koppeling, updates en start

Status: vervangen door 0040

## Context

Een app ontstaat met **Use this template**: nieuwe geschiedenis, geen instellingen of rulesets mee. ADR 0005 legt de koppeling vast
(`-s ours`, daarna gewone merges), maar framework §10 schrijft squash-merge voor elke PR voor. Squash verliest de tweede ouder,
waarna elke `git merge template/main` op alles conflicteert. Daarnaast: ADR-nummers in app en template lopen door elkaar,
de ruleset uit §10 is niet haalbaar zolang de agent geen eigen GitHub App heeft, en de setup van machine tot draaiende stack stond nergens
als uitvoerbare stappen.

## Besluit

- **Merge-commit voor de template.** De koppelings-merge en elke template-update landen als merge-commit (**Create a merge commit**).
  Gewone PR's blijven squash. De ruleset staat merge en squash toe, rebase niet.
- **Eerste push door de eigenaar.** De koppeling en de hernoeming pusht de eigenaar naar `main`, vóór de ruleset bestaat.
  Daarna gaat alles via PR.
- **ADR-nummers.** `0001`–`0099` zijn van de template; app-ADR's beginnen bij `0100`.
- **Tussentijdse ruleset.** Tot de GitHub App voor de agent bestaat: PR verplicht, geen force push of delete, 0 goedkeuringen,
  geen code-owner-review (de eigenaar kan zijn eigen PR niet goedkeuren). Met de App gaan code-owner-review en 1 goedkeuring aan.
- **Setup als playbook.** `docs/nieuwe-app.md` is de instructie voor Claude Code: machine, repo, koppeling, instellingen,
  lokale stack, baseline-migratie en databasebewijs. De agent gebruikt daarin geen Docker voor de app-stack; die start de eigenaar.
- **Hosting-ADR bij de eerste release** (roadmap fase 3), niet bij de start van een app.
- **Compose met `--env-file .env.local`**, omdat compose anders alleen `.env` leest en afwijkende poorten negeert.

## Alternatieven

- Alles squash, updates via cherry-pick of `git diff | git apply`: geen merge-commits, maar elke update handmatig en foutgevoelig.
- Fork in plaats van template: kan niet binnen hetzelfde account.
- Template als npm-pakket of generator: pas zinvol als de gedeelde code stabiel is (fase 2).

## Gevolgen

- `check-github` (fase 1) controleert dat merge-commits toegestaan zijn en rebase niet.
- Hernoemen in een app raakt alleen `package.json`, README en CHANGELOG (en CODEOWNERS bij een andere eigenaar); de rest van de template
  blijft gelijk. In die vier bestanden zijn conflicten bij een template-update verwacht; de app houdt haar eigen versie.
  App-code buiten `src/core` raakt de template niet (ADR 0008).
- Een app met een private repo op een gratis account heeft geen ruleset; de eigenaar kiest Pro, een organisatie met Team, of public.
