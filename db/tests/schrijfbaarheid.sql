-- Cataloguschecks voor uitvoerbare databasehandelingen (spec database-schrijfbaarheid, namespace database-checks, AC-1 t/m
-- AC-9; leerticket #328): I = elk verplicht insertveld heeft een bron, D = een delete door app_definer ziet de rijen die hij
-- raakt. Alles draait tegen de echte gemigreerde database in één transactie die terugdraait.
--
-- De catalogushelpers en probe-executors staan in sectie 1. De goede en opzettelijk foute fixtures toetsen zowel hun
-- structuurcontrole als de werkelijk uitgevoerde insert of delete. Registraties zijn invoer voor die handelingen,
-- geen vrijstelling van de controles; de observaties leggen ook de ongewijzigde beschermde rijen vast.
--
-- HELPERCONTRACTEN (alle in pg_temp; aanroepen met prefix pg_temp.):
--   eff_recht(p_rel regclass, p_rol text, p_recht text, p_kolom text default null) returns boolean
--     Effectief recht (tabelgrant, kolomgrant, PUBLIC, werkelijk geërfd via INHERIT; een lidmaatschap met alleen SET telt niet).
--     p_kolom null = enig tabel- of kolomrecht (has_any_column_privilege), anders dat ene kolomrecht. p_recht 'INSERT'/'SELECT'/...
--   i_kandidaten(p_rel regclass default null, p_rollen text[] default null) returns setof text
--     Regels '<schema.tabel>|<rol>' voor elke tabel (relkind r/p) met enig effectief INSERT-recht voor een rol. p_rel null =
--     ontdek in public en app; anders alleen die relatie (elk schema). p_rollen null = app_authenticated, api_user,
--     auth_service, app_definer. De echte gate (beide parameters null) gebruikt altijd public/app en de vaste vier rollen.
--   i_overtredingen(p_rel regclass default null, p_rollen text[] default null) returns setof text
--     Regels die beginnen met 'I|<schema.tabel>|<rol>|<kolom>' (daarna eventueel '|<detail>'): een NOT NULL-kolom (niet
--     verwijderd, attnum > 0) zonder bron (effectief kolominsertrecht, default, identity of generated) die niet door een
--     geldige registratie wordt gedekt. Een registratie in pg_temp.i_registratie is geldig als: uniek op (tabel, rol, kolom),
--     de kolom echt een ontbrekende bron heeft, reden niet leeg, een ingeschakelde BEFORE INSERT ROW-trigger bestaat (tgtype,
--     tgenabled in O/A) EN pg_temp.i_uitvoering voor die registratie precies één rij (rijen = 1, foutcode 00000) toont.
--     Elke andere registratie (dubbel, niet meer nodig, onbruikbaar, niet uitgevoerd, trigger weg/uit/ander event, reden
--     alleen) geeft ook een regel met dat prefix. Met p_rel gezet: alleen registraties van die tabel.
--   i_insert_probe(p_rel regclass, p_rol text, p_invoer jsonb) returns table(rijen integer, foutcode text, melding text)
--     Bouwt uit de sleutels van p_invoer een echte INSERT (waarden als literal, cast naar kolomtype), voert die uit onder
--     transactiegebonden SET LOCAL ROLE p_rol (alleen app_authenticated en app_definer zijn vanaf app_migrator bereikbaar;
--     andere rollen geven een foutregel), vangt de fout, leest GET DIAGNOSTICS row_count, herstelt ALTIJD de rol (reset role).
--     foutcode '00000' bij succes. Geen pgTAP-aanroepen en geen willekeurige SQL uit de registratie.
--   d_kandidaten(p_rel regclass default null, p_rol text default 'app_definer') returns setof text
--     Regels '<schema.tabel>|<rol>' voor elke tabel in public/app (of alleen p_rel) met RLS aan én geforceerd, effectief
--     DELETE voor de rol en minstens één toepasselijke permissieve DELETE- of ALL-policy. Toepasselijk: polroles bevat 0
--     (PUBLIC), de rol zelf of een rol waarvan de rol de rechten werkelijk erft (pg_has_role(..., 'USAGE')).
--   d_structuur(p_rel regclass default null, p_rol text default 'app_definer') returns setof text
--     Regels die beginnen met 'D|<schema.tabel>|<rol>|' voor elke kandidaat zonder toepasselijke permissieve SELECT- of
--     ALL-policy (restrictieve policies en alleen een SELECT-grant tellen niet).
--   d_gedrag(p_rel regclass default null, p_rol text default 'app_definer') returns setof text
--     Regels 'D|<schema.tabel>|<rol>|<detail>' uit de gedragsprobe, met detail: 'niet geregistreerd' (kandidaat zonder
--     registratie in pg_temp.d_probe/d_probe_rij), 'niet uitgevoerd' (geen rij in pg_temp.d_uitvoering), 'geen rij verwacht
--     verwijderd', 'SELECT-recht op <kolom>' (filterkolom zonder effectief SELECT), 'rowcount <werkelijk> verwacht <n>' (n =
--     aantal rijen met verwacht = verwijderd; werkelijk moet gelijk zijn en minstens 1), 'rij <naam>: <uitkomst> verwacht
--     <verwacht>' (uitkomst via pg_temp.d_uitkomst) en 'observatie ontbreekt'. Leeg = gedragsprobe groen.
--   d_delete_probe(p_tabel text) returns table(rijen integer, foutcode text, melding text, stmt text)
--     Leest vóór de rolwissel pg_temp.d_probe en d_probe_rij van de tabel, bouwt ÉÉN echte
--     'delete from <tabel> where <kol> in (<waarden van alle rijen>) and ...' (alle proefrijen, ook de beschermde, voldoen
--     aan dezelfde WHERE), voert die uit onder SET LOCAL ROLE app_definer met RLS aan en geforceerd, leest rowcount via GET
--     DIAGNOSTICS, herstelt ALTIJD de rol. Geen pgTAP-aanroepen. De glue pg_temp.d_voer_uit(tabel) bewaart het resultaat.
--
-- CONCRETE ONDERSTEUNING (niet wijzigen): try_as/query_as (rolwissel + foutvangst), qn, herken/rood (diagnose-vorm), i_stand,
-- d_stand_s, d_stand_t, snap_alle (snapshot van volledige opgeslagen rijen), d_uitkomst, i_voer_uit, d_voer_uit (glue die
-- de probe-uitvoering vastlegt), maak_d/maak_t/maak_bestand (fixtures), bestand_probe, force_alle, catalogus_stempel.
--
-- REGISTRATIES (temp tabellen, leeg buiten deze test; geen vrije SQL):
--   i_registratie(tabel, rol, kolom, invoer jsonb, reden)   — triggeruitzondering voor I.
--   d_probe(tabel, filterkolommen text[]) en d_probe_rij(tabel, rij, waarden jsonb, verwacht, reden) — D-proefrijen, verwacht is
--     'verwijderd' of 'beschermd'; waarden bevat per filterkolom de waarde.
--   i_uitvoering / d_uitvoering — wat de executors werkelijk deden; d_observatie(moment, tabel, rijen jsonb) — snapshots als
--     eigenaar (NO FORCE in een top-level savepoint, \gset, rollback, dan pas invoegen).
--
-- Afwijkingen van de opdracht om te melden: fixture-schema sbf_fx krijgt USAGE ook voor app_definer (de executor moet er
-- als app_definer in kunnen schrijven/verwijderen) en CREATE+USAGE voor app_authenticated; alleen op dat nieuwe testschema.
\set ON_ERROR_STOP on
\set ON_ERROR_ROLLBACK off
begin;
set search_path = tap, public;
select plan(110);

-- =====================================================================================================================
-- 0. Registratie- en bewijstabellen
-- =====================================================================================================================
create temp table i_registratie (tabel text, rol text, kolom text, invoer jsonb, reden text);
create temp table i_uitvoering (tabel text, rol text, kolom text, rijen integer, foutcode text, melding text);
create temp table d_probe (tabel text, filterkolommen text[]);
create temp table d_probe_rij (tabel text, rij text, waarden jsonb, verwacht text, reden text);
create temp table d_uitvoering (tabel text, rijen integer, foutcode text, melding text, stmt text);
create temp table d_observatie (moment text, tabel text, rijen jsonb);

-- =====================================================================================================================
-- 1. Catalogushelpers en probe-executors
-- =====================================================================================================================
create function pg_temp.eff_recht(p_rel regclass, p_rol text, p_recht text, p_kolom text default null)
  returns boolean language sql stable as $$
  select coalesce(case
    when upper(p_recht) in ('INSERT', 'SELECT', 'UPDATE', 'REFERENCES') then
      case when p_kolom is null then pg_catalog.has_any_column_privilege(r.oid, p_rel, p_recht)
           else pg_catalog.has_column_privilege(r.oid, p_rel, a.attnum, p_recht) end
    else pg_catalog.has_table_privilege(r.oid, p_rel, p_recht) end, false)
  from pg_catalog.pg_roles r
  left join pg_catalog.pg_attribute a on a.attrelid = p_rel and a.attname = p_kolom
    and a.attnum > 0 and not a.attisdropped
  where r.rolname = p_rol
$$;

create function pg_temp.i_kandidaten(p_rel regclass default null, p_rollen text[] default null)
  returns setof text language sql stable as $$
  select format('%I.%I|%s', n.nspname, c.relname, r.rol)
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join unnest(coalesce(p_rollen, array['app_authenticated', 'api_user', 'auth_service', 'app_definer'])) r(rol)
  where c.relkind in ('r', 'p')
    and (case when p_rel is null then n.nspname in ('public', 'app') else c.oid = p_rel end)
    and pg_temp.eff_recht(c.oid, r.rol, 'INSERT')
$$;

