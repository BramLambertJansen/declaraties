# 0011 — Railwerk: rolhek, geteste hooks, ratchet en goedkeuring

Status: vervangen door 0045

## Context

De template beschreef zijn rails als losse hooks, drie gespiegelde padenlijsten en een globale "bewaker" in CI. In de praktijk faalt railwerk
voor agents op voorspelbare plekken: een hook die zelf niet getest is, laat een omweg door (`echo x > "pad"`, een tweede commando na een
toegestane leesvorm, `core.hooksPath`); een agent keurt via `gh` zijn eigen werk goed of zet een label; een lijst die op drie plekken staat,
loopt uit elkaar; een regel die pas na de code komt, vraagt een grote opruimactie of wordt nooit ingevoerd; een agent bouwt op proza die
niet meer klopt. Elk van die gaten is pas echt dicht als een test bewijst dat de oude situatie faalde.

## Besluit

1. **Eén rolhek** (`.claude/hooks/rolhek.mjs` + `.claude/gates.json`) vervangt guard-files, tester-paden en readonly-bash.
   `.claude/gates.json` is de enige lijst van gate-paden, testpaden, `jsonGates` (`package.json` → `scripts`), goedkeurders en schrijfrecht per rol.
   CODEOWNERS en `ask` worden ermee vergeleken door `check-docs`; de diff-guard in CI leest dezelfde lijst.
2. **Hooks zijn gates**: elke hook heeft een tabeltest met echte stdin-payloads en de verwachte exitcode, inclusief bekende omzeilingen.
3. **Groen vóór klaar**: SubagentStop voor de developer blokkeert tot `gate:fast` groen is, ook bij een schone werkmap.
4. **Geen zelfreview**: lokaal geblokkeerd en in CI zonder effect: `gh pr review`, het label `gate-wijziging`, statussen en check-runs via `gh api`.
5. **Ratchet**: `.kit/baseline.json` plus ESLint bulk-suppressions; een nieuwe overtreding faalt, een opgeloste die nog in de baseline staat ook.
   De baseline laten groeien is een gate-wijziging.
6. **Gate-register** `scripts/kit/gates.mjs` (wat elk script bewaakt, snel of traag) is de enige gate-tabel; `check-docs` eist dat het gelijk is aan `gate:fast`/`gate:slow`.
7. **Live feiten**: `scripts/kit/feiten.mjs` (gates, routes, permissies, foutcodes, componenten, ADR-statussen, volgende vrije migratie- en ADR-nummer)
   wordt via `!`-injectie in skills en agentprompts geladen; elke rol begint met "eerst de feiten".
8. **Vijf rollen**: architect (spec en ADR), developer, tester, reviewer, docs (na merge: docs gelijk aan wat gebouwd is, regels die een gate nu afdwingt uit CLAUDE.md).
9. **Diff-guard met exacte semantiek**: een PR die een gate-pad raakt of een bestaande test wijzigt, vraagt het label `gate-wijziging` én een APPROVED-review van een
   goedkeurder die niet de auteur is, als laatste beslissende review op exact de head-SHA. Paden NUL-gesplitst; `package.json` alleen op `scripts`.
10. **Functiecatalogus in pgTAP**: elke functie in `public` en `app` is ingedeeld (client, intern); grants passen bij de klasse; elke client-functie
    controleert de actor; elke `security definer` heeft `search_path = ''`.
11. **Fixtures met omzeilingen** en **eerst reproduceren**: een rail-fix begint met een test die op de oude code faalt.
12. **Inrichting en supply chain**: `check-github` eist dat verplichte checks van GitHub Actions komen (`app_id`), `enforce_admins` en
    conversation resolution; scanner-uitzonderingen hebben een reden en een einddatum; secret scanning met Betterleaks (opvolger van gitleaks), image op digest.
13. **Release dubbel bewaakt**: `check-release-ci` vóór en na de build; `check-deployment-schema` faalt dicht en weigert een preview tegen de productiedatabase.
14. **Patronen**: idempotente mutaties (request-UUID, bonnetabel met payload-hash, advisory lock, tombstone; client legt intentie vast vóór het netwerk)
    en clientfouten (allowlist-velden, geen PII, 5 min dedupe, build-SHA).

Bewust niet: checks op SQL met regex (de template leest de catalogus), en bij elke stop de volledige testset zonder grens (`gate:fast` moet klein blijven).

## Alternatieven

- Losse hooks per rol met eigen padenlijsten: werkt, maar de lijsten lopen uit elkaar en omzeilingen worden per hook opnieuw gevonden.
- Alleen CI als bewaker, geen lokale hooks: veilig, maar de agent hoort pas na een push dat hij een grens raakte; dat kost beurten.

## Gevolgen

- Framework §1, §4, §7, §8, §9, §10, §12, AGENTS.md, CLAUDE.md, padregels, settings en roadmap zijn bijgewerkt.
- Het railwerk wordt gebouwd in roadmap fase 1 (stuk 1, 4, 5 en 6), elk onderdeel met zijn tabel- of fixturetest.
