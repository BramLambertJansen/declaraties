-- migrate:up
-- app.assign_role: de uitzondering voor scripts (seed, admin:create) geldt alleen zonder actor. Eerder mocht app_migrator
-- ook binnen een sessie met actor (na SET ROLE app_authenticated) elke rol toekennen; pgTAP ving dat (user_roles.sql).
create or replace function app.assign_role(p_user_id text, p_role text) returns void
  language plpgsql volatile security definer set search_path = ''
  as $$
  begin
    if not app.is_mfa_admin()
       and not (session_user = 'app_migrator' and app.current_user_id() is null) then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    insert into public.user_roles (user_id, role) values (p_user_id, p_role)
      on conflict (user_id) do update set role = excluded.role;
  end
  $$;

-- migrate:down
-- Append-only: geen down-migraties (docs/framework.md §10).
