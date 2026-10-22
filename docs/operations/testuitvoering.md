# Begrensde testparallelisatie

`vitest.config.ts:16` begrenst het aantal workers voor de hele run op het kleinste van vier en de beschikbare
CPU-paralleliteit. Unitbestanden draaien parallel (`vitest.config.ts:27`); Vitest behoudt zijn bestaande isolatie.
De databasegroep `int` houdt `fileParallelism: false` (`vitest.config.ts:46`): die tests delen een database.
Selectie, asserties, retries en timeouts zijn niet aangepast.

De eerdere seriële unitgroep verwees in zijn commentaar naar database-isolatie, terwijl integratietests al in
het aparte `int`-project staan en uit `unit` worden uitgesloten. Unitfixtures maken eigen tijdelijke mappen;
de lintfixtures werken in het geheugen en de bundeltest schrijft geen bundel naar de projectmap.

## Lokale meting (21 oktober 2026)

De gewone volledige `pnpm gate:fast` is vóór en na de configuratiewijziging uitgevoerd in dezelfde werkmap op
main `542e300`, met dezelfde documentatie en toolchain. De machine heeft 16 beschikbare CPU's en 8 GB geheugen.

| Uitvoering                       | Totale duur | Vitest-duur | Uitslag                   |
| -------------------------------- | ----------: | ----------: | ------------------------- |
| Bestaande configuratie           |   229,769 s |    151,77 s | 3.269 geslaagd            |
| Bestaand, herhaling (warme tools) |   288,651 s |    205,58 s | 3.259 geslaagd, 10 fouten |
| Begrensd, unit parallel          |   163,048 s |     77,86 s | 3.269 geslaagd            |

De groene vergelijking bespaart 66,721 seconden (29,0%) voor de hele gate. De rode nulmeting had bestaande
UI-time-outs en telt niet mee als snelheidswinst. Dit zijn losse metingen op één machine, geen garantie voor
andere hardware of bewijs dat alle sporadische time-outs verholpen zijn. Alle 210 testbestanden blijven actief.

Een eerdere diagnostische proef met dezelfde 3.300 tests op bron `80a3e3b` was groen met twee én vier workers
(Vitest 101,99 respectievelijk 60,47 seconden); beide hadden exact dezelfde testnamen en nul overgeslagen tests.
De volledige gate hierboven gebruikt de gewone opdracht, zonder extra Vitest-opties of runneroverride.
Database-, browser- en snapshotbewijs komt uit de bestaande CI; de PR vermeldt de werkelijk gecontroleerde SHA.
