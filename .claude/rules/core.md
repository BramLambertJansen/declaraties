---
paths:
  - "src/core/**"
---

# Regels voor `src/core`

- `src/core` is van de template (ADR 0008). In een app wijzig je het niet: updates komen alleen via `git merge template/main`,
  en `check-core` (nog niet gebouwd, zie onderaan) laat een andere wijziging falen. In de template zelf mag het met eigenaarakkoord, ook door de developer binnen een exact taakmandaat uit main (ADR 0027).
- Core importeert nooit uit `src/api`, `src/web` of `src/shared`. Wat core van de app nodig heeft, krijgt het als argument van een
  compositie-root (`src/api/app.ts`, `src/api/kit.ts`, `src/web/lib/api.ts`). Geen globale registratie, geen mutable singleton.
- Elke uitbreidingsplek (permissies, foutcodes, limieten, env, componentvarianten) heeft in core een test die bewijst dat een app
  hem gebruikt zonder core te wijzigen.
- Past iets voor een app niet in core: stop en stel een uitbreidingsplek voor in de template, in plaats van core in de app aan te passen.
- Nieuwe rol: `ROLES` in `src/core/shared/can.ts`, een migratie voor de CHECK op `public.user_roles.role`, een seed-account in
  `src/core/api/dev/seed-accounts.ts` en een naam in `roleLabels` (`src/web/copy/ui.ts`). TypeScript dwingt de laatste twee af;
  de dev-rolwisselaar toont de rol dan vanzelf.

## Besloten, nog niet gebouwd

Gebouwd: `src/core/api/{env.ts,db,http,auth,mail}`, en in `src/core/shared`: `errors.ts` (`defineErrorCodes`), `can.ts` (`definePermissions`,
MFA-eis voor admin), `limits.ts`, `assert.ts`, `unsafe-cast.ts`, `ids.ts` (`brandedId`), `money.ts` (`Cents`), `cursor.ts`; de API-client;
de dependency-cruiser-regel core → app.
Nog niet: `check-core` en de rest van core (roadmap fase 1).
Bouw een core-onderdeel alleen in het stuk van de roadmap waar het hoort.
