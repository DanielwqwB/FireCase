
from pathlib import Path
import pandas as pd

root = Path(__file__).resolve().parents[1]
df = pd.read_csv(
    root / "processed" / "FireCase_Merged_Daily_2021_2025.csv",
    parse_dates=["date"]
)

print("Rows:", len(df))
print("Date range:", df.date.min(), df.date.max())

print("\nHotspot count statistics:")
print(df["total_hotspots"].describe(
    percentiles=[.25, .5, .75, .90, .95, .99]
))

print("\nTarget distribution:")
print(df["hotspot_detected"].value_counts())

print("\nMonthly hotspot counts:")
print(
    df.set_index("date")["total_hotspots"]
      .resample("MS").sum()
      .to_string()
)

print("\nDays with zero detections by year:")
print(
    df.assign(year=df.date.dt.year)
      .groupby("year")["hotspot_detected"]
      .apply(lambda x: (x == 0).sum())
)

print("\nMissing weather values:")
print(
    df[["T2M_C", "PS", "TQV",
        "Wind10m_speed_m_s"]]
      .isna().sum()
)
