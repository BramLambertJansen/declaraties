-- Postgres leest 'false', f en "0" als onwaar: dit zijn definer-views zonder barrier.
create view app.a with (security_invoker = 'false') as
  select r.role from public.user_roles r where (select app.is_mfa_admin());
alter view app.a owner to app_definer;
create view app.b with (security_invoker = f, security_barrier = 'f') as
  select r.role from public.user_roles r where (select app.is_mfa_admin());
alter view app.b owner to app_definer;
