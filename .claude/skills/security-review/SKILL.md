---
name: security-review
description: Een beveiligingsreview van een branch of PR langs de regels van de template (rechten, RLS, CSRF, secrets, foutuitvoer). Read-only.
context: fork
agent: reviewer
allowed-tools: Bash(node scripts/kit/feiten.mjs *), Bash(git diff *)
---

# Security-review

Dit is een onafhankelijke review met schone context, in een geforkte, read-only subagent (`reviewer`). De skill beoordeelt nooit eigen werk: wie de wijziging bouwde, draait hem niet.

Routes en permissies nu:

!`node scripts/kit/feiten.mjs routes permissies`

Loop de wijziging (`git diff origin/main...HEAD`) af op:
1. Elke route via `defineRoute` met een permissie, input `.strict()`, en een test per verboden rol; een admin-actie eist MFA.
2. Elke nieuwe tabel: RLS geforceerd, expliciete grants, een policy per toegangspad met pgTAP-test; geen `SET ROLE` of `set_config(…, false)`.
3. `security definer`: `search_path = ''`, eigenaar `app_definer`, actorcontrole in de functie.
4. Geen `process.env` buiten `src/core/api/env.ts`; geen secret in de browser (alleen `VITE_`); niets uit `.env*` gelezen of gecommit.
5. Fouten naar buiten alleen als `{ code, requestId }`; geen stacktrace of SQL.
6. CSRF-middleware ongewijzigd, of met de testmatrix uit ADR 0041.
7. Geen nieuwe dependency zonder akkoord van de eigenaar.
8. MFA en sessiesterkte: een gevoelige actie (beheer, accountwijziging, wachtwoord, MFA zelf) eist de vereiste sessiesterkte of MFA, niet alleen een login.
9. IDOR: kan een gebruiker met andermans id bij data? Controleer lijst-, detail- en wijzigroutes op eigenaarschap via actor en RLS, niet via een id uit de input.
10. Audit: elke mutatie van gevoelige data schrijft een auditregel via `app.audit`.
11. Rate limits: een nieuwe of gewijzigde route valt in een rate-limitcategorie.
12. Tokenflows (uitnodiging, reset, e-mailwijziging): eenmalig, met verloop, niet te raden, en geen token in logs of URL-logging.

Rapport: per bevinding `bestand:regel`, ernst, en het pad van invoer naar fout.
