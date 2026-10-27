---
status: goedgekeurd # voorstel | goedgekeurd | gebouwd | vervallen — de merge door de eigenaar is het besluit (ADR 0046); gebouwd: # #<PR>; gevalideerd: <sha> (pnpm docs:status)
namespace: files
---

# Bestandsopslag: poort, metadata en documentupload

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

Uitwerking van [ADR 0060](../adr/0060-bestandsopslag-als-poort.md); aanleiding leerpunt #313; storage-deel van roadmap-item ST-11.
Bouwen in drie delen, elk een eigen PR in deze volgorde:

| Deel | Inhoud | Wacht op | AC's |
|---|---|---|---|
| **A — poort, route kit en lokale adapter** | `FileStorage` en `defineFileStorage` in core, `createFileService` (enige bron van `STORAGE_UNAVAILABLE`), contracttestsuite en de check die een adapter eraan koppelt, voor-stap in de route kit, lokale adapter met dev-route, harde grenzen, CSP-parameter, `format.bytes`, uploadfunctie in de API-client, `src/api/env.ts` | spec `goedgekeurd` | AC-1 t/m AC-6, AC-30, AC-31 (sleutelcontrole) |
| **B — metadata, routes en scherm** | migratie `public.files`, `app.file_deletions` en de trigger, permissies, app-foutcodes, contract, routes, `/bestanden`, `Input`-variant | A | AC-7 t/m AC-23, AC-31 (contract) |
| **C — opruimen** | eigen migratie met de functies van klasse `job`, taak `files.delete-blobs`, verlopen uploads via `app.purge_expired` | B, en de spec [achtergrondtaken](achtergrondtaken.md) `goedgekeurd` en deel C en D daarvan gebouwd (ST-03) | AC-24 t/m AC-29 |

Deel C hangt af van een spec die nog `voorstel` is. Wijzigt die spec de namen of de vorm van `withJob`, `runJobsOnce`, klasse `job` of
`app.purge_expired`, dan volgt deel C via een specwijziging (besluitroute), niet stilzwijgend in de bouw-PR. Tot deel C gebouwd is, gebruikt
een app bestanden niet in productie (ADR 0060 Gevolgen).

Deel B gebruikt `pnpm new:resource` niet: tabel (gegenereerde sleutel, status), routes (geen `PATCH`, wel `complete` en `download`) en het
pad `/bestanden` wijken af van wat de generator maakt. Deel B volgt het gouden pad met de hand; de declaratie in `test/security/resources.ts`
schrijft de tester zelf (zie "Raakt ook").

## Doel

Een ingelogde gebruiker uploadt een document, ziet zijn eigen documenten, downloadt en verwijdert ze, via één provider-neutrale grens die
elke app hergebruikt in plaats van opnieuw bedenkt.

## Rollen en wie wat ziet

| Rol | Eigen bestanden | Bestanden van een ander | Opmerking |
|---|---|---|---|
| anoniem | niets (`UNAUTHENTICATED`) | niets | |
| `user` | lijst, upload, download, verwijderen (`files:read`, `files:write`) | niets: `NOT_FOUND`, nooit `FORBIDDEN` (geen bestaansorakel) | |
| `admin` | als `user`, met MFA (elke admin-permissie eist MFA, ADR 0040 punt 11) | niets (OV-10) | zonder MFA: `MFA_REQUIRED` |
| `app_definer` | alleen verlopen `pending`-rijen (lezen en verwijderen voor `app.purge_expired`) en de wachtrij | | |
| `app_jobs` | geen tabelrecht; alleen de functies van klasse `job` uit deel C | | deel C |

## Datawijzigingen (met grants)

**Deel B**, één nieuwe migratie, tabelpatroon uit `docs/reviews/2026-10-10-tabelpatroon.md`:

- **`public.files`**:
  - `id uuid not null default gen_random_uuid() primary key` (brand `FileId` in `db/ids.json`);
  - `owner_id text not null default app.current_user_id() references better_auth."user"(id) on delete cascade`;
  - `storage_key text generated always as ('files/' || id::text) stored`, `unique`: nooit invoer, nooit de bestandsnaam;
  - `filename text not null`, CHECK lengte 1 t/m 255 (= `MAX_FILENAME_LENGTH`) en geen stuurtekens (alleen weergave);
  - `content_type text not null`, CHECK lengte 1 t/m 255;
  - `size_bytes bigint not null`, CHECK `> 0` en `<= 26214400` (= `MAX_FILE_BYTES`);
  - `status text not null default 'pending'`, CHECK `pending`/`ready`;
  - `upload_expires_at timestamptz`, `completed_at timestamptz`, met één CHECK voor beide richtingen:
    `(status = 'pending' and upload_expires_at is not null and completed_at is null) or (status = 'ready' and upload_expires_at is null and completed_at is not null)`;
  - `created_at timestamptz not null default now()`;
  - index op `(owner_id, created_at desc, id desc)` (eigenaar en cursor).
- RLS aan en geforceerd. Policies `to app_authenticated`, alle met `owner_id = (select app.current_user_id())`: `files_select_own`,
  `files_insert_own`, `files_update_own` (using en with check), `files_delete_own`.
- Grants aan `app_authenticated`: `select, delete` op de tabel; `insert (filename, content_type, size_bytes, upload_expires_at)`;
  `update (status, upload_expires_at, completed_at)`. Nooit `id`, `owner_id`, `storage_key` of `created_at`.
- **`app_definer` op `public.files`** (voor `app.purge_expired`, ADR 0051 punt 14): `select, delete`, met policies `files_definer_select`
  (`for select to app_definer using (upload_expires_at < (select app.retention_cutoff('public.files')))`) en `files_definer_delete_expired`
  (`for delete to app_definer`, zelfde `using`). Een `ready`-rij (tijdkolom null) valt buiten beide.
- **`app.file_deletions`**: `storage_key text primary key`, `queued_at timestamptz not null default now()`, `claimed_until timestamptz`,
  `attempts integer not null default 0`. Geen foreign key. RLS aan en geforceerd; geen grant aan `app_authenticated`; `select, insert,
  update, delete` alleen aan `app_definer`, met policy `file_deletions_definer_all` `to app_definer`.
- **Trigger** `files_enqueue_deletion` (after delete, per rij) op `public.files` roept `app.enqueue_file_deletion()` aan: `security definer`,
  eigenaar `app_definer`, `set search_path = ''`, voegt `old.storage_key` toe aan `app.file_deletions` (`on conflict do nothing`). Geldt ook
  voor rijen die via de cascade van een accountverwijdering verdwijnen. Regel in `db/tests/functies.sql`.
