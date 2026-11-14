# FireCase API

Serve next-day high hotspot activity predictions using the saved Random Forest,
scaler, and PCA in `models/FireCase_RandomForest_PCA.joblib`.

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

To run the integration checks:

```powershell
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests
```
