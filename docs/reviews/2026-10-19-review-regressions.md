# Herstel van de codereview van 19 oktober

De negen bevindingen uit de review van `977b886` worden samen hersteld. Dit is onderhoud aan het bestaande fundament,
geen nieuwe feature. Voor de auditmigratie blijven `docs/specs/audit-log.md` (AC-25), ADR 0021 en ADR 0026 leidend;
de bescherming van de laatste admin, grants, permissies en routes veranderen niet.

| Bevinding | Herstel | Regressiebewijs |
|---|---|---|
| R1: disconnect op een uitgeleende client stopt het proces | Een clientlistener onderbreekt de request; de kapotte verbinding wordt vernietigd en het late werk kan niet committen. | `src/core/api/db/with-user-disconnect.test.ts`, `test/datapad/checked-out-disconnect.int.test.ts` |
| R2: een fout bij tokenopslag laat een account zonder rol achter | Mail en tokenopslag volgen na commit; fouten daarna laten een zichtbaar, opnieuw uitnodigbaar account staan. Compensatie bij een eerdere fout volgt na rollback. | `src/core/api/auth/invitations-lifecycle.test.ts`, `test/api/review-transactions.int.test.ts` |
| R3: sessie-opruiming draait blokkeren terug | De blokkade en auditregel committen vóór `revokeAll`, zoals ADR 0026 besluit 7 voorschrijft. | `test/api/review-transactions.int.test.ts` |
| R4: verlopen sessies blijven bij apparaten staan | Controle op zowel `expiresAt` als de absolute termijn; vraag actieve sessies op bij Better Auth. | `src/core/api/auth/session-expiry.test.ts`, `test/api/review-transactions.int.test.ts` |
| R5: een 401 stuurt door de oude cache terug naar de app | Cache wissen vóór navigatie; afronden van een nieuwe login begint eveneens met een lege cache. | `src/web/session-expiry.test.tsx` |
| R6: debounce overschrijft browser-terug | Externe querywijziging annuleert de timer; een bevestiging van eigen invoer behoudt verder typen en spaties. | `src/core/web/ui/list-toolbar-navigation.test.tsx` |
| R7: ongeldige datumcursor veroorzaakt 500 | Valideer de sorteersleutel per sorteertype; bewaar de ISO-tekst inclusief microseconden. | `src/api/routes/accounts-cursor.test.ts`, `test/api/accounts-cursor-validation.int.test.ts` |
| R8: readOnly Combobox wijzigt toch | Focus blijft mogelijk; kiezen, typen en wissen wijzigen de waarde niet. | `src/core/web/ui/combobox-readonly.test.tsx` |
| R9: gelijktijdige blokkades schrijven dubbele auditregels | Nieuwe migratie koppelt audit aan een werkelijk gewijzigde rij, voor beide statusovergangen. | `test/api/account-audit-race.int.test.ts` |

## Transactiegrens

`ctx.afterCommit(callback)` en `ctx.afterRollback(callback)` registreren externe gevolgen van een route.
`createApp` voert ze pas uit nadat `withUser` commit/rollback en het vrijgeven van de verbinding heeft afgerond.
Ook ongeldige output en een commitfout leiden tot rollback-compensatie. Compensatie loopt in omgekeerde volgorde;
een cleanupfout wordt gelogd en verbergt de oorspronkelijke fout niet. Als een externe stap na een disconnect alsnog
afrondt, wordt een daarna geregistreerde compensatie alsnog uitgevoerd.

Een fout in een callback na commit geeft een foutrespons, maar draait gecommitteerde data nooit terug. Daarom kan
een beheerder na een uitnodigingsfout het reeds zichtbare account opnieuw uitnodigen. Na een opruimfout blijft
`authGateway.getSession` een geblokkeerd account weigeren. De ruwe Better Auth-endpoints gebruiken die gatewaycontrole
niet; sessie-opruiming blijft daar relevant.

De accountlijst wordt na uitnodigen en blokkeren ook bij een fout geïnvalideerd: de server kan al gecommit hebben.
`src/web/features/accounts/mutation-invalidation.test.tsx` bewaakt dat de UI de werkelijke serverstatus opnieuw ophaalt.

De synchrone mailpaden worden niet vervangen door een outbox: dat blijft ST-03. Better Auth 1.7.7 slikt SMTP-fouten in
`runInBackgroundOrAwait` in; deze wijziging claimt daarom geen bezorggarantie. De bestaande directe `inviteUser`-aanroep
zonder app-transactie blijft synchroon en ruimt het auth-account bij een tokenfout zelf op.

## Validatie

Fase 0/1: bestaande infrastructuur, accountbeheer en UI-componenten. De PR vermeldt de werkelijke uitslagen van
`pnpm gate:fast`, `pnpm gate:slow`, build en de overige vereiste CI-checks op de opgeleverde commit.
Database-regressies gebruiken de echte runnerstack en wekken fouten op met echte locks en backendbeëindiging.
De bestaande `test/rails/check-secdef.test.ts` krijgt één extra verwachting voor de nieuwe functiedefinitie:
ook daar moet het ontbreken van `owner to app_definer` worden afgekeurd. Er zijn geen tests verwijderd of afgezwakt
en er is geen gecommitteerde migratie gewijzigd.
