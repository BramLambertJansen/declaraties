-- migrate:up
-- Register en schakelaar per koppeling (spec koppelingsregister; ADR 0077 punt 5, 7 en 10): één rij per koppeling met haar
-- stand. Geen rij = uit (OV-2). Lezen alleen via app.integration_enabled (elke actor, in de eerste withUser), zetten alleen
-- via app.set_integration_enabled (admin met MFA, of app_migrator zonder actor: het script, OV-7). Beide security definer
-- van app_definer; app_authenticated, api_user en auth_service hebben geen recht op de tabel. Geen persoonsgegevens.

-- Naamgrens 63 is INTEGRATION_NAME_MAX_LENGTH (src/core/shared/limits.ts); een test houdt ze gelijk.
create table app.integration_switches (
  name text primary key check (name ~ '^[a-z][a-z0-9-]*$' and pg_catalog.length(name) <= 63),
  enabled boolean not null,
  updated_at timestamptz not null default now()
);
alter table app.integration_switches enable row level security;
alter table app.integration_switches force row level security;

grant select, insert, update on app.integration_switches to app_definer;

-- Alleen voor de security definer-functies hieronder (framework §6: FORCE RLS geldt ook voor app_definer). Geen delete.
create policy integration_switches_definer_select on app.integration_switches
  for select to app_definer using (true);
create policy integration_switches_definer_insert on app.integration_switches
  for insert to app_definer with check (true);
create policy integration_switches_definer_update on app.integration_switches
  for update to app_definer using (true) with check (true);

-- De stand van p_name voor de actor van de sessie; geen rij = false (fail-closed, OV-2). Eerst de actor (42501), dan de naam
-- (22023).
create function app.integration_enabled(p_name text) returns boolean
  language plpgsql stable security definer set search_path = ''
  as $$
  declare
    v_enabled boolean;
  begin
    if app.current_user_id() is null then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if p_name is null or pg_catalog.length(p_name) > 63 or p_name !~ '^[a-z][a-z0-9-]*$' then
      raise exception 'ongeldige koppelingsnaam' using errcode = '22023';
    end if;
    select s.enabled into v_enabled from app.integration_switches s where s.name = p_name;
    return coalesce(v_enabled, false);
  end
  $$;

alter function app.integration_enabled(text) owner to app_definer;
revoke all on function app.integration_enabled(text) from public;
grant execute on function app.integration_enabled(text) to app_authenticated;

-- Zet p_name aan of uit (vorm van app.assign_role en app.set_account_blocked). De advisory lock per naam laat gelijktijdige
-- aanroepen na elkaar lopen (AC-9); alleen een echte wijziging schrijft een rij en, in dezelfde transactie, een auditregel
-- core.integration.enable of core.integration.disable (OV-4). Uit zonder rij is geen wijziging.
create function app.set_integration_enabled(p_name text, p_enabled boolean) returns void
  language plpgsql volatile security definer set search_path = ''
  as $$
  declare
    v_current boolean;
  begin
    if not app.is_mfa_admin()
       and not (session_user = 'app_migrator' and app.current_user_id() is null) then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if p_name is null or pg_catalog.length(p_name) > 63 or p_name !~ '^[a-z][a-z0-9-]*$' then
      raise exception 'ongeldige koppelingsnaam' using errcode = '22023';
    end if;
    if p_enabled is null then
      raise exception 'ongeldige stand' using errcode = '22023';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('app.integration_switches:' || p_name));
    select s.enabled into v_current from app.integration_switches s where s.name = p_name;
    if coalesce(v_current, false) = p_enabled then
      return;
    end if;
    insert into app.integration_switches (name, enabled, updated_at)
      values (p_name, p_enabled, pg_catalog.now())
      on conflict (name) do update
        set enabled = excluded.enabled, updated_at = excluded.updated_at;
    insert into app.audit_log (actor_id, action, target_type, target_id, request_id, details)
      values (
        app.current_user_id(),
        case when p_enabled then 'core.integration.enable' else 'core.integration.disable' end,
        'integration', p_name, app.request_id(), '{}'::jsonb
      );
  end
  $$;

alter function app.set_integration_enabled(text, boolean) owner to app_definer;
revoke all on function app.set_integration_enabled(text, boolean) from public;
grant execute on function app.set_integration_enabled(text, boolean) to app_authenticated, app_migrator;

-- Bewaarcatalogus (R-DB-17): FORCE tijdelijk uit, alleen deze rij erin, FORCE weer aan.
alter table app.retention no force row level security;
insert into app.retention values
  ('app.integration_switches', null, null, 'app', 'configuratie per koppeling, geen persoonsgegevens');
alter table app.retention force row level security;

-- migrate:down
-- Append-only: geen down-migraties (docs/framework.md §10).