- **`app.retention`**: `public.files` met tijdkolom `upload_expires_at`, termijn `0`, opruimer `app`, reden "onvoltooide upload; een
  `ready`-rij (tijdkolom null) blijft zolang het account bestaat". `app.file_deletions` met tijdkolom `queued_at`, termijn null, opruimer
  `app`, reden "taak `files.delete-blobs` verwijdert de rij na een geslaagde delete".

**Deel C**, eigen migratie (eigen PR, na de spec achtergrondtaken): functies van klasse `job`, eigenaar `app_definer`, `set search_path = ''`,
`execute` alleen aan `app_jobs`: `app.claim_file_deletions(p_limit integer)` geeft sleutels waarvan `claimed_until` leeg of verstreken is,
zet `claimed_until` en verhoogt `attempts` (`for update skip locked`; `p_limit` begrensd door een vaste bovengrens in de functie), en
`app.finish_file_deletion(p_key text)` verwijdert de rij. Regels in `db/tests/functies.sql`.

## Routes en foutcodes

Alle routes via `defineRoute`, input `.strict()`, contract in `src/shared/contracts/files.ts`. Zonder adapter geven alle vijf
`STORAGE_UNAVAILABLE` (OV-9). Rate-limitcategorie volgens OV-13.

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| POST | `/api/files` — `{ filename, contentType, sizeBytes }` → `{ id, upload: { url, method, headers }, expiresAt }` | `files:write` | `VALIDATION`, `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`, `FILE_LIMIT_REACHED`, `STORAGE_UNAVAILABLE`, `RATE_LIMITED` |
| POST | `/api/files/:id/complete` → bestand | `files:write` | `NOT_FOUND`, `FILE_UPLOAD_INCOMPLETE`, `STORAGE_UNAVAILABLE`, `RATE_LIMITED` |
| GET | `/api/files` (cursor) → alleen `ready`-bestanden | `files:read` | `VALIDATION`, `STORAGE_UNAVAILABLE`, `RATE_LIMITED` |
| GET | `/api/files/:id/download` → `{ url, expiresAt }` | `files:read` | `NOT_FOUND`, `STORAGE_UNAVAILABLE`, `RATE_LIMITED` |
| DELETE | `/api/files/:id` | `files:write` | `NOT_FOUND`, `STORAGE_UNAVAILABLE`, `RATE_LIMITED` |
| PUT/GET | `/api/dev/files/:token` (alleen `APP_ENV=local`/`test`; buiten `defineRoute`, login, CSRF en `bodyLimit`; ADR 0060 punt 6) | geen; ondertekend token | `FORBIDDEN` (403), `ALREADY_EXISTS` (409), `PAYLOAD_TOO_LARGE` (413), `NOT_FOUND` (404) |

Plus de vaste codes van elke route (`UNAUTHENTICATED`, `FORBIDDEN`, `MFA_REQUIRED`, `CSRF_REJECTED`). De dev-route antwoordt bij een fout,
net als elke andere route, alleen `{ code, requestId }`.

**Contractvelden**: `filename` string 1 t/m `MAX_FILENAME_LENGTH`, zonder stuurtekens; `contentType` string 1 t/m 255; `sizeBytes` positief
geheel getal tot `Number.MAX_SAFE_INTEGER`, zonder bovengrens in het contract. Een te groot bestand of een niet-toegestaan type is dus geen
`VALIDATION` maar `FILE_TOO_LARGE` of `FILE_TYPE_NOT_ALLOWED`, getoetst in de handler tegen `FILE_LIMITS`. Het pad-`id` op alle
`:id`-routes is `z.uuid()` in het contract: een ander id geeft `VALIDATION` vóór `prepare`, dus zonder aanroep naar de opslag (AC-31).

**Nieuwe foutcodes**:

| Code | Plek | HTTP |
|---|---|---|
| `STORAGE_UNAVAILABLE` | core: `src/core/shared/errors.ts`, tekst in `src/core/web/copy/errors.ts`; alleen `createFileService` gooit hem | 503 |
| `FILE_TYPE_NOT_ALLOWED` | app: `src/shared/errors.ts`, tekst in `src/web/copy/errors.ts` (ADR 0040 punt 10 en 13) | 422 |
| `FILE_TOO_LARGE` | app, idem | 413 |
| `FILE_UPLOAD_INCOMPLETE` | app, idem | 409 |
| `FILE_LIMIT_REACHED` | app, idem | 409 |

**Poort** (`src/core/api/storage/`, ADR 0060 punt 1–2). Een adapter ontstaat alleen via `defineFileStorage({...})` (vindbaar voor de check) en
heeft:
- `createUploadUrl({ key, contentType, sizeBytes, ttlSeconds })` → `{ url, method, headers }`, **synchroon**: lokaal ondertekenen, geen
  netwerkaanroep (het type geeft geen `Promise`). De URL schrijft één object, alleen als het nog niet bestaat (bij een provider via een
  conditionele write);
- `createDownloadUrl({ key, filename, ttlSeconds })` → `{ url }`, **synchroon**; de response heeft `Content-Disposition: attachment` met
  RFC 6266-`filename*`, `Content-Type: application/octet-stream` en, waar de provider het toestaat, `X-Content-Type-Options: nosniff`;
- `stat(key)` → `Promise<{ sizeBytes, contentType } | null>`;
- `delete(key)` → `Promise<void>`: idempotent, een ontbrekend object is geen fout;
- `uploadOrigin`: de origin voor `connect-src`, of `null` als de URL's op `APP_ORIGIN` staan.

Een adapter die voor een URL een netwerkaanroep nodig heeft, past niet op de poort. `createFileService(storage | undefined)` in core
omhult de adapter: elke fout van de adapter, een time-out en een ontbrekende adapter worden daar `STORAGE_UNAVAILABLE`, nergens anders.
`createFileService` weigert elke sleutel die niet op `^files/<uuid>$` past (een fout in de code, geen gebruikersfout) vóór hij de adapter
aanroept, en breekt `stat` af na `STORAGE_CALL_TIMEOUT_MS` (harde grens in `src/core/shared/limits.ts`, OV-22). Zonder adapter gooit
`files.ensureAvailable()` `STORAGE_UNAVAILABLE`; elke bestandshandler roept die als eerste aan. Handlers krijgen de service via
`ctx.services.files`; `src/api/services.ts` vertaalt hem niet opnieuw.

