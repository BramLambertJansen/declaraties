-- migrate:up
-- Goed: search_path leeg, alles met schema, eigenaar app_definer. Commentaar met security definer en now() telt niet.
create function app.is_owner(p_id text) returns boolean
  language plpgsql stable security definer set search_path = ''
  as $body$
  declare
    v_count integer;
  begin
    -- tabel en functies met schema; exists, coalesce en de eigen with-naam zijn syntax
    with eigen as (select t.id from public.things t where t.owner_id = app.current_user_id())
    select pg_catalog.count(*) into v_count from eigen e join app.extra x on x.id = e.id;
    insert into public.audit (id, at) values (p_id, pg_catalog.now())
      on conflict (id) do update set at = excluded.at;
    raise notice 'select * from geheim() %', v_count;
    execute $q$select pg_catalog.now()$q$;
    return coalesce(v_count, 0) > 0 and exists (select 1 from public.things for update);
  end
  $body$;

-- SQL-standaard-body.
create function app.thing_count() returns bigint
  language sql stable security definer set search_path to ''
  return (select pg_catalog.count(*) from public.things);

-- Geen security definer: valt buiten deze check.
create function app.plain() returns timestamptz language sql stable return now();

alter function app.is_owner(text) owner to app_definer;
alter function app.thing_count() owner to app_definer;

-- Een overload van een functie zonder security definer mag wel.
create function app.plain(p_dag integer) returns timestamptz language sql stable return now();
