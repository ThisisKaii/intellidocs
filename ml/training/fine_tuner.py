import argparse
import os
import pickle
from datetime import datetime, timezone
from typing import List

import duckdb
import pandas as pd
from sklearn.ensemble import RandomForestClassifier


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for fine-tuning."""
    parser = argparse.ArgumentParser(
        description="Fine-tune a formatting model for a specific user."
    )
    parser.add_argument("--user-id", required=True, help="Supabase user_id (UUID)")
    parser.add_argument(
        "--min-samples",
        type=int,
        default=3,
        help="Minimum rows required to train a user model",
    )
    parser.add_argument(
        "--min-labels",
        type=int,
        default=2,
        help="Minimum distinct labels required to train a user model",
    )
    return parser.parse_args()


def load_user_features(conn: duckdb.DuckDBPyConnection, user_id: str) -> pd.DataFrame:
    """Load formatting_features rows for one user."""
    query = """
    SELECT *
    FROM formatting_features
    WHERE user_id = ?
    """
    return conn.execute(query, [user_id]).fetchdf()


def select_feature_columns(frame: pd.DataFrame) -> List[str]:
    """Select numeric feature columns for training."""
    numeric_cols = []
    for col in frame.columns:
        if pd.api.types.is_numeric_dtype(frame[col]):
            if col not in ("window_start", "window_end", "last_event_ts"):
                numeric_cols.append(col)
    return numeric_cols


def train_user_model(frame: pd.DataFrame, feature_columns: List[str]) -> RandomForestClassifier:
    """Train a user-specific RandomForest model."""
    x_train = frame[feature_columns]
    y_train = frame["last_action"]

    model = RandomForestClassifier(
        n_estimators=150,
        max_depth=8,
        min_samples_split=2,
        min_samples_leaf=1,
        random_state=42,
    )
    model.fit(x_train, y_train)
    return model


def save_user_model(
    model: RandomForestClassifier,
    feature_columns: List[str],
    output_path: str,
) -> None:
    """Save the user-specific model to disk."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    payload = {
        "model": model,
        "feature_columns": feature_columns,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }

    with open(output_path, "wb") as handle:
        pickle.dump(payload, handle)


def main() -> None:
    """Fine-tune a model for one user using DuckDB features."""
    args = parse_args()
    duckdb_path = os.getenv("DUCKDB_PATH", "db/duckdb/behavior.duckdb")
    output_dir = os.getenv("USER_MODEL_DIR", "ml/models/user_models")

    conn = duckdb.connect(duckdb_path)
    frame = load_user_features(conn, args.user_id)
    conn.close()

    if frame.empty:
        print("❌ No formatting_features rows for this user.")
        return

    frame = frame.dropna(subset=["last_action"])
    if len(frame) < args.min_samples:
        print(f"❌ Not enough samples to train. Found {len(frame)}.")
        return

    if frame["last_action"].nunique() < args.min_labels:
        print("❌ Not enough distinct labels to train.")
        return

    feature_columns = select_feature_columns(frame)
    if not feature_columns:
        print("❌ No numeric feature columns found.")
        return

    model = train_user_model(frame, feature_columns)

    output_path = os.path.join(output_dir, f"user_{args.user_id}.pkl")
    save_user_model(model, feature_columns, output_path)

    print(f"✅ User model saved: {output_path}")
    print(f"✅ Trained on {len(frame)} samples with labels: {frame['last_action'].nunique()}")


if __name__ == "__main__":
    main()
