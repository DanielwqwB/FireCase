-- FireCase initial schema. Apply with `supabase db push` after linking a project.
create extension if not exists postgis with schema extensions;
create schema if not exists private;

create type public.app_role as enum ('admin','emergency_responder','firefighter','land_manager');
create type public.account_status as enum ('pending','active','inactive');
create type public.case_lifecycle as enum ('watch','active','recovery','closed');
create type public.verification_status as enum ('unverified','requested','confirmed','dismissed');
create type public.incident_status as enum ('confirmed','contained','out');
create type public.verification_request_status as enum ('open','in_progress','completed','cancelled');
create type public.warning_status as enum ('draft','reviewed');
create type public.sync_status as enum ('running','succeeded','failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null unique,
  role public.app_role not null default 'firefighter',
  account_status public.account_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.monitoring_areas (
  area_id uuid primary key default gen_random_uuid(),
  area_name text not null check (length(trim(area_name)) between 2 and 160),
  area_description text,
  geographic_boundary extensions.geography(Polygon,4326) not null,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (extensions.ST_IsValid(geographic_boundary::extensions.geometry))
);
create index monitoring_areas_boundary_gix on public.monitoring_areas using gist(geographic_boundary);

create table public.area_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.monitoring_areas(area_id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  assigned_by uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  unique(area_id,user_id)
);
create index area_assignments_user_idx on public.area_assignments(user_id,area_id);

create table public.satellite_detections (
  detection_id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('nasa_firms_modis','nasa_firms_viirs','other')),
  external_detection_reference text not null,
  geographic_location extensions.geography(Point,4326) not null,
  detection_time timestamptz not null,
  fire_radiative_power numeric(10,3) check (fire_radiative_power is null or fire_radiative_power>=0),
  confidence text check (confidence is null or confidence in ('low','nominal','high')),
  satellite_name text,
  instrument_name text,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(source,external_detection_reference)
);
create index satellite_detections_location_gix on public.satellite_detections using gist(geographic_location);
create index satellite_detections_time_idx on public.satellite_detections(detection_time desc);

create table public.wildfire_cases (
  case_id uuid primary key default gen_random_uuid(),
  case_reference text not null unique,
  area_id uuid references public.monitoring_areas(area_id) on delete set null,
  geographic_location extensions.geography(Point,4326) not null,
  lifecycle_status public.case_lifecycle not null default 'watch',
  verification_status public.verification_status not null default 'unverified',
  incident_status public.incident_status,
  priority_score numeric(6,2) check (priority_score is null or priority_score between 0 and 100),
  first_detected_at timestamptz not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  check ((lifecycle_status='closed') = (closed_at is not null))
);
create index wildfire_cases_location_gix on public.wildfire_cases using gist(geographic_location);
create index wildfire_cases_area_lifecycle_idx on public.wildfire_cases(area_id,lifecycle_status);
create index wildfire_cases_detected_idx on public.wildfire_cases(first_detected_at desc);

create table public.case_detections (
  case_id uuid not null references public.wildfire_cases(case_id) on delete restrict,
  detection_id uuid not null unique references public.satellite_detections(detection_id) on delete restrict,
  associated_by uuid references public.profiles(id),
  associated_at timestamptz not null default now(),
  primary key(case_id,detection_id)
);

