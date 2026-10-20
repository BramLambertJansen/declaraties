-- Securityinvarianten C1 t/m C3 (spec security-suite, AC-12): gelden voor elke tabel en policy in de catalogus, ook toekomstige.
-- Naast db/tests/invarianten.sql (die ongewijzigd blijft): hier de breder gedetecteerde owner-tabellen (C1), het predicaat van
-- de policies (C2) en een allowlist van grants per tabel en recht (C3). Elke invariant is een query die de overtredingen met de
-- naam van tabel of policy teruggeeft; de test eist dat die leeg is en bewijst daarna met opzettelijke fouten dat de query ze
-- vangt en de goede variant doorlaat. De uitzonderingenlijsten staan hier (testpad, gate-pad): een developer kan ze niet
-- verruimen zonder diff-guard. Een uitzondering zonder reden is zelf een overtreding. Alles in één transactie die terugdraait.
begin;
set search_path = tap, public;
select plan(15);

-- Hulp: een lijst teksten gesorteerd zoals de invarianten (byte-volgorde), zodat de verwachting niet van de volgorde afhangt.
create function pg_temp.gs(text[]) returns text[] language sql immutable as $$
  select array(select x from unnest($1) x order by x collate "C")
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- C1 owner-tabel breder gedetecteerd. Een tabel in public of app is kandidaat als ze een kolom heeft die naar
-- better_auth."user"(id) verwijst, of een eigenaarvormige kolom (owner_id, user_id, een naam op _user_id), ook zonder foreign key.
-- Een owner-tabel is: schema public, kolom owner_id met een foreign key naar better_auth."user"(id) (het patroon van
-- pnpm new:resource, dat invarianten.sql afdwingt). Elke andere kandidaat staat op de uitzonderingenlijst, met reden.
-- ---------------------------------------------------------------------------------------------------------------------
create temp table owner_uitzonderingen (tabel text, reden text);
insert into owner_uitzonderingen values
  ('public.user_roles',
   'koppelt een gebruiker aan zijn rol (user_id is de primaire sleutel), geen eigen gegevens van de gebruiker: een gebruiker leest alleen zijn eigen rol, een admin met MFA alle rollen, schrijven alleen via app.assign_role (security definer); gedrag in db/tests/user_roles.sql');

create function pg_temp.c1_eigenaar() returns setof text language sql stable as $$
  with kol as (
    select n.nspname::text as schema_naam,
           format('%I.%I', n.nspname, c.relname) as tabel,
           a.attname::text as kolom,
           exists (
             select 1 from pg_catalog.pg_constraint k
             where k.conrelid = c.oid and k.contype = 'f'
               and k.confrelid = 'better_auth."user"'::regclass and a.attnum = any (k.conkey)
           ) as heeft_fk
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where c.relkind in ('r', 'p') and n.nspname in ('public', 'app')
  ),
  toegestaan as (
    select u.tabel from owner_uitzonderingen u where btrim(coalesce(u.reden, '')) <> ''
  )
  select v.regel from (
    select format('%s.%s: eigenaarvormige kolom zonder foreign key naar better_auth."user"(id)', k.tabel, k.kolom)
    from kol k
    where (k.kolom = 'owner_id' or k.kolom ~ '(^|_)user_id$')
      and not k.heeft_fk
      and k.tabel not in (select tabel from toegestaan)
    union all
    select format('%s: verwijst naar better_auth."user"(id) maar is geen owner-tabel (public, kolom owner_id)', t.tabel)
    from (select distinct tabel from kol where heeft_fk) t
    where not exists (
        select 1 from kol o
        where o.tabel = t.tabel and o.schema_naam = 'public' and o.kolom = 'owner_id' and o.heeft_fk
      )
      and t.tabel not in (select tabel from toegestaan)
    union all
    select format('%s: uitzondering zonder reden', u.tabel)
    from owner_uitzonderingen u
    where btrim(coalesce(u.reden, '')) = ''
    union all
    select format('%s: uitzondering voor een tabel die niet bestaat', u.tabel)
    from owner_uitzonderingen u
    where to_regclass(u.tabel) is null
  ) v (regel)
  order by v.regel collate "C"
$$;

select is(array(select pg_temp.c1_eigenaar()), '{}'::text[], 'C1: elke tabel met een eigenaarvormige of naar de gebruiker verwijzende kolom is een owner-tabel of staat met reden op de uitzonderingenlijst');

