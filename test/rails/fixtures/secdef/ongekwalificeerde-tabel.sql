-- migrate:up
create function app.is_admin() returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select exists (select 1 from user_roles r join public.x on true where r.role = 'admin')
  $$;
create function app.set_role(p_role text) returns void
  language plpgsql volatile security definer set search_path = ''
  as $$
  begin
    insert into user_roles (role) values (p_role);
    update "Roles" set role = p_role;
  end
  $$;
alter function app.is_admin() owner to app_definer;
alter function app.set_role(text) owner to app_definer;
