-- migrate:up
-- Bewaarcatalogus (spec achtergrondtaken, deel A; ADR 0022 punt 5, ADR 0020 stap 5): app.retention met de termijn van elke
-- tabel, app.retention_cutoff, de tien rijen, het verwijderen van audit-regels na de termijn (policy audit_log_definer_delete en
-- rij-trigger audit_log_delete_expired_only, in plaats van de statement-trigger audit_log_no_delete) en de restrictieve
-- opruimpolicy op app.rate_limits. Draait als app_migrator. Opruimen zelf (app.purge_expired) volgt in deel C.

create table app.retention (
  table_name regclass primary key,
  -- null alleen als keep null is (zolang het account bestaat).
  time_column text,
  keep interval check (keep >= interval '0'),
  -- app: opgeruimd door app.purge_expired; auth: door purgeExpired() van Better Auth.
  purger text not null check (purger in ('app', 'auth')),
  reason text not null check (pg_catalog.length(pg_catalog.btrim(reason)) > 0),
  check (keep is null or time_column is not null)
);
alter table app.retention enable row level security;
alter table app.retention force row level security;

-- Alleen app_definer leest (via app.retention_cutoff en later app.retention_targets); niemand schrijft via grants.
grant select on app.retention to app_definer;

create policy retention_definer_select on app.retention
  for select to app_definer using (true);

-- Het tijdstip waarvóór een rij van deze tabel verlopen is; -infinity als de tabel geen termijn heeft.
create function app.retention_cutoff(p_table regclass) returns timestamptz
  language plpgsql stable security definer set search_path = ''
  as $$
  declare
    v_keep interval;
  begin
    select r.keep into v_keep from app.retention r where r.table_name = p_table;
    if not found then
      raise exception 'tabel % staat niet in app.retention', p_table using errcode = '22023';
    end if;
    if v_keep is null then
      return '-infinity'::timestamptz;
    end if;
    return pg_catalog.now() - v_keep;
  end
  $$;

alter function app.retention_cutoff(regclass) owner to app_definer;
revoke all on function app.retention_cutoff(regclass) from public;
grant execute on function app.retention_cutoff(regclass) to app_definer;

-- Registratie van de tien tabellen. Onder FORCE RLS kan niemand in app.retention schrijven (alleen een select-policy), dus
-- zetten we FORCE tijdelijk uit binnen deze migratietransactie; in rust blijft de tabel geforceerd (invariant en jobs/AC-1).
alter table app.retention no force row level security;
insert into app.retention values
  ('app.retention', null, null, 'app', 'configuratie (ADR 0022 punt 5)'),
  ('public.user_roles', null, null, 'app', 'verdwijnt met het account (user_id, on delete cascade)'),
  ('app.audit_log', 'at', interval '1 year', 'app', 'audit log: minstens een jaar (ADR 0021)'),
  ('app.rate_limits', 'window_start', interval '60 seconds', 'app', 'rate-limitvenster (RATE_LIMIT_WINDOW_SECONDS)'),
  ('better_auth.session', 'createdAt', interval '7 days', 'auth', 'absolute sessieduur (SESSION_ABSOLUTE_SECONDS, ADR 0003)'),
  ('better_auth.verification', 'expiresAt', interval '0 seconds', 'auth', 'de geldigheid zit al in expiresAt'),
  ('better_auth."rateLimit"', 'lastRequest', interval '60 seconds', 'auth', 'langste venster van Better Auth (AUTH_RATE_LIMIT_KEEP_SECONDS)'),
  ('better_auth."user"', null, null, 'auth', 'verdwijnt met het account'),
  ('better_auth.account', null, null, 'auth', 'verdwijnt met het account'),
  ('better_auth."twoFactor"', null, null, 'auth', 'verdwijnt met het account');
alter table app.retention force row level security;

-- app.audit_log: verwijderen alleen na de termijn (spec audit-log OV-B1, ADR 0021 punt 6). De policy filtert onder FORCE RLS
-- verlopen rijen; de rij-trigger weigert met 42501 wie RLS omzeilt. update en truncate blijven altijd geweigerd.
grant delete on app.audit_log to app_definer;

create policy audit_log_definer_delete on app.audit_log
  for delete to app_definer using (at < (select app.retention_cutoff('app.audit_log')));

create function app.audit_log_guard_delete() returns trigger
  language plpgsql volatile set search_path = ''
  as $$
  begin
    if old.at >= app.retention_cutoff('app.audit_log') then
      raise exception 'audit log is append-only' using errcode = '42501';
    end if;
    return old;
  end
  $$;

alter function app.audit_log_guard_delete() owner to app_definer;
revoke all on function app.audit_log_guard_delete() from public;

drop trigger audit_log_no_delete on app.audit_log;
create trigger audit_log_delete_expired_only before delete on app.audit_log
  for each row execute function app.audit_log_guard_delete();

-- app.rate_limits: opruimen van verlopen vensters, restrictief naast de ongewijzigde rate_limits_definer_all.
create policy rate_limits_definer_delete_expired on app.rate_limits
  as restrictive for delete to app_definer
  using (window_start < (select app.retention_cutoff('app.rate_limits')));

-- migrate:down
-- Append-only: geen down-migraties (docs/framework.md §10).