create function pg_temp.i_overtredingen(p_rel regclass default null, p_rollen text[] default null)
  returns setof text language sql stable as $$
  with ontbreekt as (
    select format('%I.%I', n.nspname, c.relname) as tabel, c.oid, r.rol, a.attname as kolom
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.oid
    cross join unnest(coalesce(p_rollen, array['app_authenticated', 'api_user', 'auth_service', 'app_definer'])) r(rol)
    where c.relkind in ('r', 'p')
      and (case when p_rel is null then n.nspname in ('public', 'app') else c.oid = p_rel end)
      and pg_temp.eff_recht(c.oid, r.rol, 'INSERT')
      and a.attnum > 0 and not a.attisdropped and a.attnotnull
      and not pg_temp.eff_recht(c.oid, r.rol, 'INSERT', a.attname)
      and a.attidentity = '' and a.attgenerated = ''
      and not exists (select 1 from pg_catalog.pg_attrdef d where d.adrelid = c.oid and d.adnum = a.attnum)
  ), registraties as (
    select g.*, count(*) over (partition by tabel, rol, kolom) as aantal
    from pg_temp.i_registratie g
    where (p_rel is null or g.tabel = (select format('%I.%I', n.nspname, c.relname)
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where c.oid = p_rel))
      and (p_rollen is null or g.rol = any(p_rollen))
  ), geldig as (
    select g.tabel, g.rol, g.kolom from registraties g
    join ontbreekt m on (m.tabel, m.rol, m.kolom) = (g.tabel, g.rol, g.kolom)
    where g.aantal = 1 and nullif(btrim(g.reden), '') is not null
      and jsonb_typeof(g.invoer) = 'object'
      and exists (select 1 from pg_catalog.pg_trigger t where t.tgrelid = m.oid
                  and not t.tgisinternal and t.tgenabled in ('O', 'A') and (t.tgtype::integer & 7) = 7)
      and (select count(*) = 1 and bool_and(u.rijen = 1 and u.foutcode = '00000')
           from pg_temp.i_uitvoering u where (u.tabel, u.rol, u.kolom) = (g.tabel, g.rol, g.kolom))
  )
  select format('I|%s|%s|%s|ontbrekende insertbron', m.tabel, m.rol, m.kolom)
  from ontbreekt m where not exists (
    select 1 from geldig g where (g.tabel, g.rol, g.kolom) = (m.tabel, m.rol, m.kolom))
  union
  select format('I|%s|%s|%s|ongeldige bronregistratie', g.tabel, g.rol, g.kolom)
  from registraties g where not exists (
    select 1 from geldig v where (v.tabel, v.rol, v.kolom) = (g.tabel, g.rol, g.kolom))
$$;

create function pg_temp.i_insert_probe(p_rel regclass, p_rol text, p_invoer jsonb)
  returns table (rijen integer, foutcode text, melding text) language plpgsql as $$
declare v_kolommen text; v_waarden text; v_stmt text;
begin
  rijen := 0;
  begin
    if p_rol is null or p_rol not in ('app_authenticated', 'app_definer') then
      raise exception 'INSERT: rol % is niet beschikbaar voor deze executor', p_rol using errcode = '42501';
    end if;
    if p_rel is null or jsonb_typeof(p_invoer) is distinct from 'object' then
      raise exception 'INSERT: ongeldige tabel of invoerregistratie' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_object_keys(p_invoer) k
               where not exists (select 1 from pg_catalog.pg_attribute a
                 where a.attrelid = p_rel and a.attname = k and a.attnum > 0 and not a.attisdropped)) then
      raise exception 'INSERT: onbekende invoerkolom' using errcode = '22023';
    end if;
    select string_agg(format('%I', a.attname), ', ' order by a.attnum),
           string_agg(format('%L::%s', e.value #>> '{}', pg_catalog.format_type(a.atttypid, a.atttypmod)), ', ' order by a.attnum)
      into v_kolommen, v_waarden
    from jsonb_each(p_invoer) e join pg_catalog.pg_attribute a on a.attrelid = p_rel and a.attname = e.key;
    v_stmt := case when v_kolommen is null then format('insert into %s default values', pg_temp.qn(p_rel))
                   else format('insert into %s (%s) values (%s)', pg_temp.qn(p_rel), v_kolommen, v_waarden) end;
    execute format('set local role %I', p_rol);
    execute v_stmt;
    get diagnostics rijen = row_count;
    foutcode := '00000'; melding := 'INSERT uitgevoerd';
  exception when others then
    rijen := 0; foutcode := sqlstate; melding := 'INSERT: ' || sqlerrm;
  end;
  reset role;
  return next;
end $$;

create function pg_temp.d_kandidaten(p_rel regclass default null, p_rol text default 'app_definer')
  returns setof text language sql stable as $$
  select format('%I.%I|%s', n.nspname, c.relname, r.rolname)
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join pg_catalog.pg_roles r
  where c.relkind in ('r', 'p') and c.relrowsecurity and c.relforcerowsecurity and r.rolname = p_rol
    and (case when p_rel is null then n.nspname in ('public', 'app') else c.oid = p_rel end)
    and pg_catalog.has_table_privilege(r.oid, c.oid, 'DELETE')
    and exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and p.polpermissive and p.polcmd in ('d', '*')
      and exists (select 1 from unnest(p.polroles) pr(oid)
        where case when pr.oid = 0 then true else pg_catalog.pg_has_role(r.oid, pr.oid, 'USAGE') end))
$$;

create function pg_temp.d_structuur(p_rel regclass default null, p_rol text default 'app_definer')
  returns setof text language sql stable as $$
  select format('D|%I.%I|%s|permissieve SELECT/ALL-policy ontbreekt', n.nspname, c.relname, r.rolname)
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join pg_catalog.pg_roles r
  where r.rolname = p_rol
    and format('%I.%I|%s', n.nspname, c.relname, r.rolname) in (select pg_temp.d_kandidaten(p_rel, p_rol))
    and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and p.polpermissive and p.polcmd in ('r', '*')
      and exists (select 1 from unnest(p.polroles) pr(oid)
        where case when pr.oid = 0 then true else pg_catalog.pg_has_role(r.oid, pr.oid, 'USAGE') end))
$$;

create function pg_temp.d_gedrag(p_rel regclass default null, p_rol text default 'app_definer')
  returns setof text language plpgsql stable as $$
declare t record; g record; u record; x record; k text; v_prefix text; v_n integer; v_voor jsonb; v_na jsonb;
        v_observatie boolean; v_uitkomst text; v_voor_n integer; v_na_n integer;
begin
  for t in select c.oid, pg_temp.qn(c.oid) as tabel from pg_catalog.pg_class c
    where pg_temp.qn(c.oid) || '|' || p_rol in (select pg_temp.d_kandidaten(p_rel, p_rol)) loop
    v_prefix := 'D|' || t.tabel || '|' || p_rol || '|';
    if (select count(*) from pg_temp.d_probe p where p.tabel = t.tabel) <> 1
       or not exists (select 1 from pg_temp.d_probe_rij r where r.tabel = t.tabel) then
      return next v_prefix || 'niet geregistreerd'; continue;
    end if;
    select * into g from pg_temp.d_probe p where p.tabel = t.tabel;
    if cardinality(g.filterkolommen) is null or cardinality(g.filterkolommen) = 0
       or exists (select 1 from unnest(g.filterkolommen) a(k) group by a.k having a.k is null or count(*) > 1) then
      return next v_prefix || 'ongeldige filterregistratie'; continue;
    end if;
    foreach k in array g.filterkolommen loop
      if not coalesce(pg_temp.eff_recht(t.oid, p_rol, 'SELECT', k), false) then
        return next v_prefix || 'SELECT-recht op ' || coalesce(k, '<null>');
      end if;
    end loop;
    if exists (select 1 from pg_temp.d_probe_rij r where r.tabel = t.tabel and (
      nullif(btrim(r.rij), '') is null or nullif(btrim(r.reden), '') is null
      or r.verwacht is null or r.verwacht not in ('verwijderd', 'beschermd')
      or jsonb_typeof(r.waarden) is distinct from 'object')) then
      return next v_prefix || 'ongeldige rijregistratie'; continue;
    end if;
    if exists (select 1 from pg_temp.d_probe_rij r where r.tabel = t.tabel and (
      not r.waarden ?& g.filterkolommen or (select count(*) from jsonb_object_keys(r.waarden)) <> cardinality(g.filterkolommen)
      or exists (select 1 from jsonb_each(r.waarden) e where e.value = 'null'::jsonb)))
      or exists (select 1 from pg_temp.d_probe_rij r where r.tabel = t.tabel group by r.rij having count(*) > 1)
      or exists (select 1 from pg_temp.d_probe_rij r where r.tabel = t.tabel group by r.waarden having count(*) > 1) then
      return next v_prefix || 'ongeldige rijregistratie'; continue;
    end if;
    select count(*) into v_n from pg_temp.d_probe_rij r where r.tabel = t.tabel and r.verwacht = 'verwijderd';
    if v_n = 0 then return next v_prefix || 'geen rij verwacht verwijderd'; end if;
    if t.tabel = 'app.audit_log' and not exists (select 1 from pg_temp.d_probe_rij r
      where r.tabel = t.tabel and r.verwacht = 'beschermd') then
      return next v_prefix || 'beschermde grenscasus ontbreekt';
    end if;
    if (select count(*) from pg_temp.d_uitvoering e where e.tabel = t.tabel) <> 1 then
      return next v_prefix || 'niet uitgevoerd';
    else
      select * into u from pg_temp.d_uitvoering e where e.tabel = t.tabel;
      if p_rol <> 'app_definer' or u.foutcode is distinct from '00000' or nullif(btrim(u.stmt), '') is null then
        return next v_prefix || 'DELETE uitvoering: ' || coalesce(u.foutcode, 'ontbreekt');
      end if;
      if u.rijen is null or u.rijen < 1 or u.rijen <> v_n then
        return next v_prefix || format('rowcount %s verwacht %s', coalesce(u.rijen::text, 'null'), v_n);
      end if;
    end if;
    v_observatie := (select count(*) = 2 and count(*) filter (where o.moment = 'voor') = 1
      and count(*) filter (where o.moment = 'na') = 1 and bool_and(coalesce(jsonb_typeof(o.rijen) = 'array', false))
      from pg_temp.d_observatie o where o.tabel = t.tabel);
    if not coalesce(v_observatie, false) then
      return next v_prefix || 'observatie ontbreekt'; continue;
    end if;
    select o.rijen into v_voor from pg_temp.d_observatie o where o.tabel = t.tabel and o.moment = 'voor';
    select o.rijen into v_na from pg_temp.d_observatie o where o.tabel = t.tabel and o.moment = 'na';
    for x in select * from pg_temp.d_probe_rij r where r.tabel = t.tabel loop
      select count(*) into v_voor_n from jsonb_array_elements(v_voor) e(v) where e.v @> x.waarden;
      select count(*) into v_na_n from jsonb_array_elements(v_na) e(v) where e.v @> x.waarden;
      v_uitkomst := pg_temp.d_uitkomst(t.tabel, x.rij);
      if v_voor_n <> 1 or v_na_n <> (case when x.verwacht = 'verwijderd' then 0 else 1 end)
         or v_uitkomst is distinct from (case when x.verwacht = 'beschermd' then 'ongewijzigd' else x.verwacht end) then
        return next v_prefix || format('rij %s: %s verwacht %s', x.rij, v_uitkomst, x.verwacht);
      end if;
    end loop;
  end loop;
end $$;

create function pg_temp.d_delete_probe(p_tabel text)
  returns table (rijen integer, foutcode text, melding text, stmt text) language plpgsql as $$
