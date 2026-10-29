---
name: migratie
description: Een databasemigratie schrijven met RLS, grants, policies en pgTAP-tests, en het schema opnieuw genereren. Alleen met een goedgekeurde spec.
allowed-tools: Bash(node scripts/kit/feiten.mjs *)
---

# Migratie

Eerst: een spec met `status: goedgekeurd`. Een gecommitte migratie wijzig je nooit; maak een nieuwe (het rolhek weigert het ook).

Feiten nu:

!`node scripts/kit/feiten.mjs migraties`

Een nieuwe resource met een eigenaar per rij begint met `pnpm new:resource <naam> --rollen …` (hoofdsessie): die schrijft de
migratie met het tabelpatroon. Velden komen daarna in een nieuwe migratie, met kolomgrants (`docs/gouden-pad.md`).

Regels (AGENTS.md, `.claude/rules/database.md`):
1. `db/migrations/<tijdstempel>_<naam>.sql` met een tijdstempel na de laatste; nooit rollen maken.
2. Elke tabel: RLS aan en geforceerd, expliciete grants in dezelfde migratie. Policies met `(select app.current_user_id())`.
3. `security definer` alleen met `set search_path = ''`, volledig gekwalificeerde namen en eigenaar `app_definer`; zet de functie in de catalogus in `db/tests/functies.sql`.
4. pgTAP per policy in `db/tests/`, met een assert waarvan de beschrijving met de policynaam begint (`'<naam>: …'`): check-policies in `pnpm test:db` eist dat.
5. `pnpm db:generate` voor `db/schema.snapshot.sql` en `src/api/db/schema.ts` (gegenereerd; nooit met de hand). Nieuwe id-kolom: `db/ids.json`.
6. Bewijs: `pnpm test:db` en `pnpm check:snapshot` (of `pnpm gate:slow`).
