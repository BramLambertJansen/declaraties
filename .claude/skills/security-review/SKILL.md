---
name: security-review
description: Een beveiligingsreview van een branch of PR langs de regels van de template (rechten, RLS, CSRF, secrets, foutuitvoer). Read-only.
allowed-tools: Bash(node scripts/kit/feiten.mjs *), Bash(git diff *)
---

# Security-review

Routes en permissies nu:

!`node scripts/kit/feiten.mjs routes permissies`

Loop de wijziging (`git diff origin/main...HEAD`) af op:
1. Elke route via `defineRoute` met een permissie, input `.strict()`, en een test per verboden rol; een admin-actie eist MFA.
2. Elke nieuwe tabel: RLS geforceerd, expliciete grants, een policy per toegangspad met pgTAP-test; geen `SET ROLE` of `set_config(…, false)`.
3. `security definer`: `search_path = ''`, eigenaar `app_definer`, actorcontrole in de functie.
4. Geen `process.env` buiten `src/core/api/env.ts`; geen secret in de browser (alleen `VITE_`); niets uit `.env*` gelezen of gecommit.
5. Fouten naar buiten alleen als `{ code, requestId }`; geen stacktrace of SQL.
6. CSRF-middleware ongewijzigd, of met de testmatrix uit ADR 0007.
7. Geen nieuwe dependency zonder akkoord van de eigenaar.

Rapport: per bevinding `bestand:regel`, ernst, en het pad van invoer naar fout.
