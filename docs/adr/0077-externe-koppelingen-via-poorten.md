# 0077 — Externe koppelingen via één vast patroon met poorten

Status: geaccepteerd

Vult [0060](0060-bestandsopslag-als-poort.md) punt 7 aan met een tweede soort voor-stap, de partnerstap; de voor-stap voor
opslag, spec [bestandsopslag](../specs/bestandsopslag.md) en R-OPSL-03 veranderen niet. Drempel: A1 (nieuw contract tussen
core en app: register, uitgaande client, foutcodes met status 502, 503 en 504) en A3 (een machineroute zonder login als
uitzondering in `docs/framework.md` §3; een nep-partner in integratietests als uitzondering op R-TEST-01). Aanleiding: verzoek van de eigenaar op 3 en 4 november 2026 (thread "Externe API-koppelingen in het
framework beoordelen").

## Context

Een app die een externe dienst aanroept, moet nu zelf client, time-out, herhalen, geheimen, webhookcontrole, tokenopslag en
foutvertaling bedenken; een eigen foutcode van de app wordt stil 409. Elke agent kiest daardoor een andere vorm. De
voor-stap uit 0060 punt 7 is nooit gebouwd en controleert de permissie pas na de aanroep, dus een gebruiker zonder recht
kan kosten en quota bij de partner verbruiken.

## Besluit

1. **Eén patroon, zes kenmerken.** Elke koppeling wordt in de spec ingedeeld op machtiging, richting, ritme, gevoeligheid,
   kosten en quota, en bron van waarheid. Elke waarde wijst naar één bouwsteen; ontbreekt die, dan wordt de koppeling niet
   gebouwd. Bij een gedeelde bron van waarheid legt de spec de conflictregel vast.
2. **Bouwstenen in core**: register en schakelaar per koppeling (uit = geen aanroep); een uitgaande client op de
   ingebouwde `fetch` met verplichte time-out, begrensd herhalen, host-allowlist en schemacontrole op elk antwoord; core-
   foutcodes `UPSTREAM_UNAVAILABLE` (503), `UPSTREAM_TIMEOUT` (504) en `UPSTREAM_INVALID` (502); een `secret()`-schema
   voor geheimen in env; lintregels die netwerk buiten de client weigeren; een partnerstap in de route kit; een vaste vorm
   per koppeling (poort, adapter, schema's, contracttest); outbox en sync; machineroute en inbox; een tokenkluis per
   gebruiker; beheerschermen; en een agentlaag.
3. **Nooit netwerk in een transactie, nooit via `afterCommit`.** De client weigert een aanroep binnen elke transactie van
   `withUser` en, na ST-03, `withJob`; de route kit en de runner zetten daarvoor een markering. Schrijven naar de partner gaat
   als opdracht in een eigen outbox in dezelfde transactie; de runner voert hem idempotent uit, met dezelfde claim-, lease- en
   markeercyclus als de mail-outbox van 0050. De mail-outbox blijft bestaan; samenvoegen is een later besluit.
4. **Machineroute zonder login** als één limitatieve uitzondering in §3 (naast R-UIT-02): alleen onder één vast padprefix en
   alleen voor geregistreerde koppelingen. Hij valt buiten `defineRoute`, login, CSRF en de algemene `bodyLimit`; daarvoor in
   de plaats komen een verifier per koppeling, een tijdvenster, een eigen groottegrens, een rate limit per IP en een inbox
   die op event-id ontdubbelt. Verwerken doet de runner, niet het verzoek. Een check laat elke route buiten `defineRoute`
   falen die niet in de lijst van §3 staat. Of het cronpad van ST-03 deze vorm overneemt, beslist ST-03.
5. **Beheerverdeling.** Geheimen staan in env, gecontroleerd door `secret()`: buiten `local` en `test` geen lege, korte of
   demowaarde, en buiten `production` geen live-sleutel volgens het patroon dat het app-ADR van de koppeling opgeeft. Een admin met MFA zet een koppeling aan of
   uit, ziet de status en speelt een opdracht opnieuw af met een verse sessie en een auditregel. Daarvoor moet core eigen
   auditacties kunnen registreren; hoe, blijft open en valt in de besluit-PR van het beheer. Een gebruiker koppelt alleen zijn eigen
   account. Er komt geen developer-rol. Geheimen beheren via de UI vraagt een apart besluit.
6. **Testen.** Integratietests draaien tegen een lokale nep-partner (een echte HTTP-server in de test met vastgelegde
   antwoorden); eigen code en database blijven echt. De uitzondering op R-TEST-01 komt in de bouw-PR die de nep-partner
   levert. Elke koppeling krijgt daarnaast één handmatige run tegen de testomgeving van de partner, met commando en uitkomst in de PR.
7. **Partnerstap: permissie vóór de aanroep.** Volgorde: rate limit, rol, permissie en MFA; in de eerste `withUser` alleen
   wat de stap nodig heeft (een extern ID, of een token via een `client`-functie met actorcontrole) en de stand van de
   schakelaar; de aanroep zonder transactie; daarna de tweede `withUser` met de handler. Foutvolgorde: `FORBIDDEN`,
   `MFA_REQUIRED` en `NOT_FOUND` gaan vóór elke `UPSTREAM_*`-fout; een uitgezette koppeling geeft `UPSTREAM_UNAVAILABLE` zonder
   aanroep. Een route met partnerstap gebruikt `rateLimit: 'duur'`.
8. **Leverancierneutraal.** Template-code, -tests, -specs en -docs noemen geen bestaande dienst; alleen een app-ADR
   (`0100`+) noemt de partner, met scopes, regio, verwerker en bewaartermijn.
9. **Agentlaag.** Een skill `nieuwe-koppeling`, een paragraaf "Koppeling" in het spec-template en een sectie `koppelingen`
   in de feiten zorgen dat elke agent hetzelfde patroon volgt.
10. **Bouwvolgorde.** Eerst client, foutcodes, `secret()` en lintregels; dan register, partnerstap, vaste vorm met
    contracttest, en de skill. Na de runner (ST-03): outbox en sync, machineroute en inbox, tokenkluis, beheer. Elke fase met
    een migratie, databasefunctie of rolgrant krijgt een eigen besluit-PR met spec.

## Alternatieven

- **Elke app bouwt zelf**: geen core-werk, maar elke koppeling krijgt een eigen vorm en eigen gaten; dat is de aanleiding.
- **Een SDK per partner**: snel, maar een dependency per dienst, zonder vaste time-out, foutvertaling of transactiegrens.
- **Geheimen in de database**: beheer via de UI, maar sleutelbeheer, rotatie en een nieuw aanvalspad in elke app.
- **Een aparte developer-rol** voor sleutels en status: extra rol in `can()` en RLS voor wat env en de admin al dekken.
- **Consumer-driven contract testing**: sterker bewijs, maar vraagt medewerking van de partner en extra tooling.

## Gevolgen

- `docs/framework.md` krijgt de foutcodes, de netwerkregel, de machineroute in §3 en de uitzondering op R-TEST-01, elk in
  de bouw-PR die het levert; de roadmap krijgt een eigen item.
- De lintregel tegen netwerk buiten de client laat `src/core/api/mail/smtp.ts`, opslagadapters die een ADR toestaat
  (R-PROV-03) en `deploy/<host>/` buiten beschouwing; een toegestane SDK krijgt de `fetch` van de client.
- Tot de partnerstap en de vaste vorm gebouwd zijn, bouwt een app geen koppeling; tot de runner er is alleen lezen op
  verzoek met een app-sleutel.
- Een route met partnerstap kost een extra korte transactie; uitval van de partner houdt geen databaseverbinding vast.
- Contracttests bewijzen het gedrag tegen vastgelegde antwoorden, niet tegen de partner zelf; de handmatige run vult dat aan.
