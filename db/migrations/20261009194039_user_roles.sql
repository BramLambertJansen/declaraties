-- migrate:up
-- Rollen per gebruiker (spec accountbeheer; framework §6): één rol per account, per request uit de database gelezen.
-- Schrijven alleen via app.assign_role (security definer van app_definer); de laatste admin kan niet weg.

create table public.user_roles (
  user_id text primary key references better_auth."user" (id) on delete cascade,
  role text not null check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);
alter table public.user_roles enable row level security;
alter table public.user_roles force row level security;

grant select on public.user_roles to app_authenticated;
grant usage on schema public to app_definer;
grant select, insert, update on public.user_roles to app_definer;

-- Een admin-sessie telt alleen met MFA (framework §6: core leidt de MFA-eis af uit de rol).
create function app.is_mfa_admin() returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select app.session_strength() = 'mfa'
       and exists (select 1 from public.user_roles r where r.user_id = app.current_user_id() and r.role = 'admin')
  $$;

-- Rol toekennen of wijzigen: een admin met MFA (via withUser), of een script als app_migrator (seed, admin:create).
create function app.assign_role(p_user_id text, p_role text) returns void
  language plpgsql volatile security definer set search_path = ''
  as $$
  begin
    if session_user <> 'app_migrator' and not app.is_mfa_admin() then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    insert into public.user_roles (user_id, role) values (p_user_id, p_role)
      on conflict (user_id) do update set role = excluded.role;
  end
  $$;

-- De laatste admin kan niet gedegradeerd of verwijderd worden (ook niet via de cascade vanuit better_auth."user").
-- De advisory lock serialiseert gelijktijdige wijzigingen: van twee die elk één van de laatste twee admins weghalen,
-- slaagt er precies één.
create function app.user_roles_keep_one_admin() returns trigger
  language plpgsql volatile security definer set search_path = ''
  as $$
  begin
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.user_roles:last_admin'));
    if old.role = 'admin' and not exists (select 1 from public.user_roles r where r.role = 'admin') then
      raise exception 'LAST_ADMIN' using errcode = 'P0001', detail = 'De laatste admin kan niet weg.';
    end if;
    return null;
  end
  $$;

create trigger user_roles_keep_one_admin
  after update or delete on public.user_roles
  for each row execute function app.user_roles_keep_one_admin();

alter function app.is_mfa_admin() owner to app_definer;
alter function app.assign_role(text, text) owner to app_definer;
alter function app.user_roles_keep_one_admin() owner to app_definer;
grant execute on function app.current_user_id() to app_definer;
grant execute on function app.session_strength() to app_definer;
grant execute on function app.is_mfa_admin() to app_authenticated;
grant execute on function app.assign_role(text, text) to app_authenticated, app_migrator;

create policy user_roles_select_own on public.user_roles
  for select to app_authenticated using (user_id = (select app.current_user_id()));
create policy user_roles_select_admin on public.user_roles
  for select to app_authenticated using ((select app.is_mfa_admin()));
-- Alleen voor de security definer-functies hierboven (framework §6: FORCE RLS geldt ook voor app_definer).
create policy user_roles_definer_all on public.user_roles
  for all to app_definer using (true) with check (true);

-- migrate:down
-- Append-only: geen down-migraties (docs/framework.md §10).
