-- migrate:up
-- Rate limit voor app-routes (spec rate-limit; framework §6 Verharding): één teller per gebruiker per categorie, vast
-- venster. Unlogged (OV-3): geen WAL per request; na een crash of failover zijn de tellers weg en begint de grens opnieuw.
-- Alleen via app.consume_rate_limit (security definer van app_definer); app_authenticated heeft geen rechten op de tabel.

create unlogged table app.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null check (hits > 0)
);
alter table app.rate_limits enable row level security;
alter table app.rate_limits force row level security;

grant select, insert, update, delete on app.rate_limits to app_definer;

-- Alleen voor de security definer-functie hieronder (framework §6: FORCE RLS geldt ook voor app_definer).
create policy rate_limits_definer_all on app.rate_limits
  for all to app_definer using (true) with check (true);

-- Telt één verzoek van de actor in bucket p_bucket. Geeft 0 (toegestaan) of het aantal seconden tot het venster afloopt,
-- naar boven afgerond en minstens 1. De sleutel is bucket + actor: de aanroeper kiest nooit de gebruiker. Eén upsert, dus
-- van twee gelijktijdige verzoeken op de laatste vrije plek slaagt er precies één (rijvergrendeling). Een verlopen venster
-- begint opnieuw op 1. De tijd komt van de database (pg_catalog.now()), niet van de API.
create function app.consume_rate_limit(p_bucket text, p_window_seconds integer, p_max integer) returns integer
  language plpgsql volatile security definer set search_path = ''
  as $$
  declare
    v_user text := app.current_user_id();
    v_window interval;
    v_start timestamptz;
    v_hits integer;
  begin
    if v_user is null then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if p_window_seconds is null or p_window_seconds <= 0 or p_max is null or p_max <= 0
       or p_bucket is null or p_bucket = '' or pg_catalog.strpos(p_bucket, ':') > 0 then
      raise exception 'ongeldige rate limit' using errcode = '22023';
    end if;
    v_window := pg_catalog.make_interval(secs => p_window_seconds);
    insert into app.rate_limits (key, window_start, hits)
      values (p_bucket || ':' || v_user, pg_catalog.now(), 1)
      on conflict (key) do update
        set window_start = case when rate_limits.window_start + v_window <= pg_catalog.now()
                                then pg_catalog.now() else rate_limits.window_start end,
            hits = case when rate_limits.window_start + v_window <= pg_catalog.now()
                        then 1 else rate_limits.hits + 1 end
      returning window_start, hits into v_start, v_hits;
    if v_hits <= p_max then
      return 0;
    end if;
    return greatest(1, pg_catalog.ceil(pg_catalog.date_part('epoch', v_start + v_window - pg_catalog.now()))::integer);
  end
  $$;

alter function app.consume_rate_limit(text, integer, integer) owner to app_definer;
grant execute on function app.consume_rate_limit(text, integer, integer) to app_authenticated;

-- migrate:down
-- Append-only: geen down-migraties (docs/framework.md §10).