**Route kit in twee fasen** (deel A, ADR 0060 punt 7, OV-20). `defineRoute` krijgt een optionele `prepare(ctx)`. Een route met `prepare`
loopt zo; `src/core/api/db` blijft ongewijzigd:
1. sessie (`UNAUTHENTICATED`);
2. eerste `withUser()`-aanroep met een lege `work`: alleen de rate limit telt (`RATE_LIMITED`);
3. inputvalidatie buiten de database (`VALIDATION`);
4. `prepare` met `input`, `actor` (zonder rol) en `services`, zonder open transactie en zonder verbinding uit de pool; een fout wordt
   opgevangen en als waarde bewaard, niet gegooid;
5. tweede `withUser()`-aanroep, zonder opnieuw de rate limit te tellen: rol (`FORBIDDEN`), permissie en MFA (`FORBIDDEN`, `MFA_REQUIRED`),
   dan de handler met `ctx.prepared()`. Die geeft de waarde of gooit pas dan de bewaarde fout. De handler roept hem pas aan na
   `ensureAvailable()` en de eigen-rij-controle, zodat rol, permissie, MFA en `NOT_FOUND` altijd voorgaan op een fout uit `prepare`.

De extra lege transactie per request is een bewuste kost, en geldt alleen voor routes met `prepare` (nu alleen `complete`). Een route zonder
`prepare` werkt ongewijzigd: één `withUser()` met de rate limit erin. `prepare` mag alleen zonder bijwerking lezen (zoals `stat`), doet geen
kostbare of onbegrensde aanroepen (de time-out van `createFileService` begrenst `stat`), en zijn uitkomst gaat nooit naar buiten zonder de handler.

**Verloop per route**:
- `POST /api/files` (geen `prepare`): in de transactie `pg_advisory_xact_lock(<namespace>, hashtext(owner_id))`, met een vaste
  namespace-constante voor bestanden in de twee-sleutelvorm (een test bewijst dat hij verschilt van de namespace van de jobs), dan de
  telling van eigen rijen (`pending` en `ready`), dan de insert met `upload_expires_at = now() + pendingTtlSeconds`, dan de upload-URL
  (synchroon). Zo lopen twee gelijktijdige starts bij `maxPerUser − 1` niet allebei door (AC-16).
- `POST /api/files/:id/complete`: `prepare` doet `stat('files/<id>')` (de sleutel volgt uit het gevalideerde uuid, zonder database). Dan
  de transactie: `ensureAvailable()`; geen eigen rij → `NOT_FOUND` (de uitkomst van `prepare`, ook een fout, wordt weggegooid); `ready` → 200
  met de rij, zonder `ctx.prepared()`; `pending` → `ctx.prepared()` (een `stat`-fout wordt nu `STORAGE_UNAVAILABLE`); `stat` ontbreekt of wijkt af
  in grootte of type → `FILE_UPLOAD_INCOMPLETE`, geen wijziging, de rij blijft `pending` en verloopt (AC-10, AC-11; geen status `rejected`);
  anders `update … set status = 'ready', upload_expires_at = null, completed_at = now() where id = :id and status = 'pending'`. Raakt die 0
  rijen (een gelijktijdige `complete` was eerder), dan leest de handler de rij opnieuw en geeft 200 met de `ready`-rij.
- `GET /api/files/:id/download` (geen `prepare`): de transactie leest de eigen `ready`-rij, dan de download-URL (synchroon).
- `DELETE /api/files/:id`: alleen de database; de trigger zet de sleutel in de wachtrij.

**Grenzen** (OV-1, OV-3, OV-5). Harde grenzen in `src/core/shared/limits.ts`: `MAX_FILE_BYTES = 26_214_400` (25 MB),
`MAX_FILE_URL_TTL_SECONDS = 900`, `MAX_FILENAME_LENGTH = 255`. De CHECK's op `public.files` gebruiken dezelfde waarden; een test bewijst dat
ze gelijk zijn (zoals bij de audit log). App-waarden in `src/shared/limits.ts` als `FILE_LIMITS`:

| Sleutel | Standaard in de template |
|---|---|
| `maxBytes` | `10_485_760` (10 MB) |
| `allowedTypes` | `['application/pdf']`: één voorbeeld dat een app aanpast (OV-16) |
| `uploadUrlTtlSeconds` | `300` |
| `downloadUrlTtlSeconds` | `60` |
| `pendingTtlSeconds` | `86400` |
| `maxPerUser` | `100` bestanden (`pending` en `ready` samen); geen quotum in bytes |
| `pageSize` | het bestaande `DEFAULT_PAGE_SIZE` uit core |

`createApp` weigert bij opstart een waarde boven een harde grens (ook een URL-termijn boven `MAX_FILE_URL_TTL_SECONDS`), een lege
`allowedTypes` bij een geconfigureerde adapter, en `pendingTtlSeconds ≤ uploadUrlTtlSeconds`.

**Lokale adapter en dev-route** (deel A, ADR 0060 punt 6):
- URL's: absoluut op `APP_ORIGIN` (`<APP_ORIGIN>/api/dev/files/<token>`); Vite stuurt `/api` door naar de API. Zo blijft `connect-src`
  lokaal `'self'` en is `uploadOrigin` `null`.
- Token: HMAC-SHA-256 over sleutel, methode, vervaltijd en, bij PUT, exacte grootte en type, bij GET de bestandsnaam voor
  `Content-Disposition`. De ondertekeningssleutel is 32 willekeurige bytes per proces, gemaakt bij de start; nergens op schijf of in env
  (OV-19). Een herstart maakt openstaande tokens ongeldig.
- Levensduur: `uploadUrlTtlSeconds` voor PUT, `downloadUrlTtlSeconds` voor GET, nooit boven `MAX_FILE_URL_TTL_SECONDS`.
- PUT: ongeldig, verlopen of ander type of andere sleutel dan het token → `FORBIDDEN`; leest de body als stream en breekt af zodra hij de
  grootte uit het token overschrijdt (`PAYLOAD_TOO_LARGE`); schrijft naar een tijdelijk bestand en hernoemt pas bij de exacte grootte;
  bestaat het object al → `ALREADY_EXISTS` (write-once, ook na `complete`).