-- Probe: een goede owner-tabel wordt doorgelaten.
create table public.c1_probe_goed (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null default app.current_user_id() references better_auth."user" (id) on delete cascade
);
select is(array(select pg_temp.c1_eigenaar()), '{}'::text[], 'C1: een owner-tabel met owner_id en foreign key naar better_auth."user"(id) wordt doorgelaten');

-- Probe: opzettelijke fouten worden gevangen, met de naam van tabel en kolom.
create table app.c1_probe_user (id integer primary key, user_id text);
create table public.c1_probe_owner (id integer primary key, owner_id text);
create table public.c1_probe_invited (id integer primary key, invited_user_id text);
create table public.c1_probe_auteur (id integer primary key, auteur text references better_auth."user" (id));
create table app.c1_probe_app (id integer primary key, owner_id text references better_auth."user" (id));
select is(
  array(select pg_temp.c1_eigenaar()),
  pg_temp.gs(array[
    'app.c1_probe_user.user_id: eigenaarvormige kolom zonder foreign key naar better_auth."user"(id)',
    'public.c1_probe_owner.owner_id: eigenaarvormige kolom zonder foreign key naar better_auth."user"(id)',
    'public.c1_probe_invited.invited_user_id: eigenaarvormige kolom zonder foreign key naar better_auth."user"(id)',
    'public.c1_probe_auteur: verwijst naar better_auth."user"(id) maar is geen owner-tabel (public, kolom owner_id)',
    'app.c1_probe_app: verwijst naar better_auth."user"(id) maar is geen owner-tabel (public, kolom owner_id)'
  ]),
  'C1: user_id in app zonder foreign key, owner_id of een naam op _user_id zonder foreign key, een andere kolom met foreign key en een owner_id met foreign key in app worden gevangen'
);

-- Uitzonderingen: met reden gaat de tabel erdoor, zonder reden blijft de overtreding en komt er een tweede bij, en een
-- uitzondering voor een tabel die niet bestaat is zelf een overtreding.
insert into owner_uitzonderingen values
  ('app.c1_probe_user', 'probe: bewust zonder foreign key'),
  ('public.c1_probe_owner', ''),
  ('public.c1_probe_weg', 'probe: tabel bestaat niet');
select is(
  array(select pg_temp.c1_eigenaar()),
  pg_temp.gs(array[
    'public.c1_probe_owner.owner_id: eigenaarvormige kolom zonder foreign key naar better_auth."user"(id)',
    'public.c1_probe_owner: uitzondering zonder reden',
    'public.c1_probe_invited.invited_user_id: eigenaarvormige kolom zonder foreign key naar better_auth."user"(id)',
    'public.c1_probe_auteur: verwijst naar better_auth."user"(id) maar is geen owner-tabel (public, kolom owner_id)',
    'app.c1_probe_app: verwijst naar better_auth."user"(id) maar is geen owner-tabel (public, kolom owner_id)',
    'public.c1_probe_weg: uitzondering voor een tabel die niet bestaat'
  ]),
  'C1: een uitzondering met reden laat de tabel door; zonder reden, of voor een tabel die niet bestaat, is ze zelf een overtreding'
);

drop table public.c1_probe_goed, app.c1_probe_user, public.c1_probe_owner, public.c1_probe_invited, public.c1_probe_auteur, app.c1_probe_app;
delete from owner_uitzonderingen where tabel like '%c1_probe%';
select is(array(select pg_temp.c1_eigenaar()), '{}'::text[], 'C1: na het opruimen van de probes is de invariant weer leeg');

-- ---------------------------------------------------------------------------------------------------------------------
-- C2 predicaat. Een policy voor een API-rol (app_authenticated, api_user, auth_service of PUBLIC) gebruikt
-- app.current_user_id() alleen als (select app.current_user_id()), kent geen auth.uid() (een provider-functie, AGENTS.md) en
-- heeft geen using (true) of with check (true), tenzij de policy op de uitzonderingenlijst staat, met reden.
-- Policies voor app_definer (security definer-functies) vallen erbuiten.
-- ---------------------------------------------------------------------------------------------------------------------
create temp table predicaat_uitzonderingen (tabel text, policy text, reden text);

