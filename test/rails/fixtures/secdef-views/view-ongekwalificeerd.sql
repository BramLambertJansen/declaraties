create view v with (security_barrier) as
  select r.role from user_roles r where (select app.is_mfa_admin());
alter view v owner to app_definer;