- GET: ongeldig of verlopen token → `FORBIDDEN`, geen object → `NOT_FOUND`; anders `Content-Disposition: attachment` met de naam uit het
  token, `Content-Type: application/octet-stream`, `X-Content-Type-Options: nosniff` en `Content-Security-Policy: sandbox`.
- Opslagmap: env `FILES_LOCAL_DIR` in het nieuwe `src/api/env.ts` (via `readEnv` uit core), optioneel, standaard
  `<os.tmpdir()>/app-files-local`; alleen gelezen bij `APP_ENV=local`/`test`. Nooit in `src/`.
- De route is een nieuwe rij in de uitzonderingstabel van `docs/framework.md` §3 (buiten `defineRoute`, login, CSRF en `bodyLimit`); die
  wijziging doet de bouw-PR van deel A.

**CSP** (deel A): `contentSecurityPolicy` krijgt een optionele extra origin voor `connect-src`. De productieserver
(`src/core/api/http/web.ts`, `createWebApp`) krijgt `uploadOrigin` van de adapter die `src/api/server.ts` aansluit. `vite.config.ts` (dev en
preview) gebruikt altijd de lokale adapter en geeft dus niets extra mee.

**Contracttest gekoppeld aan elke adapter** (deel A, ADR 0060 punt 2): core exporteert `fileStorageContract(maakAdapter)` voor Vitest. Een
nieuwe check `pnpm check:storage-adapters` (in `gate:fast`) vindt elk `defineFileStorage(`-gebruik buiten testbestanden en faalt als er geen
testbestand is dat `fileStorageContract` op die adapter draait. De check heeft fixtures die falen: een adapter zonder suite, een suite op
een andere adapter, een re-export onder een andere naam.

## Kopieer de vorm van

Per regel een bestaand pad uit `docs/gouden-pad.md` (accountbeheer) en wat je overneemt; `check-docs` controleert het pad.

- `src/api/routes/accounts.ts` — `defineRoute`, `tx`, cursorlijst, `NOT_FOUND` bij een rij die RLS verbergt.
- `src/shared/contracts/accounts.ts` — zod-contract met `.strict()`, cursor en opname in `src/shared/contracts/index.ts`.
- `src/api/services.ts` — `ctx.services.files` aansluiten; de foutvertaling zit al in `createFileService`.
- `db/migrations/20261009194039_user_roles.sql` — RLS aan en geforceerd, grants en policies in dezelfde migratie.
- `db/migrations/20261012200000_account_blocking.sql` — functie van `app_definer` met `set search_path = ''`.
- `db/tests/user_roles.sql` — pgTAP per policy op naam; `db/tests/functies.sql` voor de nieuwe functies.
- `test/api/accounts.int.test.ts` — integratie met `beginTestDb` en `asUser`, per verboden rol en admin zonder MFA.
- `src/web/features/accounts/queries.ts` — key-factory, mutaties die de lijst invalideren.
- `src/web/features/accounts/accounts-page.tsx` — lijstpagina met `AsyncView`, lege staat en rijacties.
- `src/web/features/accounts/invite-dialog.tsx` — formulier in een `Dialog` via `<Form>` met serverfouten.
- `src/web/routes/_app/admin/accounts.tsx` — schermroute met `can()`-guard en ErrorBoundary; menu-item in `src/web/lib/nav.ts`.
- `e2e/accounts.spec.ts` — e2e per AC met axe op 375 en 1280 px.

## Hergebruik en UX

- **Bestaande componenten** (uit `node scripts/kit/feiten.mjs componenten`): `PageHeader`, `AsyncView`, `DataTable` (kolommen naam,
  grootte, geüpload op), `EmptyState`, `Dialog` met `Form`, `FormField`, `FormErrorSummary`, `Button` (`primary` voor uploaden, `ghost`
  voor downloaden, `destructive` in de bevestiging, `busy` tijdens een actie), `ConfirmDialog` voor verwijderen, `Notice` (`tone=error`)
  voor een fout in de lijst, toasts via `useToast().success/error`.
- **Geen nieuw component**: er is geen bestandskiezer in de kit. Een variant van `Input` voor `type="file"` (alleen styling van de knop in het
  veld, zelfde focusring en `aria-invalid`), met een catalogusrij op `/design-system` (OV-11). Geen drag-and-drop.
- **Opmaak**: datum via `format.date`; grootte via een nieuwe `format.bytes` in `src/core/web/lib/format.ts`: veelvouden van 1024, eenheden
  `B`, `KB`, `MB`, `GB`, Nederlandse getalnotatie met hooguit één decimaal en zonder `,0` (`format.bytes(10_485_760)` = "10 MB",
  `format.bytes(1_572_864)` = "1,5 MB", `format.bytes(900)` = "900 B").
- **Typenamen**: `fileTypeLabels` in `src/web/copy/ui.ts`, getypt als volledige afbeelding van `FILE_LIMITS.allowedTypes` op een naam
  (TypeScript eist een naam per type); standaard `{ 'application/pdf': 'PDF' }`. `{typen}` in de hulptekst is die namen in de volgorde van
  `allowedTypes`, gescheiden door ", ".
- **Formulier**: het formulierschema staat in de feature, niet in het contract (een `File` is geen JSON). Het veld levert één `File`;
  het contract krijgt `filename = file.name`, `contentType = file.type`, `sizeBytes = file.size`. Een leeg `file.type` of een type buiten
  `allowedTypes` geeft in het formulier de tekst van `FILE_TYPE_NOT_ALLOWED`, een te groot bestand die van `FILE_TOO_LARGE`, vóór de request.
- **Upload in de browser**: een nieuwe functie in `src/core/web/lib/api-client.ts` (de enige plek met `fetch(`) stuurt het bestand naar de
  signed URL met precies de methode en headers uit het antwoord, zonder cookies (`credentials: 'omit'`). Volgorde in `queries.ts`:
  `POST /api/files` → upload → `POST /api/files/:id/complete`; één mutatie, één bezig-staat.
- **Download**: `GET /api/files/:id/download`, daarna navigatie naar `url` in hetzelfde tabblad (`attachment` laat de pagina staan).
- **Staten** op `/bestanden`: laden (`AsyncView`), leeg (`EmptyState`), fout (`Notice`), bezig (`busy` op de knop tijdens upload,
  download of verwijderen; geen extra tekst), gelukt (toast), verouderd (lijst opnieuw na elke mutatie; een download van een intussen
  verwijderd bestand → toast met de tekst van `NOT_FOUND`).
