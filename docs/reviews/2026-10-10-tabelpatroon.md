# Review tabelpatroon met `owner_id` — 2026-10-10

Security-review van het tabelpatroon dat `pnpm new:resource` in elke resource zet (ADR 0016, OV-1 en gevolgen: "eerst één volledige
security-review"). Langs de skill `security-review` (punt 2 en 1) en framework §6.

**Methode.** Het patroon uit ADR 0016 OV-1b is uitgeschreven voor de voorbeeldnaam `invoices` en uitgevoerd op PostgreSQL 17.11 (image
`template-postgres`): als `app_migrator` in een teruggedraaide transactie op de dev-database, en voor de cascade via `auth_service` in een
wegwerpcontainer zonder netwerk met `db/init` en alle migraties. Elke bevinding hieronder is zo waargenomen, tenzij **(niet getest)**.
Dat de agent zelf `docker` gebruikte, is in strijd met framework §11 (de sessie liep buiten de repo, dus zonder de deny-regel); de
eigenaar heeft de uitkomsten zo geaccepteerd. Het blijvende bewijs zijn de pgTAP-tests van de generator-PR (via `pnpm test:db`).
De code-paden (`src/core/api/http/create-app.ts`, `src/core/api/errors.ts`) zijn gelezen.

**Status:** verwerkt. A1–A3 en B2–B6 zitten in de templates van `pnpm new:resource` (#52); B1 is de invariant
`pg_temp.eigenaartabellen()` in `db/tests/invarianten.sql`, met controles die bewijzen dat hij elke afwijking vangt.

## Wat standhoudt

| Controle | Uitkomst |
|---|---|
| Lezen, wijzigen, verwijderen van een rij van een ander | 0 rijen, geen fout (policy `using`) |
| Insert met `owner_id` van een ander | `42501` (policy `with check`) → `FORBIDDEN` |
| Eigen rij aan een ander geven (`update … set owner_id`) | `42501` (`with check` op update) |
| Zonder actor (`app.user_id` leeg) | ziet niets; insert faalt (`owner_id` default `null` → `with check`) |
| `api_user` zonder `set local role` | `permission denied for schema public` (`noinherit`) |
| `TRUNCATE` door `app_authenticated` | geweigerd (ook bewaakt in `db/tests/invarianten.sql`) |
| Onbekende `owner_id` als FK-orakel | eerst `with check` (`42501`), dus geen `23503` dat iets verraadt |
| Gebruiker verwijderd door `auth_service` (Better Auth `deleteUser`) | rijen gaan mee via `on delete cascade`; RI negeert RLS en eigen grants |
| Plan van de select-policy | `(select app.current_user_id())` als InitPlan, index-scan op `owner_id` |
| 501-handlers van fase 2 | `create-app.ts:67-82`: sessie → invoer → rol → permissie → handler; een 501 bereikt alleen wie het recht heeft |

## A. Wijzigen vóór het patroon in een template komt

| # | Ernst | Bevinding | Pad | Voorstel |
|---|---|---|---|---|
| A1 | middel | Met tabelbrede `grant insert, update` kiest de client zelf `id`. Een insert met het `id` van een rij van een ander geeft `23505` → `ALREADY_EXISTS` (409): een bestaansorakel over eigenaars heen. Ook `created_at` is vrij te zetten | contract zonder `.strict()` of een developer die `id` doorgeeft → `insert … (id)` → `invoices_pkey` → 409 i.p.v. 201 | Kolomrechten: `grant select, delete` op de tabel; `insert (<velden>)` en `update (<velden>)` alleen op de velden uit de spec, nooit op `id`, `owner_id` of `created_at`. Waargenomen: zelf zetten geeft `42501`, defaults vullen zich, upsert op `id` werkt |
| A2 | middel | Met tabelbrede `grant update` wijzigt de eigenaar `id` en `created_at` van een eigen rij. Een nieuwe `id` breekt verwijzingen en caches; een `created_at` in het verleden vervalst de volgorde | `update … set id = gen_random_uuid(), created_at = '1999-01-01'` slaagde | Zelfde maatregel als A1 |
| A3 | laag | Zonder velden (OV-5: de generator maakt geen velden) krijgt `app_authenticated` met A1 geen insert- of updaterecht. Een policy zonder recht geeft `permission denied`; een recht zonder policy geeft stil 0 rijen (waargenomen bij update) | developer voegt een kolom toe, vergeet de grant of de policy → 403 of een update die niets doet | De generator schrijft alle vier de policies, `grant select, delete` en een commentaar op de plek van de kolomgrants. De velden en hun grants komen in een nieuwe migratie (de gegenereerde wordt mee gecommit en is daarna append-only). Invariant hieronder (B1) vangt een vergeten policy |

## B. Toevoegen aan het patroon

| # | Ernst | Bevinding | Voorstel |
|---|---|---|---|
| B1 | middel | Niets bewaakt het patroon in toekomstige tabellen: een developer kan later `grant update on … ` tabelbreed zetten of de index weghalen | Invariant in `db/tests/invarianten.sql` (gate-pad, eigen PR met akkoord): voor elke tabel in `public` met kolom `owner_id` geen insert- of updaterecht voor `app_authenticated` op `id`, `owner_id` en `created_at`; policies voor `select`, `insert`, `update` en `delete` `to app_authenticated`; een index met `owner_id` als eerste kolom |
| B2 | middel | Rechten in de app ≠ zichtbaarheid in de database. `--rollen user,admin` geeft een admin `invoices:read`, maar RLS laat hem alleen eigen rijen zien. Dat is veilig, maar wie "admin ziet alles" verwacht, voegt makkelijk een te brede policy toe | Spec-skelet (fase 1) vraagt expliciet: "Ziet een admin rijen van anderen?" Zo ja: een aparte policy `<naam>_select_admin` met `(select app.is_mfa_admin())`, zoals `user_roles_select_admin`; nooit `using (true)` |
| B3 | laag | `on delete cascade` wist de data van een verwijderde gebruiker. Goed voor AVG, fout voor data met bewaarplicht (facturen: 7 jaar) | Cascade als standaard; het spec-skelet vraagt "Wat gebeurt er met de rijen als het account weg is?" |
| B4 | laag | Een lijst zonder limiet is API4 (framework §6) | `queries.ts` en het contract van de lijst krijgen een vaste maximale paginagrootte |
| B5 | laag | FORCE RLS geldt ook voor de eigenaar: een seed of datamigratie als `app_migrator` ziet 0 rijen en schrijft niets (waargenomen) | De generator maakt geen seed. Is er later een nodig, dan via een security definer-functie, zoals `app.assign_role` |
| B6 | info | `owner_id` is `text` (zelfde type als `better_auth."user".id`), `id` is `uuid` met `gen_random_uuid()` (core sinds PG13, geen extensie) | Brand in `db/ids.json` voor `public.<naam>.id`; de naam volgt OV-5 zonder verbuiging. Vraag aan de eigenaar bij de generator-PR |

## Het patroon na deze review

```sql
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null default app.current_user_id() references better_auth."user" (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index invoices_owner_id_idx on public.invoices (owner_id);
alter table public.invoices enable row level security;
alter table public.invoices force row level security;

-- Insert en update alleen op de velden uit de spec, nooit op id, owner_id of created_at (review 2026-10-10, A1/A2):
-- grant insert (<velden>), update (<velden>) on public.invoices to app_authenticated;
grant select, delete on public.invoices to app_authenticated;

create policy invoices_select_own on public.invoices
  for select to app_authenticated using (owner_id = (select app.current_user_id()));
create policy invoices_insert_own on public.invoices
  for insert to app_authenticated with check (owner_id = (select app.current_user_id()));
create policy invoices_update_own on public.invoices
  for update to app_authenticated
  using (owner_id = (select app.current_user_id())) with check (owner_id = (select app.current_user_id()));
create policy invoices_delete_own on public.invoices
  for delete to app_authenticated using (owner_id = (select app.current_user_id()));
```

pgTAP per policy (de tester, niet de generator): elke assert begint met de policynaam (`check-policies`), met minstens de rijen
"Wat standhoudt" hierboven en A1/A2 als `throws_ok … '42501'`.

## Buiten het patroon, gezien tijdens de review

- `create-app.ts:68-69`: invoer wordt gevalideerd vóór de rol- en permissiecontrole. Een ingelogde gebruiker zonder recht krijgt bij foute
  invoer `VALIDATION` (400) in plaats van `FORBIDDEN` (403), en kan zo het invoerschema van een route aftasten. Laag; geen wijziging
  voorgesteld zonder akkoord, de contracten staan toch al in `src/shared`.