declare v_rel regclass; v_filter text[]; v_k text; v_type text; v_waarden text; v_predicaten text[] := '{}';
begin
  rijen := 0; stmt := '';
  begin
    select c.oid into v_rel from pg_catalog.pg_class c where pg_temp.qn(c.oid) = p_tabel
      and c.relkind in ('r', 'p') and c.relrowsecurity and c.relforcerowsecurity;
    if v_rel is null or (select count(*) from pg_temp.d_probe p where p.tabel = p_tabel) <> 1 then
      raise exception 'DELETE: ongeldige tabel of proberegistratie' using errcode = '22023';
    end if;
    select p.filterkolommen into v_filter from pg_temp.d_probe p where p.tabel = p_tabel;
    if cardinality(v_filter) is null or cardinality(v_filter) = 0
       or exists (select 1 from unnest(v_filter) a(k) group by a.k having a.k is null or count(*) > 1)
       or not exists (select 1 from pg_temp.d_probe_rij r where r.tabel = p_tabel) then
      raise exception 'DELETE: ongeldige filters of ontbrekende proefrijen' using errcode = '22023';
    end if;
    if exists (select 1 from pg_temp.d_probe_rij r where r.tabel = p_tabel and jsonb_typeof(r.waarden) is distinct from 'object') then
      raise exception 'DELETE: ongeldige proefwaarden' using errcode = '22023';
    end if;
    if exists (select 1 from pg_temp.d_probe_rij r where r.tabel = p_tabel and (
      not r.waarden ?& v_filter or (select count(*) from jsonb_object_keys(r.waarden)) <> cardinality(v_filter)
      or exists (select 1 from jsonb_each(r.waarden) e where e.value = 'null'::jsonb))) then
      raise exception 'DELETE: elke proefrij moet alle filterkolommen invullen' using errcode = '22023';
    end if;
    foreach v_k in array v_filter loop
      select pg_catalog.format_type(a.atttypid, a.atttypmod) into v_type from pg_catalog.pg_attribute a
        where a.attrelid = v_rel and a.attname = v_k and a.attnum > 0 and not a.attisdropped;
      if v_type is null then raise exception 'DELETE: onbekende filterkolom %', v_k using errcode = '22023'; end if;
      select string_agg(format('%L::%s', r.waarden ->> v_k, v_type), ', ' order by r.rij) into v_waarden
        from pg_temp.d_probe_rij r where r.tabel = p_tabel;
      v_predicaten := array_append(v_predicaten, format('%I in (%s)', v_k, v_waarden));
    end loop;
    stmt := format('delete from %s where %s', pg_temp.qn(v_rel), array_to_string(v_predicaten, ' and '));
    execute 'set local role app_definer';
    execute stmt;
    get diagnostics rijen = row_count;
    foutcode := '00000'; melding := 'DELETE uitgevoerd';
  exception when others then
    rijen := 0; foutcode := sqlstate; melding := 'DELETE: ' || sqlerrm;
  end;
  reset role;
  return next;
end $$;

-- =====================================================================================================================
-- 2. CONCRETE ONDERSTEUNING (niet wijzigen)
-- =====================================================================================================================
-- Voert SQL uit als een rol en geeft '00000' of 'sqlstate|melding'; de fout draait alleen dit statement terug (zoals audit_log.sql).
create function pg_temp.try_as(p_role text, p_sql text) returns text language plpgsql as $$
declare v_result text;
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    v_result := '00000';
  exception when others then
    v_result := sqlstate || '|' || sqlerrm;
  end;
  reset role;
  return v_result;
end $$;

-- Idem voor een query met één waarde; een fout geeft 'ERROR sqlstate'.
create function pg_temp.query_as(p_role text, p_sql text) returns text language plpgsql as $$
declare v_result text;
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql into v_result;
  exception when others then
    v_result := 'ERROR ' || sqlstate;
  end;
  reset role;
  return v_result;
end $$;

create function pg_temp.qn(p_rel regclass) returns text language sql stable as $$
  select format('%I.%I', n.nspname, c.relname)
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where c.oid = p_rel
$$;

-- Diagnose-vorm: per regel 'match' (begint met het prefix) of 'vreemd:<regel>'; leeg als er geen regels zijn.
create function pg_temp.herken(p_regels text[], p_prefix text) returns text[] language sql immutable as $$
  select coalesce(array_agg(case when x like p_prefix || '%' then 'match' else 'vreemd:' || x end order by x), '{}'::text[])
  from unnest(p_regels) x
$$;

-- Waar als er minstens één regel is en elke regel met het prefix begint.
create function pg_temp.rood(p_regels text[], p_prefix text) returns boolean language sql immutable as $$
  select coalesce(count(*) > 0 and bool_and(x like p_prefix || '%'), false) from unnest(p_regels) x
$$;

create function pg_temp.i_stand(p_rel regclass, p_rol text default 'app_authenticated') returns text[] language sql stable as $$
  select array(select x from pg_temp.i_kandidaten(p_rel, array[p_rol]) x order by x)
      || array(select x from pg_temp.i_overtredingen(p_rel, array[p_rol]) x order by x)
$$;

create function pg_temp.d_stand_s(p_rel regclass, p_rol text default 'app_definer') returns text[] language sql stable as $$
  select array(select x from pg_temp.d_kandidaten(p_rel, p_rol) x order by x)
      || array(select x from pg_temp.d_structuur(p_rel, p_rol) x order by x)
$$;

create function pg_temp.d_stand_t(p_rel regclass, p_rol text default 'app_definer') returns text[] language sql stable as $$
  select pg_temp.d_stand_s(p_rel, p_rol) || array(select x from pg_temp.d_gedrag(p_rel, p_rol) x order by x)
$$;

-- Glue: voert elke registratie met de insert-probe uit en legt het resultaat vast (de uitvoering telt pas hier).
create function pg_temp.i_voer_uit(p_rel regclass default null) returns void language plpgsql as $$
declare r record;
begin
  for r in select * from pg_temp.i_registratie where p_rel is null or tabel = pg_temp.qn(p_rel) order by tabel, rol, kolom loop
    insert into pg_temp.i_uitvoering
      select r.tabel, r.rol, r.kolom, p.rijen, p.foutcode, p.melding
      from pg_temp.i_insert_probe(r.tabel::regclass, r.rol, r.invoer) p;
  end loop;
end $$;

-- Glue: voert de ene delete uit en legt rowcount en fout vast.
create function pg_temp.d_voer_uit(p_tabel text) returns void language plpgsql as $$
begin
  insert into pg_temp.d_uitvoering
    select p_tabel, p.rijen, p.foutcode, p.melding, p.stmt from pg_temp.d_delete_probe(p_tabel) p;
end $$;

-- Snapshot van de VOLLEDIGE opgeslagen rijen (inclusief ids) van alle geregistreerde proefrijen, per tabel; leest als de
-- aanroeper (eigenaar app_migrator met NO FORCE), identificeert rijen via de geregistreerde waarden.
create function pg_temp.snap_alle() returns jsonb language plpgsql as $$
declare r record; v_res jsonb := '{}'::jsonb; v_rows jsonb;
begin
  for r in select tabel from pg_temp.d_probe order by tabel loop
    execute format(
      $f$select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb) from %s t
         where exists (select 1 from pg_temp.d_probe_rij x where x.tabel = %L and to_jsonb(t) @> x.waarden)$f$,
      r.tabel, r.tabel) into v_rows;
    v_res := v_res || jsonb_build_object(r.tabel, v_rows);
  end loop;
  return v_res;
end $$;

-- Uitkomst van één proefrij uit de observaties: ontbreekt (vooraf al weg), verwijderd, ongewijzigd of gewijzigd.
create function pg_temp.d_uitkomst(p_tabel text, p_rij text) returns text language sql stable as $$
  with w as (select waarden from pg_temp.d_probe_rij where tabel = p_tabel and rij = p_rij),
  voor as (select e.v from pg_temp.d_observatie o, w, jsonb_array_elements(o.rijen) as e (v)
           where o.moment = 'voor' and o.tabel = p_tabel and e.v @> w.waarden),
  na as (select e.v from pg_temp.d_observatie o, w, jsonb_array_elements(o.rijen) as e (v)
         where o.moment = 'na' and o.tabel = p_tabel and e.v @> w.waarden)
  select case when not exists (select 1 from voor) then 'ontbreekt'
              when not exists (select 1 from na) then 'verwijderd'
              when (select v from na limit 1) = (select v from voor limit 1) then 'ongewijzigd'
              else 'gewijzigd' end
$$;

-- Waar als alle geregistreerde D-tabellen bestaan, RLS aan hebben en geforceerd zijn.
create function pg_temp.force_alle() returns boolean language sql stable as $$
  select coalesce(count(*) = (select count(*) from pg_temp.d_probe) and bool_and(c.relrowsecurity and c.relforcerowsecurity), false)
  from pg_catalog.pg_class c where c.oid in (select tabel::regclass::oid from pg_temp.d_probe)
$$;

-- D-fixture (eigenaar app_migrator): tabel (id, v) met RLS, optioneel FORCE, grants aan app_definer en genummerde policies.
create function pg_temp.maak_d(p_naam text, p_force boolean, p_grants text, p_policies text[]) returns void language plpgsql as $$
declare i integer;
begin
  execute format('create table sbf_fx.%I (id integer primary key, v text)', p_naam);
  execute format('alter table sbf_fx.%I enable row level security', p_naam);
  if p_force then execute format('alter table sbf_fx.%I force row level security', p_naam); end if;
  if p_grants <> '' then execute format('grant %s on sbf_fx.%I to app_definer', p_grants, p_naam); end if;
  for i in 1 .. coalesce(cardinality(p_policies), 0) loop
    execute format('create policy %I on sbf_fx.%I %s', 'p' || i, p_naam, p_policies[i]);
  end loop;
end $$;

-- I-fixture (eigenaar app_migrator): (a, b not null [extra], c) met alleen een insertgrant op a.
create function pg_temp.maak_t(p_naam text, p_extra text) returns void language plpgsql as $$
begin
  execute format('create table sbf_fx.%I (a integer, b text not null %s, c text)', p_naam, p_extra);
  execute format('grant insert (a) on sbf_fx.%I to app_authenticated', p_naam);
end $$;

-- Filevormige fixture: id door de database, storage_key generated, status standaard pending zonder insertgrant.
create function pg_temp.maak_bestand(p_naam text, p_key_expr text, p_status_default text, p_update_grant boolean)
  returns void language plpgsql as $$
begin
  execute format($f$create table sbf_fx.%I (
      id uuid primary key default gen_random_uuid(),
      naam text not null,
      storage_key text generated always as (%s) stored not null,
      status text not null %s check (status in ('pending', 'ready')))$f$, p_naam, p_key_expr, p_status_default);
  execute format('grant select on sbf_fx.%I to app_authenticated', p_naam);
  execute format('grant insert (naam) on sbf_fx.%I to app_authenticated', p_naam);
  if p_update_grant then execute format('grant update (status) on sbf_fx.%I to app_authenticated', p_naam); end if;
end $$;

