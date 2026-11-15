# Workspace tools

Open **Map tools & exports** in any role's navigation. Tools operate on records already accessible to the signed-in user. External lookups require an active account.

## Available without new credentials

- Draw points, polygons, or rectangles. Save named views in browser storage scoped by user ID. Saved views and read-notification state persist in that browser, not across devices. Admins can create shared monitoring areas from drawn polygons using the existing area API.
- Toggle satellite/street tiles, hotspots, cases, boundaries, and resource categories. Import sourced Polygon/MultiPolygon GeoJSON for burn scars or other analysis overlays (2 MB maximum); imported overlays last for the current session and can be exported.
- Find mapped water features, major roads, fire stations, schools and shelters within 5 km using OpenStreetMap's Overpass API. Results are not verified evacuation centers or confirmed firefighting resources. Distances are straight-line to the mapped feature center, not travel distances. Coverage and provider availability vary. Reference: https://dev.overpass-api.de/output_formats.html
- Fetch seven days of weather forecasts with Open-Meteo; display temperature, relative humidity, wind speed, and precipitation. Manila timestamps, °C, %, km/h and mm. The app uses the public non-commercial endpoint; commercial deployment must use a suitable provider plan. Reference: https://open-meteo.com/en/docs
- Export accessible cases (with area/date filters), monitoring areas, loaded resources, weather, and recovery measurements. CSV cells are quoted and formula-like text is neutralized. GeoJSON is available for geographic datasets.
- Read and mark notifications from loaded case, warning, audit and connection records. This is an in-app feed; no OS push service is configured.
- Ask the local assistant about loaded records. It uses deterministic intent matching and does not call an LLM or invent resource data.
- Admins and Land Managers can add sourced recovery measurements for an accessible case. Vegetation indices range from −1 to 1; burned area is in hectares. The API checks account role and case visibility with the signed-in Supabase client before inserting using the existing server secret. No database migration is required. Separate vegetation lines are drawn for separate cases; no measurements are synthesized.

## Classroom demo mode

Set `FIRECASE_DEMO_MODE=true` in `.env` and restart Next.js. On Render add the same variable to the frontend Web Service and redeploy. Spread and burn requests then use built-in scripted scenarios, with no external provider URLs or operation keys. Choose Mild, Windy or Hot and dry in Map tools, then run the 6/12/24-hour simulation or burn scenario. The perimeter is synthetic geometry; GO/CAUTION/NO-GO are illustrative labels, not permission to burn. Confidence is not invented. Demo responses are not saved as AI predictions or delivered as alerts. Weather, resources and Resend remain their existing live integrations.

Your separate AI project at `C:/Users/Harvi/Desktop/scrape` serves Random Forest `/predict` and LSTM `/predict/lstm` next-day activity predictions. Keep `FIRECASE_PREDICTION_API_URL` pointing to that API; demo mode does not replace either model. Set demo mode to `false` before connecting operational spread or burn providers.

## Optional production integrations

Set these environment variables on the server. Never prefix secrets with `NEXT_PUBLIC_`. The existing Daily/LSTM service predicts fire activity; it cannot supply a fire-spread perimeter, burn approval, or seven days of ignition probabilities.

### Fire-spread perimeters

`FIRECASE_SPREAD_API_URL` is a complete HTTPS endpoint. FireCase sends:

```json
{"latitude":13.1,"longitude":124.1,"hours":6}
```

`hours` is 6, 12 or 24. If set, `FIRECASE_OPERATIONS_API_KEY` is sent as a Bearer token. The provider must respond:

```json
{
  "model":"Your validated spread model",
  "issuedAt":"2026-11-15T01:00:00Z",
  "validAt":"2026-11-15T07:00:00Z",
  "hours":6,
  "geometry":{"type":"Polygon","coordinates":[[[124.10,13.10],[124.12,13.10],[124.12,13.12],[124.10,13.10]]]},
  "confidence":0.8,
  "notes":"Provider-specific limitations and input conditions."
}
```

Timestamps above illustrate the contract; use current timestamps. FireCase rejects expired forecasts, invalid polygons and mismatched horizons. Coordinates are longitude, latitude. Supply a trained and validated provider; no spread model is included in this repository.

### Authorized burn advisories

Set `FIRECASE_BURN_API_URL` to a complete HTTPS endpoint. It receives the same location request and optional Bearer token. Return:

```json
{
  "source":"Local advisory service",
  "authority":"Responsible burn authority",
  "issuedAt":"2026-11-15T01:00:00Z",
  "validUntil":"2026-11-15T07:00:00Z",
  "status":"no-go",
  "reason":"Current advisory text and applicable conditions."
}
```

`status` must be `go`, `caution`, or `no-go`. Expired advisories are rejected. FireCase does not turn weather thresholds into burn authorization. Obtaining a real advisory source remains a deployment prerequisite.

### Warning delivery

Recommended direct email integration: set `RESEND_API_KEY`, `FIRECASE_ALERT_FROM` (a sender at your verified domain), and `FIRECASE_ALERT_TO` (1?50 comma-separated approved recipient addresses). No webhook is required for Resend. The app uses the warning UUID as the idempotency key and limits email sending to 23 hours after draft creation because Resend keeps idempotency keys for 24 hours. Create and review a new warning when an old draft expires; reviewing the old draft again does not reset its email sending window. Keep recipient configuration stable while retrying a warning. Resend's dashboard owns final delivery receipts. Reference: https://resend.com/docs/dashboard/emails/idempotency-keys

The webhook option below takes precedence if configured.

Set `FIRECASE_ALERT_WEBHOOK_URL` to a complete HTTPS endpoint and `FIRECASE_ALERT_WEBHOOK_TOKEN` to its Bearer token. Only the Emergency Responder who owns a reviewed warning can send it. The provider owns recipient configuration (for example an operations center mailing list or SMS group); the app does not accept arbitrary webhook URLs or recipients from a browser request.

The server POSTs `{id, caseId, title, message, reviewedAt, senderId}` and `Idempotency-Key: <warning UUID>`. The provider **must persist and deduplicate this key** before delivery. A 2xx response means accepted by the provider, not confirmed delivered to recipients. The provider must maintain delivery receipts, retries and an audit trail. Warning editing after review is not supported; create a new draft for a new message.

No live messages are sent by installation, builds or tests. Sending is initiated by the user's **Send reviewed warning** button.

## Validation

```sh
node --test tests/workspace-tools.test.cjs tests/operations-api.test.cjs
npm run typecheck
npm run lint
npm run build
```

Manual account checks: each role can open Tools; only Admin can create shared areas; only Admin/Land Manager can save recovery measurements; only the owning Emergency Responder can deliver a reviewed warning. Verify resource/weather availability with your deployed account, browser-storage persistence, export contents, and Mapbox URL restrictions. Optional provider end-to-end checks require real service URLs and credentials.
