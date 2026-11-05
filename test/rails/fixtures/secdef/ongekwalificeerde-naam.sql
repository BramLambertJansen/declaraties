-- migrate:up
create function is_owner() returns boolean
  language sql stable security definer set search_path = ''
  as $$ select true $$;
alter function is_owner() owner to app_definer;