-- De hele bestandshandeling onder app_authenticated; geeft de eerste mislukte stap terug, leeg = geslaagd.
create function pg_temp.bestand_probe(p_tabel text) returns text[] language plpgsql as $$
declare v_res text; v_id text; v_key text; v_status text; v_n integer; v_totaal integer;
begin
  v_res := pg_temp.query_as('app_authenticated',
    format($q$insert into sbf_fx.%I (naam) values ('rapport.pdf') returning id::text$q$, p_tabel));
  if v_res is null or v_res like 'ERROR %' then return array['insert:' || coalesce(substr(v_res, 7), 'null')]; end if;
  v_id := v_res;
  execute format('select storage_key, status from sbf_fx.%I where id = %L::uuid', p_tabel, v_id) into v_key, v_status;
  if v_key is distinct from 'files/' || v_id then return array['sleutel']; end if;
  if v_status is distinct from 'pending' then return array['status:' || coalesce(v_status, 'null')]; end if;
  v_res := pg_temp.try_as('app_authenticated',
    format($q$update sbf_fx.%I set status = 'ready' where id = %L::uuid$q$, p_tabel, v_id));
  if v_res <> '00000' then return array['update:' || left(v_res, 5)]; end if;
  execute format('select count(*) filter (where status = ''ready''), count(*) from sbf_fx.%I', p_tabel) into v_n, v_totaal;
  if v_n <> 1 or v_totaal <> 1 then return array['update-rijen:' || v_n || '/' || v_totaal]; end if;
  return '{}'::text[];
end $$;