- **Alle zichtbare tekst letterlijk** (OV-4; schermteksten in `src/web/copy/ui.ts`, foutteksten volgens de tabel bij de foutcodes):

  | Plek | Tekst |
  |---|---|
  | Menu-item en paginatitel | "Bestanden" |
  | Knop op de pagina | "Bestand uploaden" |
  | Dialoogtitel | "Bestand uploaden" |
  | Veldlabel | "Bestand" |
  | Hulptekst | "Toegestaan: {typen}. Maximaal {grootte}." — met de standaard: "Toegestaan: PDF. Maximaal 10 MB." |
  | Dialoogknoppen | "Uploaden" / "Annuleren" |
  | Kolomkoppen | "Naam" / "Grootte" / "Geüpload op" |
  | Lege staat | "Je hebt nog geen bestanden." |
  | Rijknoppen | "Downloaden" / "Verwijderen" |
  | Bevestigingstitel | "Bestand verwijderen?" |
  | Bevestigingstekst | ""{naam}" wordt definitief verwijderd. Dit kan niet ongedaan worden gemaakt." |
  | Toasts | "Bestand geüpload." / "Bestand verwijderd." |
  | `FILE_TYPE_NOT_ALLOWED` | "Dit bestandstype is niet toegestaan." |
  | `FILE_TOO_LARGE` | "Dit bestand is te groot." |
  | `FILE_UPLOAD_INCOMPLETE` | "De upload is niet afgerond. Probeer het opnieuw." |
  | `FILE_LIMIT_REACHED` | "Je hebt het maximum aantal bestanden bereikt." |
  | `STORAGE_UNAVAILABLE` | "Bestanden zijn nu niet beschikbaar. Probeer het later opnieuw." |

  Overige meldingen (bijvoorbeeld `NOT_FOUND`, `VALIDATION`) gebruiken de bestaande teksten uit `src/core/web/copy/errors.ts`.
- **Focusvolgorde en toetsenbord**: paginatitel → uploadknop → tabel (per rij downloaden, verwijderen). De dialoog zet focus op het
  bestandsveld en geeft hem na sluiten terug aan de uploadknop; na verwijderen gaat de focus naar de tabel of de lege staat. Alles werkt met Tab, Enter en Escape.

## Acceptatiecriteria

**Deel A**

- **files/AC-1** — Gegeven de contracttestsuite, wanneer hij tegen de lokale adapter draait, dan slagen upload, `stat`, download, idempotente
  `delete`, weigering van een verlopen URL en weigering van een tweede upload op dezelfde sleutel; een adapter die een verlopen URL accepteert,
  een tweede upload toelaat of `attachment` of `application/octet-stream` weglaat, laat de suite falen.
- **files/AC-2** — Gegeven `APP_ENV=staging` of `production`, wanneer iemand `/api/dev/files/<token>` opent, dan 404 (integratietest met de
  app gebouwd voor die `APP_ENV`).
- **files/AC-3** — Gegeven een token voor sleutel X, wanneer het wordt gebruikt voor sleutel Y, met een andere methode, met een ander type, na
  het verlopen, na een herstart van het proces of met een gewijzigde handtekening, dan 403 met `{ code: 'FORBIDDEN', requestId }` en wordt er
  niets geschreven of gelezen.
- **files/AC-4** — Gegeven een upload-token voor N bytes, wanneer de body groter is dan N, dan 413 (`PAYLOAD_TOO_LARGE`) en bestaat het object
  niet; bij een bestaand object 409 (`ALREADY_EXISTS`) en blijft de inhoud gelijk.
- **files/AC-5** — Gegeven een adapter met `uploadOrigin` O, dan bevat `connect-src` in de headers van `createWebApp` precies `'self'` en O;
  met `uploadOrigin` `null`, zonder adapter en in `vite.config.ts` precies `'self'`.
- **files/AC-6** — Gegeven `FILE_LIMITS` met een waarde boven een harde grens, `pendingTtlSeconds ≤ uploadUrlTtlSeconds` of een lege
  `allowedTypes` bij een adapter, wanneer de API start, dan weigert `createApp` met een melding die de sleutel noemt.
- **files/AC-30** — Gegeven een route met `prepare`:
  - tijdens `prepare` is er geen open transactie en houdt het request geen verbinding uit de pool vast (de test meet het aantal uitgegeven
    verbindingen van de pool tijdens `prepare`: 0 voor dit request);
  - de rate limit telt precies één keer per request;
  - een fout uit `prepare` komt alleen in het antwoord als de handler `ctx.prepared()` aanroept, dus nooit vóór rol, permissie, MFA,
    `ensureAvailable()` en eigen-rij-controle: een gebruiker zonder rol krijgt `FORBIDDEN` en een admin zonder MFA `MFA_REQUIRED`, ook als
    `prepare` faalt, nooit `STORAGE_UNAVAILABLE`.

  Een route zonder `prepare` gedraagt zich als voorheen (bestaande routetests blijven groen). Gegeven een `defineFileStorage`-adapter zonder
  testbestand met `fileStorageContract`, dan faalt `pnpm check:storage-adapters`.
- **files/AC-31** — Gegeven een `:id` dat geen uuid is (bijvoorbeeld `..%2Fx` of `abc`), wanneer `complete`, `download` of `DELETE` komt, dan
  `VALIDATION` en wordt `stat` niet aangeroepen; gegeven een sleutel die niet op `^files/<uuid>$` past, dan roept `createFileService` de
  adapter niet aan.

**Deel B**

- **files/AC-7** — Gegeven een `user`, wanneer hij een toegestaan bestand binnen de grootte uploadt, dan staat het met naam, grootte en
  uploaddatum in de lijst op `/bestanden` en toont een toast "Bestand geüpload.".
- **files/AC-8** — Gegeven een type buiten `allowedTypes`, wanneer `POST /api/files` komt, dan `FILE_TYPE_NOT_ALLOWED` en geen rij.
- **files/AC-9** — Gegeven `sizeBytes` boven `FILE_LIMITS.maxBytes` (ook boven `MAX_FILE_BYTES`), dan `FILE_TOO_LARGE`, niet `VALIDATION`, en
  geen rij; de UI toont "Dit bestand is te groot." al vóór de request.
- **files/AC-10** — Gegeven een object dat de test direct in `FILES_LOCAL_DIR` onder de sleutel zet, met een andere grootte dan de aanvraag,
  wanneer `complete` komt, dan `FILE_UPLOAD_INCOMPLETE`, blijft de rij ongewijzigd `pending` en staat ze niet in de lijst.
