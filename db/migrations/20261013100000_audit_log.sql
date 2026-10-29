-- migrate:up
-- Audit log van admin-acties (spec audit-log, deel A database-kant en deel B; ADR 0021, ADR 0026 besluit 3 punt 6):
-- app.request_id(), app.audit_log (append-only, drie policies, guard-triggers), app.audit, app.audit_account_action en de
-- auditregel in app.assign_role en app.set_account_blocked. Draait als app_migrator.
-- Bewust (spec OV-B1): in deze migratie kan niemand een regel verwijderen: geen delete-grant en geen delete-policy.

-- De requestId van de server, gezet door withUser() met set_config(…, true). Alleen gelezen door de schrijvende
-- security definer-functies hieronder (klasse intern, OV-A1). Een lege waarde is null (script zonder request).
create function app.request_id() returns text
  language sql stable
  return nullif(pg_catalog.current_setting('app.request_id', true), '');

revoke all on function app.request_id() from public;
grant execute on function app.request_id() to app_definer;

create table app.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default pg_catalog.now(),
  -- null = script of taak; bewust geen foreign key (ADR 0022 punt 4).
  actor_id text,
  db_role text not null default session_user,
  action text not null check (action ~ '^[a-z]+(\.[a-z_]+)+$'),
  target_type text check (target_type ~ '^[a-z_]+$'),
  target_id text check (target_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  request_id text,
  -- Grenzen gelijk aan MAX_AUDIT_DETAILS_BYTES in src/core/shared/limits.ts (OV-B5: bytes van de tekstvorm).
  details jsonb not null default '{}'::jsonb
    check (pg_catalog.jsonb_typeof(details) = 'object' and pg_catalog.octet_length(details::text) <= 2048)
);
alter table app.audit_log enable row level security;
alter table app.audit_log force row level security;

create index audit_log_target_idx on app.audit_log (target_type, target_id, at);
create index audit_log_actor_idx on app.audit_log (actor_id, at);

-- Alleen deze grants (ADR 0021 punt 6). Kolomgrant (OV-B2): id, at en db_role krijgen altijd hun standaard.
grant select on app.audit_log to app_definer, app_authenticated;
grant insert (actor_id, action, target_type, target_id, request_id, details) on app.audit_log to app_definer;

create policy audit_log_definer_insert on app.audit_log
  for insert to app_definer with check (true);
create policy audit_log_select_admin on app.audit_log
  for select to app_authenticated using ((select app.is_mfa_admin()));
create policy audit_log_definer_select on app.audit_log
  for select to app_definer using (true);

-- Guard (ADR 0021 punt 6): statement-niveau, zodat ook een update of delete die door RLS 0 rijen raakt zichtbaar faalt.
create function app.audit_log_guard() returns trigger
  language plpgsql volatile set search_path = ''
  as $$
  begin
    raise exception 'audit log is append-only' using errcode = '42501';
  end
  $$;

alter function app.audit_log_guard() owner to app_definer;
revoke all on function app.audit_log_guard() from public;

create trigger audit_log_no_update before update on app.audit_log
  for each statement execute function app.audit_log_guard();
create trigger audit_log_no_delete before delete on app.audit_log
  for each statement execute function app.audit_log_guard();
create trigger audit_log_no_truncate before truncate on app.audit_log
  for each statement execute function app.audit_log_guard();

-- Registratie van een app-actie door de actor van de sessie. core.* en target_type account zijn voorbehouden aan de
-- functies van core. Patroon en omvang bewaken de CHECKs (23514).
create function app.audit(p_action text, p_target_type text, p_target_id text, p_details jsonb) returns void
  language plpgsql volatile security definer set search_path = ''
  as $$
  begin
    if app.current_user_id() is null then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if p_action like 'core.%' or p_target_type = 'account' then
      raise exception 'voorbehouden actie of doeltype' using errcode = '22023';
    end if;
    insert into app.audit_log (actor_id, action, target_type, target_id, request_id, details)
      values (app.current_user_id(), p_action, p_target_type, p_target_id, app.request_id(), p_details);
  end
  $$;

alter function app.audit(text, text, text, jsonb) owner to app_definer;
revoke all on function app.audit(text, text, text, jsonb) from public;
grant execute on function app.audit(text, text, text, jsonb) to app_authenticated;

