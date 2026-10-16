# 0032 — Developer-subagent volgt de hoofdsessie buiten `voorReview`

Status: geaccepteerd

Wijzigt [0029](0029-snellere-beslisroute.md) punt 9 (de zin over subagentrollen in het rolhek). Wijzigt verder geen besluit
uit 0029. De verwijsregel "Gewijzigd door 0032" in 0029 zelf voegt de eigenaar toe bij acceptatie; dit ADR wijzigt 0029 niet.
Besluitherkomst: eigenaar, 2026-10-16, in de sessie (vraag "Ook developer allow").

## Context

ADR 0029 punt 9 zegt dat het rolhek de hoofdsessie alleen nog vraagt op `voorReview` en op andere gate-paden een melding
geeft, en dat "Subagentrollen, migraties, gegenereerde bestanden en bestaande tests … in het rolhek ongewijzigd" blijven.
Letterlijk gelezen houdt de developer-subagent dus deny op elk gate-pad buiten zijn taakmandaat.

PR #174 (gemerged 2026-10-16, `0aacb6a`) bouwde het rolhek anders, op eigenaarbesluit in de sessie van 2026-10-16: de
developer (hoofdsessie én developer-subagent) krijgt buiten `voorReview` een melding ("noem het in de PR") in plaats van
deny. Zie `decideByRole` in `.claude/hooks/lib/rolhek.mjs`, `test/hooks/rolhek-voorreview.test.ts`, `docs/framework.md`
§8 stap 4 en `.claude/agents/developer.md` stap 3.

Een geaccepteerd ADR kan niet zonder heropend besluit wijzigen (`check-document-status`, ADR 0027 en 0031 besluit 3,
spoor 1: een normatieve wijziging is een nieuw ADR). Daarom legt dit aparte ADR het besluit vast.

## Besluit

1. **De developer-subagent volgt de hoofdsessie op gate-paden buiten `voorReview`**: geen deny en geen prompt, wel de
   melding dat het pad eigenaarreview in de PR vraagt en dat de developer het in de PR noemt.
2. **Ongewijzigd** blijven:
   - een onbekende subagent (`onbekendeRol`): deny op elk gate-pad, ook buiten `voorReview` (onbekende rol = strengste rol);
   - het schrijfrecht van architect, tester, reviewer en docs (`schrijfrecht`);
   - migraties, gegenereerde bestanden en bestaande tests;
   - `jsonGates` (de bewaakte sleutels in `package.json`, zoals `scripts`);
   - elk pad in `voorReview`: de developer krijgt daar deny buiten zijn taakmandaat.
3. **Ontbreekt `voorReview`** in de configuratie, dan telt elke gate als `voorReview` (faalt dicht).

## Alternatieven

- **Developer blijft deny buiten `voorReview`** (0029 punt 9 letterlijk). Dan moet de hoofdsessie elke wijziging aan
  `docs/adr/`, `src/api/{kit,server,env}.ts` en `deploy/` zelf doen, ook binnen een taak die de developer verder uitvoert.
  Verworpen: dat schuift werk naar de hoofdsessie zonder extra bescherming; de eigenaarreview in de PR is in beide gevallen
  de grens.
- **Ook onbekende subagents verruimen.** Verworpen: een subagent zonder bekende rol krijgt de strengste rol, anders kan een
  nieuwe of verkeerd benoemde agent het rolhek omzeilen.

## Gevolgen

- **Zwakte.** Een developer-subagent kan nu zonder prompt `src/core/**` en `deploy/**` wijzigen. De bescherming ligt bij
  CODEOWNERS, de diff-guard en de eigenaarreview in de PR. `check-core` bestaat nog niet (`.claude/rules/core.md`); tot dan
  is er voor `src/core/**` geen check die zo'n wijziging vóór de review tegenhoudt.
- **Bestaand open punt, niet door dit ADR veroorzaakt.** Een map wissen (`rm -rf scripts`) wordt niet door het patroon
  `scripts/**` gematcht; dat gat bestond al en blijft open.
- Het rolhek, de tests en de docs staan al zo op main (PR #174); acceptatie van dit ADR vraagt geen codewijziging.
- Geen nieuwe dependency, route, migratie of permissie; dus geen spec (framework §8 stap 1).
