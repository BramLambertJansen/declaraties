---
name: security-review
description: Een beveiligingsreview van een branch of PR langs de regels van de template (rechten, RLS, CSRF, secrets, foutuitvoer). Read-only.
context: fork
agent: reviewer
allowed-tools: Bash(node scripts/kit/feiten.mjs *), Bash(git diff *)
---

# Security-review

De review draait in een aparte reviewer-subagent (read-only via de toolslijst van de agent en het rolhek); de sessie die de wijziging bouwde, beoordeelt haar niet zelf.

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
8. MFA en sessiesterkte: admin-permissies lopen via `MFA_REQUIRED` in `can()`; gevoelige accountwijzigingen eisen een verse sessie (`SESSION_FRESH_SECONDS`, anders `SESSION_NOT_FRESH`) en met TOTP sterkte `mfa`, niet alleen een login.
9. IDOR: kan een gebruiker met andermans id bij data? Controleer lijst-, detail- en wijzigroutes op eigenaarschap via actor en RLS, niet via een id uit de input.
10. Audit: een app-route registreert haar actie (`defineAuditActions`) en schrijft via `ctx.audit`; acties via Better Auth gaan via `app.audit_account_action`. `app.audit` weigert doeltype `account` en het voorvoegsel `core.`. Lees-acties, inloggen en mislukte pogingen worden niet gelogd (ADR 0051 punt 8).
11. Rate limits: elke route heeft een categorie via `rateLimitCategory()`; toets of die past. Dure of gevoelige routes horen in `duur` (`limits.ts`); `/api/auth/*` valt onder de Better Auth-limiet.
12. Tokenflows: uitnodiging en reset zijn eenmalig via Better Auth; de e-mailwijzigingslink is een stateless JWT, herbruikbaar binnen `EMAIL_CHANGE_TTL_SECONDS` (kort verloop is de beveiliging). Voor alle flows: verloop volgens `src/core/shared/limits.ts`, niet te raden, geen token in logs.

Rapport: per bevinding `bestand:regel`, ernst, en het pad van invoer naar fout.
