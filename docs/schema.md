# FireCase data model

The initial migration is `supabase/migrations/202611140001_initial_schema.sql`. PostGIS stores monitoring area boundaries; application tables use UUID keys and timestamps. Row Level Security is enabled on all application tables.

```mermaid
erDiagram
  profiles ||--o{ area_assignments : manages
  monitoring_areas ||--o{ area_assignments : assigned
  monitoring_areas ||--o{ wildfire_cases : contains
  satellite_detections ||--o{ case_detections : matched
  wildfire_cases ||--o{ case_detections : has
  wildfire_cases ||--o{ verification_requests : requests
  profiles ||--o{ verification_requests : creates
  wildfire_cases ||--o{ field_reports : receives
  profiles ||--o{ field_reports : submits
  wildfire_cases ||--o{ case_status_history : tracks
  wildfire_cases ||--o{ fire_warnings : warns
  wildfire_cases ||--o{ recovery_records : recovers
  profiles ||--o{ audit_logs : performs
  profiles { uuid id PK; text email; text full_name; app_role role; account_status account_status }
  monitoring_areas { uuid area_id PK; text area_name; geography boundary; boolean is_active }
  area_assignments { uuid area_id FK; uuid user_id FK; uuid assigned_by FK }
  satellite_detections { uuid detection_id PK; timestamptz detection_time; geography location; text source }
  wildfire_cases { uuid case_id PK; text case_reference; uuid area_id FK; case_lifecycle lifecycle_status; verification_status verification_status }
  verification_requests { uuid request_id PK; uuid case_id FK; uuid requested_by FK; verification_request_status request_status }
  field_reports { uuid report_id PK; uuid case_id FK; uuid submitted_by FK; text photo_path; incident_status incident_status }
  case_status_history { uuid history_id PK; uuid case_id FK; uuid changed_by FK }
  fire_warnings { uuid warning_id PK; uuid case_id FK; uuid created_by FK; warning_status warning_status }
  recovery_records { uuid recovery_id PK; uuid case_id FK; date observation_date; numeric vegetation_index }
  audit_logs { uuid audit_id PK; uuid actor_id FK; text action; jsonb old_data; jsonb new_data }
```

`field-reports` is a private Storage bucket. Photos are accessible through short-lived signed URLs after the caller's report access is checked. Audit logs and satellite observations are read-only to authenticated application clients; privileged ingestion should use a trusted server-side worker.
