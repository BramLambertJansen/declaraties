-- migrate:up
-- Spec audit-log AC-25: alleen een echte statusovergang schrijft audit, ook bij gelijktijdige requests.
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
      update better_auth."user" set blocked_at = null where id = p_user_id and blocked_at is not null;
      if found then
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
    if not found then
      return;
    end if;
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

alter function app.set_account_blocked(text, boolean) owner to app_definer;

-- migrate:down
-- Append-only: geen down-migraties (docs/framework.md §10).
