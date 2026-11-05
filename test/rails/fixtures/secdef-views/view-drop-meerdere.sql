create view app.a with (security_barrier) as
  select r.role from public.user_roles r where (select app.is_mfa_admin());
alter view app.a owner to app_definer;
create view app.w with (security_barrier) as
  select r.role from public.user_roles r where (select app.is_mfa_admin());
alter view app.w owner to app_definer;
drop view app.a, app.w;
create or replace view app.w with (security_barrier) as
  select r.role from public.user_roles r where (select app.is_mfa_admin());
