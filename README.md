# FireCase

FireCase is a Next.js application backed by Supabase Auth, Postgres, Row Level Security, and private Storage. Map tiles use Mapbox when `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is configured.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and set the Supabase project URL and publishable key. Set `SUPABASE_SECRET_KEY` only in server environments. Set a URL-restricted Mapbox public token for map tiles.
3. Start local Supabase with `npx supabase start`.
4. Apply the schema and policies with `npx supabase db reset`.
5. Start Next.js with `npm run dev`.

The schema is in `supabase/migrations`. `supabase/config.toml` disables public signup. For a hosted project, link it with `npx supabase link --project-ref your-project-ref` then apply migrations with `npx supabase db push`. Add the same environment variables in your hosting provider.

## First administrator

Create the initial Auth user in the Supabase Dashboard. Copy that user's UUID and run `select public.bootstrap_first_admin('<user-uuid>');` in the project SQL editor. Then sign in and invite the rest of the team from User Management. Do not use the service secret in client code. The first-admin function is intentionally not executable by API roles.

## Fire activity prediction

The dashboard exposes the documented prediction service to Admin and Emergency Responder accounts. Daily predictions use `POST /predict`; LSTM uses `POST /predict/lstm` and requires 14 consecutive observations, oldest first. The Next.js API route validates each input and model response, writes a pending record before the model call, then stores the returned prediction or a failed status in `public.fire_predictions`. The prediction history is loaded from Supabase. Configure `FIRECASE_PREDICTION_API_URL` to use another compatible service; it defaults to `https://firecase.onrender.com`. Apply the new `202611140002_fire_predictions.sql` migration before using this page.

## Operational notes

- All application reads and writes require an authenticated account and are checked against the user's role and area assignments. RLS remains enabled even when API routes are used.
- Field report photos are stored in the private `field-report-photos` bucket and served using signed URLs.
- Warning drafts are stored for review; this project does not send public alerts.
- Satellite providers and ingestion workers are not connected. The activity and recovery views show stored records only.
- Mapbox requires a valid public token with Styles:Read access and URL restrictions that permit the deployed hostname.

## Validation

`npm run build` compiles and type-checks the Next.js application. `npx supabase db reset` validates and applies the local migration when Docker and the Supabase CLI are available. No remote Supabase project is linked by this repository setup.
