-- A pending Admin registration must not prevent first-admin setup.
create or replace function public.bootstrap_first_admin(p_user_id uuid)
returns void language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
 perform pg_advisory_xact_lock(71684201);
 if exists(select 1 from public.profiles where role='admin' and account_status='active') then
  raise exception 'an active administrator already exists';
 end if;
 if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'auth user not found'; end if;
 insert into public.profiles(id,email,full_name,role,account_status)
 select id,email,coalesce(raw_user_meta_data->>'full_name','FireCase Administrator'),'admin','active' from auth.users where id=p_user_id
 on conflict(id) do update set role='admin',account_status='active';
end $$;
revoke all on function public.bootstrap_first_admin(uuid) from public,anon,authenticated,service_role;
