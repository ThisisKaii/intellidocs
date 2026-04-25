import os
import pickle
from typing import cast

import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split


def load_training_data(csv_path: str) -> pd.DataFrame:
    """Load the processed formatting dataset from disk."""
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
    excluded = {"label", "text"}
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
        stratify=labels,
    )
    return cast(tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series], tuple(split))


def train_model(
    x_train: pd.DataFrame, y_train: pd.Series
) -> RandomForestClassifier:
    """Train a simple baseline formatting classifier."""
    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=12,
        min_samples_split=4,
        min_samples_leaf=2,
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
    """Train and save the base formatting model."""
    dataset_path = os.getenv(
        "FORMATTING_DATASET_PATH",
        "ml/dataset/processed/formatting_examples.csv",
    )
    output_path = os.getenv(
        "BASE_MODEL_PATH",
        "ml/models/base_model.pkl",
    )

    dataframe = load_training_data(dataset_path)
    feature_columns = select_feature_columns(dataframe)

    if not feature_columns:
        raise ValueError("No numeric feature columns found for training.")

    x_train, x_valid, y_train, y_valid = split_data(dataframe, feature_columns)
    model = train_model(x_train, y_train)
    accuracy = evaluate_model(model, x_valid, y_valid)

    save_model(model, feature_columns, output_path)

    print("✅ Base formatting model trained.")
    print(f"Validation accuracy: {accuracy:.4f}")
    print(f"Saved model to: {output_path}")


if __name__ == "__main__":
    main()