create function pg_temp.c2_predicaat() returns setof text language sql stable as $$
  with pol as (
    select format('%I.%I', n.nspname, c.relname) as tabel,
           p.polname::text as policy,
           coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') as qual,
           coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '') as chk
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'app')
      and p.polroles && array[0::oid, 'app_authenticated'::regrole::oid, 'api_user'::regrole::oid, 'auth_service'::regrole::oid]
  ),
  toegestaan as (
    select u.tabel, u.policy from predicaat_uitzonderingen u where btrim(coalesce(u.reden, '')) <> ''
  ),
  actief as (
    select * from pol where (tabel, policy) not in (select tabel, policy from toegestaan)
  )
  select v.regel from (
    select format('%s: %s: kale app.current_user_id() (gebruik (select app.current_user_id()))', a.tabel, a.policy)
    from actief a
    where regexp_replace(a.qual || ' ' || a.chk, '\(\s*SELECT\s+app\.current_user_id\(\)(\s+AS\s+\w+)?\s*\)', '', 'gi')
          ~* 'current_user_id\(\)'
    union all
    select format('%s: %s: auth.uid() is een provider-functie', a.tabel, a.policy)
    from actief a
    where (a.qual || ' ' || a.chk) ~* 'auth\.uid\('
    union all
    select format('%s: %s: using (true) voor een API-rol', a.tabel, a.policy)
    from actief a
    where btrim(a.qual) = 'true'
    union all
    select format('%s: %s: with check (true) voor een API-rol', a.tabel, a.policy)
    from actief a
    where btrim(a.chk) = 'true'
    union all
    select format('%s: %s: uitzondering zonder reden', u.tabel, u.policy)
    from predicaat_uitzonderingen u
    where btrim(coalesce(u.reden, '')) = ''
  ) v (regel)
  order by v.regel collate "C"
$$;

select is(array(select pg_temp.c2_predicaat()), '{}'::text[], 'C2: elke policy voor een API-rol gebruikt (select app.current_user_id()), geen auth.uid() en geen using (true) of with check (true)');

-- Probe: goede policies worden doorgelaten, ook een using (true) voor app_definer.
create table public.c2_probe (id integer primary key, owner_id text);
alter table public.c2_probe enable row level security;
create policy c2_ok_select on public.c2_probe for select to app_authenticated using (owner_id = (select app.current_user_id()));
create policy c2_ok_all on public.c2_probe for all to api_user
  using (owner_id = (select app.current_user_id())) with check (owner_id = (select app.current_user_id()));
create policy c2_definer on public.c2_probe for select to app_definer using (true);
select is(array(select pg_temp.c2_predicaat()), '{}'::text[], 'C2: (select app.current_user_id()) in using en with check, en using (true) voor app_definer worden doorgelaten');

-- Probe: opzettelijke fouten worden gevangen, met tabel en policy. auth.uid() bestaat hier niet; een lokale functie met die naam
-- maakt de fout mogelijk, binnen de transactie die terugdraait.
create schema if not exists auth;
create or replace function auth.uid() returns text language sql return 'x';
create policy c2_bare on public.c2_probe for select to app_authenticated using (owner_id = app.current_user_id());
create policy c2_auth on public.c2_probe for update to app_authenticated using (owner_id = auth.uid());
create policy c2_true_select on public.c2_probe for select to app_authenticated using (true);
create policy c2_true_insert on public.c2_probe for insert to app_authenticated with check (true);
create policy c2_public_true on public.c2_probe for delete to public using (true);
select is(
  array(select pg_temp.c2_predicaat()),
  pg_temp.gs(array[
    'public.c2_probe: c2_bare: kale app.current_user_id() (gebruik (select app.current_user_id()))',
    'public.c2_probe: c2_auth: auth.uid() is een provider-functie',
    'public.c2_probe: c2_true_select: using (true) voor een API-rol',
    'public.c2_probe: c2_true_insert: with check (true) voor een API-rol',
    'public.c2_probe: c2_public_true: using (true) voor een API-rol'
  ]),
  'C2: een kale app.current_user_id(), auth.uid(), using (true), with check (true) en een policy to public met using (true) worden gevangen'
);

insert into predicaat_uitzonderingen values
  ('public.c2_probe', 'c2_true_select', 'probe: bewust voor iedereen leesbaar'),
  ('public.c2_probe', 'c2_bare', '');
select is(
  array(select pg_temp.c2_predicaat()),
  pg_temp.gs(array[
    'public.c2_probe: c2_bare: kale app.current_user_id() (gebruik (select app.current_user_id()))',
    'public.c2_probe: c2_bare: uitzondering zonder reden',
    'public.c2_probe: c2_auth: auth.uid() is een provider-functie',
    'public.c2_probe: c2_true_insert: with check (true) voor een API-rol',
    'public.c2_probe: c2_public_true: using (true) voor een API-rol'
  ]),
  'C2: een uitzondering met reden laat de policy door; zonder reden blijft de overtreding en is de uitzondering zelf er een'
);

