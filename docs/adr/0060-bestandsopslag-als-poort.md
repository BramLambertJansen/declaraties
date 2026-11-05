# 0060 — Bestandsopslag als poort, zonder standaardopslag

Status: geaccepteerd

Drempel: A1 (nieuw contract tussen core en app: een app registreert een opslagadapter, [0040](0040-template-app-en-grens-core-app.md))
en A3 (de browser krijgt contact met een origin buiten de app via een kortlevende signed URL en een ruimere `connect-src`; een dev-route
buiten CSRF en `bodyLimit`). Aanleiding: leerpunt #313 ("documentupload wordt per app opnieuw bedacht"); activeert het storage-deel van
roadmap-item ST-11. Uitwerking: spec [bestandsopslag](../specs/bestandsopslag.md).

## Context

Een app die documenten laat uploaden, moet nu zelf opslag, eigenaarcontrole, limieten, signed URL's, metadata, een
uploadcomponent en opruimen bedenken. Dat gebeurt per app anders. Tegelijk kent de template geen provider ([0039](0039-stack-provider-neutraal-en-toolchain.md)
punt 2 en 4), en `docs/framework.md` §3 zet een directe data-API van een provider naar de browser uit. Bytes in Postgres
(bytea, large objects) zou een standaard opleggen die de eigenaar niet wil.

## Besluit

1. **Poort zonder standaardopslag.** Core definieert de poort `FileStorage` (upload-URL maken, download-URL maken, opvragen,
   verwijderen). De template levert geen productieopslag, geen provider-SDK en geen dependency. Een app kiest de provider per
   ADR (`0100`+) en levert een adapter op een plek die dat ADR toestaat (`docs/framework.md` §3). Zonder adapter registreert de API
   geen opslagtaken, vraagt hij geen extra configuratie en antwoorden de bestandsroutes dat opslag niet beschikbaar is.
2. **Eén contracttest voor elke adapter, afgedwongen.** Core exporteert een contracttestsuite; een check in de gate faalt als een
   adapter geen test heeft die de suite op hem draait (framework §1 punt 2). Het contract eist onder meer: een URL maken is lokaal
   ondertekenen zonder netwerkaanroep; een upload-URL schrijft één object en alleen als het nog niet bestaat; een download is een bijlage
   met een neutraal type.
3. **De browser alleen via een kortlevende signed URL.** Alleen de API maakt een URL, na permissie en eigenaarcontrole, voor één
   object en één methode, met een geldigheid die core begrenst. Geen provider-SDK in `src/web`. De regel in `docs/framework.md` §3 over
   een directe data-API van de provider wordt voor opslag: alleen zulke URL's; Storage-policies, publieke buckets en listing blijven uit,
   en de smoketest bewijst dat een browsersessie zonder URL niets leest of schrijft. De `connect-src` van de CSP krijgt alleen de
   upload-origin die de adapter opgeeft.
4. **Metadata in Postgres, eigenaar via RLS.** Elke upload heeft een rij met `owner_id`, met RLS zoals het tabelpatroon. De
   opslagsleutel volgt uit het id van de rij; invoer van de gebruiker (bestandsnaam) komt nooit in de sleutel.
5. **Verwijderen via een wachtrij.** Een verwijderde metadatarij (ook via `on delete cascade` bij accountverwijdering,
   [0051](0051-audit-log-en-avg.md) punt 11–12) zet de sleutel in een wachtrij in de database; een taak van de runner
   ([0050](0050-achtergrondtaken-en-mail-outbox.md)) verwijdert het object en herhaalt bij een fout. Onvoltooide uploads verlopen
   via de bewaarcatalogus.
6. **Lokaal en in tests een eigen adapter, nooit in productie.** Voor ontwikkelen en e2e levert core een adapter op schijf achter een
   dev-route, alleen bij `APP_ENV=local` of `test` (zoals `/api/dev/login-as`, [0043](0043-accounts-uitnodigen-mfa-en-beheer.md));
   elders bestaat die route niet. De route valt buiten `defineRoute`, login, CSRF en de algemene `bodyLimit`, want de browser stuurt het
   bestand zonder cookie naar een signed URL. Vervangende bescherming: een token met een sleutel die per proces willekeurig ontstaat,
   gebonden aan objectsleutel, methode en vervaltijd, bij een upload ook aan exacte grootte en type, bij een download aan de bestandsnaam; een eigen streaminglimiet op die grootte; schrijven alleen
   als het object nog niet bestaat. Dit is een rij in de uitzonderingstabel van `docs/framework.md` §3.
7. **Route kit in twee fasen.** Een route mag een voor-stap hebben voor aanroepen naar de opslag zonder bijwerking (zoals opvragen),
   begrensd door een time-out. De kit gebruikt daarvoor twee gewone `withUser()`-aanroepen: de eerste telt alleen de rate limit, dan volgt
   de voor-stap zonder transactie of vastgehouden verbinding, dan de tweede met rol- en permissiecontrole en de handler. De databasemodule
   verandert niet; de extra lege transactie is een bewuste kost voor alleen die routes. Een fout uit de voor-stap wordt bewaard en pas
   gegooid als de handler de uitkomst opvraagt, dus na rol, permissie, MFA, de beschikbaarheidscontrole en de eigenaarcontrole. Een route zonder voor-stap verandert niet.

## Alternatieven

- **Bytes in Postgres** (bytea of large objects): geen provider nodig, maar zwaar voor back-ups en pool, en een standaard die de
  eigenaar niet wil.
- **Upload en download via de API (proxy)**: geen extra origin in de CSP, maar elke byte gaat door het API-proces en botst met de
  harde `bodyLimit`; host-adapters met een kleine requestgrens kunnen het niet.
- **Alleen een gouden-padtekst, geen poort**: goedkoper, maar elke app kiest opnieuw de vorm van de grens; dat is het leerpunt.
- **Een S3-compatibele dienst in `compose.yaml`** voor lokaal: dichter bij productie, maar een extra service en een SDK of eigen
  ondertekening in de template.
- **Provideraanroepen in de transactie** of een tweede transactie per route: eenvoudiger in de route kit, maar een netwerkaanroep
  houdt dan een verbinding vast, of de route verliest één atomaire stap.
- **Tokensleutel afgeleid van een bestaand geheim**: overleeft een herstart, maar koppelt de dev-route aan het auth-geheim.

## Gevolgen

- `docs/framework.md` §3 krijgt een poortrij, de bijgestelde providerregel en de uitzondering voor de dev-route.
- Elke app krijgt de tabellen, routes en het scherm als startinhoud; zonder adapter zijn ze inert, en een app zonder bestanden verwijdert ze.
- Een app met bestanden kiest per ADR provider, adapterplek en regio; CORS, conditionele writes en levenscyclus van de bucket staan in een runbook.
- Een al uitgegeven URL blijft geldig tot hij verloopt, ook na verwijderen of blokkeren; daarom is de geldigheid kort en begrensd in core.
- Het opruimen werkt pas met de runner (ST-03); tot dan gebruikt een app bestanden niet in productie.