- **files/AC-11** — Gegeven geen object onder de sleutel, wanneer `complete` komt, dan `FILE_UPLOAD_INCOMPLETE` en blijft de rij ongewijzigd `pending`.
- **files/AC-12** — Gegeven een `ready`-bestand, wanneer `complete` opnieuw komt, ook twee keer tegelijk, dan elke keer 200 met hetzelfde
  bestand en blijven `completed_at` en de andere kolommen ongewijzigd.
- **files/AC-13** — Gegeven gebruikers A en B en een bestand van A, wanneer B `complete`, `download` of `DELETE` op dat id doet, dan dezelfde
  HTTP-status en code (`NOT_FOUND`) als voor een onbekend id; `GET /api/files` van B bevat het niet.
- **files/AC-14** — Gegeven `pending`-rijen, dan staan ze niet in `GET /api/files` en geeft `download` `NOT_FOUND`.
- **files/AC-15** — Gegeven een download-URL, dan verloopt hij na `downloadUrlTtlSeconds`, levert hij `Content-Disposition: attachment` met de
  oorspronkelijke naam en `Content-Type: application/octet-stream`, en `expiresAt` in het antwoord ligt niet verder dan die termijn.
- **files/AC-16** — Gegeven 99 eigen bestanden (`pending` en `ready` samen), wanneer twee starts tegelijk binnenkomen, dan slaagt er precies
  één en geeft de andere `FILE_LIMIT_REACHED`; bij 100 geeft elke start `FILE_LIMIT_REACHED`.
- **files/AC-17** — Gegeven een bestand, wanneer de eigenaar het na bevestiging verwijdert, dan verdwijnt het uit de lijst, toont een toast
  "Bestand verwijderd.", staat de sleutel in `app.file_deletions` en geeft `download` daarna `NOT_FOUND`.
- **files/AC-18** — Gegeven een admin zonder MFA, dan geven alle vijf `/api/files`-routes `MFA_REQUIRED`, ook zonder adapter en ook als
  `prepare` faalt; anoniem `UNAUTHENTICATED`.
- **files/AC-19** — Gegeven een request met een veld dat niet in het contract staat (ook `ownerId`, `storageKey` of `status`), dan `VALIDATION`.
- **files/AC-20** — Gegeven een bestandsnaam met stuurtekens, leeg of boven `MAX_FILENAME_LENGTH`, dan `VALIDATION`; elke naam, ook `../x.pdf`,
  komt nooit in `storage_key` (die is altijd `files/<id>`).
- **files/AC-21** — Gegeven geen adapter en een gebruiker met rol, permissie en (voor een admin) MFA, dan geven alle vijf `/api/files`-routes
  `STORAGE_UNAVAILABLE`, ook voor een id van een ander, en start de API zonder extra env. Zonder rol, permissie of MFA gaat AC-18 of AC-30 voor.
- **files/AC-22** — Gegeven `/bestanden` op 375 en 1280 px met de standaardwaarden, dan geen axe-overtredingen, werkt de upload met alleen het
  toetsenbord en staat de hulptekst er als "Toegestaan: PDF. Maximaal 10 MB.".
- **files/AC-23** — Gegeven een upload die `complete` heeft gehaald, wanneer de oude upload-URL opnieuw wordt gebruikt, dan faalt hij en
  blijft de inhoud gelijk (write-once, AC-4).

**Deel C**

- **files/AC-24** — Gegeven een rij in `app.file_deletions`, wanneer `files.delete-blobs` draait, dan roept hij `delete` aan en verdwijnt de rij.
- **files/AC-25** — Gegeven een `delete` die faalt, dan blijft de rij, stijgt `attempts`, en pakt een volgende run hem pas na `claimed_until` op.
- **files/AC-26** — Gegeven twee runners tegelijk, dan claimt maar één van beide een sleutel.
- **files/AC-27** — Gegeven een `pending`-rij met `upload_expires_at` in het verleden, wanneer `app.purge_expired` draait, dan verdwijnt de rij
  en staat de sleutel in `app.file_deletions`; een `ready`-rij blijft.
- **files/AC-28** — Gegeven een account met bestanden, wanneer `better_auth."user"` van dat account verdwijnt (cascade, ook via
  `app.delete_account` zodra ST-05 dat levert), dan staan al zijn sleutels in `app.file_deletions` en na één run van de taak bestaan de objecten niet meer.
- **files/AC-29** — Gegeven geen adapter, dan registreert de API de taak `files.delete-blobs` niet; met een adapter wel.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Upload-URL verlopen vóór de upload | adapter weigert; `complete` vindt geen object | `FILE_UPLOAD_INCOMPLETE` |
| Upload binnen de URL-termijn, `complete` nooit aangeroepen | rij verloopt na `pendingTtlSeconds` (> URL-termijn), object via de wachtrij weg | — |
| Afwijkende upload | rij blijft `pending`; gebruiker start een nieuwe upload; de oude verloopt | `FILE_UPLOAD_INCOMPLETE` |
| Twee keer `complete` tegelijk | één zet `ready`, de ander raakt 0 rijen, leest opnieuw en geeft ook 200 | — |
| Download-URL al uitgegeven, bestand daarna verwijderd of account geblokkeerd | URL werkt tot hij verloopt, hooguit 60 s (ADR 0060 Gevolgen) | — |
| Dubbel `DELETE` | tweede geeft `NOT_FOUND` | `NOT_FOUND` |
| Twee uploads met dezelfde naam | twee rijen; naam is geen sleutel | — |
| Provider onbereikbaar bij `complete` (`stat`) | rij ongewijzigd | `STORAGE_UNAVAILABLE` |
| Gebruiker sluit de dialoog tijdens de upload | upload loopt af of breekt af; `pending`-rij verloopt | — |
| Lokale API herstart tussen start en upload | token ongeldig (403); `complete` faalt; nieuwe upload | `FILE_UPLOAD_INCOMPLETE` |

## Raakt ook

- **Database**: `check:migrations` (twee migraties: deel B en deel C), `check:secdef` (`app.enqueue_file_deletion`,
  `app.claim_file_deletions`, `app.finish_file_deletion`), `pnpm test:db` met pgTAP op elke policy (`files_select_own`, `files_insert_own`,
  `files_update_own`, `files_delete_own`, `files_definer_select`, `files_definer_delete_expired`, `file_deletions_definer_all`),
  `db/tests/functies.sql` (alle drie de functies), de invariant op `app.retention` en het tabelpatroon (`db/tests/invarianten.sql`).
