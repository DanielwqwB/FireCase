# Usability audit — 15 November 2026

## Navigation and reading

- Removed the sidebar. Desktop uses role-specific top navigation; mobile uses a labelled page selector.
- Page selection is reflected in `?page=...`; browser Back and refresh restore an allowed page for the signed-in actor.
- Increased primary text, labels and controls. Darkened low-contrast text, buttons and status badges.
- Reserved space for statistic icons so they cannot overlap labels or values.
- Task tabs replace long dashboards: responders have Today, Ground checks, Risk outlook and Prepare alert; firefighters have Situation, Access & directions, Submit report and Offline kit.
- Land Overview contains seasonal comparison and burn planning. Fire history and Recovery have their own pages.
- Admin Overview focuses on accounts, assignments and recent activity rather than operational maps and recovery panels.
- Lists use pagination, with direct page selection. Mobile tables use smaller page sizes and area cards show one at a time. Short laptop screens show fewer cases per page.

## Page coverage

| Actor | Checked navigation pages |
| --- | --- |
| Admin | Overview, Case summaries, User management, Monitoring areas, System activity, Wildfire analysis, Map tools & exports |
| Emergency Responder | Response dashboard, Case queue, Fire monitoring map, Warnings, Wildfire analysis, Map tools & exports |
| Firefighter | Active incident, Field reports |
| Land Manager | Land dashboard, My areas, Burning calendar, Recovery monitoring, Wildfire analysis, Map tools & exports |

All 21 pages were exercised at 1440×900, 1024×768 and 390×844, plus empty-data and failed-service states: **105 screen/state checks**. Checks cover headings, blank screens, runtime errors, sideways document overflow, long default pages, pagination size, and overlapping metric text/icons. The normal-page length limit is 1.75 viewports on desktop/tablet and 2.5 on mobile. Optional expanded source details and advanced manual input are separate interactions.

The desktop page sweep and the secondary flows were scanned with axe-core for WCAG 2 A/AA serious/critical violations, excluding third-party map internals. Authentication and offline screens were also scanned, including mobile. This automated check is not a claim of complete accessibility certification.

## Functional checks

Stateful, isolated HTTP fixtures verify these client workflows without changing live accounts, records or sending mail:

- Create/edit a user; open and dismiss the area editor.
- Browser Back and refresh restore navigation.
- Load stored model inputs, run a prediction, open its result, and navigate incident/recovery records.
- Request ground confirmation; save, review and submit a warning to a mocked delivery endpoint.
- Submit a firefighter status report and refresh its case data.
- Open activity for the correct land area.
- Open a recovery-entry form with the selected scar; save a measurement, return to Recovery, and see the refreshed source.
- Switch tool categories, ask the local assistant, and download a CSV.
- Sign-in/password visibility, signup validation, missing email-confirmation code recovery, and offline report entry.
- The separate actor-demo walkthrough verifies report-count handoff, spread/wind controls, calendar/rain panels, offline reload, local draft storage and later submission.

## Error handling

Loading no longer briefly renders an empty actor dashboard. Failed data loading offers Retry loading. Network failures and timeouts use actionable messages. Prediction service status can be checked again, and a known-unavailable model cannot be submitted. Map errors preserve access to incident coordinates. Recovery submissions refresh the parent dashboard before returning to it.

## Reproduce

Start a local server on port 3010 with demo mode enabled. Browser scripts use installed Microsoft Edge; override `FIRECASE_TEST_URL` for another local address.

```powershell
npm.cmd exec --yes --package=playwright --package=axe-core -- node tests/all-pages-audit.browser.cjs
npm.cmd exec --yes --package=playwright --package=axe-core -- node tests/actor-actions.browser.cjs
npm.cmd exec --yes --package=playwright --package=axe-core -- node tests/auth-pages-audit.browser.cjs
npm.cmd exec --yes --package=playwright -- node tests/case-layout.browser.cjs
npm.cmd exec --yes --package=playwright -- node tests/usability.browser.cjs
npm.cmd exec --yes --package=playwright -- node tests/role-workspaces.browser.cjs
node --test tests/services.test.cjs tests/demo-seed.test.cjs tests/role-workspaces.test.cjs tests/operations-api.test.cjs tests/workspace-tools.test.cjs tests/prediction-dataset.test.cjs tests/research-input.test.cjs
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Detailed JSON reports and review screenshots are written to ignored `artifacts/`. The browser audit uses mock API responses and map tiles; live provider availability, email deliverability, model accuracy and database authorization are not established by those client tests. Separate API/data tests check validation and access restrictions.
