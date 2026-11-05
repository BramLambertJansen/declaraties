create view app.v with (security_barrier) as
  select r.role from public.user_roles r
  union all
  select r.role from public.user_roles r where (select app.is_mfa_admin());
alter view app.v owner to app_definer;