drop table public.c2_probe;
drop function auth.uid();
drop schema auth;
delete from predicaat_uitzonderingen where tabel = 'public.c2_probe';
select is(array(select pg_temp.c2_predicaat()), '{}'::text[], 'C2: na het opruimen van de probes is de invariant weer leeg');

-- ---------------------------------------------------------------------------------------------------------------------
-- C3 grants. Elke grant (tabel- of kolomrecht, rechtstreeks) aan app_authenticated, api_user of auth_service op een tabel of
-- view in public of app staat op de allowlist per tabel en recht. Op een owner-tabel (C1) zijn tabelbreed select en delete en
-- kolomrechten voor insert en update de regel: dat hoeft niet per tabel op de lijst, een tabelbrede insert of update is een
-- overtreding, en elk ander recht ook. Die vrijstelling geldt alleen voor app_authenticated; api_user en auth_service
-- vallen overal onder de allowlist. (PUBLIC, TRUNCATE/REFERENCES/TRIGGER en better_auth staan in invarianten.sql.)
-- ---------------------------------------------------------------------------------------------------------------------
create temp table grant_allowlist (tabel text, rol text, recht text, reden text);
insert into grant_allowlist values
  ('public.user_roles', 'app_authenticated', 'SELECT',
   'een gebruiker leest zijn eigen rol (policy user_roles_select_own), een admin met MFA alle rollen (user_roles_select_admin); schrijven alleen via app.assign_role'),
  ('app.accounts', 'app_authenticated', 'SELECT',
   'view voor de accountlijst van een admin (owner app_definer leest better_auth); de view zelf filtert op admin met MFA (spec accountbeheer, ADR 0014)'),
  ('app.audit_log', 'app_authenticated', 'SELECT',
   'een admin met MFA leest de audit log (policy audit_log_select_admin, ADR 0021); schrijven alleen via app.audit (security definer)');

create function pg_temp.c3_grants() returns setof text language sql stable as $$
  with rel as (
    select c.oid, c.relacl, c.relowner,
           format('%I.%I', n.nspname, c.relname) as tabel,
           (n.nspname = 'public' and exists (
             select 1 from pg_catalog.pg_attribute a
             join pg_catalog.pg_constraint k on k.conrelid = c.oid and k.contype = 'f'
               and k.confrelid = 'better_auth."user"'::regclass and a.attnum = any (k.conkey)
             where a.attrelid = c.oid and a.attname = 'owner_id' and not a.attisdropped
           )) as is_owner
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p', 'v', 'm', 'f') and n.nspname in ('public', 'app')
  ),
  rechten as (
    select r.tabel, (r.is_owner and g.rolname = 'app_authenticated') as is_owner, g.rolname::text as rol, a.privilege_type::text as recht, null::text as kolom
    from rel r
    cross join lateral pg_catalog.aclexplode(coalesce(r.relacl, pg_catalog.acldefault('r', r.relowner))) a
    join pg_catalog.pg_roles g on g.oid = a.grantee
    where g.rolname in ('app_authenticated', 'api_user', 'auth_service')
    union all
    select r.tabel, (r.is_owner and g.rolname = 'app_authenticated'), g.rolname::text, a.privilege_type::text, att.attname::text
    from rel r
    join pg_catalog.pg_attribute att on att.attrelid = r.oid and att.attacl is not null and not att.attisdropped
    cross join lateral pg_catalog.aclexplode(att.attacl) a
    join pg_catalog.pg_roles g on g.oid = a.grantee
    where g.rolname in ('app_authenticated', 'api_user', 'auth_service')
  ),
  toegestaan as (
    select l.tabel, l.rol, l.recht from grant_allowlist l where btrim(coalesce(l.reden, '')) <> ''
  )
  select v.regel from (
    select format('%s: %s heeft %s, niet op de allowlist', x.tabel, x.rol, x.recht)
    from rechten x
    where not x.is_owner and x.kolom is null
      and (x.tabel, x.rol, x.recht) not in (select tabel, rol, recht from toegestaan)
    union all
    select format('%s: %s heeft %s op kolom %s, niet op de allowlist', x.tabel, x.rol, x.recht, x.kolom)
    from rechten x
    where not x.is_owner and x.kolom is not null
    union all
    select format('%s: %s heeft tabelbrede %s op een owner-tabel (alleen kolomrechten)', x.tabel, x.rol, x.recht)
    from rechten x
    where x.is_owner and x.kolom is null and x.recht in ('INSERT', 'UPDATE')
    union all
    select format('%s: %s heeft %s op een owner-tabel, niet toegestaan', x.tabel, x.rol, x.recht)
    from rechten x
    where x.is_owner and x.kolom is null and x.recht not in ('SELECT', 'DELETE', 'INSERT', 'UPDATE')
    union all
    select format('%s: %s heeft %s op kolom %s van een owner-tabel, niet toegestaan', x.tabel, x.rol, x.recht, x.kolom)
    from rechten x
    where x.is_owner and x.kolom is not null and x.recht not in ('INSERT', 'UPDATE')
    union all
    select format('%s: allowlist-regel zonder reden (%s %s)', l.tabel, l.rol, l.recht)
    from grant_allowlist l
    where btrim(coalesce(l.reden, '')) = ''
  ) v (regel)
  order by v.regel collate "C"
