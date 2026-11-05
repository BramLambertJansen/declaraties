-- migrate:up
-- Account blokkeren (spec accountbeheer-uitbreiding AC-11 t/m AC-14 en AC-22 t/m AC-24, ADR 0026): kolom blocked_at in
-- better_auth."user" (Better Auth user.additionalFields.blockedAt), app.set_account_blocked, de telbare-admin-definitie van
-- app.user_roles_keep_one_admin en de status 'blocked' in app.accounts. Draait als app_migrator.
-- Audit log (ADR 0021): app.audit_log bestaat nog niet, dus de functie schrijft nog geen auditregel (besluit 3, stap 6).

-- Kolom zoals Better Auth hem voor additionalFields genereert (scripts/auth-schema.mjs, gepinde versie).
set local search_path = better_auth;
alter table "user" add column "blocked_at" timestamptz;
-- dbmate schrijft schema_migrations in dezelfde transactie, zonder schemanaam: zonder reset belandt die in better_auth.
reset search_path;

-- Besluit 2: de enige schrijfrechten van app_definer in better_auth. Geen grant op sessies of andere kolommen.
grant select (blocked_at), update (blocked_at) on better_auth."user" to app_definer;

-- Besluit 4: een telbare admin heeft een credential-account en is niet geblokkeerd. Triggerfunctie en trigger blijven
-- (eigenaar, search_path); bij degradatie of verwijdering van een adminrij (niet bij admin naar admin, zoals de upsert van admin:create) moet er nog een telbare admin zijn.
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
        and exists (
          select 1 from better_auth.account a where a."userId" = u.id and a."providerId" = 'credential'
        )
    ) then
      raise exception 'LAST_ADMIN' using errcode = 'P0001', detail = 'De laatste admin kan niet weg.';
    end if;
    return null;
  end
  $$;

-- Besluit 3. Rechten vóór bestaan, deblokkeren zonder verdere controles, blokkeren onder dezelfde lock als de trigger.
create function app.set_account_blocked(p_user_id text, p_blocked boolean) returns void
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
      update better_auth."user" set blocked_at = null where id = p_user_id;
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
  end
  $$;

alter function app.set_account_blocked(text, boolean) owner to app_definer;
revoke all on function app.set_account_blocked(text, boolean) from public;
grant execute on function app.set_account_blocked(text, boolean) to app_authenticated;

-- Besluit 5: 'blocked' gaat vóór 'active' en 'invited'; zelfde kolommen in dezelfde volgorde.
create or replace view app.accounts with (security_barrier) as
  select u.id,
         u.name,
         u.email,
         r.role,
         case
           when u.blocked_at is not null then 'blocked'
           when exists (
             select 1 from better_auth.account a where a."userId" = u.id and a."providerId" = 'credential'
           ) then 'active'
           else 'invited'
         end as status,
         u."createdAt" as created_at
  from better_auth."user" u
  join public.user_roles r on r.user_id = u.id
  where (select app.is_mfa_admin());

alter view app.accounts owner to app_definer;

-- migrate:down
-- Append-only: geen down-migraties (docs/framework.md §10).
