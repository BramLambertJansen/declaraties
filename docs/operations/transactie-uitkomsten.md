# Onzekere transactie-uitkomst

`withUser()` rapporteert de uitkomst van de routetransactie via de optionele `onTransactionOutcome` in
`WithUserOptions` (`src/core/api/db/types.ts`). De aparte rate-limittransactie levert geen commitbewijs voor de route.
De waarnemer wordt na vrijgeven van de verbinding aangeroepen; een fout in die waarnemer vervangt het resultaat niet.

| Uitkomst | Bewijs | Gevolgen |
|---|---|---|
| `committed` | COMMIT is bevestigd | De geregistreerde afterCommit-acties mogen lopen; geen rollback-cleanup |
| `rolledBack` | ROLLBACK is bevestigd en COMMIT was nog niet verstuurd | Rollback-cleanup loopt in omgekeerde volgorde, ook bij laat geregistreerde cleanup |
| `unknown` | COMMIT-bevestiging ontbreekt, rollback faalt of de verbinding valt weg | Geen destructieve cleanup en geen afterCommit-acties; geen automatische retry |

Na het versturen van COMMIT kan de database de wijziging hebben opgeslagen terwijl de bevestiging verloren gaat.
Zo'n verbinding wordt vernietigd. Een latere ROLLBACK zou niet bewijzen dat de eerdere COMMIT niet is uitgevoerd.
Een onbekende uitkomst wordt daarom nooit automatisch als teruggedraaid behandeld.

## Herstel

Bij geregistreerde routegevolgen schrijft de API de vaste melding "onbekende transactie-uitkomst, cleanup overgeslagen"
met requestId en het routepatroon, zonder foutbericht, SQL of persoonsgegevens (`src/core/api/http/route-effects.ts`).
De request kan een foutrespons hebben terwijl zijn data al gecommit is.

1. Zoek de request en de bedoelde actie op met het requestId. Controleer de daadwerkelijke account-/resourcestatus en,
   waar van toepassing, de bijbehorende auditregel. Een auditregel uit dezelfde transactie bewijst de commit;
   alleen het ontbreken van die regel bewijst geen rollback.
2. Laat de eigenaar de uitkomst vaststellen vóór verwijderen, opnieuw aanmaken of een niet-idempotente herhaling.
   Een gecommit uitnodigingsaccount wordt niet als compensatie verwijderd. Gebruik na bevestiging zo nodig de bestaande
   actie voor opnieuw uitnodigen.
3. Meld een niet vast te stellen uitkomst als onopgelost. De duurzame outbox en verdere herstelautomatisering horen bij
   ST-03 en ADR 0050; deze foutafhandeling garandeert geen mailbezorging.

Een eigen `WithUser`-implementatie moet een mislukte transactie expliciet als `rolledBack` rapporteren om cleanup toe
te staan. Zonder rapport blijft de uitkomst bij een fout onbekend. De terugdraaiende testkit rapporteert de logische
savepointuitkomst, geen duurzame commit van de buitenste testtransactie.
