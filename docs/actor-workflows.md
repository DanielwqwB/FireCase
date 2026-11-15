# Actor-specific workflows

The signed-in overview now selects a separate workspace component for each actor. Admin keeps account, area and system management. Firefighters no longer receive the general analysis/tools navigation.

## Emergency Responder

The response dashboard places a ranked watch/active case queue beside the operational map and seven-day risk panel. Score ties sort by earliest detection and unknown scores follow scored cases. Selecting an area filters the queue and map boundaries. Map layers include hotspots, watch-area boundaries, nearby residential buildings, schools, shelters, roads, water and stations. Live shelters are not assumed to be designated evacuation centers; mapped roads have no verified passability field.

Detected-versus-reported counts accessible cases and counts ground verification once per confirmed/dismissed case. Requested confirmations do not inflate the reported count. The embedded alert composer saves a draft, requires review, then exposes the configured delivery provider. The seven-day barangay risk chart and anomaly baseline are scripted and visibly labelled when demo mode is enabled; the existing activity AI is not represented as a barangay ignition model.

## Firefighter

The overview and case page show one selected incident, its coordinates, satellite FRP (explicitly an intensity proxy), first detection and latest linked satellite observation. The cases API derives FRP/source/pass time from accessible case-detection links; missing observations stay missing.

The incident screen includes 6/12/24-hour spread footprints, demo wind direction, nearest resource groups, and a field-report form with three incident status choices, optional photo and remarks. Submitting a real report uses the existing field-report API/RPC and refreshes the case verification. It does not silently change the responder-controlled case lifecycle. A demo report updates the shared sample case data only.

**Offline kit:** choose Download case while online, then Open offline screen. It saves the selected incident and loaded access notes in IndexedDB, plus nine generated schematic terrain tiles in Cache Storage. A service worker serves the downloaded screen during an offline reload. The tiles are explicitly demo illustrations, not Mapbox satellite downloads or navigation data. No API, auth response or session token is cached. The active download is selected by a tab-scoped session marker. Device storage may be evicted by the browser.

Offline photo/status reports remain local drafts. Reconnect and use Submit saved report in the signed-in firefighter screen; there is no automatic transmission. Failed/uncertain submissions require checking existing reports before retry. Sign-out removes the active user's downloaded kit. Remove download deletes the selected user's incident and drafts. Generated schematic tiles contain no case records.

## Land Manager

The land overview is organized around a selected accessible monitoring area, one calendar row per year with the current year highlighted, same-month seasonal comparisons, safe-burn scenario, closed/recovery-case scar view, per-scar vegetation curve, and a 72-hour rainfall watch. Calendar cells count recorded cases, not every satellite hotspot. An empty cell means no records, not proof that no fire occurred.

Seasonal comparisons use earlier recorded years through the same calendar month; repeated burned-area measurements count only the latest measurement per case. Unknown hectares and missing baselines stay unknown. Actual scar geometry is not in the current schema: live mode shows the case point plus sourced hectares/severity; demo mode overlays a synthetic boundary with an explicit label. Vegetation points come from recovery observations. Rainfall prompts a review of slope/drainage and local advisories; no flood or landslide hazard model is claimed.

## Demonstration

With `FIRECASE_DEMO_MODE=true`, visit `/demo`. This page has separate actor tabs and shared sample records; it makes no operational database mutations and sends no emails. Request a confirmation as the responder, submit a firefighter report, then switch back to see the verified count increase. Land management includes sample multiyear histories and sourced-as-demo recovery curves. The public preview returns 404 when demo mode is disabled.

The `/demo` page is a sample walkthrough, not an authentication bypass. Signed-in pages still use the existing server role checks and Supabase RLS.

## Verification

```powershell
node --test tests/role-workspaces.test.cjs tests/operations-api.test.cjs tests/workspace-tools.test.cjs tests/prediction-dataset.test.cjs tests/research-input.test.cjs
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

For the browser walkthrough, enable demo mode and run a local server on port 3010. With Microsoft Edge installed:

```powershell
npm.cmd exec --yes --package=playwright -- node tests/role-workspaces.browser.cjs
```

Set `FIRECASE_TEST_URL` to use another server address. Browser checks cover the actor layouts, report-count handoff, reviewed demo alert, spread/wind, calendar/rain panel, narrow viewport, offline reload and local report submission. Review screenshots are written to ignored `artifacts/`.

## Populating signed-in dashboards

`node scripts/seed-demo-data.cjs` previews a synthetic Supabase dataset using the server credentials in the ignored local `.env`. It requires `FIRECASE_DEMO_MODE=true`. Add `--apply` to insert it. This is additive: stable UUIDs and ignore-on-conflict preserve all existing rows, including edits made to earlier sample cases. Existing auth users are reused; no accounts, invitations or emails are created. Every active land manager receives assignments to the three sample areas. Historical NASA detections are left unchanged; synthetic detections use `source=other` and `source_metadata.synthetic=true`.

Sample cases use `DEMO-ACTIVE-*` / `DEMO-HIST-*` references, areas use `[DEMO]` names, and reports, warnings and recovery observations explicitly say synthetic/demo. Warning rows are drafts and are never automatically sent. This fills the real authenticated case/report/calendar/recovery workflows, separately from the isolated `/demo` preview. It does not manufacture stored AI predictions. Running it against the shared project makes the sample records available to the deployed frontend immediately; refresh the app. Land management initially selects an area containing case records.

## Task navigation and record lists

Recovery monitoring now contains only scar selection, the scar map, regrowth and rain watch; burn planning remains in Overview. Fire history has only the calendar and seasonal comparison. Selecting Record observation opens the recovery-entry form with the selected case prefilled. Page changes return to the top instead of inheriting the previous scroll position. Map layer controls and measurement provenance are available in expandable sections. Tools are divided into Map & resources, Weather & planning, Records & export, and Assistant. Long record tables show ten records per page, with explicit Previous/Next controls. The desktop case browser remains bounded to the viewport.

`npm.cmd exec --yes --package=playwright -- node tests/usability.browser.cjs` checks these task flows, including the direct measurement form and mobile layout.
