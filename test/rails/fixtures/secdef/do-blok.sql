-- migrate:up
-- security definer in een do-blok of in dynamische SQL leest de check niet als create: dat faalt.
do $$
begin
  create function app.verstopt() returns boolean
    language sql security definer set search_path = ''
    as 'select true';
end
$$;
create function app.maak() returns void
  language plpgsql set search_path = ''
  as $$
  begin
    execute 'create function app.later() returns boolean language sql security definer as ''select true''';
  end
  $$;
