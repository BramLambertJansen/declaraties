-- Een definer-view zoals app.accounts, en een invoker-view die niets hoeft.
create view app.mijn_rollen with (security_barrier) as
  select r.user_id, r.role
  from public.user_roles r
  where r.user_id = (select app.current_user_id());
alter view app.mijn_rollen owner to app_definer;

create view app.rollen_invoker with (security_invoker = true) as
  select role from user_roles;

-- Een optie met een waarde die Postgres als waar leest, ook tussen quotes.
create view app.met_quotes with (security_barrier = 'on') as
  select r.role from public.user_roles r where (select app.is_mfa_admin());
alter view app.met_quotes owner to app_definer;

