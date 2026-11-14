# FireCase

FireCase is a Next.js application backed by Supabase Auth, Postgres, Row Level Security, and private Storage. Map tiles use Mapbox when `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is configured.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and set the Supabase project URL and publishable key. Set `SUPABASE_SECRET_KEY` only in server environments. Set a URL-restricted Mapbox public token for map tiles.
3. Start local Supabase with `npx supabase start`.
4. Apply the schema and policies with `npx supabase db reset`.
5. Start Next.js with `npm run dev`.

The schema is in `supabase/migrations`. `supabase/config.toml` enables public signup. Apply `202611150001_actor_registration.sql` to store the requested actor role with a pending account status. For hosted Supabase, enable new-user signup in Authentication settings, enable email confirmation, and allow your app origin plus `/auth/confirm` in redirect URLs. For a hosted project, link it with `npx supabase link --project-ref your-project-ref` then apply migrations with `npx supabase db push`. Add the same environment variables in your hosting provider.

## First administrator

Create the initial Auth user in the Supabase Dashboard. Copy that user's UUID and run `select public.bootstrap_first_admin('<user-uuid>');` in the project SQL editor. Then sign in and invite the rest of the team or approve registrations from User Management. All four actors can register; new profiles remain pending until an active administrator approves them. Pending Admin registrations can be activated, but existing administrator roles remain protected. Do not use the service secret in client code. The first-admin function is intentionally not executable by API roles.

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

## Registration succeeds but login says pending

Registration creates a pending profile. An existing active administrator can approve it in User Management. For the reported local test account, run `supabase/activate_test_account.sql` in the Supabase SQL Editor; it activates only `test1@gmail.com` and preserves its role. Then sign in again. The activation script sets transaction-local service-role claims so the profile guard permits this owner-run maintenance update; the claims reset on commit.

For the first administrator, apply `202611150002_first_admin_bootstrap.sql`, then run `select public.bootstrap_first_admin('<auth-user-uuid>');` as the database owner in the SQL Editor. A pending Admin registration no longer blocks bootstrap. The application cannot activate accounts without an authorized administrator or database access.

## Bicol wildfire analysis

Open **Wildfire analysis** in the sidebar or the **Open wildfire analysis** card on Overview. Every actor can open the analysis workspace; Admin and Emergency Responder accounts can submit model requests.

The pre-fire tab supports Bicol province selection, location/source metadata, CSV or JSON observations, header templates, validated Daily or 14-day LSTM inputs, and saved outputs. Coordinates are optional for region-wide datasets; when used, both coordinates must be supplied. Location metadata is stored with the request but is not sent to the model because the upstream schemas do not accept coordinates. The result is the probability of high hotspot activity, not the probability of a new wildfire igniting.

`docs/firecase-openapi.json` is a snapshot retrieved from https://firecase.onrender.com/openapi.json on 2026-11-15. The service documents `/health`, `/predict`, and `/predict/lstm`, but no dataset retrieval, spread prediction, or recovery prediction endpoint. Weather units and Bicol training coverage are not specified in the schema. Supply observations with the training dataset's units and aggregation; do not fill missing measurements with zeros. The during/post tabs show accessible incident/recovery case records with honest empty states. There is no automatic satellite ingestion.

Set `SUPABASE_SECRET_KEY` on the server to save predictions and apply `202611140002_fire_predictions.sql` if the predictions table is missing. The analysis page checks service readiness and reports missing server saving configuration. The secret must never use a `NEXT_PUBLIC_` prefix. Admin reads now use their authenticated database session and existing RLS rather than requiring a service secret.

Run `node --test tests/prediction-dataset.test.cjs` for importer and API-contract validation.

## Importing the local research dataset into Supabase

Run from the FireCase project directory:

```powershell
python scripts/prepare-research-data.py --source "C:\Users\Harvi\Desktop\scrape\Data"
node scripts/upload-research-data.mjs          # preview
node scripts/upload-research-data.mjs --apply  # upload and verify
```

The scripts never change the source files. Preparation extracts 4,462 vegetation/unknown-type FIRMS observations inside the simplified Bicol Region boundary, normalizes UTC timestamps, preserves original columns and filenames, and uses deterministic observation identities. The boundary's attribution and license are in `data/reference/README.md`. Archived observations take precedence over duplicate near-real-time observations. MODIS numeric confidence is retained in metadata; VIIRS categorical confidence is mapped to the schema. Records are upserted into `public.satellite_detections`; they are not converted into confirmed or active wildfire cases.

The original 1,826 weather days and the 778 processed training-input days are stored as JSON in the **private** `research-datasets` bucket under `bicol-v1/`, with a source manifest and Bicol boundary. No database migration is required for this import. The importer checks remote counts and logs completion in `satellite_sync_logs`. Rerunning uses upserts rather than creating duplicates. Generated data is excluded from Git under `.local-data/`. The server secret is read from `.env` and is never written into data artifacts.

Open **Wildfire analysis** to view source counts, dates, and historical hotspot markers. Admin and Emergency Responder accounts can choose a historical date and click **Load stored Daily/LSTM inputs**; Daily inputs use the preceding seven days excluding the observation date, and LSTM uses 14 consecutive days. Then choose **Predict and save**. This preserves the training dataset's Philippines-wide aggregation and labels it as historical evaluation. Do not relabel these inputs as Bicol-only or current conditions. Weather CSV coordinates/aggregation are unspecified. Rainfall and soil-moisture NetCDF files are inventoried but not ingested; the burned-area folder contains a download manifest rather than actual HDF measurements, so no post-fire recovery values are created.

`/api/datasets` requires an active account and exposes only the imported research reference assets. Loading model inputs additionally requires Admin or Emergency Responder. Operational database reads retain their existing RLS rules.

Validation: `node --test tests/*.test.cjs` and `python -m unittest discover -s tests -p "test_*.py"`.
