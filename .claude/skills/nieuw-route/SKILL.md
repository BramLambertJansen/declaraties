---
name: nieuw-route
description: Een nieuwe API-route toevoegen (contract, defineRoute, permissie, tests) volgens het gouden pad. Alleen met een goedgekeurde spec.
allowed-tools: Bash(node scripts/kit/feiten.mjs *)
---

# Nieuwe route

Eerst: een spec met `status: goedgekeurd` in `docs/specs/`. Zonder die spec bouw je niets (AGENTS.md).

Feiten nu:

!`node scripts/kit/feiten.mjs routes permissies foutcodes`

Een nieuwe resource begint met `pnpm new:resource <naam> --rollen …` (hoofdsessie): contract, permissies en handlers die
501 geven; de gate-wijzigingen zet de hoofdsessie met Edit. Daarna, of voor een losse route,
`docs/gouden-pad.md`, stap 4 t/m 7:
1. Permissie in `src/shared/permissions.ts` (beschermd pad: akkoord eigenaar), foutcode in `src/shared/errors.ts` met tekst in `src/web/copy/errors.ts`.
2. Contract met zod en `.strict()` in `src/shared/contracts/<resource>.ts`, opgenomen in `src/shared/contracts/index.ts`.
3. Handler met `defineRoute` in `src/api/routes/<resource>.ts` (voorbeeld: `src/api/routes/accounts.ts`), opgenomen in `src/api/app.ts`. Gebruik `ctx.actor` en `tx`; vang geen Postgres-fouten af.
4. Integratietests in `test/api/<resource>.int.test.ts`: per verboden rol `FORBIDDEN`, een admin zonder MFA `MFA_REQUIRED`, ongeldige input `VALIDATION`, en elk acceptatiecriterium.
5. Bewijs: `pnpm gate:fast` en `pnpm test:db`.
