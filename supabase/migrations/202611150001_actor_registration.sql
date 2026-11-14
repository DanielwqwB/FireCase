-- Requested roles never grant access until an administrator activates the profile.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public, auth, pg_temp
as $$
declare requested public.app_role;
begin
 requested := case new.raw_user_meta_data->>'requested_role'
  when 'admin' then 'admin'::public.app_role
  when 'emergency_responder' then 'emergency_responder'::public.app_role
  when 'land_manager' then 'land_manager'::public.app_role
  else 'firefighter'::public.app_role end;
 insert into public.profiles(id,full_name,email,role,account_status)
 values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),new.email,requested,'pending')
 on conflict(id) do nothing;
 return new;
end $$;
