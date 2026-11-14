
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "Data"
OUT = ROOT / "processed"
OUT.mkdir(exist_ok=True)

START = pd.Timestamp("2023-11-15")
END = pd.Timestamp("2025-12-31")

# 1. Load weather
weather = pd.read_csv(
    DATA / "FireCase_Weather_2021_2025.csv"
)
weather["date"] = pd.to_datetime(weather["date_UTC"])
weather = weather[
    weather["date"].between(START, END)
].copy()

weather = weather.drop(
    columns=["date_UTC"]
).drop_duplicates("date")

# 2. Discover FIRMS archive files
files = sorted(DATA.rglob("fire_archive_*.csv"))
frames = []

for file in files:
    df = pd.read_csv(file, low_memory=False)

    required = {"acq_date", "latitude", "longitude",
                "acq_time", "satellite", "frp"}
    if not required.issubset(df.columns):
        print("Skipping invalid:", file)
        continue

    df["date"] = pd.to_datetime(
        df["acq_date"], errors="coerce"
    )

    df = df[df["date"].between(START, END)].copy()

    # Approximate Philippines bounding rectangle
    df = df[
        df["latitude"].between(4.5, 21.2)
        & df["longitude"].between(116.9, 126.6)
    ].copy()

    # Keep possible vegetation fires where type exists
    if "type" in df.columns:
        df = df[
            pd.to_numeric(df["type"], errors="coerce") == 0
        ].copy()

    df["sensor"] = (
        "VIIRS" if "SV-C2" in file.name
        else "MODIS"
    )
    frames.append(df)

if not frames:
    raise RuntimeError("No FIRMS archive data in 2021-2025")

fires = pd.concat(frames, ignore_index=True)

# Remove duplicate observations from overlapping archives
fires = fires.drop_duplicates(
    subset=[
        "sensor", "satellite", "acq_date",
        "acq_time", "latitude", "longitude"
    ]
)

print("FIRMS date coverage:")
print(fires.groupby("sensor")["date"].agg(["min", "max", "count"]))

# 3. Daily hotspot counts
counts = (
    fires.groupby(["date", "sensor"])
    .size()
    .unstack(fill_value=0)
)

for sensor in ["MODIS", "VIIRS"]:
    if sensor not in counts:
        counts[sensor] = 0

counts = counts.reset_index().rename(
    columns={
        "MODIS": "MODIS_count",
        "VIIRS": "VIIRS_count"
    }
)

# 4. Merge weather and observed fire detections
merged = weather.merge(counts, on="date", how="left")

for col in ["MODIS_count", "VIIRS_count"]:
    merged[col] = merged[col].fillna(0).astype(int)

merged["total_hotspots"] = (
    merged["MODIS_count"] + merged["VIIRS_count"]
)

merged["hotspot_detected"] = (
    merged["total_hotspots"] > 0
).astype(int)

merged = merged.sort_values("date")

# 5. Save results
merged.to_csv(
    OUT / "FireCase_Merged_Daily_2021_2025.csv",
    index=False
)
fires.to_csv(
    OUT / "FireCase_FIRMS_Cleaned.csv",
    index=False
)

print("\nMerged rows:", len(merged))
print("Date range:", merged.date.min(), merged.date.max())
print("Days with detections:",
      merged.hotspot_detected.sum())
print("Days without detections:",
      (merged.hotspot_detected == 0).sum())
print("\nSaved to processed/")
