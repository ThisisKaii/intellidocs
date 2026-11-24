"""Supervised fine-tuning of one user's formatting model for one genre, from their labeled feedback.

Each example is a block the user gave feedback on: an accepted suggestion labels the block with the
suggested format, a rejected one with the format the block kept. The examples arrive as the same
feature rows /predict builds for a block (ml/src/main.py build_feature_row), so the user's
RandomForest learns in exactly the space the base model predicts in, and /predict can blend the two
(user_forest.blend). This is supervised learning on labeled examples: no reinforcement learning,
policy gradients or reward functions.

usage: python training/fine_tuner.py --user-id <uuid> --genre <genre> --examples <examples.json>
  examples.json: {"feature_columns": [...], "rows": [[...], ...], "labels": [...]}

The model is saved under USER_MODEL_DIR (default ml/models/user_models) and uploaded to the
`user-models` Supabase Storage bucket, where /predict reads it (the ML host's disk does not survive
a redeploy).
"""

import argparse
import json
import os
import pickle
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List

import pandas as pd
from sklearn.ensemble import RandomForestClassifier

# The shared helpers live one folder up; make them importable when run as a script.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import duckdb_store  # noqa: E402

# Fewer labeled blocks than this, or a single label, teach a model nothing worth blending in.
MIN_EXAMPLES = 5
MIN_LABELS = 2


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fine-tune one user's formatting model for one genre from labeled feedback.")
    parser.add_argument("--user-id", required=True, help="Supabase user_id (UUID)")
    parser.add_argument("--genre", required=True, choices=duckdb_store.GENRES, help="Genre partition the examples belong to")
    parser.add_argument("--examples", required=True, help="JSON file of feature rows and labels")
    return parser.parse_args()


def can_train(labels: List[str]) -> bool:
    return len(labels) >= MIN_EXAMPLES and len(set(labels)) >= MIN_LABELS


def train_user_forest(feature_columns: List[str], rows: List[List[float]], labels: List[str]) -> Dict[str, Any]:
    """The user's RandomForest and what /predict needs to blend it: its features and example count."""
    frame = pd.DataFrame(rows, columns=feature_columns)
    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=8,
        min_samples_leaf=1,
        class_weight="balanced",
        random_state=42,
    )
    model.fit(frame, labels)
    return {
        "model": model,
        "feature_columns": list(feature_columns),
        "n_examples": len(labels),
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }


def user_forest_path(output_dir: str, user_id: str, genre: str) -> str:
    return os.path.join(output_dir, f"user_{user_id}__{genre}.forest.pkl")


def main() -> None:
    args = parse_args()
    with open(args.examples, encoding="utf-8") as handle:
        data = json.load(handle)
    labels = [str(label) for label in data["labels"]]
    if not can_train(labels):
        print(f"Not enough labeled feedback to train: {len(labels)} examples, {len(set(labels))} labels.")
        return

    payload = train_user_forest(data["feature_columns"], data["rows"], labels)
    output_dir = os.getenv("USER_MODEL_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "models", "user_models"))
    os.makedirs(output_dir, exist_ok=True)
    output_path = user_forest_path(output_dir, args.user_id, args.genre)
    with open(output_path, "wb") as handle:
        pickle.dump(payload, handle)
    print(f"Fine-tuned on {len(labels)} labeled blocks ({len(set(labels))} formats): {output_path}")

    import storage

    if storage.upload_user_forest(output_path, args.user_id, args.genre):
        print("Uploaded to Supabase Storage.")


if __name__ == "__main__":
    main()
