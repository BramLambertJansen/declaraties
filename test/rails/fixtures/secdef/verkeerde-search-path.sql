-- migrate:up
create function app.a() returns boolean
  language sql stable security definer set search_path = public
  as $$ select true $$;
create function app.b() returns boolean
  language sql stable security definer set search_path to pg_catalog, public
  as $$ select true $$;
create function app.c() returns boolean
  language sql stable security definer set search_path from current
  as $$ select true $$;
-- Een search_path in de body telt niet: de functie zelf heeft er geen.
create function app.d() returns void
  language plpgsql security definer
  as $$ begin set local search_path = ''; end $$;
alter function app.a() owner to app_definer;
alter function app.b() owner to app_definer;
alter function app.c() owner to app_definer;
alter function app.d() owner to app_definer;
