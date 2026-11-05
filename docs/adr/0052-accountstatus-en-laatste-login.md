# 0052 — Afzonderlijke accountmaatregelen en laatste geslaagde login

Status: geaccepteerd

Herzien: 2026-10-30 (#385): in Gevolgen vervalt het taakmandaat; de bronbestanden blijven als scope
([0063](0063-compacte-kennisbasis-en-lichtere-werkstraat.md)).

## Context

De eigenaar bevestigde op 2026-10-21 twee keuzes uit de
[spec accountstatus-en-laatste-login](../specs/accountstatus-en-laatste-login.md): deactiveren en blokkeren zijn
afzonderlijk omkeerbaar, en alleen volledig geslaagde login telt, inclusief vereiste MFA. Alleen beheerders zien
de laatste login. De eigenaar gaf op 2026-10-21 ook akkoord op deze technische invulling en vervolgens expliciet
opdracht de feature vóór de besluitmerge te bouwen. Dit document is geen bouwbewijs.

[ADR 0026](0026-account-blokkeren.md) regelt blokkeren via de auth-user, een gecontroleerde databasefunctie en
de laatste-admin-lock. Actuele main controleert blokkades en absoluut sessieverval ook op directe auth-routes,
en `src/api/routes/accounts.ts` ruimt sessies na de commit op. Deze uitbreiding behoudt die garanties en voegt
onafhankelijke deactivatie en sessiegeneraties toe: ook auth-routes moeten beide maatregelen respecteren, en activeren of deblokkeren
mag een oude sessie nooit opnieuw toegang geven als fysieke sessie-opruiming mislukte of overlapte met login.

## Besluit

Inhoudelijk akkoord van de eigenaar op 2026-10-21, voortbouwend op ADR 0026:

1. **Uservelden.** Nieuwe nullable kolommen `better_auth."user".last_login_at` en `deactivated_at`, beide
   `timestamptz`. Better Auth krijgt aanvullende velden `lastLoginAt` en `deactivatedAt` met `input: false`.
   De bestaande `blocked_at` blijft zelfstandig. Geen historische backfill van de laatste login.
2. **Sessiegeneratie.** Een nieuwe `session_version` op de user en op de sessie, beide gehele getallen met
   beginwaarde nul. Bestaande sessies beginnen op nul; de waarde is uitsluitend servergestuurd. Iedere echte
   overgang naar geblokkeerd of gedeactiveerd verhoogt de userversie atomair in de statusmutatie. Herstel verlaagt
   de versie niet. De sessie neemt bij het controleren van accounttoegang vóór aanmaak de userversie over.
   Een latere MFA-stap of sessievervanging mag een verouderde versie niet stilzwijgend actualiseren.
3. **Toegang.** Sessies zijn uitsluitend bruikbaar als beide maatregelen ontbreken én de sessieversie gelijk is
   aan de huidige userversie. Dit geldt voor de applicatiegateway, rechtstreekse auth-routes en serveraanroepen
   van gevoelige auth-operaties. Nieuwe sessies voor een uitgeschakeld account worden geweigerd. Een maatregel
   die na de eerste controle commit, maakt een tussentijds aangemaakte sessie via de versie alsnog ongeldig.
   Een oude cookie blijft ook na activeren/deblokkeren ongeldig. Fysieke sessie-opruiming is aanvullend en mag
   de gecommitte toegangsweigering niet terugdraaien; een opruimfout mag ook geen geldige sessie opleveren.
4. **Laatste login.** Auth schrijft een servertijdstip uitsluitend na een volledig geslaagde toegestane login.
   Bij vereiste MFA telt alleen de afgeronde MFA-stap. Geen update bij mislukte login, onvoltooide MFA,
   sessieverversing, profielwijziging of sessievervanging na wachtwoordwijziging. Het vastleggen gebeurt
   conditioneel op nog toegestane accounttoegang en de juiste sessieversie; een gelijktijdig ingetrokken sessie
   mag geen nieuwe geslaagde login registreren. Een update bewaart het grootste tijdstip, zodat gelijktijdige
   logins de waarde nooit terugzetten. Een schrijffout levert geen geslaagde login op.
   De compositie-root registreert via een callback of de rol MFA vereist; auth leest zelf geen app-tabellen.
   Een MFA-challenge bewaart een gekoppelde sessieversie in een even lang geldig verificatierecord, zodat
   blokkeren gevolgd door deblokkeren geen nog lopende challenge opnieuw geldig maakt.
5. **Deactiveren.** Nieuwe functie `app.set_account_deactivated(p_user_id text, p_deactivated boolean) returns void`,
   `security definer`, eigenaar `app_definer`, `set search_path = ''`, volledig gekwalificeerde namen en execute
   uitsluitend aan `app_authenticated`. De functie eist `app.is_mfa_admin()`, controleert bestaan en credentials,
   weigert eigen deactivatie, en gebruikt dezelfde advisory lock als blokkeren en rolwijzigingen.
   Een herhaling is een no-op; een echte wijziging schrijft in dezelfde transactie `core.account.deactivate`
   of `core.account.activate`, met actor, doel en requestId. Activeren wijzigt `blocked_at` niet.
6. **Laatste beheerder.** De blokkeerfunctie, deactivatiefunctie en bestaande laatste-admin-trigger hanteren
   dezelfde definitie: admin met credentials, zonder blokkade en zonder deactivatie. Controle en mutatie
   serialiseren via de bestaande lock; blokkeren en deactiveren kunnen elkaar daardoor niet passeren.
7. **Grants.** Breid uitsluitend de bestaande kolom-allowlist van `app_definer` uit met select op `last_login_at`,
   `deactivated_at` en user-`session_version`, en update op `deactivated_at` en user-`session_version`.
   Auth schrijft de laatste login als `auth_service`; `app_definer` krijgt geen toegang tot de sessietabel.
   Geen nieuwe databaserollen, brede grants of providerafhankelijkheid. De nieuwe functie komt in de
   functiecatalogus; elke nieuwe grant wordt door de bestaande allowlist-invarianten getoetst.
8. **Accountlijst.** De view `app.accounts` voegt de nieuwe velden achter de bestaande kolommen toe en behoudt
   eigenaar en MFA-adminfilter. Het strikte contract geeft tijdstippen als ISO-string of null. De lijst toont
   blokkade en deactivatie afzonderlijk; zoeken/filteren mag geen van beide verbergen bij gelijktijdigheid.

## Alternatieven

- Eén status voor blokkeren en deactiveren: past niet bij het bevestigde eigenaarbesluit.
- Alleen sessies verwijderen: een opruimfout of race kan na herstel een oude sessie opnieuw bruikbaar maken.
- Laatste login afleiden uit sessieactiviteit: sessieverversing telt dan mee en opgeruimde sessies verliezen historie.
- Eigen app-tabel voor accountmaatregelen: vraagt extra datatoegang vanuit auth naast de bestaande uservelden.

## Gevolgen

Nieuwe append-only migratie; uitbreiding van authvelden, hooks, sessiecontrole, laatste-admin-controle,
beheerview en UI. Geen nieuwe dependency. De generator past niet bij deze uitbreiding van een auth-user en
bestaande view; de bouw gebruikt de bestaande routecontracten en UI-componenten.

Vóór de bouw worden de uitzondering op auth-kolomrechten in framework §6, de betrokken ADR-verwijzingen en de
database-invarianten met eigenaarakkoord bijgewerkt. De bronbestanden van dit besluit
zijn `src/core/api/auth/auth.ts`, `src/core/api/auth/options.ts`, `src/core/api/auth/hooks.ts`, de nieuwe
`src/core/api/auth/account-lifecycle.ts`, `src/core/api/auth/session-policy.ts` en
`src/core/api/auth/session-guard.ts` en `src/core/api/auth/profile.ts`, plus `src/api/app.ts` en `src/api/server.ts`.
De hulpmodule bundelt de controles en registratie
uit dit besluit.
Beschermde docs en bestaande tests behouden hun eigen reviewvereisten.

Integratie- en pgTAP-tests bewijzen versies, auth-toegang, atomaire audit en de gemengde laatste-admin-races.
E2E bewijst laatste-loginweergave en alle vier statuscombinaties, inclusief ongeldige oude cookies na herstel.
De gepinde Better Auth-versie moet de hooks met echte lokale-stacktests bewijzen; een ontbrekend hookpunt is
een ontwerpblokkade, geen reden om de toegangsgarantie af te zwakken.
