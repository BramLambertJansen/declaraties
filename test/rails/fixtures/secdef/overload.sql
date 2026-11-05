-- migrate:up
create function app.is_owner(p_id text) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select true $$;
-- Zelfde gekwalificeerde naam, andere argumenten: een overload.
create function app.is_owner(p_id integer, p_strict boolean default true) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select true $$;
alter function app.is_owner(text) owner to app_definer;
alter function app.is_owner(integer, boolean) owner to app_definer;
