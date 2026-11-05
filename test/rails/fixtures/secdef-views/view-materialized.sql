create materialized view app.v as
  select r.role from public.user_roles r;
