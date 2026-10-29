do $$ begin
  create view app.v as select role from public.user_roles;
end $$;
do $$ begin execute 'alter view app.v owner to postgres'; end $$;
create schema extra create view w as select 1;
