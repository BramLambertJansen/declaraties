# Veilige foutlogging van idle databaseverbindingen

`src/core/api/db/pool.ts` gebruikt voor idle fouten dezelfde metadata-allowlist als onverwachte requestfouten
(`src/core/api/http/safe-error-log.ts`), met behoud van het waarschuwingsniveau. Dit geldt ook voor de readiness-pool.
De vaste labeltekst en geldige SQLSTATE blijven beschikbaar; message, SQL, parameters, detail, stack en cause niet.
Een loggerfout mag de foutlistener niet laten werpen: een verloren idle verbinding beëindigt het proces niet.

De unitproef `src/core/api/db/pool-privacy.test.ts` injecteert synthetische SQL en persoonsgegevens in een echte
pg.Pool-foutgebeurtenis zonder databaseverbinding. De bestaande disconnect-integratietests bewaken dat de volgende
request opnieuw kan verbinden. Zoek in de log op het vaste label en de SQLSTATE; er is voor een idle gebeurtenis geen
requestId. Dit wijzigt de logvorm, zonder extra foutdetails naar de API te sturen.
