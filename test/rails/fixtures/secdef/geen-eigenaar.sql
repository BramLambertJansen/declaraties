-- migrate:up
create function app.is_owner() returns boolean
  language sql stable security definer set search_path = ''
  as $$ select true $$;
