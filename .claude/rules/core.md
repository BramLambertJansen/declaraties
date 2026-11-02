---
paths:
  - "src/core/**"
---

# Regels voor `src/core`

Letterlijk uit `docs/framework.md`; bij verschil wint het regelboek.

- **R-LAAG-01** Zones: `src/core/{api,web,shared}` is template (in app alleen via template-merge); app-code in `src/{api,web,shared}` (0040)
- **R-ARCH-07** `check-core` laat wijziging van `src/core/` in app falen behalve vertrouwde template-merge; verplicht in app-ruleset. Bekend gat: merge met oudere template-commit kan core terugzetten of wissen (0040)
- **R-REPO-03** Beschermde paden in `.claude/gates.json`, eigenaarakkoord; developer: `voorReview`-pad volgens R-WERK-10; `src/api/app.ts` en `src/shared/permissions.ts` geen gate; geen gegenereerde bestanden of `.env*` bewerken (0046)
- **R-LAAG-02** App importeert core, core nooit app; core krijgt app-input als argument van compositie-root (`src/api/app.ts`, `src/api/kit.ts`, `src/web/lib/api.ts`); geen globale registratie of singleton (0040)
- **R-ARCH-02** Elk uitbreidingspunt heeft core-test dat app het zonder core-wijziging gebruikt (plaats en gebruik: ADR 0040 punt 10); core/app-tabel via `src/shared/{permissions,errors,limits,ids,audit}.ts` (0040)
- **R-ARCH-01** App breidt uit door registreren, nooit core wijzigen; past iets niet: stel uitbreidingsplek in template voor; core-fout oplossen in template (0040)
- **R-ARCH-03** Nieuwe rol: `ROLES` in `src/core/shared/can.ts`, migratie voor CHECK op `public.user_roles.role`, seed-account in `src/core/api/dev/seed-accounts.ts`, naam in `roleLabels` (rules)

Hoe (geen norm):

- Core-updates in een app via `git merge template/main` (R-LAAG-01); `check-core` is een job in `guard.yml` (`scripts/kit/check-core.mjs`) en staat in de template zelf uit. In de template wijzigt core met eigenaarakkoord (R-REPO-03).
- `src/shared` is app-code, dus core importeert er niet uit (R-LAAG-02). Uitbreidingsplekken: permissies, foutcodes, limieten, env, componentvarianten.
- `roleLabels` staat in `src/web/copy/ui.ts`; TypeScript dwingt seed-account en naam af, de dev-rolwisselaar toont de rol dan vanzelf.

## Besloten, nog niet gebouwd

Gebouwd: `src/core/api/{env.ts,db,http,auth,mail}`, en in `src/core/shared`: `errors.ts` (`defineErrorCodes`), `can.ts` (`definePermissions`,
MFA-eis voor admin), `limits.ts`, `assert.ts`, `unsafe-cast.ts`, `ids.ts` (`brandedId`), `money.ts` (`Cents`), `cursor.ts`; de API-client;
de dependency-cruiser-regel core → app; `check-core`.
Nog niet: de rest van core (roadmap fase 1).
Bouw een core-onderdeel alleen in het stuk van de roadmap waar het hoort.
