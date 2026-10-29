-- Een string in de select is geen optie: dit is een definer-view zonder barrier, filter en eigenaar.
create view app.v as select 'with (security_invoker) as' as x, r.role from public.user_roles r;
