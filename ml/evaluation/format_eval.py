import os
import pickle
import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split


DATASET_PATH = os.getenv(
    "FORMATTING_DATASET_PATH",
    "ml/dataset/processed/formatting_examples.csv",
)
MODEL_PATH = os.getenv(
    "BASE_MODEL_PATH",
    "ml/models/base_model.pkl",
)


def load_model(path: str) -> dict:
    """Load model + feature columns."""
    with open(path, "rb") as handle:
        payload = pickle.load(handle)
    return payload


def select_eval_frame(frame: pd.DataFrame) -> pd.DataFrame:
    """Select validation/test split if present; otherwise use holdout."""
    if "split" in frame.columns:
        eval_frame = frame[frame["split"].isin(["validation", "test"])]
        if eval_frame.empty:
            eval_frame = frame[frame["split"] != "train"]
        return eval_frame.copy()

    _, eval_frame = train_test_split(frame, test_size=0.2, random_state=42)
    return eval_frame.copy()


def main() -> None:
    """Evaluate formatting prediction model."""
    frame = pd.read_csv(DATASET_PATH)
    payload = load_model(MODEL_PATH)

    feature_columns = payload["feature_columns"]
    model = payload["model"]

    eval_frame = select_eval_frame(frame)

    x_eval = eval_frame[feature_columns].copy()
    y_true = eval_frame["label"]

    y_pred = model.predict(x_eval)

    print("=== Label Distribution (Eval) ===")
    print(y_true.value_counts())
    print("\n=== Classification Report ===")
    print(classification_report(y_true, y_pred, zero_division=0))

    print("\n=== Confusion Matrix ===")
    labels = sorted(y_true.unique().tolist())
    matrix = confusion_matrix(y_true, y_pred, labels=labels)
    print("Labels:", labels)
    print(matrix)


if __name__ == "__main__":
    main()
