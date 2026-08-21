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
    """Load primary manuscript training data from processed CSV datasets."""
    candidate_paths = [
        "ml/dataset/processed/formatting_examples_merged.csv",
        "dataset/processed/formatting_examples_merged.csv",
        "ml/dataset/processed/academic_paper_formatting_examples.csv",
        "dataset/processed/academic_paper_formatting_examples.csv",
        csv_path,
    ]

    found_path = None
    for path in candidate_paths:
        if os.path.exists(path):
            found_path = path
            break

    if not found_path:
        # Fallback to direct extraction if missing
        manuscript_files = load_manuscript_files(MANUSCRIPT_DIR)
        if manuscript_files:
            print(f"Loading manuscript documents from: {manuscript_files}")
            from dataset.extract_academic_papers import extract_academic_examples
            return extract_academic_examples(MANUSCRIPT_DIR)
        raise FileNotFoundError(f"No processed training CSV found in candidate paths.")

    print(f"Loading training dataset from: {found_path}")
    dataframe = pd.read_csv(found_path)
    if dataframe.empty:
        raise ValueError("Training dataset is empty.")

    if "label" not in dataframe.columns:
        raise ValueError("Training dataset must include a 'label' column.")

    return dataframe


def select_feature_columns(dataframe: pd.DataFrame) -> list[str]:
    """Select numeric feature columns used for model training."""
    excluded = {"label", "text", "split", "source", "source_file", "context", "page_type"}
    return [
        column
        for column in dataframe.columns
        if column not in excluded and pd.api.types.is_numeric_dtype(dataframe[column])
    ]


def train_model(
    x_train: pd.DataFrame,
    y_train: pd.Series,
    sample_weights: pd.Series | None = None,
) -> RandomForestClassifier:
    """Train a baseline formatting classifier with sample weights."""
    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=14,
        min_samples_split=4,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
    )
    model.fit(x_train, y_train, sample_weight=sample_weights)
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
    default_dataset = "ml/dataset/processed/formatting_examples_merged.csv" if os.path.exists("ml/dataset") else "dataset/processed/formatting_examples_merged.csv"
    default_output = "ml/models/base_model.pkl" if os.path.exists("ml/models") else "models/base_model.pkl"

    dataset_path = os.getenv("FORMATTING_DATASET_PATH", default_dataset)
    output_path = os.getenv("BASE_MODEL_PATH", default_output)

    dataframe = load_training_data(dataset_path)
    feature_columns = select_feature_columns(dataframe)


    if not feature_columns:
        raise ValueError("No numeric feature columns found for training.")

    # Fill NaN values in numeric feature columns
    dataframe[feature_columns] = dataframe[feature_columns].fillna(0)

    # Compute sample weights: Academic samples get 3.0x weight, WikiText gets 1.0x
    sample_weights = dataframe.apply(
        lambda row: 3.0 if str(row.get("split", "")).lower() == "academic" or "academic" in str(row.get("source", "")).lower() else 1.0,
        axis=1,
    )

    x_train, x_valid, y_train, y_valid, w_train, w_valid = train_test_split(
        dataframe[feature_columns],
        dataframe["label"],
        sample_weights,
        test_size=0.2,
        random_state=42,
        stratify=dataframe["label"] if dataframe["label"].nunique() > 1 else None,
    )

    model = train_model(x_train, y_train, sample_weights=w_train)
    accuracy = evaluate_model(model, x_valid, y_valid)

    save_model(model, feature_columns, output_path)

    print("[OK] Base formatting model trained on research manuscript data.")
    print(f"Features used ({len(feature_columns)}): {feature_columns}")
    print(f"Validation accuracy: {accuracy:.4f}")
    print(f"Saved model to: {output_path}")


if __name__ == "__main__":
    main()