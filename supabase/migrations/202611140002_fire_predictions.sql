-- Prediction requests and model outputs returned by the FireCase inference API.
create table public.fire_predictions (
  prediction_id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  model_name text not null check (model_name in ('daily','lstm')),
  observation_data jsonb not null,
  prediction_result jsonb,
  prediction_status text not null default 'pending' check (prediction_status in ('pending','succeeded','failed')),
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((prediction_status='succeeded') = (prediction_result is not null)),
  check ((prediction_status='pending') = (completed_at is null))
);
create index fire_predictions_submitted_idx on public.fire_predictions(submitted_by,created_at desc);
create index fire_predictions_created_idx on public.fire_predictions(created_at desc);
alter table public.fire_predictions enable row level security;
create policy predictions_select_owner_admin on public.fire_predictions for select to authenticated
  using (private.current_role()='admin' or submitted_by=auth.uid());
revoke all on public.fire_predictions from public,anon;
grant select on public.fire_predictions to authenticated;
-- Writes are made only by the authenticated Next.js route using the server-only Supabase secret.
