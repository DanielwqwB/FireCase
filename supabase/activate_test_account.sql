-- Run once in your Supabase project's SQL Editor to activate the account
-- shown in the login error. This preserves its currently assigned role.
begin;
-- SQL Editor runs as the database owner; use the trusted role for this transaction.
set local request.jwt.claims = '{"role":"service_role"}';
set local request.jwt.claim.role = 'service_role';
do $$
declare target_id uuid;
begin
 select id into target_id from public.profiles where lower(email) = 'test1@gmail.com';
 if target_id is null then
  raise exception 'No profile found for test1@gmail.com. Check the registered email in Authentication > Users.';
 end if;
 update public.profiles set account_status = 'active' where id = target_id;
end $$;
commit;
select email, role, account_status from public.profiles where lower(email) = 'test1@gmail.com';
