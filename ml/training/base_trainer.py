import glob
import os
import pickle
from typing import cast, List

import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split

MANUSCRIPT_DIR = os.getenv("MANUSCRIPT_DIR", "ml/dataset/manuscript")


def load_manuscript_files(manuscript_dir: str) -> List[str]:
    """Find manuscript documents (.pdf, .txt, .docx) in the manuscript folder."""
    if not os.path.exists(manuscript_dir):
        return []
    extensions = ["*.txt", "*.pdf", "*.docx"]
    files = []
    for ext in extensions:
        files.extend(glob.glob(os.path.join(manuscript_dir, ext)))
    return files


def extract_text_from_manuscript(file_path: str) -> List[str]:
    """Extract paragraphs or segments from a manuscript document."""
    lines = []
    if file_path.endswith(".txt"):
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = [line.strip() for line in f if line.strip()]
    elif file_path.endswith(".pdf"):
        try:
            import fitz  # PyMuPDF

            doc = fitz.open(file_path)
            for page in doc:
                text = page.get_text("text")
                for line in text.split("\n"):
                    if line.strip():
                        lines.append(line.strip())
        except Exception as e:
            print(f"⚠️ PyMuPDF extraction warning for {file_path}: {e}")
    return lines


def parse_manuscript_dataframe(file_paths: List[str]) -> pd.DataFrame:
    """Build a training DataFrame from manuscript text segments using feature extractor rules."""
    from dataset.preprocess import compute_features, infer_format_label

    rows = []
    for path in file_paths:
        segments = extract_text_from_manuscript(path)
        for seg in segments:
            label = infer_format_label(seg)
            row = {"text": seg, "label": label}
            row.update(compute_features(seg))
            rows.append(row)

    return pd.DataFrame(rows)


def load_training_data(csv_path: str) -> pd.DataFrame:
    """Load primary manuscript training data, falling back to processed CSV dataset if manuscript directory is empty."""
    manuscript_files = load_manuscript_files(MANUSCRIPT_DIR)

    if manuscript_files:
        print(f"📄 Training base model on manuscript documents: {manuscript_files}")
        df = parse_manuscript_dataframe(manuscript_files)
        if not df.empty and "label" in df.columns:
            return df
        print("⚠️ Manuscript extraction returned empty, falling back to historical CSV dataset.")

    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Training dataset not found: {csv_path}")

    dataframe = pd.read_csv(csv_path)
    if dataframe.empty:
        raise ValueError("Training dataset is empty.")

    if "label" not in dataframe.columns:
        raise ValueError("Training dataset must include a 'label' column.")

    return dataframe


def select_feature_columns(dataframe: pd.DataFrame) -> list[str]:
    """Select numeric feature columns used for model training."""
    excluded = {"label", "text", "split"}
    return [
        column
        for column in dataframe.columns
        if column not in excluded and pd.api.types.is_numeric_dtype(dataframe[column])
    ]


def split_data(
    dataframe: pd.DataFrame, feature_columns: list[str]
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
    """Split the dataset into train and validation sets."""
    features = dataframe[feature_columns]
    labels = dataframe["label"]

    split = train_test_split(
        features,
        labels,
        test_size=0.2,
        random_state=42,
        stratify=labels if labels.nunique() > 1 else None,
    )
    return cast(tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series], tuple(split))


def train_model(
    x_train: pd.DataFrame, y_train: pd.Series
) -> RandomForestClassifier:
    """Train a baseline formatting classifier."""
    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=12,
        min_samples_split=4,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
    )
    model.fit(x_train, y_train)
    return model


def evaluate_model(
    model: RandomForestClassifier,
    x_valid: pd.DataFrame,
    y_valid: pd.Series,
) -> float:
    """Evaluate the model on the validation split."""
    predictions = model.predict(x_valid)
    return accuracy_score(y_valid, predictions)


def save_model(
    model: RandomForestClassifier,
    feature_columns: list[str],
    output_path: str,
) -> None:
    """Save the trained model and metadata to disk."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    payload = {
        "model": model,
        "feature_columns": feature_columns,
    }

    with open(output_path, "wb") as file_handle:
        pickle.dump(payload, file_handle)


def main() -> None:
    """Train and save the base formatting model using paper/manuscript data."""
    dataset_path = os.getenv(
        "FORMATTING_DATASET_PATH",
        "dataset/processed/formatting_examples.csv",
    )
    output_path = os.getenv(
        "BASE_MODEL_PATH",
        "models/base_model.pkl",
    )

    dataframe = load_training_data(dataset_path)
    feature_columns = select_feature_columns(dataframe)

    if not feature_columns:
        raise ValueError("No numeric feature columns found for training.")

    x_train, x_valid, y_train, y_valid = split_data(dataframe, feature_columns)
    model = train_model(x_train, y_train)
    accuracy = evaluate_model(model, x_valid, y_valid)

    save_model(model, feature_columns, output_path)

    print("✅ Base formatting model trained on research manuscript data.")
    print(f"Validation accuracy: {accuracy:.4f}")
    print(f"Saved model to: {output_path}")


if __name__ == "__main__":
    main()