- **Securitysuite** (tester): `test/security/resources.ts` met `routeClassificatie` `POST /files` → `create`, `GET /files` → `list`,
  `GET /files/:id/download` → `read`, `POST /files/:id/complete` → `update`, `DELETE /files/:id` → `delete` (scope `eigenaar`); samples met
  `status = 'ready'` (anders verbergen lijst en download ze), `createTweede` met twee `ready`-bestanden per gebruiker. De suite draait met
  de lokale adapter aangesloten: `test/security/fixtures.ts` en `test/api/account-harness.ts` (die `buildApp` met services opbouwen) krijgen
  `files` mee.
- **Permissies**: test per verboden rol in `src/shared/permissions.test.ts` (`files:read`, `files:write`: anoniem, admin zonder MFA);
  `src/web/routes.test.tsx` (menu per rol).
- **Core** (deel A; beschermd, eigenaarakkoord of exact taakmandaat): `src/core/api/storage/` (nieuw), `src/core/api/route/kit.ts` en
  `src/core/api/http/create-app.ts` (voor-stap `prepare`, opstartcontroles, dev-route), `src/core/api/http/security-headers.ts` met
  `src/core/api/http/web.ts`, `src/core/shared/limits.ts`, `src/core/shared/errors.ts` en `src/core/web/copy/errors.ts` (alleen
  `STORAGE_UNAVAILABLE`), `src/core/web/lib/format.ts` (`format.bytes`), `src/core/web/lib/api-client.ts`, `src/core/web/ui/input.tsx` en de catalogus.
- **Overige beschermde paden**: `vite.config.ts`, `src/api/server.ts`, `src/api/env.ts` (nieuw, `FILES_LOCAL_DIR`), `scripts/` en
  `package.json` (`check:storage-adapters`, opgenomen in `gate:fast` en het gate-register), `docs/framework.md`, `docs/roadmap.md`, en de
  testbestanden hierboven.
- **App**: `src/api/app.ts`, `src/api/services.ts`, `src/shared/permissions.ts`, `src/shared/errors.ts` en `src/web/copy/errors.ts` (vier codes),
  `src/shared/limits.ts`, `src/web/copy/ui.ts` (teksten, `fileTypeLabels`), `db/ids.json`, `src/web/lib/nav.ts`.
- **`docs/framework.md` §3** (bouw-PR deel A, door bouw- of hoofdsessie): een rij "Bestandsopslag" in de poortentabel; de regel over een
  directe data-API van de provider: voor opslag alleen signed URL's van de API, Storage-policies, publieke buckets en listing blijven uit, en
  de smoketest bewijst dat een browsersessie zonder signed URL niets leest of schrijft; een rij in de uitzonderingstabel voor
  `/api/dev/files/:token`. §1 punt 2 (afdwingen boven afspreken) is de grond voor `check:storage-adapters`.
- **`docs/roadmap.md`** (door de hoofdsessie, mee in de bouw-PR van deel A; een besluit-PR bevat alleen `docs/adr/` en `docs/specs/`, ADR 0046): het storage-deel van ST-11 wordt actief met een verwijzing naar deze
  spec en ADR 0060; notificaties blijft geparkeerd. Drie verschillen met "Klaar als": (1) de template voegt wel tabellen, routes en een
  scherm toe aan elke app, die zonder adapter inert zijn (`STORAGE_UNAVAILABLE`, geen env, geen taak); (2) provider-ADR en
  dependencygoedkeuring horen bij de app, niet bij de template; (3) "opruimen van verweesde bestanden" dekt objecten met een rij (wachtrij
  en bewaarcatalogus), niet een afstemming van objecten zonder rij (zie "Buiten scope").
- **Overige docs** in de bouw-PR's: `docs/gouden-pad.md` (sectie "Bestanden", OV-12), een runbook voor een app-adapter (CORS, conditionele
  writes, levenscyclus, regio), `CHANGELOG.md` met "Bij een update".

## Buiten scope

- Een productieadapter of provider: per app ADR (`0100`+).
- Bestanden delen of aan een andere resource koppelen; virusscan; inhoudscontrole op magic bytes; previews en thumbnails; versies.
- Een afstemming die de opslag doorzoekt naar objecten zonder rij (de poort heeft geen `list`); zulke objecten ontstaan alleen buiten
  deze flow en vragen dan een app-ADR.
- Voortgangsbalk bij uploaden (geen `XMLHttpRequest`; alleen een bezig-staat).
- Notificaties (ander deel van ST-11).

## Testplan

- **pgTAP** (tester): elke policy op naam; B ziet, wijzigt en verwijdert 0 rijen van A; insert met `owner_id` van een ander → `42501`;
  geen recht op `id`, `owner_id`, `storage_key`, `created_at`; `storage_key` is altijd `files/<id>`; CHECK-grenzen gelijk aan `limits.ts`;
  de status-CHECK weigert `ready` met `upload_expires_at` en `pending` zonder; `files_definer_select` en `files_definer_delete_expired` zien en
  raken geen `ready`-rij en geen `pending`-rij binnen de termijn (AC-27); trigger vult de wachtrij bij delete en bij cascade (AC-28);
  `app_authenticated` heeft geen toegang tot `app.file_deletions`; `app_jobs` alleen `execute` op de twee jobfuncties.
- **Unit**: contracttestsuite tegen de lokale adapter met een injecteerbare klok (AC-1, AC-3, AC-4, AC-23); CSP (AC-5); opstartcontroles (AC-6);
  route kit met `prepare` (AC-30: poolmeting op `createWithUser` met een geïnstrumenteerde pool (`connect`/`release` tellen), niet met de testkit `beginTestDb` (één vaste verbinding met savepoints), één rate-limittelling, gebruiker zonder rol en admin zonder MFA met een falende `prepare`);
  sleutelcontrole en time-out van `createFileService` (AC-31); fixtures van `check:storage-adapters` (AC-30); `format.bytes`; formulierafleiding uit `File`; `Input`-variant in de catalogus.
- **Integratie** (`test/api/files.int.test.ts`, echte lokale stack, lokale adapter): AC-2, AC-8 t/m AC-21 en AC-31, met racetests voor AC-12 en
  AC-16 (twee gelijktijdige requests); AC-10 door direct in `FILES_LOCAL_DIR` te schrijven; per verboden rol en admin zonder MFA; een test dat
  de advisory-lock-namespace van bestanden verschilt van die van de jobs.
