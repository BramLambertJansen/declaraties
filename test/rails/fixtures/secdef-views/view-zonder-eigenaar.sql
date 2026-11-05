create view app.v with (security_barrier) as
  select r.role from public.user_roles r where (select app.is_mfa_admin());
