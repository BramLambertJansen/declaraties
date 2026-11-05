create view app.v with (security_invoker = true) as
  select role from public.user_roles;
alter view app.v set (security_invoker = false);
alter view app.v reset (security_invoker);