- **Securitysuite**: `files` in `test/security/resources.ts` (zie "Raakt ook").
- **E2E** (`e2e/files.spec.ts`, axe op 375 en 1280 px): AC-7, AC-17, AC-22, plus de foutmeldingen van AC-8 en AC-9 in de UI.
- **Deel C**: integratie met `runJobsOnce` (AC-24 t/m AC-29), met een adapter die een fout kan geven.

## Open vragen

Een vraag zonder aanbeveling (de eigenaar kiest) blokkeert `goedgekeurd`; een vraag met aanbeveling mag blijven staan. `check-docs` telt elke regel in deze sectie met het waarschuwingsteken en "open" (ook met U+FE0F of hoofdletter, ook zonder opsommingsteken).

Besluiten van de eigenaar op 2026-10-27: OV-1 t/m OV-5 en OV-16 gekozen, OV-6 t/m OV-15 volgens de aanbeveling; na de eerste spec-review
OV-17, OV-18 en de dev-route buiten CSRF en `bodyLimit`; na de tweede OV-19, OV-20 en OV-21; na de derde de vorm van OV-20 (twee `withUser()`-aanroepen).

- **OV-1 ✅ besloten** — `MAX_FILE_BYTES = 26_214_400` (25 MB) in core; `FILE_LIMITS.maxBytes` standaard `10_485_760` (10 MB).
- **OV-2 ✅ besloten, gewijzigd door OV-16** — Elke app geeft `allowedTypes` op; `createApp` weigert een lege lijst bij een adapter (AC-6).
  De template levert wel één voorbeeld (OV-16).
- **OV-3 ✅ besloten** — `uploadUrlTtlSeconds` 300, `downloadUrlTtlSeconds` 60, `pendingTtlSeconds` 86400; harde grenzen
  `MAX_FILE_URL_TTL_SECONDS` 900 en `MAX_FILENAME_LENGTH` 255.
- **OV-4 ✅ besloten** — Alle teksten letterlijk zoals in "Hergebruik en UX".
- **OV-5 ✅ besloten** — `maxPerUser` standaard 100 bestanden, geen quotum in bytes; `FILE_LIMIT_REACHED` en AC-16 blijven.
- **OV-6 ✅ besloten** — Upload direct naar de opslag met een signed URL en een `complete`-stap met `stat`, niet via de API (ADR 0060 punt 3).
- **OV-7 ✅ besloten** — Lokale adapter achter `/api/dev/files/:token`, alleen bij `APP_ENV=local`/`test`, buiten CSRF en `bodyLimit` met de
  vervangende bescherming uit "Lokale adapter en dev-route" (ADR 0060 punt 6). Geen standaardopslag: elders bestaat de route niet (AC-2).
- **OV-8 ✅ besloten** — Opslagmap `FILES_LOCAL_DIR`, standaard `<os.tmpdir()>/app-files-local`; nooit in `src/`.
- **OV-9 ✅ besloten** — Routes en `/bestanden` horen bij de startinhoud van de app (ADR 0040 punt 13), zoals accountbeheer; zonder adapter
  geven ze `STORAGE_UNAVAILABLE` (AC-21); een app zonder bestanden verwijdert de feature.
- **OV-10 ✅ besloten** — Een admin ziet en verwijdert geen bestanden van anderen; alleen accountverwijdering ruimt ze op (AC-28).
- **OV-11 ✅ besloten** — Bestandskiezer als variant van `Input` (`type="file"`); geen nieuw component, geen drag-and-drop.
- **OV-12 ✅ besloten** — Nu een sectie "Bestanden" in `docs/gouden-pad.md` die naar `/bestanden` als voorbeeld wijst, plus hoe een app een
  bestand aan een eigen resource koppelt (kolom `file_id` met foreign key en eigenaarcontrole); een generatoroptie pas als een tweede app
  dat patroon nodig heeft (framework §1, P1), onder ST-06.
- **OV-13 ✅ besloten** — Rate-limitcategorie `schrijven` voor `POST /api/files`, `complete` en `DELETE`; `lezen` voor de lijst en `download`.
- **OV-14 ✅ besloten** — Geen audit van upload en verwijderen in de template; een app kan acties registreren met `defineAuditActions`.
- **OV-15 ✅ besloten** — Zodra ST-05 de exporter levert, staat de metadata (naam, type, grootte, datum) in de AVG-export; de inhoud via de
  bestaande download.
- **OV-16 ✅ besloten** — De template levert `allowedTypes: ['application/pdf']` als voorbeeld dat een app aanpast; geen aparte testlijst.
- **OV-17 ✅ besloten** — Afwijkende upload: `FILE_UPLOAD_INCOMPLETE` zonder wijziging; de rij blijft `pending` en verloopt (AC-10). Geen status `rejected`.
- **OV-18 ✅ besloten** — Foutcodes: alleen `STORAGE_UNAVAILABLE` in core; de vier `FILE_*`-codes in de app (ADR 0040 punt 10 en 13).
- **OV-19 ✅ besloten** — Ondertekeningssleutel van de dev-route: 32 willekeurige bytes per proces, niet afgeleid van `AUTH_SECRET` of een
  ander bestaand geheim.
- **OV-20 ✅ besloten** — Route kit in twee fasen via twee `withUser()`-aanroepen: eerst alleen de rate limit met een lege `work`, dan
  `prepare` zonder open transactie of vastgehouden verbinding, dan de route zonder tweede rate-limittelling; `src/core/api/db` blijft
  ongewijzigd en de extra lege transactie is een bewuste kost. Een fout uit `prepare` wordt als waarde bewaard en pas via `ctx.prepared()`
  gegooid. Een URL maken is synchroon lokaal ondertekenen (ADR 0060 punt 7).
- **OV-21 ✅ besloten** — De contracttestsuite is geëxporteerd, en `check:storage-adapters` koppelt elke app-adapter eraan (ADR 0060 punt 2).
- **OV-22** — Waarde van `STORAGE_CALL_TIMEOUT_MS`, de time-out op `stat` in `createFileService`. Aanbeveling: 5000 ms: ruim voor één
  metadata-aanroep bij een provider, kort genoeg om een request niet aan een hangende provider vast te houden; een overschrijding wordt
  `STORAGE_UNAVAILABLE`.