$$;

select is(array(select pg_temp.c3_grants()), '{}'::text[], 'C3: elke grant aan app_authenticated, api_user en auth_service op een tabel in public of app staat op de allowlist (of is het kolompatroon van een owner-tabel)');

-- Probe: het patroon van pnpm new:resource (select en delete tabelbreed, insert en update op een kolom) wordt doorgelaten.
create table public.c3_owner_probe (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null default app.current_user_id() references better_auth."user" (id) on delete cascade,
  created_at timestamptz not null default now(),
  notitie text
);
grant select, delete on public.c3_owner_probe to app_authenticated;
grant insert (notitie), update (notitie) on public.c3_owner_probe to app_authenticated;
select is(array(select pg_temp.c3_grants()), '{}'::text[], 'C3: tabelbreed select en delete plus kolomrechten voor insert en update op een owner-tabel worden doorgelaten');

-- Probe: opzettelijke fouten worden gevangen, met tabel, rol en recht.
grant insert, update, truncate on public.c3_owner_probe to app_authenticated;
grant references (notitie) on public.c3_owner_probe to auth_service;
create table public.c3_probe (id integer primary key, notitie text);
grant select, insert on public.c3_probe to app_authenticated;
grant update (notitie) on public.c3_probe to api_user;
select is(
  array(select pg_temp.c3_grants()),
  pg_temp.gs(array[
    'public.c3_owner_probe: app_authenticated heeft tabelbrede INSERT op een owner-tabel (alleen kolomrechten)',
    'public.c3_owner_probe: app_authenticated heeft tabelbrede UPDATE op een owner-tabel (alleen kolomrechten)',
    'public.c3_owner_probe: app_authenticated heeft TRUNCATE op een owner-tabel, niet toegestaan',
    'public.c3_owner_probe: auth_service heeft REFERENCES op kolom notitie, niet op de allowlist',
    'public.c3_probe: app_authenticated heeft SELECT, niet op de allowlist',
    'public.c3_probe: app_authenticated heeft INSERT, niet op de allowlist',
    'public.c3_probe: api_user heeft UPDATE op kolom notitie, niet op de allowlist'
  ]),
  'C3: een tabelbrede insert of update en een ander recht op een owner-tabel, en een grant op een andere tabel buiten de allowlist (tabel- en kolomrecht) worden gevangen'
);

-- Allowlist: met reden gaat het recht erdoor, zonder reden blijft de overtreding en is de regel zelf er een.
insert into grant_allowlist values
  ('public.c3_probe', 'app_authenticated', 'SELECT', 'probe: bewust leesbaar'),
  ('public.c3_probe', 'app_authenticated', 'INSERT', '');
select is(
  array(select pg_temp.c3_grants()),
  pg_temp.gs(array[
    'public.c3_owner_probe: app_authenticated heeft tabelbrede INSERT op een owner-tabel (alleen kolomrechten)',
    'public.c3_owner_probe: app_authenticated heeft tabelbrede UPDATE op een owner-tabel (alleen kolomrechten)',
    'public.c3_owner_probe: app_authenticated heeft TRUNCATE op een owner-tabel, niet toegestaan',
    'public.c3_owner_probe: auth_service heeft REFERENCES op kolom notitie, niet op de allowlist',
    'public.c3_probe: app_authenticated heeft INSERT, niet op de allowlist',
    'public.c3_probe: api_user heeft UPDATE op kolom notitie, niet op de allowlist',
    'public.c3_probe: allowlist-regel zonder reden (app_authenticated INSERT)'
  ]),
  'C3: een allowlist-regel met reden laat het recht door; zonder reden blijft de overtreding en is de regel zelf er een'
);

drop table public.c3_owner_probe, public.c3_probe;
delete from grant_allowlist where tabel like '%c3_%probe%';
select is(array(select pg_temp.c3_grants()), '{}'::text[], 'C3: na het opruimen van de probes is de invariant weer leeg');

select * from finish();
rollback;