create table public.verification_requests (
  request_id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.wildfire_cases(case_id) on delete restrict,
  requested_by uuid not null references public.profiles(id),
  assigned_firefighter_id uuid references public.profiles(id),
  request_status public.verification_request_status not null default 'open',
  request_note text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index verification_requests_assigned_idx on public.verification_requests(assigned_firefighter_id,request_status);
create index verification_requests_case_idx on public.verification_requests(case_id,created_at desc);

create table public.field_reports (
  report_id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.wildfire_cases(case_id) on delete restrict,
  firefighter_id uuid not null references public.profiles(id),
  verification_result public.verification_status not null check (verification_result in ('confirmed','dismissed')),
  incident_status public.incident_status not null,
  remarks text check (remarks is null or length(remarks)<=5000),
  photo_path text,
  submitted_at timestamptz not null default now()
);
create index field_reports_case_idx on public.field_reports(case_id,submitted_at desc);

create table public.case_status_history (
  history_id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.wildfire_cases(case_id) on delete restrict,
  previous_status public.case_lifecycle,
  new_status public.case_lifecycle not null,
  updated_by uuid references public.profiles(id),
  remarks text,
  created_at timestamptz not null default now()
);
create index case_status_history_case_idx on public.case_status_history(case_id,created_at desc);

create table public.fire_warnings (
  warning_id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.wildfire_cases(case_id) on delete restrict,
  created_by uuid not null references public.profiles(id),
  warning_title text not null check (length(trim(warning_title)) between 3 and 180),
  warning_message text not null check (length(trim(warning_message)) between 3 and 10000),
  warning_status public.warning_status not null default 'draft',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table public.recovery_records (
  recovery_id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.wildfire_cases(case_id) on delete restrict,
  burned_area_hectares numeric(14,3) check (burned_area_hectares is null or burned_area_hectares>=0),
  burn_severity text check (burn_severity is null or burn_severity in ('low','moderate','high','unknown')),
  vegetation_index numeric(8,5) check (vegetation_index is null or vegetation_index between -1 and 1),
  observation_date date not null,
  recovery_status text not null default 'monitoring' check (recovery_status in ('monitoring','improving','stable','degraded','unknown')),
  source text not null,
  created_at timestamptz not null default now(),
  unique(case_id,observation_date,source)
);
create index recovery_records_case_date_idx on public.recovery_records(case_id,observation_date desc);

create table public.audit_logs (
  log_id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs(created_at desc);

create table public.satellite_sync_logs (
  sync_id uuid primary key default gen_random_uuid(),
  data_source text not null,
  sync_status public.sync_status not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  records_processed integer not null default 0 check (records_processed>=0),
  error_message text
);
create index satellite_sync_logs_started_idx on public.satellite_sync_logs(started_at desc);
-- Trusted authorization helpers. SECURITY DEFINER prevents profile-policy recursion.
create or replace function private.current_role()
returns public.app_role language sql stable security definer set search_path = public, auth, pg_temp
as $$ select role from public.profiles where id=auth.uid() and account_status='active' $$;
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = public, auth, pg_temp
as $$ select coalesce(private.current_role()='admin',false) $$;
create or replace function private.has_area_access(target_area uuid)
returns boolean language sql stable security definer set search_path = public, auth, pg_temp
as $$ select private.current_role() in ('admin','emergency_responder','firefighter') or exists(select 1 from public.area_assignments a where a.area_id=target_area and a.user_id=auth.uid()) $$;
create or replace function private.can_view_case(target_case uuid)
returns boolean language sql stable security definer set search_path = public, auth, pg_temp
as $$
 select case
  when private.current_role() in ('admin','emergency_responder') then true
  when private.current_role()='firefighter' then exists(select 1 from public.wildfire_cases c where c.case_id=target_case and c.lifecycle_status in ('watch','active')) or exists(select 1 from public.verification_requests v where v.case_id=target_case and v.assigned_firefighter_id=auth.uid())
  when private.current_role()='land_manager' then exists(select 1 from public.wildfire_cases c join public.area_assignments a on a.area_id=c.area_id where c.case_id=target_case and a.user_id=auth.uid())
  else false end
$$;
create or replace function private.can_view_location(target_location extensions.geography)
returns boolean language sql stable security definer set search_path = public, auth, extensions, pg_temp
as $$ select private.current_role() in ('admin','emergency_responder','firefighter') or (private.current_role()='land_manager' and exists(select 1 from public.area_assignments aa join public.monitoring_areas ma using(area_id) where aa.user_id=auth.uid() and ma.is_active and extensions.ST_Covers(ma.geographic_boundary::extensions.geometry,target_location::extensions.geometry))) $$;
revoke all on function private.current_role(),private.is_admin(),private.has_area_access(uuid),private.can_view_case(uuid),private.can_view_location(extensions.geography) from public, anon;
grant execute on function private.current_role(),private.is_admin(),private.has_area_access(uuid),private.can_view_case(uuid),private.can_view_location(extensions.geography) to authenticated, service_role;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public, auth, pg_temp
as $$ begin
 insert into public.profiles(id,full_name,email,role,account_status)
 values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),new.email,'firefighter','pending')
 on conflict(id) do nothing;
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path=public,pg_temp as $$ begin new.updated_at=now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger areas_touch before update on public.monitoring_areas for each row execute function public.touch_updated_at();
create trigger cases_touch before update on public.wildfire_cases for each row execute function public.touch_updated_at();

create or replace function private.guard_profile_update()
returns trigger language plpgsql security definer set search_path=public,auth,private,pg_temp as $$
begin
 if auth.role()='service_role' or private.is_admin() then return new; end if;
 if auth.uid()=old.id and new.id=old.id and new.email=old.email and new.role=old.role and new.account_status=old.account_status and new.created_at=old.created_at then return new; end if;
 raise exception 'profile role and account status are managed by an administrator';
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function private.guard_profile_update();

create or replace function private.guard_case_update()
returns trigger language plpgsql security definer set search_path=public,auth,private,pg_temp as $$
declare r public.app_role;
begin
 r:=private.current_role();
 if auth.role()='service_role' or r='admin' then return new; end if;
 if r='emergency_responder' then
  if new.case_id=old.case_id and new.case_reference=old.case_reference and new.area_id is not distinct from old.area_id and new.geographic_location=old.geographic_location and new.verification_status=old.verification_status and new.incident_status is not distinct from old.incident_status and new.first_detected_at=old.first_detected_at and new.created_by is not distinct from old.created_by and new.created_at=old.created_at and new.closed_at is not distinct from old.closed_at then return new; end if;
 elsif r='firefighter' then
  if new.case_id=old.case_id and new.case_reference=old.case_reference and new.area_id is not distinct from old.area_id and new.geographic_location=old.geographic_location and new.lifecycle_status=old.lifecycle_status and new.priority_score is not distinct from old.priority_score and new.first_detected_at=old.first_detected_at and new.created_by is not distinct from old.created_by and new.created_at=old.created_at and new.closed_at is not distinct from old.closed_at and exists(select 1 from public.field_reports fr where fr.case_id=old.case_id and fr.firefighter_id=auth.uid() and fr.submitted_at>now()-interval '2 minutes') then return new; end if;
 end if;
 raise exception 'case update not permitted';
end $$;
create trigger wildfire_cases_guard before update on public.wildfire_cases for each row execute function private.guard_case_update();

create or replace function private.validate_case_transition()
returns trigger language plpgsql security definer set search_path=public,auth,private,pg_temp as $$
begin
 if new.lifecycle_status is distinct from old.lifecycle_status then
  if private.current_role() not in ('admin','emergency_responder') and auth.role() is distinct from 'service_role' then raise exception 'lifecycle transition not permitted'; end if;
  if not ((old.lifecycle_status='watch' and new.lifecycle_status in ('active','closed')) or (old.lifecycle_status='active' and new.lifecycle_status in ('recovery','closed')) or (old.lifecycle_status='recovery' and new.lifecycle_status in ('active','closed'))) then raise exception 'invalid wildfire case lifecycle transition'; end if;
  if new.lifecycle_status='closed' and new.closed_at is null then new.closed_at=now(); elsif new.lifecycle_status<>'closed' then new.closed_at=null; end if;
 end if;
 return new;
end $$;
create trigger wildfire_cases_transition before update on public.wildfire_cases for each row execute function private.validate_case_transition();
create or replace function private.record_case_status()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
 if new.lifecycle_status is distinct from old.lifecycle_status then insert into public.case_status_history(case_id,previous_status,new_status,updated_by) values(new.case_id,old.lifecycle_status,new.lifecycle_status,auth.uid()); end if;
 return new;
end $$;
create trigger wildfire_cases_history after update on public.wildfire_cases for each row execute function private.record_case_status();

create or replace function public.submit_field_report(p_case_id uuid,p_verification public.verification_status,p_incident public.incident_status,p_remarks text default null,p_photo_path text default null)
returns uuid language plpgsql security definer set search_path=public,auth,private,pg_temp as $$
declare report_id uuid; r public.app_role;
begin
 r:=private.current_role();
 if auth.uid() is null or r<>'firefighter' then raise exception 'firefighter access required'; end if;
 if p_verification not in ('confirmed','dismissed') then raise exception 'verification result must be confirmed or dismissed'; end if;
 if length(coalesce(p_remarks,''))>5000 then raise exception 'remarks too long'; end if;
 if not exists(select 1 from public.wildfire_cases c where c.case_id=p_case_id and c.lifecycle_status in ('watch','active')) then raise exception 'case unavailable for field reports'; end if;
 if p_photo_path is not null and p_photo_path !~ ('^'||p_case_id::text||'/'||auth.uid()::text||'/[^/]+$') then raise exception 'photo path must be inside this case and user folder'; end if;
 insert into public.field_reports(case_id,firefighter_id,verification_result,incident_status,remarks,photo_path) values(p_case_id,auth.uid(),p_verification,p_incident,nullif(trim(p_remarks),''),p_photo_path) returning public.field_reports.report_id into report_id;
 update public.wildfire_cases set verification_status=p_verification,incident_status=p_incident where case_id=p_case_id;
 update public.verification_requests set request_status='completed',completed_at=now() where case_id=p_case_id and assigned_firefighter_id=auth.uid() and request_status in ('open','in_progress');
 return report_id;
end $$;
revoke all on function public.submit_field_report(uuid,public.verification_status,public.incident_status,text,text) from public,anon;
grant execute on function public.submit_field_report(uuid,public.verification_status,public.incident_status,text,text) to authenticated;

create or replace function private.audit_row_change()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare target uuid; action_name text;
begin
 target:=coalesce((to_jsonb(new)->>tg_argv[0])::uuid,(to_jsonb(old)->>tg_argv[0])::uuid);
 action_name:=lower(tg_op)||'_'||tg_table_name;
 insert into public.audit_logs(actor_id,action,target_type,target_id,metadata) values(auth.uid(),action_name,tg_table_name,target,jsonb_build_object('source','database_trigger'));
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger audit_area_changes after insert or update on public.monitoring_areas for each row execute function private.audit_row_change('area_id');
create trigger audit_assignment_changes after insert or update or delete on public.area_assignments for each row execute function private.audit_row_change('assignment_id');
create trigger audit_case_changes after insert or update on public.wildfire_cases for each row execute function private.audit_row_change('case_id');
create trigger audit_profile_changes after insert or update on public.profiles for each row execute function private.audit_row_change('id');
-- Enable RLS for every application-facing table.
alter table public.profiles enable row level security;
alter table public.monitoring_areas enable row level security;
alter table public.area_assignments enable row level security;
alter table public.satellite_detections enable row level security;
alter table public.wildfire_cases enable row level security;
alter table public.case_detections enable row level security;
alter table public.verification_requests enable row level security;
alter table public.field_reports enable row level security;
alter table public.case_status_history enable row level security;
alter table public.fire_warnings enable row level security;
alter table public.recovery_records enable row level security;
alter table public.audit_logs enable row level security;
alter table public.satellite_sync_logs enable row level security;

create policy profiles_select_self_admin on public.profiles for select to authenticated using(id=auth.uid() or private.is_admin());
create policy profiles_admin_insert on public.profiles for insert to authenticated with check(private.is_admin());
create policy profiles_admin_update on public.profiles for update to authenticated using(private.is_admin()) with check(private.is_admin());

create policy areas_select_role on public.monitoring_areas for select to authenticated using(is_active and private.has_area_access(area_id));
create policy areas_admin_insert on public.monitoring_areas for insert to authenticated with check(private.is_admin() and created_by=auth.uid());
create policy areas_admin_update on public.monitoring_areas for update to authenticated using(private.is_admin()) with check(private.is_admin());

create policy assignments_select_self_admin on public.area_assignments for select to authenticated using(user_id=auth.uid() or private.is_admin());
create policy assignments_admin_insert on public.area_assignments for insert to authenticated with check(private.is_admin() and assigned_by=auth.uid() and exists(select 1 from public.profiles p where p.id=user_id and p.role='land_manager' and p.account_status='active'));
create policy assignments_admin_update on public.area_assignments for update to authenticated using(private.is_admin()) with check(private.is_admin());
create policy assignments_admin_delete on public.area_assignments for delete to authenticated using(private.is_admin());

create policy detections_select_authorized on public.satellite_detections for select to authenticated using(private.can_view_location(geographic_location));
-- Detection ingestion is intentionally reserved for trusted server/CLI credentials; no client write policies.
create policy cases_select_authorized on public.wildfire_cases for select to authenticated using(private.can_view_case(case_id));
create policy cases_admin_insert on public.wildfire_cases for insert to authenticated with check(private.is_admin() and (created_by is null or created_by=auth.uid()));
create policy cases_responder_insert on public.wildfire_cases for insert to authenticated with check(private.current_role()='emergency_responder' and created_by=auth.uid() and lifecycle_status='watch' and verification_status='unverified');
create policy cases_update_authorized on public.wildfire_cases for update to authenticated using(private.current_role() in ('admin','emergency_responder','firefighter') and private.can_view_case(case_id)) with check(private.current_role() in ('admin','emergency_responder','firefighter') and private.can_view_case(case_id));
create policy case_detections_select on public.case_detections for select to authenticated using(private.can_view_case(case_id));
create policy case_detections_insert on public.case_detections for insert to authenticated with check(private.current_role() in ('admin','emergency_responder') and private.can_view_case(case_id));

create policy verification_select_relevant on public.verification_requests for select to authenticated using(private.current_role() in ('admin','emergency_responder') or requested_by=auth.uid() or assigned_firefighter_id=auth.uid());
create policy verification_create_responder on public.verification_requests for insert to authenticated with check(private.current_role()='emergency_responder' and requested_by=auth.uid() and private.can_view_case(case_id) and (assigned_firefighter_id is null or exists(select 1 from public.profiles p where p.id=assigned_firefighter_id and p.role='firefighter' and p.account_status='active')));
create policy verification_update_admin_responder on public.verification_requests for update to authenticated using(private.current_role() in ('admin','emergency_responder')) with check(private.current_role() in ('admin','emergency_responder'));
create policy verification_update_assignee on public.verification_requests for update to authenticated using(assigned_firefighter_id=auth.uid() and private.current_role()='firefighter') with check(assigned_firefighter_id=auth.uid() and private.current_role()='firefighter');

create policy reports_select_relevant on public.field_reports for select to authenticated using(private.current_role() in ('admin','emergency_responder') or firefighter_id=auth.uid() or exists(select 1 from public.wildfire_cases c join public.area_assignments a on a.area_id=c.area_id where c.case_id=field_reports.case_id and a.user_id=auth.uid()));
-- Writes go through submit_field_report() so report insertion and case update are atomic.
create policy history_select_case_access on public.case_status_history for select to authenticated using(private.can_view_case(case_id));
create policy warnings_select_roles on public.fire_warnings for select to authenticated using(private.current_role() in ('admin','emergency_responder'));
create policy warnings_insert_responder on public.fire_warnings for insert to authenticated with check(private.current_role()='emergency_responder' and created_by=auth.uid() and private.can_view_case(case_id));
create policy warnings_insert_admin on public.fire_warnings for insert to authenticated with check(private.is_admin() and created_by=auth.uid());
create policy warnings_update_reviewer on public.fire_warnings for update to authenticated using(private.current_role()='emergency_responder' and created_by=auth.uid()) with check(private.current_role()='emergency_responder' and created_by=auth.uid());
create policy recovery_select_relevant on public.recovery_records for select to authenticated using(private.current_role() in ('admin','emergency_responder') or exists(select 1 from public.wildfire_cases c join public.area_assignments a on a.area_id=c.area_id where c.case_id=recovery_records.case_id and a.user_id=auth.uid()));
create policy audit_admin_select on public.audit_logs for select to authenticated using(private.is_admin());
create policy sync_admin_select on public.satellite_sync_logs for select to authenticated using(private.is_admin());
-- No public mutation policies for audit, sync, satellite records, recovery observations, or case history.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('field-reports','field-reports',false,5242880,array['image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png'];

create policy field_report_photos_upload on storage.objects for insert to authenticated with check(
 bucket_id='field-reports' and private.current_role()='firefighter' and (storage.foldername(name))[2]=auth.uid()::text
 and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and exists(select 1 from public.wildfire_cases c where c.case_id=((storage.foldername(name))[1])::uuid and c.lifecycle_status in ('watch','active'))
);
create policy field_report_photos_read on storage.objects for select to authenticated using(
 bucket_id='field-reports' and (
  private.current_role() in ('admin','emergency_responder') or
  ((storage.foldername(name))[2]=auth.uid()::text and private.current_role()='firefighter') or
  exists(select 1 from public.wildfire_cases c join public.area_assignments a on a.area_id=c.area_id where c.case_id=((storage.foldername(name))[1])::uuid and a.user_id=auth.uid())
 )
);
-- Deliberately no object UPDATE/DELETE policy: report evidence cannot be replaced or removed via Storage API.
create or replace view public.case_feed with (security_invoker=true) as
select c.case_id,c.case_reference,c.area_id,coalesce(a.area_name,'Unassigned area') as area_name,
 extensions.ST_Y(c.geographic_location::extensions.geometry) as latitude,
 extensions.ST_X(c.geographic_location::extensions.geometry) as longitude,
 c.lifecycle_status,c.verification_status,c.incident_status,c.priority_score,c.first_detected_at,c.created_at,c.updated_at,c.closed_at
from public.wildfire_cases c left join public.monitoring_areas a on a.area_id=c.area_id;
create or replace view public.monitoring_area_feed with (security_invoker=true) as
select a.area_id,a.area_name,a.area_description,a.is_active,a.created_by,a.created_at,a.updated_at,
 extensions.ST_AsGeoJSON(a.geographic_boundary::extensions.geometry)::jsonb as boundary_geojson,
 extensions.ST_Y(extensions.ST_Centroid(a.geographic_boundary::extensions.geometry)) as center_latitude,
 extensions.ST_X(extensions.ST_Centroid(a.geographic_boundary::extensions.geometry)) as center_longitude,
 round((extensions.ST_Area(a.geographic_boundary)/10000)::numeric,2) as area_hectares
from public.monitoring_areas a;
grant select on public.case_feed,public.monitoring_area_feed to authenticated;

create or replace function public.create_monitoring_area(p_name text,p_description text,p_boundary jsonb)
returns uuid language plpgsql security definer set search_path=public,private,auth,extensions,pg_temp as $$
declare new_id uuid; geom extensions.geometry;
begin
 if not private.is_admin() then raise exception 'administrator access required'; end if;
 geom:=extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(p_boundary::text),4326);
 if extensions.GeometryType(geom)<>'POLYGON' or not extensions.ST_IsValid(geom) then raise exception 'valid Polygon boundary required'; end if;
 insert into public.monitoring_areas(area_name,area_description,geographic_boundary,created_by)
 values(trim(p_name),nullif(trim(p_description),''),geom::extensions.geography,auth.uid()) returning area_id into new_id;
 return new_id;
end $$;
create or replace function public.update_monitoring_area(p_id uuid,p_name text,p_description text,p_boundary jsonb,p_is_active boolean)
returns void language plpgsql security definer set search_path=public,private,auth,extensions,pg_temp as $$
declare geom extensions.geometry;
begin
 if not private.is_admin() then raise exception 'administrator access required'; end if;
 geom:=extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(p_boundary::text),4326);
 if extensions.GeometryType(geom)<>'POLYGON' or not extensions.ST_IsValid(geom) then raise exception 'valid Polygon boundary required'; end if;
 update public.monitoring_areas set area_name=trim(p_name),area_description=nullif(trim(p_description),''),geographic_boundary=geom::extensions.geography,is_active=p_is_active where area_id=p_id;
 if not found then raise exception 'monitoring area not found'; end if;
