# FireCase API

## Deploy to Render

The repository includes `render.yaml` and `.python-version` for deployment.
The Blueprint selects a paid 2 GB instance as a starting point for TensorFlow;
review the current price in Render before creating the service. Memory needs
depend on actual traffic. A single worker avoids loading multiple copies of
both models.

1. Push the project to GitHub, including all three runtime model artifacts:
   `models/FireCase_RandomForest_PCA.joblib`, `models/FireCase_LSTM.keras`, and
   `models/FireCase_LSTM_Preprocessing.joblib`.
2. In Render, choose **New > Blueprint**, connect your GitHub repository, and
   select the branch containing `render.yaml`. Review the plan and create it.
3. After deployment, open `https://<your-service>.onrender.com/health` and
   confirm both `model_loaded` and `lstm_model_loaded` are `true`.
4. Open `https://<your-service>.onrender.com/docs` to try both prediction endpoints.

For a manually created **Web Service**, use these same settings:

| Setting | Value |
| --- | --- |
| Runtime | Python |
| Root directory | Leave blank |
| Build command | `python -m pip install -r requirements.txt` |
| Start command | `python -m uvicorn api.main:app --host 0.0.0.0 --port $PORT --workers 1` |
| Health check path | `/health` |
| Python version | `3.13` via `.python-version` |

Copy the environment variables from `render.yaml` when creating a service
manually. Do not train models during deployment. The raw `Data/` downloads
are excluded from Git and are not needed to serve predictions. No persistent
disk or database is needed for the current API.

Deployment configuration follows the official Render guides:
[FastAPI](https://render.com/docs/deploy-fastapi),
[Python versions](https://render.com/docs/python-version), and
[Blueprints](https://render.com/docs/blueprint-spec).

## Local setup

Serve next-day high hotspot activity predictions using the saved Random Forest,
scaler, and PCA in `models/FireCase_RandomForest_PCA.joblib`.
The LSTM endpoint uses `models/FireCase_LSTM.keras` and
`models/FireCase_LSTM_Preprocessing.joblib` from `Scripts/05_train_lstm.py`.

From the project root:

```powershell
python -m pip install -r requirements.txt
python -m uvicorn api.main:app --reload
```

Open http://127.0.0.1:8000/docs to try the API. `GET /health` checks that the
model is loaded; `POST /predict` returns a next-day classification and probability.
The model loads once at startup. If it is missing, run
`python Scripts/04_train_model.py` before starting the API.

Example JSON body for `POST /predict`:

```json
{
  "observation_date": "2025-01-01",
  "CLDTMP": 250.0,
  "PS": 100000.0,
  "T2M": 298.0,
  "TO3": 260.0,
  "TQV": 40.0,
  "TS": 299.0,
  "U10M": 2.0,
  "U50M": 3.0,
  "V10M": -1.0,
  "V50M": -2.0,
  "hotspots_today": 10,
  "hotspots_prev7_mean": 8.5
}
```

Use weather values with the same units and aggregation as the training CSV.
The example values only illustrate the request format. `observation_date` is
the date of the supplied weather and today's hotspot count. Supply the mean
hotspot count for the preceding seven days, excluding the observation date.
Seasonal features are calculated automatically using the training formula.

`high_activity` means predicted next-day hotspot counts exceed the training
threshold returned in `high_activity_hotspot_threshold`. This model classifies
regional daily hotspot activity; it does not predict an exact hotspot count
or individual fire locations. Restart the API after retraining to load the new model.

## LSTM predictions

`POST /predict/lstm` accepts an `observations` array containing exactly 14
consecutive daily records, oldest first. Each record contains `observation_date`,
the same ten weather fields shown above, and a nonnegative integer
`total_hotspots`. Do not include the Random Forest fields `hotspots_today` or
`hotspots_prev7_mean`. Sequence length, feature order, scaler, and activity
threshold come from the saved LSTM preprocessing artifact.

The response has the same fields as `/predict`. Its `observation_date` is the
last input day and `prediction_date` is the following day. A probability of
at least 0.5 produces class 1. The LSTM training threshold is currently 145.25
hotspots, and is loaded independently of the Random Forest threshold.

Generate a request from your processed data in PowerShell:

```powershell
$days = Import-Csv processed/FireCase_Merged_Daily_2021_2025.csv | Select-Object -Last 14
$observations = @($days | ForEach-Object {
    $record = @{ observation_date = $_.date; total_hotspots = [int]$_.total_hotspots }
    foreach ($field in @('CLDTMP','PS','T2M','TO3','TQV','TS','U10M','U50M','V10M','V50M')) {
        $record[$field] = [double]$_.$field
    }
    $record
})
$body = @{ observations = $observations } | ConvertTo-Json -Depth 4
Invoke-RestMethod http://127.0.0.1:8000/predict/lstm -Method Post -ContentType 'application/json' -Body $body
```

Both models load at startup when their artifacts exist. If the LSTM artifacts
are absent, `/predict/lstm` returns HTTP 503 while Random Forest remains
available. `/health` includes `lstm_model_loaded`. TensorFlow is included in
`requirements.txt`; reinstall requirements when updating an existing setup.

To run the integration checks:

```powershell
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests
```
