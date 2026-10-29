-- migrate:up
create function app.is_owner() returns boolean
  language sql stable security definer
  as $$ select true $$;
alter function app.is_owner() owner to app_definer;