end $$;
create or replace function public.assign_land_manager(p_area_id uuid,p_user_id uuid)
returns uuid language plpgsql security definer set search_path=public,private,auth,pg_temp as $$
declare assignment uuid;
begin
 if not private.is_admin() then raise exception 'administrator access required'; end if;
 if not exists(select 1 from public.profiles where id=p_user_id and role='land_manager' and account_status='active') then raise exception 'active Land Manager required'; end if;
 insert into public.area_assignments(area_id,user_id,assigned_by) values(p_area_id,p_user_id,auth.uid())
 on conflict(area_id,user_id) do update set assigned_by=excluded.assigned_by returning assignment_id into assignment;
 return assignment;
end $$;
create or replace function public.remove_land_manager(p_area_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path=public,private,auth,pg_temp as $$
begin if not private.is_admin() then raise exception 'administrator access required'; end if; delete from public.area_assignments where area_id=p_area_id and user_id=p_user_id; end $$;
create or replace function public.create_watch_case(p_lat double precision,p_lon double precision,p_area_id uuid default null)
returns uuid language plpgsql security definer set search_path=public,private,auth,extensions,pg_temp as $$
declare new_id uuid; loc extensions.geography;
begin
 if private.current_role()<>'emergency_responder' then raise exception 'Emergency Responder access required'; end if;
 if p_lat not between -90 and 90 or p_lon not between -180 and 180 then raise exception 'valid coordinates required'; end if;
 loc:=extensions.ST_SetSRID(extensions.ST_MakePoint(p_lon,p_lat),4326)::extensions.geography;
 if p_area_id is not null and not exists(select 1 from public.monitoring_areas a where a.area_id=p_area_id and a.is_active and extensions.ST_Covers(a.geographic_boundary::extensions.geometry,loc::extensions.geometry)) then raise exception 'location must be within the selected active monitoring area'; end if;
 insert into public.wildfire_cases(case_reference,area_id,geographic_location,lifecycle_status,verification_status,first_detected_at,created_by)
 values('FC-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),p_area_id,loc,'watch','unverified',now(),auth.uid()) returning case_id into new_id;
 return new_id;
end $$;
create or replace function public.create_verification_request(p_case_id uuid,p_firefighter uuid default null,p_note text default null)
returns uuid language plpgsql security definer set search_path=public,private,auth,pg_temp as $$
declare new_id uuid;
begin
 if private.current_role()<>'emergency_responder' then raise exception 'Emergency Responder access required'; end if;
 if not private.can_view_case(p_case_id) then raise exception 'case unavailable'; end if;
 if p_firefighter is not null and not exists(select 1 from public.profiles where id=p_firefighter and role='firefighter' and account_status='active') then raise exception 'active Firefighter required'; end if;
 insert into public.verification_requests(case_id,requested_by,assigned_firefighter_id,request_note) values(p_case_id,auth.uid(),p_firefighter,nullif(trim(p_note),'')) returning request_id into new_id;
 update public.wildfire_cases set verification_status='requested' where case_id=p_case_id and verification_status='unverified';
 return new_id;
end $$;
revoke all on function public.create_monitoring_area(text,text,jsonb),public.update_monitoring_area(uuid,text,text,jsonb,boolean),public.assign_land_manager(uuid,uuid),public.remove_land_manager(uuid,uuid),public.create_watch_case(double precision,double precision,uuid),public.create_verification_request(uuid,uuid,text) from public,anon;
grant execute on function public.create_monitoring_area(text,text,jsonb),public.update_monitoring_area(uuid,text,text,jsonb,boolean),public.assign_land_manager(uuid,uuid),public.remove_land_manager(uuid,uuid) to authenticated;
grant execute on function public.create_watch_case(double precision,double precision,uuid),public.create_verification_request(uuid,uuid,text) to authenticated;

-- One-time bootstrap is intentionally unavailable to application roles. Run in the SQL editor
-- as postgres after creating the first Auth user, then remove public sign-up.
create or replace function public.bootstrap_first_admin(p_user_id uuid)
returns void language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
 if exists(select 1 from public.profiles where role='admin') then raise exception 'an administrator already exists'; end if;
 if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'auth user not found'; end if;
 insert into public.profiles(id,email,full_name,role,account_status)
 select id,email,coalesce(raw_user_meta_data->>'full_name','FireCase Administrator'),'admin','active' from auth.users where id=p_user_id
 on conflict(id) do update set role='admin',account_status='active';
end $$;
revoke all on function public.bootstrap_first_admin(uuid) from public,anon,authenticated,service_role;
