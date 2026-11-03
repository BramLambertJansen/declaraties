---
status: gebouwd # #459; gevalideerd: 32513532dc72c4a301e0454bb9117991d4ac5043
namespace: onderdrukkingen-ratchet
---

# Ratchet op ESLint-onderdrukkingen

## Doel

`eslint-suppressions.json` mag alleen kleiner worden, en elke PR ziet hoeveel er nog staat en welke onderdrukkingen hij kan opruimen. Aanleiding: bevinding P5 van de review van 3 november 2026 (123 onderdrukkingen, een dag later 174, zonder doel of grens); het waarom van de ratchet staat in R-CI-02.

## Rollen en wie wat ziet

n.v.t. — `pnpm ratchet` lokaal en in CI; geen app-gebruikers.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes.

## Kopieer de vorm van

- `scripts/kit/leesbudget.mjs` — vergelijken met `git merge-base origin/main HEAD` en het gedrag zonder basis (`zonderBasis`)
- `scripts/kit/ratchet.mjs` — de kanalen `strikt` (nooit in de baseline) en `meldingen` (nooit een andere exitcode)

## Hergebruik en UX

n.v.t. — geen UI. Een overtreding noemt de lintregel, het aantal op de basis en nu, en wat de agent kan doen.

## Acceptatiecriteria

- **onderdrukkingen-ratchet/AC-1** — `pnpm ratchet` vergelijkt elk paar (bestand, lintregel) in `eslint-suppressions.json` in de werkmap met hetzelfde paar op `git merge-base origin/main HEAD`. Is `count` nu groter, dan is `pnpm ratchet` rood met per paar één overtreding in het kanaal `strikt` (nooit in `.kit/baseline.json`). Gelijk of kleiner is groen. Een bestand dat `git diff -M --name-status <basis>` als rename (`R`) toont, neemt de aantallen van zijn oude pad mee; een kopie (`C`) niet. De stand per lintregel (som over alle bestanden) is alleen een melding (AC-4).
- **onderdrukkingen-ratchet/AC-2** — Een paar dat op de basis ontbreekt of 0 is, valt onder AC-1, ook als de lintregel op de basis nergens onderdrukt was (`--suppress-rule` op een regel uit een preset, of opnieuw onderdrukken na `pnpm lint:prune` tot nul). Enige uitzondering: deze PR voert de lintregel in, dat wil zeggen dat de naam tussen aanhalingstekens (`'x'` voor `rails/x`, anders de volle naam) nu in `eslint.config.js` staat en op de basis niet. Dan geeft `pnpm ratchet` een melding met het aantal in plaats van een overtreding.
- **onderdrukkingen-ratchet/AC-3** — Zonder merge-base (geen `origin/main` of een ondiepe checkout), of met een ongeldig `eslint-suppressions.json` op de basis, vergelijkt `pnpm ratchet` niet: in CI is dat rood (`GITHUB_ACTIONS=true`, hetzelfde signaal als `zonderBasis` in `scripts/kit/leesbudget.mjs`), lokaal een melding, zonder andere exitcode. Ontbreekt `eslint.config.js` op de basis, dan telt geen lintregel als ingevoerd (AC-2). Een ongeldig bestand in de werkmap (geen JSON, geen object, of een `count` dat geen geheel getal ≥ 0 is) is altijd rood. Ontbreekt het bestand in de werkmap, dan is elk aantal 0; ontbreekt het op de basis, dan is elk paar nieuw (AC-2).
- **onderdrukkingen-ratchet/AC-4** — `pnpm ratchet` meldt (zonder overtreding) per lintregel de som nu en op de basis, en voor elk bestand dat de werkmap tegenover de basis wijzigt en dat onderdrukkingen heeft: het bestand, de lintregel en het aantal. Zo ziet de agent welke onderdrukkingen in zijn PR opgeruimd kunnen worden (het dalende doel per lintregel staat in `docs/roadmap.md`).
- **onderdrukkingen-ratchet/AC-5** — R-CI-02 noemt de ratchet op `eslint-suppressions.json` met bron deze spec; de beschrijving van `pnpm ratchet` in `scripts/kit/gates.mjs` noemt hem ook.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| `pnpm lint:prune` haalt opgeloste onderdrukkingen weg | daling: groen, melding met het nieuwe aantal (AC-1, AC-4) | n.v.t. |
| `eslint --suppress-all` of `--suppress-rule` voor nieuwe overtredingen | rood per paar (AC-1, AC-2) | n.v.t. |
| Opruimen in bestand A, nieuwe onderdrukking in bestand B onder dezelfde regel | rood voor B (AC-1) | n.v.t. |
| `git mv` van een bestand met onderdrukkingen | groen (AC-1); een `mv` die git niet als rename ziet (te veel gewijzigd, of niet gestaged) is rood | n.v.t. |
| Eén lintregel daalt, een andere stijgt evenveel | rood voor de stijgende (AC-1) | n.v.t. |
| Nieuwe rail in `eslint.config.js` met onderdrukte bestaande gevallen | melding (AC-2) | n.v.t. |
| Lintregel hernoemd in `eslint.config.js` | de nieuwe naam geldt als ingevoerd: melding (AC-2); grens is de eigenaarreview van `eslint.config.js` (Buiten scope) | n.v.t. |
| Lintregel met een sleutel zonder aanhalingstekens (`complexity: …`) | nooit ingevoerd: elke stijging rood (AC-2) | n.v.t. |
| Ondiepe checkout of ongeldige basis in CI | rood (AC-3) | n.v.t. |
| Nieuw bestand dat nog niet in git staat | AC-4 noemt het niet (`git diff` ziet alleen getrackte bestanden); AC-1 telt het wel | n.v.t. |
| `count: 1.5`, `count: -1` of kapotte JSON in de werkmap | rood (AC-3) | n.v.t. |