-- De accountacties die routes van core vastleggen (invite, reinvite; revoke en reset_link voor de routes die nog komen).
create function app.audit_account_action(p_action text, p_target_id text) returns void
  language plpgsql volatile security definer set search_path = ''
  as $$
  begin
    if not app.is_mfa_admin() then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if p_action is null or p_action not in (
      'core.account.invite', 'core.account.reinvite', 'core.account.revoke', 'core.account.reset_link'
    ) then
      raise exception 'onbekende accountactie' using errcode = '22023';
    end if;
    insert into app.audit_log (actor_id, action, target_type, target_id, request_id, details)
      values (app.current_user_id(), p_action, 'account', p_target_id, app.request_id(), '{}'::jsonb);
  end
  $$;

alter function app.audit_account_action(text, text) owner to app_definer;
revoke all on function app.audit_account_action(text, text) from public;
grant execute on function app.audit_account_action(text, text) to app_authenticated;

-- app.assign_role: zoals in 20261009195546_assign_role_actor.sql, plus een regel core.role.assign bij een echte wijziging
-- (OV-B3): details {"role", "previous"}; previous weggelaten bij een nieuw account. Zelfde signatuur, eigenaar en grants.
create or replace function app.assign_role(p_user_id text, p_role text) returns void
  language plpgsql volatile security definer set search_path = ''
  as $$
  declare
    v_previous text;
  begin
    if not app.is_mfa_admin()
       and not (session_user = 'app_migrator' and app.current_user_id() is null) then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    select r.role into v_previous from public.user_roles r where r.user_id = p_user_id for update;
    insert into public.user_roles (user_id, role) values (p_user_id, p_role)
      on conflict (user_id) do update set role = excluded.role;
    if v_previous is distinct from p_role then
      insert into app.audit_log (actor_id, action, target_type, target_id, request_id, details)
        values (
          app.current_user_id(), 'core.role.assign', 'account', p_user_id, app.request_id(),
          case when v_previous is null
            then pg_catalog.jsonb_build_object('role', p_role)
            else pg_catalog.jsonb_build_object('role', p_role, 'previous', v_previous)
          end
        );
    end if;
  end
  $$;

-- app.set_account_blocked: zoals in 20261012200000_account_blocking.sql, plus een regel core.account.block resp.
-- core.account.unblock, alleen bij een echte wijziging en bij blokkeren na de LAST_ADMIN-controle.
create or replace function app.set_account_blocked(p_user_id text, p_blocked boolean) returns void
  language plpgsql volatile security definer set search_path = ''
  as $$
  declare
    v_blocked_at timestamptz;
  begin
    if not app.is_mfa_admin() then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    select u.blocked_at into v_blocked_at from better_auth."user" u where u.id = p_user_id;
    if not found then
      raise exception 'NOT_FOUND';
    end if;
    if not p_blocked then
      if v_blocked_at is not null then
        update better_auth."user" set blocked_at = null where id = p_user_id;
        insert into app.audit_log (actor_id, action, target_type, target_id, request_id, details)
          values (app.current_user_id(), 'core.account.unblock', 'account', p_user_id, app.request_id(), '{}'::jsonb);
      end if;
      return;
    end if;
    if p_user_id = app.current_user_id() then
      raise exception 'OWN_ACCOUNT';
    end if;
    if not exists (
      select 1 from better_auth.account a where a."userId" = p_user_id and a."providerId" = 'credential'
    ) then
      raise exception 'ACCOUNT_INVITED';
    end if;
    if v_blocked_at is not null then
      return;
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.user_roles:last_admin'));
    update better_auth."user" set blocked_at = pg_catalog.now() where id = p_user_id and blocked_at is null;
    if not exists (
      select 1
      from public.user_roles r
      join better_auth."user" u on u.id = r.user_id
      where r.role = 'admin'
        and u.blocked_at is null
        and exists (
          select 1 from better_auth.account a where a."userId" = u.id and a."providerId" = 'credential'
        )
    ) then
      raise exception 'LAST_ADMIN' using detail = 'De laatste admin kan niet weg.';
    end if;
    insert into app.audit_log (actor_id, action, target_type, target_id, request_id, details)
      values (app.current_user_id(), 'core.account.block', 'account', p_user_id, app.request_id(), '{}'::jsonb);
  end
  $$;

-- migrate:down
-- Append-only: geen down-migraties (docs/framework.md §10).