-- Stempel van alles wat deze test niet mag veranderen in public en app: relaties, rechten, policies, triggers en
-- lidmaatschappen (bewijs dat opruimen de beginsituatie herstelt).
create function pg_temp.catalogus_stempel() returns text language sql stable as $$
  select md5(concat_ws('#',
    (select coalesce(string_agg(s, ',' order by s), '') from (
       select format('%s:%s:%s:%s:%s', c.oid::regclass, c.relacl, c.relrowsecurity, c.relforcerowsecurity, c.relkind) as s
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public', 'app')) q),
    (select coalesce(string_agg(s, ',' order by s), '') from (
       select format('%s.%s:%s', a.attrelid::regclass, a.attname, a.attacl) as s
       from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname in ('public', 'app') and a.attacl is not null) q),
    (select coalesce(string_agg(s, ',' order by s), '') from (
       select format('%s:%s:%s:%s:%s:%s', p.polrelid::regclass, p.polname, p.polcmd, p.polpermissive, p.polroles,
                     pg_get_expr(p.polqual, p.polrelid)) as s
       from pg_catalog.pg_policy p) q),
    (select coalesce(string_agg(s, ',' order by s), '') from (
       select format('%s:%s:%s:%s', t.tgrelid::regclass, t.tgname, t.tgenabled, t.tgtype) as s
       from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where not t.tgisinternal and n.nspname in ('public', 'app')) q),
    (select coalesce(string_agg(s, ',' order by s), '') from (
       select format('%s:%s:%s:%s', m.roleid::regrole, m.member::regrole, m.inherit_option, m.set_option) as s
       from pg_catalog.pg_auth_members m) q)))
$$;

-- =====================================================================================================================
-- 3. De echte gate vóór de fixtures (AC-8: echte gate, vóór en na opruimen)
-- =====================================================================================================================
select is(
  array(select x from pg_temp.i_kandidaten() x
        where x in ('app.audit_log|app_definer', 'app.rate_limits|app_definer', 'public.user_roles|app_definer') order by x),
  array['app.audit_log|app_definer', 'app.rate_limits|app_definer', 'public.user_roles|app_definer'],
  'database-checks/AC-1: I ontdekt in public/app de tabellen met effectief INSERT voor app_definer (kolomgrants tellen mee)'
);
select is(
  array(select x from pg_temp.i_overtredingen() x order by x), '{}'::text[],
  'database-checks/AC-1: de echte I-gate is groen (geen verplicht insertveld zonder bron in public/app)'
);
select is(
  array(select x from pg_temp.d_kandidaten() x order by x),
  array['app.audit_log|app_definer', 'app.one_time_use|app_definer', 'app.rate_limits|app_definer'],
  'database-checks/AC-6: D ontdekt precies app.audit_log, app.one_time_use en app.rate_limits (FORCE RLS, DELETE, permissieve DELETE/ALL-policy)'
);
select is(
  array(select x from pg_temp.d_structuur() x order by x), '{}'::text[],
  'database-checks/AC-5: de echte D-structuurgate is groen (elke D-tabel heeft een permissieve SELECT/ALL-policy)'
);

select pg_temp.catalogus_stempel() as stempel_voor \gset

-- Fixture-schema: alleen dit nieuwe schema krijgt rechten voor de bestaande rollen; niets in public of app wordt aangeraakt.
create schema sbf_fx;
grant usage, create on schema sbf_fx to app_authenticated;
grant usage on schema sbf_fx to app_definer;

-- =====================================================================================================================
-- 4. AC-1: verplicht insertveld zonder bron is rood
-- =====================================================================================================================
create table sbf_fx.i_bad (a integer, b text not null);
grant insert (a) on sbf_fx.i_bad to app_authenticated;
create table sbf_fx.i_nullable (a integer, b text);
grant insert (a) on sbf_fx.i_nullable to app_authenticated;
create table sbf_fx.i_noinsert (a integer, b text not null);
grant select on sbf_fx.i_noinsert to app_authenticated;
create table sbf_fx.i_upd (a integer, b text not null);
grant insert (a), update (b) on sbf_fx.i_upd to app_authenticated;

select is(
  pg_temp.herken(array(select x from pg_temp.i_overtredingen('sbf_fx.i_bad'::regclass, array['app_authenticated']) x),
                 'I|sbf_fx.i_bad|app_authenticated|b'),
  array['match'],
  'database-checks/AC-1: INSERT-recht, NOT NULL-kolom b zonder bron: precies één regel met check, tabel, rol en kolom'
);
select is(
  pg_temp.i_stand('sbf_fx.i_nullable'::regclass), array['sbf_fx.i_nullable|app_authenticated'],
  'database-checks/AC-1: een nullable kolom zonder bron geeft geen fout (tabel wel ontdekt)'
);
select is(
  pg_temp.i_stand('sbf_fx.i_noinsert'::regclass), '{}'::text[],
  'database-checks/AC-1: een tabel zonder effectief insertrecht geeft geen insertverplichting en geen kandidaat'
);
select is(
  pg_temp.herken(array(select x from pg_temp.i_overtredingen('sbf_fx.i_upd'::regclass, array['app_authenticated']) x),
                 'I|sbf_fx.i_upd|app_authenticated|b'),
  array['match'],
  'database-checks/AC-1: UPDATE-recht op de kolom herstelt de ontbrekende insertbron niet'
);

-- =====================================================================================================================
-- 5. AC-2: elke bron passeert, effectieve rechten (PUBLIC, geërfd) en SET-only
-- =====================================================================================================================
create table sbf_fx.i_colgrant (a integer, b text not null);
grant insert (a, b) on sbf_fx.i_colgrant to app_authenticated;
create table sbf_fx.i_tabgrant (a integer, b text not null);
grant insert on sbf_fx.i_tabgrant to app_authenticated;
create table sbf_fx.i_default (a integer, b text not null default 'x');
grant insert (a) on sbf_fx.i_default to app_authenticated;
create table sbf_fx.i_identity (a integer, b integer generated always as identity);
grant insert (a) on sbf_fx.i_identity to app_authenticated;
create table sbf_fx.i_generated (a integer, b integer generated always as (a * 2) stored not null);
grant insert (a) on sbf_fx.i_generated to app_authenticated;

select is(pg_temp.i_stand('sbf_fx.i_colgrant'::regclass), array['sbf_fx.i_colgrant|app_authenticated'],
  'database-checks/AC-2: een effectief kolominsertrecht is een bron');
select is(pg_temp.i_stand('sbf_fx.i_tabgrant'::regclass), array['sbf_fx.i_tabgrant|app_authenticated'],
  'database-checks/AC-2: een effectief tabelinsertrecht is een bron');
select is(pg_temp.i_stand('sbf_fx.i_default'::regclass), array['sbf_fx.i_default|app_authenticated'],
  'database-checks/AC-2: een default in pg_attrdef is een bron');
select is(pg_temp.i_stand('sbf_fx.i_identity'::regclass), array['sbf_fx.i_identity|app_authenticated'],
  'database-checks/AC-2: een identity-kolom is een bron');
select is(pg_temp.i_stand('sbf_fx.i_generated'::regclass), array['sbf_fx.i_generated|app_authenticated'],
  'database-checks/AC-2: een generated kolom is een bron');

create table sbf_fx.i_public (a integer, b text not null);
grant insert (b) on sbf_fx.i_public to public;
create table sbf_fx.i_set (a integer, b text not null);
grant insert on sbf_fx.i_set to app_authenticated;
set local role app_authenticated;
create table sbf_fx.i_erf (a integer, b text not null);
reset role;

select is(pg_temp.eff_recht('sbf_fx.i_public'::regclass, 'app_authenticated', 'INSERT', 'b'), true,
  'database-checks/AC-2: een recht voor PUBLIC telt als effectief kolomrecht voor app_authenticated');
select is(pg_temp.eff_recht('sbf_fx.i_public'::regclass, 'app_authenticated', 'INSERT', 'a'), false,
  'database-checks/AC-2: PUBLIC op kolom b geeft geen recht op kolom a');
select is(pg_temp.eff_recht('sbf_fx.i_set'::regclass, 'app_authenticated', 'INSERT'), true,
  'database-checks/AC-2: app_authenticated heeft de tabelgrant zelf (positieve controle)');
select is(pg_temp.eff_recht('sbf_fx.i_set'::regclass, 'api_user', 'INSERT'), false,
  'database-checks/AC-2: api_user heeft app_authenticated alleen via SET: geen geërfd insertrecht');
select is(pg_temp.eff_recht('sbf_fx.i_erf'::regclass, 'app_migrator', 'INSERT'), false,
  'database-checks/AC-2: app_migrator mag alleen SET naar app_authenticated (eigenaar van i_erf): geen eigenaarsrechten geërfd');
set local role app_authenticated;
grant insert on sbf_fx.i_erf to app_definer;
reset role;
select is(pg_temp.eff_recht('sbf_fx.i_erf'::regclass, 'app_migrator', 'INSERT'), true,
  'database-checks/AC-2: een grant aan app_definer geeft app_migrator (INHERIT) een geërfd insertrecht');
set local role app_authenticated;
revoke insert on sbf_fx.i_erf from app_definer;
reset role;
select is(pg_temp.eff_recht('sbf_fx.i_erf'::regclass, 'app_migrator', 'INSERT'), false,
  'database-checks/AC-2: na de revoke is het geërfde insertrecht weg');

-- =====================================================================================================================
-- 6. AC-3: triggeruitzondering alleen via geldige registratie met uitgevoerde insert van precies één rij
-- =====================================================================================================================
create function sbf_fx.vul_b() returns trigger language plpgsql as $$ begin new.b := 'uit trigger'; return new; end $$;
create function sbf_fx.sla_over() returns trigger language plpgsql as $$ begin return null; end $$;
create function sbf_fx.vul_c() returns trigger language plpgsql as $$ begin new.c := 'andere kolom'; return new; end $$;

select pg_temp.maak_t('t_unreg', '');
create trigger vul before insert on sbf_fx.t_unreg for each row execute function sbf_fx.vul_b();
select pg_temp.maak_t('t_ok', '');
create trigger vul before insert on sbf_fx.t_ok for each row execute function sbf_fx.vul_b();
select pg_temp.maak_t('t_skip', '');
create trigger vul before insert on sbf_fx.t_skip for each row execute function sbf_fx.sla_over();
select pg_temp.maak_t('t_notassign', '');
create trigger vul before insert on sbf_fx.t_notassign for each row execute function sbf_fx.vul_c();
select pg_temp.maak_t('t_disabled', '');
create trigger vul before insert on sbf_fx.t_disabled for each row execute function sbf_fx.vul_b();
alter table sbf_fx.t_disabled disable trigger vul;
select pg_temp.maak_t('t_event', '');
create trigger vul before update on sbf_fx.t_event for each row execute function sbf_fx.vul_b();
select pg_temp.maak_t('t_reden', '');
select pg_temp.maak_t('t_dup', '');
create trigger vul before insert on sbf_fx.t_dup for each row execute function sbf_fx.vul_b();
select pg_temp.maak_t('t_api', '');
create trigger vul before insert on sbf_fx.t_api for each row execute function sbf_fx.vul_b();
grant insert (a) on sbf_fx.t_api to api_user;
select pg_temp.maak_t('t_notneeded', $$default 'x'$$);

insert into pg_temp.i_registratie values
  ('sbf_fx.t_ok', 'app_authenticated', 'b', '{"a": 1}', 'trigger vul_b zet b bij insert'),
  ('sbf_fx.t_skip', 'app_authenticated', 'b', '{"a": 1}', 'trigger slaat de insert over'),
  ('sbf_fx.t_notassign', 'app_authenticated', 'b', '{"a": 1}', 'trigger vult alleen kolom c'),
  ('sbf_fx.t_disabled', 'app_authenticated', 'b', '{"a": 1}', 'trigger staat uit'),
  ('sbf_fx.t_event', 'app_authenticated', 'b', '{"a": 1}', 'trigger voor een ander event'),
  ('sbf_fx.t_reden', 'app_authenticated', 'b', '{"a": 1}', 'alleen een reden, geen trigger'),
  ('sbf_fx.t_dup', 'app_authenticated', 'b', '{"a": 1}', 'trigger vul_b zet b bij insert'),
  ('sbf_fx.t_dup', 'app_authenticated', 'b', '{"a": 1}', 'dubbele registratie'),
  ('sbf_fx.t_api', 'api_user', 'b', '{"a": 1}', 'api_user is vanaf app_migrator niet via SET bereikbaar'),
  ('sbf_fx.t_notneeded', 'app_authenticated', 'b', '{"a": 1}', 'bron bestaat al: registratie niet meer nodig');
do $$
declare t text;
begin
  foreach t in array array['t_ok', 't_skip', 't_notassign', 't_disabled', 't_event', 't_reden', 't_dup', 't_api', 't_notneeded'] loop
    perform pg_temp.i_voer_uit(format('sbf_fx.%I', t)::regclass);
  end loop;
end $$;

select is(
  pg_temp.herken(array(select x from pg_temp.i_overtredingen('sbf_fx.t_unreg'::regclass, array['app_authenticated']) x),
                 'I|sbf_fx.t_unreg|app_authenticated|b'),
  array['match'],
  'database-checks/AC-3: een BEFORE INSERT ROW-trigger zonder registratie maakt de ontbrekende bron niet groen'
);
select is(
  (select array_agg(rijen) from pg_temp.i_uitvoering where tabel = 'sbf_fx.t_ok'), array[1],
  'database-checks/AC-3: de geregistreerde helper-insert op t_ok voegt precies één rij in'
);
select is(
  (select array_agg(b) from sbf_fx.t_ok), array['uit trigger'],
  'database-checks/AC-3: de ingevoegde rij bevat de waarde die de trigger voor de NOT NULL-kolom zette'
);
select is(
  pg_temp.i_stand('sbf_fx.t_ok'::regclass), array['sbf_fx.t_ok|app_authenticated'],
  'database-checks/AC-3: geldige registratie + actieve trigger + uitgevoerde insert met één rij: I is groen (tabel wel ontdekt)'
);
-- AC-3: de pg_trigger-controle is onafhankelijk van het uitvoeringsbewijs (de uitvoering met rijen = 1 blijft bestaan).
alter table sbf_fx.t_ok disable trigger vul;
select ok(
  pg_temp.rood(array(select x from pg_temp.i_overtredingen('sbf_fx.t_ok'::regclass, array['app_authenticated']) x
                     where x like 'I|sbf_fx.t_ok|app_authenticated|b%'),
               'I|sbf_fx.t_ok|app_authenticated|b')
  and exists (select 1 from pg_temp.i_uitvoering where tabel = 'sbf_fx.t_ok' and rol = 'app_authenticated' and kolom = 'b' and rijen = 1),
  'database-checks/AC-3: een uitgeschakelde trigger maakt t_ok rood terwijl de geslaagde uitvoering (rijen = 1) nog bestaat'
);
alter table sbf_fx.t_ok enable trigger vul;
select is(
  pg_temp.i_stand('sbf_fx.t_ok'::regclass), array['sbf_fx.t_ok|app_authenticated'],
  'database-checks/AC-3: na het weer inschakelen van de trigger is t_ok opnieuw groen (bestaand bewijs ongewijzigd)'
);
select ok(
  pg_temp.rood(array(select x from pg_temp.i_overtredingen('sbf_fx.t_skip'::regclass, array['app_authenticated']) x),
               'I|sbf_fx.t_skip|app_authenticated|b'),
  'database-checks/AC-3: een trigger die de insert overslaat (nul rijen) is rood'
);
select ok(
  pg_temp.rood(array(select x from pg_temp.i_overtredingen('sbf_fx.t_notassign'::regclass, array['app_authenticated']) x),
               'I|sbf_fx.t_notassign|app_authenticated|b'),
  'database-checks/AC-3: een trigger zonder toekenning aan de verplichte kolom (vult alleen een ander veld) is rood'
);
select ok(
  pg_temp.rood(array(select x from pg_temp.i_overtredingen('sbf_fx.t_disabled'::regclass, array['app_authenticated']) x),
               'I|sbf_fx.t_disabled|app_authenticated|b'),
  'database-checks/AC-3: een uitgeschakelde trigger is rood'
);
select ok(
  pg_temp.rood(array(select x from pg_temp.i_overtredingen('sbf_fx.t_event'::regclass, array['app_authenticated']) x),
               'I|sbf_fx.t_event|app_authenticated|b'),
  'database-checks/AC-3: een trigger voor een ander event dan BEFORE INSERT is rood'
);
select ok(
  pg_temp.rood(array(select x from pg_temp.i_overtredingen('sbf_fx.t_reden'::regclass, array['app_authenticated']) x),
               'I|sbf_fx.t_reden|app_authenticated|b'),
  'database-checks/AC-3: alleen een reden registreren (geen trigger) kan de fout niet opheffen'
);
select ok(
  pg_temp.rood(array(select x from pg_temp.i_overtredingen('sbf_fx.t_dup'::regclass, array['app_authenticated']) x),
               'I|sbf_fx.t_dup|app_authenticated|b'),
  'database-checks/AC-3: een dubbele registratie (tabel, rol, kolom) is rood'
);
select ok(
  pg_temp.rood(array(select x from pg_temp.i_overtredingen('sbf_fx.t_api'::regclass, array['api_user']) x),
               'I|sbf_fx.t_api|api_user|b'),
  'database-checks/AC-3: een onbruikbare registratie (rol niet via SET bereikbaar, insert kan niet uitgevoerd) is rood'
);
select ok(
  pg_temp.rood(array(select x from pg_temp.i_overtredingen('sbf_fx.t_notneeded'::regclass, array['app_authenticated']) x),
               'I|sbf_fx.t_notneeded|app_authenticated|b'),
  'database-checks/AC-3: een registratie voor een kolom die al een bron heeft (niet meer nodig) is rood'
);

-- =====================================================================================================================
-- 7. AC-4: filevormige regressie (id door database, sleutel generated, status pending, bevoegde update naar ready)
-- =====================================================================================================================
select pg_temp.maak_bestand('bestand_goed', $$'files/' || id::text$$, $$default 'pending'$$, true);
select pg_temp.maak_bestand('bestand_geen_default', $$'files/' || id::text$$, '', true);
select pg_temp.maak_bestand('bestand_geen_update', $$'files/' || id::text$$, $$default 'pending'$$, false);
select pg_temp.maak_bestand('bestand_fout_sleutel', $$'files/' || naam$$, $$default 'pending'$$, true);
select pg_temp.maak_bestand('bestand_nulldef', $$'files/' || id::text$$, $$default nullif('x', 'x')$$, true);

select is(pg_temp.bestand_probe('bestand_goed'), '{}'::text[],
  'database-checks/AC-4: id en sleutel door de database, status pending, bevoegde update geeft één ready-rij (opgeslagen waarden gecontroleerd)');
select is(pg_temp.i_stand('sbf_fx.bestand_goed'::regclass), array['sbf_fx.bestand_goed|app_authenticated'],
  'database-checks/AC-4: I is groen voor de filevormige tabel (id default, storage_key generated, status default, naam granted)');
select is(pg_temp.bestand_probe('bestand_geen_default'), array['insert:23502'],
  'database-checks/AC-4: zonder statusdefault faalt de echte insert (23502)');
select is(
  pg_temp.herken(array(select x from pg_temp.i_overtredingen('sbf_fx.bestand_geen_default'::regclass, array['app_authenticated']) x),
                 'I|sbf_fx.bestand_geen_default|app_authenticated|status'),
  array['match'],
  'database-checks/AC-4: zonder statusdefault faalt ook I (status heeft geen insertgrant en geen default)');
select is(pg_temp.bestand_probe('bestand_geen_update'), array['update:42501'],
  'database-checks/AC-4: zonder updategrant op status faalt de statusupdate naar ready (42501)');
select is(pg_temp.bestand_probe('bestand_fout_sleutel'), array['sleutel'],
  'database-checks/AC-4: een verkeerde sleutelafleiding faalt op de werkelijk opgeslagen storage_key');
select is(pg_temp.bestand_probe('bestand_nulldef'), array['insert:23502'],
  'database-checks/AC-4: een default die NULL oplevert faalt de echte insert (23502)');
select is(
  (select foutcode from pg_temp.i_insert_probe('sbf_fx.bestand_nulldef'::regclass, 'app_authenticated', '{"naam": "x"}')), '23502',
  'database-checks/AC-4: de insert-probe meldt de NOT NULL-fout van de NULL-default (geen geldige uitvoering)');
select is(pg_temp.i_stand('sbf_fx.bestand_nulldef'::regclass), array['sbf_fx.bestand_nulldef|app_authenticated'],
  'database-checks/AC-4: de NULL-default is structureel een bron: I blijft groen, alleen de echte insert bewijst de mislukking');

-- =====================================================================================================================
-- 8. AC-5 en AC-6: D-structuur en toepasselijkheid van policies (rol app_definer; geërfd via app_migrator)
-- =====================================================================================================================
select pg_temp.maak_d('d_nosel', true, 'delete', array['for delete to app_definer using (true)']);
select pg_temp.maak_d('d_grantonly', true, 'select, delete', array['for delete to app_definer using (true)']);
select pg_temp.maak_d('d_restr', true, 'select, delete',
  array['for delete to app_definer using (true)', 'as restrictive for select to app_definer using (true)']);
select pg_temp.maak_d('d_sel_ok', true, 'select, delete',
  array['for delete to app_definer using (true)', 'for select to app_definer using (true)']);
select pg_temp.maak_d('d_all_ok', true, 'select, delete', array['for all to app_definer using (true) with check (true)']);
select pg_temp.maak_d('d_noforce', false, 'select, delete',
  array['for delete to app_definer using (true)', 'for select to app_definer using (true)']);
select pg_temp.maak_d('d_nodelgrant', true, 'select',
  array['for delete to app_definer using (true)', 'for select to app_definer using (true)']);
select pg_temp.maak_d('d_restrdel', true, 'select, delete',
  array['as restrictive for delete to app_definer using (true)', 'for select to app_definer using (true)']);
select pg_temp.maak_d('d_nietrol', true, 'select, delete',
  array['for delete to app_definer using (true)', 'for select to app_authenticated using (true)']);
select pg_temp.maak_d('d_public_sel', true, 'select, delete',
  array['for delete to app_definer using (true)', 'for select to public using (true)']);
select pg_temp.maak_d('d_erf_ok', true, 'select, delete',
  array['for delete to app_definer using (true)', 'for select to app_definer using (true)']);
select pg_temp.maak_d('d_erf_set', true, 'select, delete',
  array['for delete to app_definer using (true)', 'for select to app_authenticated using (true)']);
select pg_temp.maak_d('d_erf_public', true, 'select, delete',
  array['for delete to public using (true)', 'for select to public using (true)']);
select pg_temp.maak_d('d_erf_delset', true, 'select, delete',
  array['for delete to app_authenticated using (true)', 'for select to app_definer using (true)']);

select is(
  pg_temp.herken(array(select x from pg_temp.d_structuur('sbf_fx.d_nosel'::regclass) x), 'D|sbf_fx.d_nosel|app_definer|'),
  array['match'],
  'database-checks/AC-5: FORCE-RLS, DELETE-grant en permissieve DELETE-policy zonder SELECT/ALL-policy: D is rood met tabel en rol');
select is(
  pg_temp.herken(array(select x from pg_temp.d_structuur('sbf_fx.d_grantonly'::regclass) x), 'D|sbf_fx.d_grantonly|app_definer|'),
  array['match'],
  'database-checks/AC-5: een SELECT-grant alleen (zonder SELECT-policy) verandert de uitkomst niet');
select is(
  pg_temp.herken(array(select x from pg_temp.d_structuur('sbf_fx.d_restr'::regclass) x), 'D|sbf_fx.d_restr|app_definer|'),
  array['match'],
  'database-checks/AC-5: alleen een restrictieve SELECT-policy geeft geen toegang en voldoet niet');
select is(pg_temp.d_stand_s('sbf_fx.d_sel_ok'::regclass), array['sbf_fx.d_sel_ok|app_definer'],
  'database-checks/AC-5: een permissieve SELECT-policy naast de DELETE-policy passeert de structuurcheck (tabel ontdekt)');
select is(pg_temp.d_stand_s('sbf_fx.d_all_ok'::regclass), array['sbf_fx.d_all_ok|app_definer'],
  'database-checks/AC-5: een permissieve ALL-policy telt aan beide kanten en passeert');
select is(array(select x from pg_temp.d_kandidaten('sbf_fx.d_noforce'::regclass) x), '{}'::text[],
  'database-checks/AC-6: een tabel met RLS aan maar niet geforceerd is geen D-kandidaat');
select is(array(select x from pg_temp.d_kandidaten('sbf_fx.d_nodelgrant'::regclass) x), '{}'::text[],
  'database-checks/AC-6: zonder effectief DELETE-recht voor app_definer is een tabel geen D-kandidaat');
select is(array(select x from pg_temp.d_kandidaten('sbf_fx.d_restrdel'::regclass) x), '{}'::text[],
  'database-checks/AC-6: alleen een restrictieve DELETE-policy geeft geen D-kandidaat');
select is(
  pg_temp.herken(array(select x from pg_temp.d_structuur('sbf_fx.d_nietrol'::regclass) x), 'D|sbf_fx.d_nietrol|app_definer|'),
  array['match'],
  'database-checks/AC-6: een SELECT-policy alleen voor een niet-toepasselijke rol (app_authenticated) telt niet');
select is(pg_temp.d_stand_s('sbf_fx.d_public_sel'::regclass), array['sbf_fx.d_public_sel|app_definer'],
  'database-checks/AC-6: een SELECT-policy voor PUBLIC (polroles bevat 0) is toepasselijk');
select is(pg_temp.d_stand_s('sbf_fx.d_erf_ok'::regclass, 'app_migrator'), array['sbf_fx.d_erf_ok|app_migrator'],
  'database-checks/AC-6: policies voor app_definer gelden voor app_migrator, die app_definer werkelijk erft (USAGE)');
select is(
  pg_temp.herken(array(select x from pg_temp.d_structuur('sbf_fx.d_erf_set'::regclass, 'app_migrator') x),
                 'D|sbf_fx.d_erf_set|app_migrator|'),
  array['match'],
  'database-checks/AC-6: een SELECT-policy voor app_authenticated telt niet voor app_migrator (alleen SET, geen geërfd recht)');
select is(pg_temp.d_stand_s('sbf_fx.d_erf_public'::regclass, 'app_migrator'), array['sbf_fx.d_erf_public|app_migrator'],
  'database-checks/AC-6: DELETE- en SELECT-policies voor PUBLIC gelden ook voor een erfgenaam');
select is(array(select x from pg_temp.d_kandidaten('sbf_fx.d_erf_delset'::regclass, 'app_migrator') x), '{}'::text[],
  'database-checks/AC-6: een DELETE-policy alleen voor een SET-only rol maakt app_migrator geen D-kandidaat');

-- =====================================================================================================================
-- 9. D-gedragsproben: echte deletes als app_definer, observatie als eigenaar (AC-6, AC-7, AC-9)
-- =====================================================================================================================
-- Proefrijen voor de echte tabellen. app.audit_log: een verlopen en een nog te bewaren rij die beide de WHERE matchen
-- (id en at); app.rate_limits: een verlopen venster en een lopend venster, beide op key.
with oud as (
  insert into app.audit_log (at, action, request_id)
  values (now() - interval '2 years', 'sbf.oud', 'sbf-oud') returning id, at
), nieuw as (
  insert into app.audit_log (at, action, request_id)
  values (now() - interval '1 day', 'sbf.nieuw', 'sbf-nieuw') returning id, at
)
insert into pg_temp.d_probe_rij
  select 'app.audit_log', 'oud', jsonb_build_object('id', id, 'at', at), 'verwijderd', 'ouder dan de termijn van 1 jaar' from oud
  union all
  select 'app.audit_log', 'nieuw', jsonb_build_object('id', id, 'at', at), 'beschermd', 'binnen de termijn: policy audit_log_definer_delete' from nieuw;
insert into pg_temp.d_probe values ('app.audit_log', array['id', 'at']);

insert into app.rate_limits (key, window_start, hits) values
  ('sbf:oud', now() - interval '1 hour', 1), ('sbf:nieuw', now(), 1);
insert into pg_temp.d_probe values ('app.rate_limits', array['key']);
insert into pg_temp.d_probe_rij values
  ('app.rate_limits', 'oud', '{"key": "sbf:oud"}', 'verwijderd', 'venster ouder dan de termijn van 60 seconden'),
  ('app.rate_limits', 'nieuw', '{"key": "sbf:nieuw"}', 'beschermd', 'lopend venster: restrictieve policy rate_limits_definer_delete_expired');

-- app.one_time_use (ADR 0075): een verlopen en een geldige claim, beide op key.
insert into app.one_time_use (key, expires_at) values
  ('sbf:oud', now() - interval '1 hour'), ('sbf:nieuw', now() + interval '1 hour');
insert into pg_temp.d_probe values ('app.one_time_use', array['key']);
insert into pg_temp.d_probe_rij values
  ('app.one_time_use', 'oud', '{"key": "sbf:oud"}', 'verwijderd', 'claim verlopen (termijn 0 seconden na expires_at)'),
  ('app.one_time_use', 'nieuw', '{"key": "sbf:nieuw"}', 'beschermd', 'geldige claim: restrictieve policy one_time_use_definer_delete_expired');

-- Synthetische D-tabellen (rijen vóór RLS, als eigenaar). Domeinbeleid oud/nieuw: alleen v = 'oud' mag weg.
select pg_temp.maak_d('d_vis_false', false, 'select, delete',
  array[$$for delete to app_definer using (v = 'oud')$$, 'for select to app_definer using (false)']);
select pg_temp.maak_d('d_restr_false', false, 'select, delete',
  array[$$for delete to app_definer using (v = 'oud')$$, 'for select to app_definer using (true)',
        'as restrictive for select to app_definer using (false)']);
select pg_temp.maak_d('d_all_true', false, 'select, delete', array['for all to app_definer using (true) with check (true)']);
select pg_temp.maak_d('d_all_restr', false, 'select, delete',
  array['for all to app_definer using (true) with check (true)', 'as restrictive for select to app_definer using (false)']);
select pg_temp.maak_d('d_geen_pos', false, 'select, delete',
  array['for delete to app_definer using (false)', 'for select to app_definer using (true)']);
select pg_temp.maak_d('d_notrun', false, 'select, delete',
  array['for delete to app_definer using (true)', 'for select to app_definer using (true)']);
select pg_temp.maak_d('d_unreg', true, 'select, delete',
  array['for delete to app_definer using (true)', 'for select to app_definer using (true)']);
select pg_temp.maak_d('d_kolrecht', false, 'delete',
  array['for delete to app_definer using (true)', 'for select to app_definer using (true)']);
grant select (id) on sbf_fx.d_kolrecht to app_definer;

insert into sbf_fx.d_vis_false values (1, 'oud'), (2, 'nieuw');
insert into sbf_fx.d_restr_false values (1, 'oud'), (2, 'nieuw');
insert into sbf_fx.d_all_true values (1, 'een'), (2, 'twee');
insert into sbf_fx.d_all_restr values (1, 'een'), (2, 'twee');
insert into sbf_fx.d_geen_pos values (1, 'a'), (2, 'b');
insert into sbf_fx.d_notrun values (1, 'a'), (2, 'b');
insert into sbf_fx.d_kolrecht values (1, 'a'), (2, 'b');
alter table sbf_fx.d_vis_false force row level security;
alter table sbf_fx.d_restr_false force row level security;
alter table sbf_fx.d_all_true force row level security;
alter table sbf_fx.d_all_restr force row level security;
alter table sbf_fx.d_geen_pos force row level security;
alter table sbf_fx.d_notrun force row level security;
alter table sbf_fx.d_kolrecht force row level security;

insert into pg_temp.d_probe values
  ('sbf_fx.d_vis_false', array['id']), ('sbf_fx.d_restr_false', array['id']), ('sbf_fx.d_all_true', array['id']),
  ('sbf_fx.d_all_restr', array['id']), ('sbf_fx.d_geen_pos', array['id']), ('sbf_fx.d_notrun', array['id']),
  ('sbf_fx.d_kolrecht', array['id', 'v']);
insert into pg_temp.d_probe_rij values
  ('sbf_fx.d_vis_false', 'oud', '{"id": 1}', 'verwijderd', 'verlopen rij'),
  ('sbf_fx.d_vis_false', 'nieuw', '{"id": 2}', 'beschermd', 'beschermde grenscasus'),
  ('sbf_fx.d_restr_false', 'oud', '{"id": 1}', 'verwijderd', 'verlopen rij'),
  ('sbf_fx.d_restr_false', 'nieuw', '{"id": 2}', 'beschermd', 'beschermde grenscasus'),
  ('sbf_fx.d_all_true', 'een', '{"id": 1}', 'verwijderd', 'bewust volledige verwijdertoegang (wachtrijvorm)'),
  ('sbf_fx.d_all_true', 'twee', '{"id": 2}', 'verwijderd', 'bewust volledige verwijdertoegang (wachtrijvorm)'),
  ('sbf_fx.d_all_restr', 'een', '{"id": 1}', 'verwijderd', 'verwacht weg, maar restrictieve SELECT false blokkeert'),
  ('sbf_fx.d_all_restr', 'twee', '{"id": 2}', 'verwijderd', 'verwacht weg, maar restrictieve SELECT false blokkeert'),
  ('sbf_fx.d_geen_pos', 'a', '{"id": 1}', 'beschermd', 'geen enkele rij verwacht verwijderd'),
  ('sbf_fx.d_geen_pos', 'b', '{"id": 2}', 'beschermd', 'geen enkele rij verwacht verwijderd'),
  ('sbf_fx.d_notrun', 'a', '{"id": 1}', 'verwijderd', 'geregistreerd maar niet uitgevoerd'),
  ('sbf_fx.d_notrun', 'b', '{"id": 2}', 'beschermd', 'geregistreerd maar niet uitgevoerd'),
  ('sbf_fx.d_kolrecht', 'a', '{"id": 1, "v": "a"}', 'verwijderd', 'filterkolom v heeft geen SELECT-recht'),
  ('sbf_fx.d_kolrecht', 'b', '{"id": 2, "v": "b"}', 'beschermd', 'filterkolom v heeft geen SELECT-recht');

-- AC-6: FORCE vóór de delete.
select ok(pg_temp.force_alle(), 'database-checks/AC-6: FORCE RLS staat aan op alle geregistreerde D-tabellen vóór de delete');

-- Observatie VOOR: top-level savepoint als eigenaar app_migrator; snapshot via \gset; terugdraaien; daarna pas vastleggen.
reset role;
\unset snap_voor
savepoint obs_voor;
alter table app.audit_log no force row level security;
alter table app.rate_limits no force row level security;
alter table app.one_time_use no force row level security;
alter table sbf_fx.d_vis_false no force row level security;
alter table sbf_fx.d_restr_false no force row level security;
alter table sbf_fx.d_all_true no force row level security;
alter table sbf_fx.d_all_restr no force row level security;
alter table sbf_fx.d_geen_pos no force row level security;
alter table sbf_fx.d_notrun no force row level security;
alter table sbf_fx.d_kolrecht no force row level security;
select pg_temp.snap_alle() as snap_voor \gset
rollback to savepoint obs_voor;
release savepoint obs_voor;
insert into pg_temp.d_observatie select 'voor', key, value from jsonb_each(:'snap_voor'::jsonb);

select ok(pg_temp.force_alle(), 'database-checks/AC-6: FORCE RLS is na de observatie vóór de delete hersteld');
select is(
  (select jsonb_array_length(rijen) from pg_temp.d_observatie where moment = 'voor' and tabel = 'app.audit_log'), 2,
  'database-checks/AC-7: vóór de delete staan beide audit-proefrijen (verlopen en beschermd) in de tabel');
select is(
  (select jsonb_array_length(rijen) from pg_temp.d_observatie where moment = 'voor' and tabel = 'app.rate_limits'), 2,
  'database-checks/AC-7: vóór de delete staan beide rate-limit-proefrijen (verlopen en lopend) in de tabel');
select is(
  (select jsonb_array_length(rijen) from pg_temp.d_observatie where moment = 'voor' and tabel = 'app.one_time_use'), 2,
  'database-checks/AC-7: vóór de delete staan beide claim-proefrijen (verlopen en geldig) in de tabel');
-- AC-6/AC-7: onder FORCE ziet zelfs de eigenaar de rijen niet; dat maakt de NO FORCE-observatie onafhankelijk.
select is((select count(*)::integer from sbf_fx.d_vis_false), 0,
  'database-checks/AC-7: onder FORCE ziet de eigenaar app_migrator in d_vis_false geen rijen (SELECT using (false))');
select is((select count(*)::integer from sbf_fx.d_all_restr), 0,
  'database-checks/AC-7: onder FORCE ziet de eigenaar app_migrator in d_all_restr geen rijen (restrictieve SELECT false)');

-- De echte deletes als app_definer (de probe wisselt transactiegebonden van rol en herstelt die altijd).
do $$
declare t text;
begin
  foreach t in array array['app.audit_log', 'app.rate_limits', 'app.one_time_use', 'sbf_fx.d_vis_false', 'sbf_fx.d_restr_false',
                           'sbf_fx.d_all_true', 'sbf_fx.d_all_restr', 'sbf_fx.d_geen_pos'] loop
    perform pg_temp.d_voer_uit(t);
  end loop;
end $$;

-- Observatie NA: het savepoint begint pas na de deletes en de registratie van de uitvoering.
reset role;
\unset snap_na
savepoint obs_na;
alter table app.audit_log no force row level security;
alter table app.rate_limits no force row level security;
alter table app.one_time_use no force row level security;
alter table sbf_fx.d_vis_false no force row level security;
alter table sbf_fx.d_restr_false no force row level security;
alter table sbf_fx.d_all_true no force row level security;
alter table sbf_fx.d_all_restr no force row level security;
alter table sbf_fx.d_geen_pos no force row level security;
alter table sbf_fx.d_notrun no force row level security;
alter table sbf_fx.d_kolrecht no force row level security;
select pg_temp.snap_alle() as snap_na \gset
rollback to savepoint obs_na;
release savepoint obs_na;
insert into pg_temp.d_observatie select 'na', key, value from jsonb_each(:'snap_na'::jsonb);

select ok(pg_temp.force_alle(), 'database-checks/AC-6: FORCE RLS is na de observatie na de delete hersteld');
-- AC-7/AC-9: de NO FORCE-snapshots zagen de verborgen rijen wél en de mislukte delete liet ze ongewijzigd.
select is(pg_temp.d_uitkomst('sbf_fx.d_vis_false', 'oud'), 'ongewijzigd',
  'database-checks/AC-7: de verborgen rij oud in d_vis_false is in beide snapshots gezien en ongewijzigd gebleven');
select is(pg_temp.d_uitkomst('sbf_fx.d_vis_false', 'nieuw'), 'ongewijzigd',
  'database-checks/AC-7: de verborgen rij nieuw in d_vis_false is in beide snapshots gezien en ongewijzigd gebleven');
select is(pg_temp.d_uitkomst('sbf_fx.d_all_restr', 'een'), 'ongewijzigd',
  'database-checks/AC-9: de rij een in d_all_restr is in beide snapshots gezien en ongewijzigd gebleven');
select is(pg_temp.d_uitkomst('sbf_fx.d_all_restr', 'twee'), 'ongewijzigd',
  'database-checks/AC-9: de rij twee in d_all_restr is in beide snapshots gezien en ongewijzigd gebleven');

-- AC-6/AC-7: de echte tabellen, per tabel rowcount en per rij de uitkomst.
select is((select rijen from pg_temp.d_uitvoering where tabel = 'app.audit_log'), 1,
  'database-checks/AC-7: de ene echte DELETE als app_definer raakt in app.audit_log precies één rij');
select is(pg_temp.d_uitkomst('app.audit_log', 'oud'), 'verwijderd',
  'database-checks/AC-7: de verlopen audit-regel is als eigenaar waargenomen verwijderd (id en at in de WHERE)');
select is(pg_temp.d_uitkomst('app.audit_log', 'nieuw'), 'ongewijzigd',
  'database-checks/AC-7: de beschermde audit-regel staat ongewijzigd in de tabel; de policy sluit hem uit, niet de WHERE');
select is((select rijen from pg_temp.d_uitvoering where tabel = 'app.rate_limits'), 1,
  'database-checks/AC-7: de ene echte DELETE als app_definer raakt in app.rate_limits precies één rij');
select is(pg_temp.d_uitkomst('app.rate_limits', 'oud'), 'verwijderd',
  'database-checks/AC-7: het verlopen rate-limitvenster is als eigenaar waargenomen verwijderd');
select is(pg_temp.d_uitkomst('app.rate_limits', 'nieuw'), 'ongewijzigd',
  'database-checks/AC-7: het lopende venster staat ongewijzigd in de tabel (restrictieve policy, niet de WHERE)');
select is((select rijen from pg_temp.d_uitvoering where tabel = 'app.one_time_use'), 1,
  'database-checks/AC-7: de ene echte DELETE als app_definer raakt in app.one_time_use precies één rij');
select is(pg_temp.d_uitkomst('app.one_time_use', 'oud'), 'verwijderd',
  'database-checks/AC-7: de verlopen claim is als eigenaar waargenomen verwijderd');
select is(pg_temp.d_uitkomst('app.one_time_use', 'nieuw'), 'ongewijzigd',
  'database-checks/AC-7: de geldige claim staat ongewijzigd in de tabel (restrictieve policy, niet de WHERE)');

-- AC-6: SELECT-recht op de gelezen filterkolommen.
select is(
  (select bool_and(pg_temp.eff_recht('app.audit_log'::regclass, 'app_definer', 'SELECT', k)) from unnest(array['id', 'at']) k), true,
  'database-checks/AC-6: app_definer heeft effectief SELECT op de gelezen filterkolommen id en at van app.audit_log');
select is(pg_temp.eff_recht('app.rate_limits'::regclass, 'app_definer', 'SELECT', 'key'), true,
  'database-checks/AC-6: app_definer heeft effectief SELECT op de gelezen filterkolom key van app.rate_limits');
select is(pg_temp.eff_recht('app.one_time_use'::regclass, 'app_definer', 'SELECT', 'key'), true,
  'database-checks/AC-6: app_definer heeft effectief SELECT op de gelezen filterkolom key van app.one_time_use');
select is(
  array[pg_temp.eff_recht('sbf_fx.d_kolrecht'::regclass, 'app_definer', 'SELECT', 'id'),
        pg_temp.eff_recht('sbf_fx.d_kolrecht'::regclass, 'app_definer', 'SELECT', 'v')],
  array[true, false],
  'database-checks/AC-6: kolomgrant alleen op id: SELECT op de filterkolom v ontbreekt');
select ok(
  pg_temp.rood(array(select x from pg_temp.d_gedrag('sbf_fx.d_kolrecht'::regclass) x
                     where x like 'D|sbf_fx.d_kolrecht|app_definer|SELECT-recht op v%'),
               'D|sbf_fx.d_kolrecht|app_definer|SELECT-recht op v'),
  'database-checks/AC-6: een filterkolom zonder SELECT-grant is rood op het recht (D|tabel|rol|SELECT-recht op kolom)');

-- AC-7: SELECT using (false) of een restrictieve SELECT false verbergt de positieve rij: structuur groen, gedrag rood.
select is(pg_temp.d_stand_s('sbf_fx.d_vis_false'::regclass), array['sbf_fx.d_vis_false|app_definer'],
  'database-checks/AC-7: met een aanwezige SELECT using (false) is de structuurcheck terecht groen');
select is((select rijen from pg_temp.d_uitvoering where tabel = 'sbf_fx.d_vis_false'), 0,
  'database-checks/AC-7: de echte delete raakt bij SELECT using (false) nul rijen terwijl een verlopen rij verwacht was');
select ok(
  pg_temp.rood(array(select x from pg_temp.d_gedrag('sbf_fx.d_vis_false'::regclass) x
                     where x like 'D|sbf_fx.d_vis_false|app_definer|rowcount%'),
               'D|sbf_fx.d_vis_false|app_definer|rowcount'),
  'database-checks/AC-7: de gedragsprobe is rood op rowcount (nul verwijderd, één verwacht) bij een verbergende SELECT-policy');
select ok(
  pg_temp.rood(array(select x from pg_temp.d_gedrag('sbf_fx.d_vis_false'::regclass) x
                     where x like 'D|sbf_fx.d_vis_false|app_definer|rij oud:%'),
               'D|sbf_fx.d_vis_false|app_definer|rij oud: ongewijzigd verwacht verwijderd'),
  'database-checks/AC-7: de per-rij-diagnose meldt voor d_vis_false rij oud: ongewijzigd, verwacht verwijderd');
select is(pg_temp.d_stand_s('sbf_fx.d_restr_false'::regclass), array['sbf_fx.d_restr_false|app_definer'],
  'database-checks/AC-7: met een permissieve SELECT-policy en een restrictieve SELECT false blijft de structuurcheck groen');
select is((select rijen from pg_temp.d_uitvoering where tabel = 'sbf_fx.d_restr_false'), 0,
  'database-checks/AC-7: een restrictieve SELECT false blokkeert de delete: nul rijen');
select ok(
  pg_temp.rood(array(select x from pg_temp.d_gedrag('sbf_fx.d_restr_false'::regclass) x
                     where x like 'D|sbf_fx.d_restr_false|app_definer|rowcount%'),
               'D|sbf_fx.d_restr_false|app_definer|rowcount'),
  'database-checks/AC-7: de gedragsprobe is rood op rowcount bij een restrictieve SELECT-policy die de rij verbergt');
select ok(
  pg_temp.rood(array(select x from pg_temp.d_gedrag('sbf_fx.d_unreg'::regclass) x), 'D|sbf_fx.d_unreg|app_definer|niet geregistreerd'),
  'database-checks/AC-7: een D-tabel zonder geregistreerde probe is rood');
select ok(
  pg_temp.rood(array(select x from pg_temp.d_gedrag('sbf_fx.d_notrun'::regclass) x where x like '%|niet uitgevoerd%'),
               'D|sbf_fx.d_notrun|app_definer|niet uitgevoerd'),
  'database-checks/AC-7: een geregistreerde maar niet uitgevoerde probe is rood');
select ok(
  pg_temp.rood(array(select x from pg_temp.d_gedrag('sbf_fx.d_geen_pos'::regclass) x where x like '%|geen rij verwacht verwijderd%'),
               'D|sbf_fx.d_geen_pos|app_definer|geen rij verwacht verwijderd'),
  'database-checks/AC-7: een registratie zonder enige verwacht verwijderde rij is rood');

-- AC-9: bewust volledige verwijdertoegang (ALL using true) met een echte probe; een restrictieve SELECT false blokkeert.
select is(pg_temp.d_stand_s('sbf_fx.d_all_true'::regclass), array['sbf_fx.d_all_true|app_definer'],
  'database-checks/AC-9: een permissieve ALL-policy using (true) passeert de structuurcheck (tabel ontdekt)');
select is((select rijen from pg_temp.d_uitvoering where tabel = 'sbf_fx.d_all_true'), 2,
  'database-checks/AC-9: de ene echte DELETE raakt beide geregistreerde proefrijen (rowcount twee)');
select is(pg_temp.d_uitkomst('sbf_fx.d_all_true', 'een'), 'verwijderd',
  'database-checks/AC-9: de eerste proefrij is als eigenaar waargenomen verwijderd');
select is(pg_temp.d_uitkomst('sbf_fx.d_all_true', 'twee'), 'verwijderd',
  'database-checks/AC-9: de tweede proefrij is als eigenaar waargenomen verwijderd (geen beschermde rij geëist)');
select is(array(select x from pg_temp.d_gedrag('sbf_fx.d_all_true'::regclass) x), '{}'::text[],
  'database-checks/AC-9: de gedragsprobe voor de volledige-toegangstabel is groen');
select is(pg_temp.d_stand_s('sbf_fx.d_all_restr'::regclass), array['sbf_fx.d_all_restr|app_definer'],
  'database-checks/AC-9: ALL using (true) met een restrictieve SELECT false blijft structureel groen');
select is((select rijen from pg_temp.d_uitvoering where tabel = 'sbf_fx.d_all_restr'), 0,
  'database-checks/AC-9: de aanvullende restrictieve SELECT using (false) blokkeert de uitvoering: nul rijen');
select ok(
  pg_temp.rood(array(select x from pg_temp.d_gedrag('sbf_fx.d_all_restr'::regclass) x where x like '%|rowcount%'),
               'D|sbf_fx.d_all_restr|app_definer|rowcount'),
  'database-checks/AC-9: de gedragsprobe is rood op rowcount (nul verwijderd, twee verwacht)');
select ok(
  pg_temp.rood(array(select x from pg_temp.d_gedrag('sbf_fx.d_all_restr'::regclass) x
                     where x like 'D|sbf_fx.d_all_restr|app_definer|rij een:%'),
               'D|sbf_fx.d_all_restr|app_definer|rij een: ongewijzigd verwacht verwijderd'),
  'database-checks/AC-9: de per-rij-diagnose meldt voor d_all_restr rij een: ongewijzigd, verwacht verwijderd');

-- =====================================================================================================================
-- 10. AC-8: opruimen herstelt de beginsituatie; daarna opnieuw de echte gate
-- =====================================================================================================================
-- Opruimen zonder terugdraaien (geen TAP in een later teruggedraaid savepoint): de fixtures gaan expliciet weg.
drop schema sbf_fx cascade;
delete from pg_temp.i_registratie;
delete from pg_temp.i_uitvoering;
delete from pg_temp.d_observatie where tabel like 'sbf_fx.%';
delete from pg_temp.d_uitvoering where tabel like 'sbf_fx.%';
delete from pg_temp.d_probe_rij where tabel like 'sbf_fx.%';
delete from pg_temp.d_probe where tabel like 'sbf_fx.%';

select is(to_regnamespace('sbf_fx')::text, null,
  'database-checks/AC-8: het fixture-schema met alle foute en goede fixtures is opgeruimd');
select is(pg_temp.catalogus_stempel(), :'stempel_voor',
  'database-checks/AC-8: relaties, rechten, policies, FORCE, triggers en lidmaatschappen in public/app zijn gelijk aan de beginsituatie');
select is(
  array(select x from pg_temp.i_kandidaten() x
        where x in ('app.audit_log|app_definer', 'app.rate_limits|app_definer', 'public.user_roles|app_definer') order by x),
  array['app.audit_log|app_definer', 'app.rate_limits|app_definer', 'public.user_roles|app_definer'],
  'database-checks/AC-8: na opruimen ontdekt de echte I-gate dezelfde tabellen');
select is(array(select x from pg_temp.i_overtredingen() x order by x), '{}'::text[],
  'database-checks/AC-8: na opruimen is de echte I-gate groen en zonder resterende registraties');
select is(array(select x from pg_temp.d_structuur() x order by x), '{}'::text[],
  'database-checks/AC-8: na opruimen is de echte D-structuurgate groen');
select is(
  array(select x from pg_temp.d_kandidaten() x order by x),
  array(select tabel || '|app_definer' from pg_temp.d_probe order by tabel),
  'database-checks/AC-7: iedere ontdekte D-tabel (audit_log, one_time_use en rate_limits) heeft een geregistreerde probe');
select is(
  array(select tabel from pg_temp.d_uitvoering where rijen >= 1 order by tabel),
  array['app.audit_log', 'app.one_time_use', 'app.rate_limits'],
  'database-checks/AC-7: iedere ontdekte D-tabel is werkelijk uitgevoerd met een positieve rowcount');
select is(array(select x from pg_temp.d_gedrag() x order by x), '{}'::text[],
  'database-checks/AC-8: na opruimen is de echte D-gedragsgate groen (registratie, rechten, rowcount en per-rij-uitkomst)');

select * from finish();
rollback;
