create view app.v with (security_barrier) as
  select r.role from public.user_roles r;
alter view app.v owner to app_definer;
