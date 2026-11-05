-- migrate:up

alter table better_auth."user"
  add column last_login_at timestamptz,
  add column deactivated_at timestamptz,
  add column session_version integer not null default 0;

alter table better_auth.session
  add column session_version integer not null default 0;

grant select (last_login_at, deactivated_at, session_version), update (deactivated_at, session_version)
  on better_auth."user" to app_definer;

create or replace function app.user_roles_keep_one_admin() returns trigger
  language plpgsql volatile security definer set search_path = ''
  as $$
  begin
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.user_roles:last_admin'));
    if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin') and not exists (
      select 1
      from public.user_roles r
      join better_auth."user" u on u.id = r.user_id
      where r.role = 'admin'
        and u.blocked_at is null
        and u.deactivated_at is null
        and exists (
          select 1 from better_auth.account a where a."userId" = u.id and a."providerId" = 'credential'
        )
    ) then
      raise exception 'LAST_ADMIN' using errcode = 'P0001', detail = 'De laatste admin kan niet weg.';
    end if;
    return null;
  end
  $$;

create or replace function app.set_account_blocked(p_user_id text, p_blocked boolean) returns void
  language plpgsql volatile security definer set search_path = ''
  as $$
  declare
    v_blocked_at timestamptz;
  begin
    if not app.is_mfa_admin() then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.user_roles:last_admin'));
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
    update better_auth."user"
      set blocked_at = pg_catalog.now(), session_version = session_version + 1
      where id = p_user_id;
    if not exists (
      select 1
      from public.user_roles r
      join better_auth."user" u on u.id = r.user_id
      where r.role = 'admin'
        and u.blocked_at is null
        and u.deactivated_at is null
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

create function app.set_account_deactivated(p_user_id text, p_deactivated boolean) returns void
  language plpgsql volatile security definer set search_path = ''
  as $$
  declare
    v_deactivated_at timestamptz;
  begin
    if not app.is_mfa_admin() then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.user_roles:last_admin'));
    select u.deactivated_at into v_deactivated_at from better_auth."user" u where u.id = p_user_id;
    if not found then
      raise exception 'NOT_FOUND';
    end if;
    if not exists (
      select 1 from better_auth.account a where a."userId" = p_user_id and a."providerId" = 'credential'
    ) then
      raise exception 'ACCOUNT_INVITED';
    end if;
    if not p_deactivated then
      if v_deactivated_at is not null then
        update better_auth."user" set deactivated_at = null where id = p_user_id;
        insert into app.audit_log (actor_id, action, target_type, target_id, request_id, details)
          values (app.current_user_id(), 'core.account.activate', 'account', p_user_id, app.request_id(), '{}'::jsonb);
      end if;
      return;
    end if;
    if p_user_id = app.current_user_id() then
      raise exception 'OWN_ACCOUNT';
    end if;
    if v_deactivated_at is not null then
      return;
    end if;
    update better_auth."user"
      set deactivated_at = pg_catalog.now(), session_version = session_version + 1
      where id = p_user_id;
    if not exists (
      select 1
      from public.user_roles r
      join better_auth."user" u on u.id = r.user_id
      where r.role = 'admin'
        and u.blocked_at is null
        and u.deactivated_at is null
        and exists (
          select 1 from better_auth.account a where a."userId" = u.id and a."providerId" = 'credential'
        )
    ) then
      raise exception 'LAST_ADMIN' using detail = 'De laatste admin kan niet weg.';
    end if;
    insert into app.audit_log (actor_id, action, target_type, target_id, request_id, details)
      values (app.current_user_id(), 'core.account.deactivate', 'account', p_user_id, app.request_id(), '{}'::jsonb);
  end
  $$;

alter function app.set_account_deactivated(text, boolean) owner to app_definer;
revoke all on function app.set_account_deactivated(text, boolean) from public;
grant execute on function app.set_account_deactivated(text, boolean) to app_authenticated;

create or replace view app.accounts with (security_barrier) as
  select u.id,
         u.name,
         u.email,
         r.role,
         case
           when u.blocked_at is not null then 'blocked'
           when u.deactivated_at is not null then 'deactivated'
           when exists (
             select 1 from better_auth.account a where a."userId" = u.id and a."providerId" = 'credential'
           ) then 'active'
           else 'invited'
         end as status,
         u."createdAt" as created_at,
         u.last_login_at,
         u.deactivated_at,
         u.blocked_at
  from better_auth."user" u
  join public.user_roles r on r.user_id = u.id
  where (select app.is_mfa_admin());

alter view app.accounts owner to app_definer;

-- migrate:down
