from contextlib import asynccontextmanager
from datetime import date, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, Request
from pydantic import BaseModel, ConfigDict, Field

MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "FireCase_RandomForest_PCA.joblib"


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not MODEL_PATH.is_file():
        raise RuntimeError("Model missing. Run python Scripts/04_train_model.py first.")
    app.state.bundle = joblib.load(MODEL_PATH)
    yield
    del app.state.bundle


app = FastAPI(title="FireCase API", version="1.0.0", lifespan=lifespan)


class PredictionInput(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    observation_date: date
    CLDTMP: float
    PS: float
    T2M: float
    TO3: float
    TQV: float
    TS: float
    U10M: float
    U50M: float
    V10M: float
    V50M: float
    hotspots_today: int = Field(ge=0, strict=True)
    hotspots_prev7_mean: float = Field(
        ge=0, description="Mean daily hotspots for the seven days before observation_date, excluding today."
    )


class PredictionOutput(BaseModel):
    observation_date: date
    prediction_date: date
    predicted_class: int
    high_activity: bool
    high_activity_probability: float
    high_activity_hotspot_threshold: float


@app.get("/")
def root():
    return {"name": "FireCase API", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health(request: Request):
    return {"status": "ok", "model_loaded": hasattr(request.app.state, "bundle")}


@app.post("/predict", response_model=PredictionOutput)
def predict(payload: PredictionInput, request: Request):
    bundle = request.app.state.bundle
    values = payload.model_dump()
    weather = pd.DataFrame([values], columns=bundle["weather_columns"])
    transformed = bundle["pca"].transform(bundle["scaler"].transform(weather))
    angle = 2 * np.pi * payload.observation_date.timetuple().tm_yday / 365.25
    values.update(season_sin=np.sin(angle), season_cos=np.cos(angle))
    features = np.column_stack([
        transformed, [[values[column] for column in bundle["extra_columns"]]]
    ])
    model = bundle["model"]
    predicted = int(model.predict(features)[0])
    positive_index = list(model.classes_).index(1)
    probability = float(model.predict_proba(features)[0, positive_index])
    return PredictionOutput(
        observation_date=payload.observation_date,
        prediction_date=payload.observation_date + timedelta(days=int(bundle["prediction_horizon_days"])),
        predicted_class=predicted,
        high_activity=bool(predicted),
        high_activity_probability=probability,
        high_activity_hotspot_threshold=float(bundle["threshold"]),
    )
