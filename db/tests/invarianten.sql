-- RLS- en grant-invarianten (framework §6, ADR 0004): gelden voor elke tabel, ook toekomstige. Elke invariant is een
-- query die de overtredingen teruggeeft; de test eist dat die leeg is en bewijst daarna met een opzettelijke fout dat
-- de query hem vangt. Alles in één transactie die terugdraait.
begin;
set search_path = tap, public;
select plan(53);

-- Elke tabel in public en app: RLS aan én geforceerd (uitzondering: public.schema_migrations van dbmate).
create function pg_temp.zonder_rls() returns setof text language sql stable as $$
  select format('%I.%I', n.nspname, c.relname)
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p') and n.nspname in ('public', 'app')
    and not (n.nspname = 'public' and c.relname = 'schema_migrations')
    and not (c.relrowsecurity and c.relforcerowsecurity)
  order by 1
$$;

-- Geen rol buiten de eigenaar heeft TRUNCATE, REFERENCES of TRIGGER, op tabellen in public, app of better_auth.
create function pg_temp.verboden_rechten() returns setof text language sql stable as $$
  select format('%s: %s op %I.%I', r.rolname, p.recht, n.nspname, c.relname)
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join (values ('app_authenticated'), ('api_user'), ('auth_service'), ('app_definer')) r (rolname)
  cross join (values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p (recht)
  where c.relkind in ('r', 'p', 'v', 'm', 'f') and n.nspname in ('public', 'app', 'better_auth')
    -- De eigenaar (bijv. app_definer van de view app.accounts) heeft ze altijd; het gaat om rechten die zijn toegekend.
    and c.relowner <> r.rolname::regrole
    and pg_catalog.has_table_privilege(r.rolname, c.oid, p.recht)
  order by 1
$$;

-- Schema better_auth is dicht: rechten op het schema, de tabellen en de kolommen alleen voor auth_service (en de eigenaar).
-- Uitzondering (besluit eigenaar, view app.accounts): app_definer mag het schema gebruiken en exact de kolommen hieronder
-- lezen. Elke andere grant, ook een extra kolom of een ander recht, is een overtreding.
create temp table better_auth_allowlist (rol text, recht text, object text);
insert into better_auth_allowlist values
  ('app_definer', 'USAGE', 'schema better_auth'),
  ('app_definer', 'SELECT', 'better_auth.user.id'),
  ('app_definer', 'SELECT', 'better_auth.user.name'),
  ('app_definer', 'SELECT', 'better_auth.user.email'),
  ('app_definer', 'SELECT', 'better_auth.user.createdAt'),
  ('app_definer', 'SELECT', 'better_auth.account.userId'),
  ('app_definer', 'SELECT', 'better_auth.account.providerId'),
  -- ADR 0026: blokkeren; de enige kolom in better_auth die app_definer ook schrijft (app.set_account_blocked).
  ('app_definer', 'SELECT', 'better_auth.user.blocked_at'),
  ('app_definer', 'UPDATE', 'better_auth.user.blocked_at');

create function pg_temp.better_auth_open() returns setof text language sql stable as $$
  with grants as (
    select coalesce(g.rolname, 'PUBLIC') as rol, a.privilege_type as recht, 'schema better_auth' as object
    from pg_catalog.pg_namespace n
    cross join lateral pg_catalog.aclexplode(coalesce(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) a
    left join pg_catalog.pg_roles g on g.oid = a.grantee
    where n.nspname = 'better_auth' and a.grantee <> n.nspowner
    union all
    select coalesce(g.rolname, 'PUBLIC'), a.privilege_type, n.nspname || '.' || c.relname
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
    left join pg_catalog.pg_roles g on g.oid = a.grantee
    where n.nspname = 'better_auth' and a.grantee <> c.relowner
    union all
    select coalesce(g.rolname, 'PUBLIC'), a.privilege_type, n.nspname || '.' || c.relname || '.' || att.attname
    from pg_catalog.pg_attribute att
    join pg_catalog.pg_class c on c.oid = att.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(att.attacl) a
    left join pg_catalog.pg_roles g on g.oid = a.grantee
    where n.nspname = 'better_auth' and att.attacl is not null and a.grantee <> c.relowner
  )
  select format('%s: %s op %s', rol, recht, object) from grants
  where rol <> 'auth_service'
    and (rol, recht, object) not in (select rol, recht, object from better_auth_allowlist)
  order by 1
$$;

-- PUBLIC krijgt niets: geen tabelrechten in public, app en better_auth, geen EXECUTE op functies in public en app.
create function pg_temp.rechten_voor_public() returns setof text language sql stable as $$
  select format('PUBLIC: %s op %I.%I', a.privilege_type, n.nspname, c.relname)
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
  where n.nspname in ('public', 'app', 'better_auth') and a.grantee = 0
  union all
  select format('PUBLIC: EXECUTE op %I.%I(%s)', n.nspname, p.proname, pg_catalog.oidvectortypes(p.proargtypes))
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
  where n.nspname in ('public', 'app') and a.grantee = 0
  order by 1
$$;

-- Tabelpatroon met owner_id (docs/reviews/2026-10-10-tabelpatroon.md, B1; ADR 0016), voor elke tabel in public met die kolom:
-- geen insert- of updaterecht voor app_authenticated op id, owner_id of created_at (A1/A2: anders kiest de client zelf de
-- id of de eigenaar), een policy voor select, insert, update en delete to app_authenticated (A3: een recht zonder policy
-- geeft stil 0 rijen), en een index met owner_id als eerste kolom (elke policy filtert erop).
create function pg_temp.eigenaartabellen() returns setof text language sql stable as $$
  with t as (
    select c.oid, format('%I.%I', n.nspname, c.relname) as naam
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attname = 'owner_id' and not a.attisdropped
    where c.relkind in ('r', 'p') and n.nspname = 'public'
  )
  select * from (
    select format('%s: app_authenticated heeft %s op %s', t.naam, r.recht, k.kolom)
    from t
    cross join (values ('id'), ('owner_id'), ('created_at')) k (kolom)
    cross join (values ('INSERT'), ('UPDATE')) r (recht)
    where exists (
        select 1 from pg_catalog.pg_attribute a where a.attrelid = t.oid and a.attname = k.kolom and not a.attisdropped
      )
      and pg_catalog.has_column_privilege('app_authenticated', t.oid, k.kolom, r.recht)
    union all
    select format('%s: geen policy voor %s to app_authenticated', t.naam, m.actie)
    from t
    cross join (values ('select', 'r'), ('insert', 'a'), ('update', 'w'), ('delete', 'd')) m (actie, cmd)
    where not exists (
      select 1 from pg_catalog.pg_policy p
      where p.polrelid = t.oid
        and p.polcmd in (m.cmd::"char", '*'::"char")
        and 'app_authenticated'::regrole::oid = any (p.polroles)
    )
    union all
    select format('%s: geen index met owner_id als eerste kolom', t.naam)
    from t
    where not exists (
      select 1 from pg_catalog.pg_index i
      join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
      where i.indrelid = t.oid and a.attname = 'owner_id'
    )
  ) overtredingen (regel)
  order by regel collate "C"
$$;

-- app.audit_log (spec audit-log AC-5, ADR 0021 punt 6; spec achtergrondtaken jobs/AC-7): precies de vier policies van
-- ADR 0021 punt 6, alleen select (en insert op kolommen en delete voor app_definer) en de drie guard-triggers aan. De tabel zelf valt al onder de algemene invarianten hierboven.
create function pg_temp.audit_log_afwijkingen() returns setof text language sql stable as $$
  with t as (select to_regclass('app.audit_log') as oid)
  select 'app.audit_log ontbreekt' from t where t.oid is null
  union all
  select 'extra policy: ' || p.polname from pg_catalog.pg_policy p join t on p.polrelid = t.oid
  where p.polname not in ('audit_log_definer_insert', 'audit_log_select_admin', 'audit_log_definer_select', 'audit_log_definer_delete')
  union all
  select 'ontbrekende policy: ' || v.naam from t
  cross join (values ('audit_log_definer_insert'), ('audit_log_select_admin'), ('audit_log_definer_select'), ('audit_log_definer_delete')) v (naam)
  where t.oid is not null
    and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = t.oid and p.polname = v.naam)
  union all
  select format('extra grant: %s %s', coalesce(g.rolname, 'PUBLIC'), a.privilege_type)
  from t join pg_catalog.pg_class c on c.oid = t.oid
  cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
  left join pg_catalog.pg_roles g on g.oid = a.grantee
  where a.grantee <> c.relowner
    and (coalesce(g.rolname, 'PUBLIC')::text, a.privilege_type::text)
        not in (('app_authenticated', 'SELECT'), ('app_definer', 'SELECT'), ('app_definer', 'DELETE'))
  union all
  select format('extra kolomgrant: %s %s op %s', g.rolname, a.privilege_type, att.attname)
  from t join pg_catalog.pg_attribute att on att.attrelid = t.oid
  cross join lateral pg_catalog.aclexplode(att.attacl) a
  left join pg_catalog.pg_roles g on g.oid = a.grantee
  where att.attacl is not null
    and not coalesce(g.rolname = 'app_definer' and a.privilege_type = 'INSERT'
                     and att.attname in ('actor_id', 'action', 'target_type', 'target_id', 'request_id', 'details'), false)
  union all
  select format('guard-trigger %s staat niet aan', v.naam) from t
  cross join (values ('audit_log_no_update'), ('audit_log_delete_expired_only'), ('audit_log_no_truncate')) v (naam)
  where t.oid is not null
    and not exists (
      select 1 from pg_catalog.pg_trigger g where g.tgrelid = t.oid and g.tgname = v.naam and g.tgenabled = 'O'
    )
  order by 1
$$;

-- Bewaarcatalogus (spec achtergrondtaken, deel A, ADR 0022 punt 5): elke tabel in public en app heeft een rij in
-- app.retention (behalve public.schema_migrations), elke rij een tabel, de purger past bij het schema, en een tabel die
-- app.purge_expired opruimt (purger app, keep niet null) heeft een timestamptz-kolom, select en delete voor app_definer en
-- een delete-policy die app.retention_cutoff aanroept (of een restrictieve die dat doet); de audit log bewaart minstens 1 jaar.
-- plpgsql, zodat het ontbreken van app.retention een regel is en geen afgebroken script.
create function pg_temp.bewaarcatalogus() returns setof text language plpgsql stable as $$
begin
  if to_regclass('app.retention') is null then
    return next 'app.retention ontbreekt';
    return;
  end if;
  return query
  select v.regel from (
    -- Regel 1: een tabel zonder rij.
    select 'geen rij: ' || format('%I.%I', n.nspname, c.relname) as regel
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and n.nspname in ('public', 'app')
      and not (n.nspname = 'public' and c.relname = 'schema_migrations')
      and not exists (select 1 from app.retention r where r.table_name = c.oid)
    union all
    -- Regel 2: een rij voor een tabel die niet (meer) bestaat.
    select 'rij zonder tabel: ' || r.table_name::oid::text
    from app.retention r
    where not exists (select 1 from pg_catalog.pg_class c where c.oid = r.table_name)
    union all
    -- Regel 3: purger app in public of app, purger auth in better_auth.
    select format('purger %s past niet bij het schema: %I.%I', r.purger, n.nspname, c.relname)
    from app.retention r
    join pg_catalog.pg_class c on c.oid = r.table_name join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where (r.purger = 'app' and n.nspname not in ('public', 'app')) or (r.purger = 'auth' and n.nspname <> 'better_auth')
    union all
    -- Regel 4a: time_column is een kolom van type timestamptz.
    select 'time_column geen timestamptz: ' || format('%I.%I', n.nspname, c.relname)
    from app.retention r
    join pg_catalog.pg_class c on c.oid = r.table_name join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where r.purger = 'app' and r.keep is not null
      and not exists (
        select 1 from pg_catalog.pg_attribute a
        where a.attrelid = c.oid and a.attname = r.time_column and a.attnum > 0 and not a.attisdropped
          and a.atttypid = 'pg_catalog.timestamptz'::regtype
      )
    union all
    -- Regel 4b: app_definer heeft select en delete.
    select 'app_definer mist select of delete: ' || format('%I.%I', n.nspname, c.relname)
    from app.retention r
    join pg_catalog.pg_class c on c.oid = r.table_name join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where r.purger = 'app' and r.keep is not null
      and not (pg_catalog.has_table_privilege('app_definer', c.oid, 'SELECT') and pg_catalog.has_table_privilege('app_definer', c.oid, 'DELETE'))
    union all
    -- Regel 4c: elke permissieve delete-policy to app_definer roept app.retention_cutoff aan, of een restrictieve doet dat.
    select 'delete-policy zonder app.retention_cutoff: ' || format('%I.%I', n.nspname, c.relname)
    from app.retention r
    join pg_catalog.pg_class c on c.oid = r.table_name join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where r.purger = 'app' and r.keep is not null
      and exists (
        select 1 from pg_catalog.pg_policy p
        where p.polrelid = c.oid and p.polpermissive and p.polcmd in ('d'::"char", '*'::"char")
          and ('app_definer'::regrole::oid = any (p.polroles) or 0::oid = any (p.polroles))
          and coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') !~ 'retention_cutoff'
      )
      and not exists (
        select 1 from pg_catalog.pg_policy p
        where p.polrelid = c.oid and not p.polpermissive and p.polcmd in ('d'::"char", '*'::"char")
          and ('app_definer'::regrole::oid = any (p.polroles) or 0::oid = any (p.polroles))
          and coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') ~ 'retention_cutoff'
      )
    union all
    -- Regel 5: de audit log bewaart minstens 1 jaar (null = zolang het account bestaat, nooit korter).
    select 'app.audit_log: keep korter dan 1 jaar'
    from app.retention r
    where r.table_name = to_regclass('app.audit_log') and r.keep is not null and r.keep < interval '1 year'
  ) v order by v.regel collate "C";
end $$;

select is(array(select pg_temp.zonder_rls()), '{}'::text[], 'elke tabel in public en app heeft RLS aan en geforceerd');
select is(array(select pg_temp.verboden_rechten()), '{}'::text[], 'geen API-rol heeft TRUNCATE, REFERENCES of TRIGGER');
select is(array(select pg_temp.better_auth_open()), '{}'::text[], 'better_auth: alleen auth_service heeft rechten, plus de kolom-allowlist van app_definer');
select is(array(select pg_temp.rechten_voor_public()), '{}'::text[], 'PUBLIC heeft geen tabelrechten en geen EXECUTE');
select is(array(select pg_temp.eigenaartabellen()), '{}'::text[], 'elke tabel met owner_id volgt het tabelpatroon (kolomrechten, vier policies, index)');
select is(has_schema_privilege('app_authenticated', 'better_auth', 'usage'), false, 'app_authenticated kan schema better_auth niet gebruiken');
select is(has_schema_privilege('api_user', 'better_auth', 'usage'), false, 'api_user kan schema better_auth niet gebruiken');

-- Bewaarcatalogus (jobs/AC-4): de invariant is leeg, en elke regel vangt een opzettelijke fout. app.retention staat onder
-- FORCE RLS met alleen een select-policy; de eigenaar kan er dus niet in schrijven. Voor de controles zetten we FORCE uit
-- (alleen in deze transactie) en na afloop weer aan. De probetabel gaat voor de controles op de rest van het bestand weg.
select is(array(select pg_temp.bewaarcatalogus()), '{}'::text[], 'bewaarcatalogus: elke tabel heeft een rij, elke rij een tabel, purger past bij het schema, de termijn is opruimbaar (AC-4)');
select lives_ok($$alter table app.retention no force row level security$$, 'voorbereiding: FORCE RLS op app.retention uit, alleen in deze transactie');

create table app.retention_probe (id integer, d date, t timestamptz);
select is(array(select pg_temp.bewaarcatalogus()), array['geen rij: app.retention_probe'], 'controle regel 1: een nieuwe tabel in app zonder rij wordt gevangen (AC-4)');
select lives_ok($$insert into app.retention values ('app.retention_probe', null, null, 'app', 'probe')$$, 'voorbereiding: een rij voor de probetabel (keep null)');
select is(array(select pg_temp.bewaarcatalogus()), '{}'::text[], 'controle regel 1: met een rij is de tabel in orde');

select lives_ok($$update app.retention set purger = 'auth' where table_name = 'app.retention_probe'::regclass$$, 'voorbereiding: purger auth op een tabel in app');
select is(array(select pg_temp.bewaarcatalogus()), array['purger auth past niet bij het schema: app.retention_probe'], 'controle regel 3: purger auth op een tabel in app wordt gevangen (AC-4)');
select lives_ok($$update app.retention set purger = 'app' where table_name = 'app.retention_probe'::regclass$$, 'voorbereiding: purger weer app');

grant select, delete on app.retention_probe to app_definer;
select lives_ok($$update app.retention set time_column = 'd', keep = interval '1 year' where table_name = 'app.retention_probe'::regclass$$, 'voorbereiding: time_column van type date');
select is(array(select pg_temp.bewaarcatalogus()), array['time_column geen timestamptz: app.retention_probe'], 'controle regel 4: purger app met een time_column van type date wordt gevangen (AC-4)');

select lives_ok($$update app.retention set time_column = 't' where table_name = 'app.retention_probe'::regclass$$, 'voorbereiding: time_column van type timestamptz');
alter table app.retention_probe enable row level security;
create policy retention_probe_delete on app.retention_probe for delete to app_definer using (true);
select is(array(select pg_temp.bewaarcatalogus()), array['delete-policy zonder app.retention_cutoff: app.retention_probe'], 'controle regel 4: een permissieve delete-policy to app_definer zonder app.retention_cutoff wordt gevangen (AC-4)');
create policy retention_probe_cutoff on app.retention_probe as restrictive for delete to app_definer
  using (t < (select app.retention_cutoff('app.retention_probe')));
select is(array(select pg_temp.bewaarcatalogus()), '{}'::text[], 'controle regel 4: een restrictieve delete-policy met app.retention_cutoff maakt het goed');
revoke delete on app.retention_probe from app_definer;
select is(array(select pg_temp.bewaarcatalogus()), array['app_definer mist select of delete: app.retention_probe'], 'controle regel 4: een ontbrekend delete-recht voor app_definer wordt gevangen');

drop table app.retention_probe;
select ok(
  (select count(*) = 1 and bool_and(r ~ '^rij zonder tabel: [0-9]+$') from pg_temp.bewaarcatalogus() r),
  'controle regel 2: een rij voor een verwijderde tabel wordt gevangen (AC-4)'
);
select lives_ok($$delete from app.retention where not exists (select 1 from pg_catalog.pg_class c where c.oid = table_name)$$, 'voorbereiding: de rij van de verwijderde tabel weer weg');
select is(array(select pg_temp.bewaarcatalogus()), '{}'::text[], 'controle: na het opruimen van de probe is de invariant weer leeg');

select lives_ok($$update app.retention set keep = interval '11 months' where table_name = 'app.audit_log'::regclass$$, 'voorbereiding: de audit log met keep 11 maanden');
select is(array(select pg_temp.bewaarcatalogus()), array['app.audit_log: keep korter dan 1 jaar'], 'controle regel 5: app.audit_log met keep 11 maanden wordt gevangen (AC-4)');
select lives_ok($$update app.retention set keep = interval '1 year' where table_name = 'app.audit_log'::regclass$$, 'voorbereiding: de audit log weer 1 jaar');
select lives_ok($$alter table app.retention force row level security$$, 'voorbereiding: FORCE RLS op app.retention weer aan');

-- Controle: elke invariant vangt een opzettelijke fout.
create table app.invariant_probe (id integer primary key);
alter table app.invariant_probe enable row level security;
select is(array(select pg_temp.zonder_rls()), array['app.invariant_probe'], 'controle: RLS aan maar niet geforceerd wordt gevangen');

grant select, truncate on app.invariant_probe to app_authenticated;
select is(array(select pg_temp.verboden_rechten()), array['app_authenticated: TRUNCATE op app.invariant_probe'], 'controle: TRUNCATE voor app_authenticated wordt gevangen');

create table better_auth.invariant_probe (id integer primary key);
grant select on better_auth.invariant_probe to app_authenticated;
select is(
  array(select pg_temp.better_auth_open()),
  array['app_authenticated: SELECT op better_auth.invariant_probe'],
  'controle: een grant op better_auth aan een andere rol wordt gevangen'
);

grant select (password) on better_auth.account to app_definer;
select is(
  array(select pg_temp.better_auth_open()),
  array['app_authenticated: SELECT op better_auth.invariant_probe', 'app_definer: SELECT op better_auth.account.password'],
  'controle: een kolom buiten de allowlist (wachtwoord) wordt gevangen'
);
select is(
  (select count(*)::integer from better_auth_allowlist a
   where not exists (
     select 1 from pg_catalog.pg_attribute att join pg_catalog.pg_class c on c.oid = att.attrelid
     where a.object = 'better_auth.' || c.relname || '.' || att.attname
       and pg_catalog.has_column_privilege(a.rol, c.oid, att.attnum, a.recht)
   ) and a.object <> 'schema better_auth'),
  0,
  'de allowlist beschrijft precies wat app_definer nu mag lezen (geen verouderde regels)'
);

create function app.invariant_probe_fn() returns integer language sql return 1;
grant execute on function app.invariant_probe_fn() to public;
select is(
  array(select pg_temp.rechten_voor_public()),
  array['PUBLIC: EXECUTE op app.invariant_probe_fn()'],
  'controle: EXECUTE voor PUBLIC wordt gevangen'
);

-- Controle tabelpatroon: een tabel met tabelbrede insert en update, zonder policies en zonder index wordt gevangen; met
-- kolomrechten alleen op een veld, de vier policies en de index (het patroon van pnpm new:resource) is hij in orde.
create table public.invariant_owner_probe (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  created_at timestamptz not null default now(),
  notitie text
);
alter table public.invariant_owner_probe enable row level security;
alter table public.invariant_owner_probe force row level security;
grant select, insert, update, delete on public.invariant_owner_probe to app_authenticated;
select is(
  array(select pg_temp.eigenaartabellen()),
  array[
    'public.invariant_owner_probe: app_authenticated heeft INSERT op created_at',
    'public.invariant_owner_probe: app_authenticated heeft INSERT op id',
    'public.invariant_owner_probe: app_authenticated heeft INSERT op owner_id',
    'public.invariant_owner_probe: app_authenticated heeft UPDATE op created_at',
    'public.invariant_owner_probe: app_authenticated heeft UPDATE op id',
    'public.invariant_owner_probe: app_authenticated heeft UPDATE op owner_id',
    'public.invariant_owner_probe: geen index met owner_id als eerste kolom',
    'public.invariant_owner_probe: geen policy voor delete to app_authenticated',
    'public.invariant_owner_probe: geen policy voor insert to app_authenticated',
    'public.invariant_owner_probe: geen policy voor select to app_authenticated',
    'public.invariant_owner_probe: geen policy voor update to app_authenticated'
  ],
  'controle: tabelbrede insert en update, ontbrekende policies en index worden gevangen'
);

revoke insert, update on public.invariant_owner_probe from app_authenticated;
grant insert (notitie), update (notitie) on public.invariant_owner_probe to app_authenticated;
create policy invariant_owner_probe_select_own on public.invariant_owner_probe
  for select to app_authenticated using (owner_id = (select app.current_user_id()));
create policy invariant_owner_probe_insert_own on public.invariant_owner_probe
  for insert to public with check (owner_id = (select app.current_user_id()));
select is(
  array(select pg_temp.eigenaartabellen()),
  array[
    'public.invariant_owner_probe: geen index met owner_id als eerste kolom',
    'public.invariant_owner_probe: geen policy voor delete to app_authenticated',
    'public.invariant_owner_probe: geen policy voor insert to app_authenticated',
    'public.invariant_owner_probe: geen policy voor update to app_authenticated'
  ],
  'controle: kolomrechten op een veld zijn goed; een policy to public telt niet als policy to app_authenticated'
);

drop policy invariant_owner_probe_insert_own on public.invariant_owner_probe;
create policy invariant_owner_probe_insert_own on public.invariant_owner_probe
  for insert to app_authenticated with check (owner_id = (select app.current_user_id()));
create policy invariant_owner_probe_update_own on public.invariant_owner_probe
  for update to app_authenticated
  using (owner_id = (select app.current_user_id())) with check (owner_id = (select app.current_user_id()));
create policy invariant_owner_probe_delete_own on public.invariant_owner_probe
  for delete to app_authenticated using (owner_id = (select app.current_user_id()));
create index invariant_owner_probe_owner_id_idx on public.invariant_owner_probe (owner_id);
select is(array(select pg_temp.eigenaartabellen()), '{}'::text[], 'controle: het tabelpatroon van pnpm new:resource wordt doorgelaten');

-- Controle app.audit_log: een extra policy, een extra grant en een uitgeschakelde guard-trigger worden gevangen.
select is(array(select pg_temp.audit_log_afwijkingen()), '{}'::text[], 'app.audit_log: exact vier policies, alleen de toegestane grants en de guard-triggers aan (AC-5, jobs/AC-7)');
select lives_ok($$create policy audit_log_probe on app.audit_log for select to app_authenticated using (true)$$, 'voorbereiding: een extra policy op app.audit_log');
select is(array(select pg_temp.audit_log_afwijkingen()), array['extra policy: audit_log_probe'], 'controle: een extra policy op app.audit_log wordt gevangen');
select lives_ok($$drop policy audit_log_probe on app.audit_log$$, 'voorbereiding: de extra policy weer weg');
select lives_ok($$grant update on app.audit_log to app_definer$$, 'voorbereiding: een extra grant op app.audit_log');
select is(array(select pg_temp.audit_log_afwijkingen()), array['extra grant: app_definer UPDATE'], 'controle: een extra grant (update aan app_definer) op app.audit_log wordt gevangen');
select lives_ok($$revoke update on app.audit_log from app_definer$$, 'voorbereiding: de extra grant weer weg');
select lives_ok($$alter table app.audit_log disable trigger audit_log_no_update$$, 'voorbereiding: de guard-trigger uitzetten');
select is(array(select pg_temp.audit_log_afwijkingen()), array['guard-trigger audit_log_no_update staat niet aan'], 'controle: een uitgeschakelde guard-trigger wordt gevangen');
select lives_ok($$alter table app.audit_log enable trigger audit_log_no_update$$, 'voorbereiding: de guard-trigger weer aan');
select lives_ok($$grant delete on app.audit_log to app_authenticated$$, 'voorbereiding: een delete-grant aan een andere rol dan app_definer');
select is(array(select pg_temp.audit_log_afwijkingen()), array['extra grant: app_authenticated DELETE'], 'controle: een delete-grant aan een andere rol dan app_definer wordt gevangen (jobs/AC-7)');
select lives_ok($$revoke delete on app.audit_log from app_authenticated$$, 'voorbereiding: de extra grant weer weg');
select lives_ok($$alter table app.audit_log disable trigger audit_log_delete_expired_only$$, 'voorbereiding: de rij-trigger uitzetten');
select is(array(select pg_temp.audit_log_afwijkingen()), array['guard-trigger audit_log_delete_expired_only staat niet aan'], 'controle: een uitgeschakelde rij-trigger audit_log_delete_expired_only wordt gevangen (jobs/AC-7)');
select lives_ok($$alter table app.audit_log enable trigger audit_log_delete_expired_only$$, 'voorbereiding: de rij-trigger weer aan');

select * from finish();
rollback;