## Raakt ook

`scripts/kit/ratchet.mjs` (registratie in `strikt` en `meldingen`), `scripts/kit/gates.mjs` (beschrijving), `docs/framework.md` R-CI-02, `docs/roadmap.md` (één item met per onderdrukte lintregel het aantal en het doel). De reviewer toetst bij een melding van AC-2 of de PR de onderdrukkingen per bestand noemt.

## Buiten scope

Een rode check voor een PR die een bestand met onderdrukkingen raakt zonder ze op te ruimen (AC-4 meldt alleen; een kleine fix in `rails/hooks/lib/rolhek.mjs` met 10 onderdrukkingen blijft klein). Een lintregel uitzetten, hernoemen of bestanden uitsluiten in `eslint.config.js` (`off`, `files`, `ignores`): daarna haalt `pnpm lint:prune` de onderdrukkingen weg en daalt het aantal; die wijziging toetst deze check niet. De grens daar is dat `eslint.config.*` een gate-pad is (`.claude/gates.json`) met eigenaarreview. Binnen één paar ziet de check alleen het aantal: een overtreding oplossen en een andere toevoegen in hetzelfde bestand onder dezelfde regel blijft onzichtbaar (dat geldt ook voor ESLint zelf). `.kit/baseline.json`: die heeft al een eigen ratchet (R-CI-02).

## Testplan

Tabeltests in `test/rails/onderdrukkingen-ratchet.test.ts` voor de pure functies (AC-1 tot en met AC-4 en elk randgeval) en één test tegen een tijdelijke git-repo met `origin/main` voor de koppeling met git; een docs-test voor AC-5. Elke negatieve test faalt op de huidige code (R-PRINC-04).

## Open vragen

- **OV-1 ✅ besloten** — Per paar (bestand, lintregel) in plaats van een som per lintregel: met een som koopt opruimen in het ene bestand een nieuwe onderdrukking in een ander. Hernoemen blijft groen via de rename-detectie van git. Alleen een lintregel die deze PR zelf in `eslint.config.js` invoert, is een melding: een nieuwe rail maakt de code strenger, en de config is een gate-pad met eigenaarreview. Elke andere regel zonder onderdrukking op de basis (een preset-regel, of een regel die al tot nul was opgeruimd) is gewoon strikt.
