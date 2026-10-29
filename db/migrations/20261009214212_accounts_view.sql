-- migrate:up
-- app.accounts (spec accountbeheer): naam, e-mail, rol en status van elk account, alleen voor een admin met MFA.
-- Een view van app_definer (framework §6); die leest uit better_auth alleen de kolommen hieronder (besluit eigenaar,
-- kolom-allowlist in db/tests/invarianten.sql): geen wachtwoord, sessies of TOTP-geheimen.

grant usage on schema better_auth to app_definer;
grant select (id, name, email, "createdAt") on better_auth."user" to app_definer;
grant select ("userId", "providerId") on better_auth.account to app_definer;

-- Status: 'active' zodra het wachtwoord is ingesteld (credential-account), anders 'invited' (ADR 0013).
-- security_barrier: het filter op is_mfa_admin() gaat altijd vóór filters van de aanroeper.
create view app.accounts with (security_barrier) as
  select u.id,
         u.name,
         u.email,
         r.role,
         case
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
grant select on app.accounts to app_authenticated;

-- migrate:down
-- Append-only: geen down-migraties (docs/framework.md §10).
