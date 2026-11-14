
from pathlib import Path
import numpy as np
import pandas as pd
import joblib

from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    average_precision_score,
    roc_auc_score
)

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "processed" / "FireCase_Merged_Daily_2021_2025.csv"
OUT = ROOT / "models"
OUT.mkdir(exist_ok=True)

# 1. LOAD DATA
df = pd.read_csv(INPUT, parse_dates=["date"])
df = df.sort_values("date").reset_index(drop=True)

weather_cols = [
    "CLDTMP", "PS", "T2M", "TO3", "TQV",
    "TS", "U10M", "U50M", "V10M", "V50M"
]

# 2. CREATE NEXT-DAY TARGET
df["next_day_hotspots"] = df["total_hotspots"].shift(-1)

# Use today's hotspot activity as a predictor
df["hotspots_today"] = df["total_hotspots"]

# Previous seven days, excluding today
df["hotspots_prev7_mean"] = (
    df["total_hotspots"].shift(1)
    .rolling(7, min_periods=7).mean()
)

# Seasonal information available before prediction
day = df["date"].dt.dayofyear
df["season_sin"] = np.sin(2 * np.pi * day / 365.25)
df["season_cos"] = np.cos(2 * np.pi * day / 365.25)

# Remove incomplete feature and target rows
df = df.dropna(
    subset=weather_cols + [
        "next_day_hotspots",
        "hotspots_prev7_mean"
    ]
).copy()

# 3. CHRONOLOGICAL SPLIT
train = df[df["date"] < "2025-01-01"].copy()
test = df[df["date"] >= "2025-01-01"].copy()

if train.empty or test.empty:
    raise ValueError("Insufficient train/test observations")

# Threshold determined ONLY from training outcomes
threshold = train["next_day_hotspots"].quantile(0.75)

train["target"] = (
    train["next_day_hotspots"] > threshold
).astype(int)

test["target"] = (
    test["next_day_hotspots"] > threshold
).astype(int)

print("High-activity threshold:", threshold)
print("Training rows:", len(train))
print("Testing rows:", len(test))
print("Training positive rate:", train.target.mean())
print("Testing positive rate:", test.target.mean())

# 4. SCALE WEATHER ON TRAINING DATA ONLY
scaler = StandardScaler()
X_train_weather = scaler.fit_transform(train[weather_cols])
X_test_weather = scaler.transform(test[weather_cols])

# 5. PCA ON TRAINING DATA ONLY
pca = PCA(n_components=0.95)
X_train_pca = pca.fit_transform(X_train_weather)
X_test_pca = pca.transform(X_test_weather)

print("\nPCA components:", pca.n_components_)
print("Explained variance:",
      round(pca.explained_variance_ratio_.sum(), 4))

# 6. INCLUDE HISTORICAL ACTIVITY
extra = [
    "hotspots_today",
    "hotspots_prev7_mean",
    "season_sin",
    "season_cos"
]

X_train = np.column_stack([
    X_train_pca, train[extra].to_numpy()
])

X_test = np.column_stack([
    X_test_pca, test[extra].to_numpy()
])

y_train = train["target"]
y_test = test["target"]

# 7. TRAIN RANDOM FOREST
model = RandomForestClassifier(
    n_estimators=300,
    max_depth=8,
    min_samples_leaf=5,
    class_weight="balanced",
    random_state=42,
    n_jobs=-1
)

model.fit(X_train, y_train)

# 8. EVALUATE
pred = model.predict(X_test)
prob = model.predict_proba(X_test)[:, 1]

print("\nCLASSIFICATION REPORT")
print(classification_report(
    y_test, pred, zero_division=0
))

print("\nCONFUSION MATRIX")
print(confusion_matrix(y_test, pred))

print("\nMajority-class baseline accuracy:",
      max(y_test.mean(), 1 - y_test.mean()))

if y_test.nunique() == 2:
    print("PR-AUC:",
          average_precision_score(y_test, prob))
    print("ROC-AUC:",
          roc_auc_score(y_test, prob))
else:
    print("AUC unavailable: one test class")

# 9. EXPORT PREDICTIONS
results = test[[
    "date", "next_day_hotspots", "target"
]].copy()

results["predicted"] = pred
results["high_activity_probability"] = prob

results.to_csv(
    OUT / "FireCase_2025_Predictions.csv",
    index=False
)

# 10. SAVE MODEL AND PREPROCESSORS
joblib.dump({
    "model": model,
    "scaler": scaler,
    "pca": pca,
    "weather_columns": weather_cols,
    "extra_columns": extra,
    "threshold": threshold,
    "prediction_horizon_days": 1
}, OUT / "FireCase_RandomForest_PCA.joblib")

print("\nTraining completed!")
print("Files saved in models/")
