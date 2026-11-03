-- migrate:up
-- Eenmalig gebruik (ADR 0075, spec inloggat-dichten): een TOTP-code en een link van de e-mailwijziging werken één keer.
-- Eén sleutel per gebruik met een vervaltijd; de primaire sleutel maakt de claim atomair, ook bij gelijktijdige verzoeken of
-- meer API-processen. Niet unlogged: een claim moet een crash of failover overleven, anders werkt een gebruikte code weer.
-- Alleen via app.claim_one_time_use (security definer van app_definer); alleen auth_service mag die uitvoeren.

create table app.one_time_use (
  key text primary key,
  expires_at timestamptz not null
);
alter table app.one_time_use enable row level security;
alter table app.one_time_use force row level security;

grant select, insert, update, delete on app.one_time_use to app_definer;

-- Alleen voor de security definer-functie hieronder (framework §6: FORCE RLS geldt ook voor app_definer).
create policy one_time_use_definer_all on app.one_time_use
  for all to app_definer using (true) with check (true);

-- Opruimen alleen van verlopen sleutels (R-DB-17, vorm van rate_limits_definer_delete_expired).
create policy one_time_use_definer_delete_expired on app.one_time_use
  as restrictive for delete to app_definer
  using (expires_at < (select app.retention_cutoff('app.one_time_use')));

-- Claimt p_key voor p_ttl_seconds. true: de claim is nieuw (of de oude was verlopen); false: de sleutel is al in gebruik.
-- Eén upsert: van twee gelijktijdige claims op dezelfde sleutel wint er precies één (rijvergrendeling). De tijd komt van de
-- database. De bovengrens 3600 is EMAIL_CHANGE_TTL_SECONDS (src/core/shared/limits.ts); een integratietest houdt ze gelijk.
create function app.claim_one_time_use(p_key text, p_ttl_seconds integer) returns boolean
  language plpgsql volatile security definer set search_path = ''
  as $$
  declare
    v_claimed boolean;
  begin
    if p_key is null or pg_catalog.length(p_key) > 200 or p_key !~ '^[a-z][a-z-]*:.+$' then
      raise exception 'ongeldige sleutel' using errcode = '22023';
    end if;
    if p_ttl_seconds is null or p_ttl_seconds < 1 or p_ttl_seconds > 3600 then
      raise exception 'ongeldige geldigheid' using errcode = '22023';
    end if;
    insert into app.one_time_use (key, expires_at)
      values (p_key, pg_catalog.now() + pg_catalog.make_interval(secs => p_ttl_seconds))
      on conflict (key) do update
        set expires_at = excluded.expires_at
        where one_time_use.expires_at <= pg_catalog.now()
      returning true into v_claimed;
    return coalesce(v_claimed, false);
  end
  $$;

alter function app.claim_one_time_use(text, integer) owner to app_definer;
revoke all on function app.claim_one_time_use(text, integer) from public;
grant usage on schema app to auth_service;
grant execute on function app.claim_one_time_use(text, integer) to auth_service;

-- Bewaarcatalogus (R-DB-17): FORCE tijdelijk uit, alleen deze rij erin, FORCE weer aan.
alter table app.retention no force row level security;
insert into app.retention values
  ('app.one_time_use', 'expires_at', interval '0 seconds', 'app', 'eenmalig gebruik: de geldigheid zit al in expires_at (ADR 0075)');
alter table app.retention force row level security;

-- migrate:down
-- Append-only: geen down-migraties (docs/framework.md §10).
