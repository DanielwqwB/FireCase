
from pathlib import Path
import numpy as np
import pandas as pd
import tensorflow as tf
import joblib

from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    average_precision_score,
    roc_auc_score,
    accuracy_score,
    precision_score,
    recall_score,
    f1_score
)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "processed" / "FireCase_Merged_Daily_2021_2025.csv"
OUT = ROOT / "models"
OUT.mkdir(exist_ok=True)

tf.keras.utils.set_random_seed(42)

SEQUENCE_LENGTH = 14
THRESHOLD = 145.25

# Load the same dataset used for Random Forest
df = pd.read_csv(DATA, parse_dates=["date"])
df = df.sort_values("date").reset_index(drop=True)

features = [
    "CLDTMP", "PS", "T2M", "TO3", "TQV",
    "TS", "U10M", "U50M", "V10M", "V50M",
    "total_hotspots"
]

# Validate consecutive dates
date_gaps = df["date"].diff().dropna()
if not (date_gaps == pd.Timedelta(days=1)).all():
    raise ValueError("Daily dates are not consecutive")

df["next_day_hotspots"] = df["total_hotspots"].shift(-1)
df["target"] = (
    df["next_day_hotspots"] > THRESHOLD
).astype(int)

# Scale using 2023-2024 input data only
train_days = df["date"] < "2025-01-01"
scaler = StandardScaler()
scaler.fit(df.loc[train_days, features])

scaled = scaler.transform(df[features])

# Create 14-day sequences ending on the prediction date
X, y, dates = [], [], []

for i in range(SEQUENCE_LENGTH - 1, len(df) - 1):
    X.append(scaled[i-SEQUENCE_LENGTH+1:i+1])
    y.append(df.loc[i, "target"])
    dates.append(df.loc[i, "date"])

X = np.asarray(X, dtype=np.float32)
y = np.asarray(y, dtype=np.int32)
dates = pd.to_datetime(dates)

train_mask = dates < pd.Timestamp("2025-01-01")
test_mask = dates >= pd.Timestamp("2025-01-01")

X_train, y_train = X[train_mask], y[train_mask]
X_test, y_test = X[test_mask], y[test_mask]
test_dates = dates[test_mask]

# Chronological validation from the training period
split = int(len(X_train) * 0.8)

X_fit, X_val = X_train[:split], X_train[split:]
y_fit, y_val = y_train[:split], y_train[split:]

print("Training sequences:", len(X_fit))
print("Validation sequences:", len(X_val))
print("Testing sequences:", len(X_test))
print("Test positive cases:", y_test.sum())

# LSTM architecture
model = tf.keras.Sequential([
    tf.keras.layers.Input(
        shape=(SEQUENCE_LENGTH, len(features))
    ),
    tf.keras.layers.LSTM(32),
    tf.keras.layers.Dropout(0.25),
    tf.keras.layers.Dense(16, activation="relu"),
    tf.keras.layers.Dense(1, activation="sigmoid")
])

model.compile(
    optimizer=tf.keras.optimizers.Adam(
        learning_rate=0.001
    ),
    loss="binary_crossentropy"
)

model.summary()

early_stop = tf.keras.callbacks.EarlyStopping(
    monitor="val_loss",
    patience=12,
    restore_best_weights=True
)

# Train with class weighting
n_pos = max(int(y_fit.sum()), 1)
n_neg = max(int((y_fit == 0).sum()), 1)

weights = {
    0: 1.0,
    1: n_neg / n_pos
}

history = model.fit(
    X_fit, y_fit,
    validation_data=(X_val, y_val),
    epochs=100,
    batch_size=16,
    class_weight=weights,
    callbacks=[early_stop],
    verbose=1,
    shuffle=False
)

# Evaluate on untouched 2025 test data
prob = model.predict(X_test).ravel()
pred = (prob >= 0.5).astype(int)

print("\nLSTM CLASSIFICATION REPORT")
print(classification_report(
    y_test, pred, zero_division=0
))

print("\nCONFUSION MATRIX")
print(confusion_matrix(y_test, pred))

pr_auc = average_precision_score(y_test, prob)
roc_auc = roc_auc_score(y_test, prob)

print("PR-AUC:", round(pr_auc, 4))
print("ROC-AUC:", round(roc_auc, 4))

# Export predictions
results = pd.DataFrame({
    "date": test_dates,
    "target": y_test,
    "predicted": pred,
    "probability": prob
})

results.to_csv(
    OUT / "FireCase_LSTM_2025_Predictions.csv",
    index=False
)

# Save model and scaler
model.save(OUT / "FireCase_LSTM.keras")
joblib.dump({
    "scaler": scaler,
    "features": features,
    "sequence_length": SEQUENCE_LENGTH,
    "threshold": THRESHOLD
}, OUT / "FireCase_LSTM_Preprocessing.joblib")

# Save training history
pd.DataFrame(history.history).to_csv(
    OUT / "FireCase_LSTM_Training_History.csv",
    index=False
)

# Compare on matching test dates
rf_path = OUT / "FireCase_2025_Predictions.csv"

if rf_path.exists():
    rf = pd.read_csv(rf_path, parse_dates=["date"])
    comparison = results.merge(
        rf[["date", "target", "predicted",
            "high_activity_probability"]],
        on="date",
        suffixes=("_lstm", "_rf"),
        validate="one_to_one"
    )

    if not (
        comparison["target_lstm"]
        == comparison["target_rf"]
    ).all():
        raise ValueError("RF and LSTM targets differ")

    rows = []
    for name, pcol, scorecol in [
        ("Random Forest", "predicted_rf",
         "high_activity_probability"),
        ("LSTM", "predicted_lstm", "probability")
    ]:
        truth = comparison["target_lstm"]
        rows.append({
            "model": name,
            "accuracy": accuracy_score(
                truth, comparison[pcol]
            ),
            "precision": precision_score(
                truth, comparison[pcol],
                zero_division=0
            ),
            "recall": recall_score(
                truth, comparison[pcol],
                zero_division=0
            ),
            "f1": f1_score(
                truth, comparison[pcol],
                zero_division=0
            ),
            "pr_auc": average_precision_score(
                truth, comparison[scorecol]
            ),
            "roc_auc": roc_auc_score(
                truth, comparison[scorecol]
            )
        })

    table = pd.DataFrame(rows)
    print("\nMODEL COMPARISON")
    print(table.to_string(index=False))
    table.to_csv(
        OUT / "FireCase_Model_Comparison.csv",
        index=False
    )

print("\nLSTM training completed!")
