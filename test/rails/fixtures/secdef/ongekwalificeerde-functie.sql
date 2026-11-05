-- migrate:up
create function app.is_admin() returns boolean
  language sql stable security definer set search_path = ''
  as $$ select current_user_id() is not null and now() > pg_catalog.now() $$;
-- Een body tussen gewone quotes wordt ook gelezen.
create function app.oud() returns timestamptz
  language sql stable security definer set search_path = ''
  as 'select now()';
alter function app.is_admin() owner to app_definer;
alter function app.oud() owner to app_definer;
