import unittest
from pathlib import Path

import pandas as pd
from fastapi.testclient import TestClient

from api.main import app

ROOT = Path(__file__).resolve().parents[1]


class PredictionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        daily = pd.read_csv(ROOT / "processed/FireCase_Merged_Daily_2021_2025.csv")
        daily = daily.sort_values("date").reset_index(drop=True)
        saved = pd.read_csv(ROOT / "models/FireCase_2025_Predictions.csv")
        cls.expected = saved.iloc[0]
        index = daily.index[daily["date"] == cls.expected["date"]][0]
        row = daily.loc[index]
        weather_columns = ["CLDTMP", "PS", "T2M", "TO3", "TQV", "TS", "U10M", "U50M", "V10M", "V50M"]
        cls.payload = {key: float(row[key]) for key in weather_columns}
        cls.payload.update(
            observation_date=row["date"],
            hotspots_today=int(row["total_hotspots"]),
            hotspots_prev7_mean=float(daily.loc[index - 7:index - 1, "total_hotspots"].mean()),
        )

    def test_prediction_matches_training_export(self):
        with TestClient(app) as client:
            self.assertEqual(client.get("/health").json(), {"status": "ok", "model_loaded": True, "lstm_model_loaded": True})
            self.assertEqual(client.get("/docs").status_code, 200)
            response = client.post("/predict", json=self.payload)
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(result["predicted_class"], int(self.expected["predicted"]))
        self.assertAlmostEqual(result["high_activity_probability"], float(self.expected["high_activity_probability"]))
        expected_date = (pd.Timestamp(self.payload["observation_date"]) + pd.Timedelta(days=1)).date().isoformat()
        self.assertEqual(result["prediction_date"], expected_date)

    def test_rejects_invalid_inputs(self):
        with TestClient(app) as client:
            for update in ({"hotspots_today": -1}, {"hotspots_prev7_mean": -1}, {"observation_date": "invalid"}, {"T2M": "NaN"}, {"unexpected": 1}):
                with self.subTest(update=update):
                    self.assertEqual(client.post("/predict", json={**self.payload, **update}).status_code, 422)
            self.assertEqual(client.post("/predict", json={}).status_code, 422)

    def test_lstm_prediction_and_validation(self):
        daily = pd.read_csv(ROOT / "processed/FireCase_Merged_Daily_2021_2025.csv").sort_values("date").reset_index(drop=True)
        saved = pd.read_csv(ROOT / "models/FireCase_LSTM_2025_Predictions.csv")
        expected = saved.iloc[0]
        index = daily.index[daily["date"] == expected["date"]][0]
        observations = []
        for _, row in daily.iloc[index - 13:index + 1].iterrows():
            item = {key: float(row[key]) for key in self.payload if key not in (
                "observation_date", "hotspots_today", "hotspots_prev7_mean"
            )}
            item.update(observation_date=row["date"], total_hotspots=int(row["total_hotspots"]))
            observations.append(item)
        with TestClient(app) as client:
            response = client.post("/predict/lstm", json={"observations": observations})
            self.assertEqual(response.status_code, 200, response.text)
            result = response.json()
            self.assertEqual(result["predicted_class"], int(expected["predicted"]))
            self.assertAlmostEqual(result["high_activity_probability"], float(expected["probability"]), places=5)
            self.assertEqual(result["observation_date"], expected["date"])
            self.assertEqual(result["prediction_date"], (pd.Timestamp(expected["date"]) + pd.Timedelta(days=1)).date().isoformat())
            self.assertEqual(result["high_activity_hotspot_threshold"], 145.25)
            invalid_sequences = [[], observations[:-1], list(reversed(observations)),
                                 [observations[0], *observations[:-1]],
                                 [{**observations[0], "total_hotspots": -1}, *observations[1:]],
                                 [{**observations[0], "T2M": "NaN"}, *observations[1:]]]
            for sequence in invalid_sequences:
                self.assertEqual(client.post("/predict/lstm", json={"observations": sequence}).status_code, 422)
            model = app.state.lstm_model
            try:
                app.state.lstm_model = None
                self.assertEqual(client.post("/predict/lstm", json={"observations": observations}).status_code, 503)
                self.assertEqual(client.post("/predict", json=self.payload).status_code, 200)
            finally:
                app.state.lstm_model = model


if __name__ == "__main__":
    unittest.main()
