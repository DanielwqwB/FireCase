
from pathlib import Path
import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[1] / "Data"

print("FIRECASE DATASET INSPECTION")
print("=" * 60)

for file in DATA_DIR.rglob("*"):
    if not file.is_file():
        continue

    if file.suffix.lower() != ".csv":
        continue

    print(f"\nFILE: {file.relative_to(DATA_DIR)}")

    try:
        df = pd.read_csv(file, nrows=1000, low_memory=False)

        print("Columns:", df.columns.tolist())
        print("Sample rows:", len(df))
        print("Missing values:")
        print(df.isnull().sum().to_string())
        print("\nFirst 3 rows:")
        print(df.head(3).to_string(index=False))

    except Exception as e:
        print("ERROR:", e)

print("\nInspection completed.")
