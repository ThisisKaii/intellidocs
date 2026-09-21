"""Fine-tune a DistilBERT sequence classifier on formatting examples and export an INT8 ONNX model.

This is the Tier-3 (deep) learner in the hybrid formatting cascade:

    Tier 1: regex rules          (~0ms, inline in main.py)
    Tier 2: RandomForest         (~2ms, base_model.pkl)
    Tier 3: DistilBERT INT8 ONNX (~20ms, onnxruntime) -- this script

Training data is `ml/dataset/processed/formatting_examples_merged.csv` (text +
label columns). The Quantized INT8 model is written to `ml/models/` and can be
uploaded to the `ml-models` Supabase Storage bucket with `--upload` so the API
streams it into the temp cache at startup.
"""

import argparse
import glob
import json
import os
import shutil
import sys
from pathlib import Path

import pandas as pd
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

MODEL_NAME = "distilbert-base-uncased"
DEFAULT_DATASET = str(ROOT_DIR / "dataset" / "processed" / "formatting_examples_merged.csv")
DEFAULT_OUT = str(ROOT_DIR / "models" / "distilbert_int8.onnx")
DEFAULT_LABELS_OUT = str(ROOT_DIR / "models" / "distilbert_labels.json")
DEFAULT_CHECKPOINT_DIR = str(ROOT_DIR / "models" / "distilbert_checkpoints")


def find_latest_checkpoint(checkpoint_dir: str) -> str | None:
    """Return the most recently written `checkpoint-*` folder, or None."""
    if not os.path.isdir(checkpoint_dir):
        return None
    matches = sorted(
        glob.glob(os.path.join(checkpoint_dir, "checkpoint-*")),
        key=os.path.getmtime,
    )
    return matches[-1] if matches else None


def load_training_data(csv_path: str) -> pd.DataFrame:
    """Load the merged formatting-examples CSV, requiring text + label columns."""
    candidate_paths = [
        csv_path,
        "ml/dataset/processed/formatting_examples_merged.csv",
        "dataset/processed/formatting_examples_merged.csv",
    ]
    found = next((p for p in candidate_paths if os.path.exists(p)), None)
    if not found:
        raise FileNotFoundError(
            f"No DistilBERT training CSV found; tried {candidate_paths}"
        )
    print(f"Loading training dataset from: {found}")
    df = pd.read_csv(found)
    if "text" not in df.columns or "label" not in df.columns:
        raise ValueError("Training dataset must include 'text' and 'label' columns.")
    return df.dropna(subset=["text", "label"])


def build_label_map(df: pd.DataFrame) -> dict[str, int]:
    """Return a sorted {label: id} map so predictions map back to format names."""
    return {label: idx for idx, label in enumerate(sorted(df["label"].unique()))}


def train_model(
    x_train: list[str],
    y_train: list[int],
    x_valid: list[str],
    y_valid: list[int],
    label_map: dict[str, int],
    epochs: int,
    batch_size: int,
    model_out_dir: str,
    resume_from_checkpoint: str | None = None,
) -> float:
    """Fine-tune DistilBERT and export a dynamic-quantized INT8 ONNX model; return validation accuracy.

    Checkpoints are written to `model_out_dir` every 100 steps and kept on disk
    so an interrupted run can be resumed later via `resume_from_checkpoint`.
    """
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        Trainer,
        TrainingArguments,
    )

    id2label = {idx: label for label, idx in label_map.items()}

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=len(label_map),
        id2label=id2label,
        label2id=label_map,
    )

    def tokenize(examples: list[str]):
        return tokenizer(
            examples, truncation=True, padding=True, max_length=128
        )

    encoded_train = tokenize(x_train)
    encoded_valid = tokenize(x_valid)

    # Build a small Dataset-compatible object so import_errors are contained.
    import torch

    class TextDataset(torch.utils.data.Dataset):
        def __init__(self, encodings, labels):
            self.encodings = encodings
            self.labels = labels

        def __getitem__(self, index):
            item = {k: torch.tensor(v[index]) for k, v in self.encodings.items()}
            item["labels"] = torch.tensor(self.labels[index], dtype=torch.long)
            return item

        def __len__(self):
            return len(self.labels)

    train_dataset = TextDataset(encoded_train, y_train)
    valid_dataset = TextDataset(encoded_valid, y_valid)

    training_args = TrainingArguments(
        output_dir=model_out_dir,
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size,
        eval_strategy="epoch",
        save_strategy="steps",
        save_steps=100,
        logging_steps=20,
        fp16=torch.cuda.is_available(),
        save_total_limit=3,
        seed=42,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=valid_dataset,
    )

    if resume_from_checkpoint:
        print(f"Resuming training from checkpoint: {resume_from_checkpoint}")
    trainer.train(resume_from_checkpoint=resume_from_checkpoint)

    logits = trainer.predict(valid_dataset).predictions
    trainer.save_model(model_out_dir)
    tokenizer.save_pretrained(os.path.join(model_out_dir, "tokenizer"))
    return accuracy_score(y_valid, logits.argmax(axis=1).tolist())


def export_onnx(model_out_dir: str, quantized_path: str) -> None:
    """Export the fine-tuned checkpoint to ONNX and dynamic-quantize it to INT8."""
    from optimum.onnxruntime import ORTModelForSequenceClassification

    print(f"Exporting ONNX from {model_out_dir} ...")
    ort_model = ORTModelForSequenceClassification.from_pretrained(model_out_dir, export=True)
    fp32_path = str(ROOT_DIR / "models" / "model.onnx")
    ort_model.save_pretrained(str(ROOT_DIR / "models"))
    os.makedirs(os.path.dirname(quantized_path), exist_ok=True)

    from onnxruntime.quantization import QuantType, quantize_dynamic

    quantize_dynamic(fp32_path, quantized_path, weight_type=QuantType.QInt8)
    print(f"INT8 quantized model written to {quantized_path}")


def cap_dataset(df: pd.DataFrame, max_rows: int) -> pd.DataFrame:
    """Subsample the majority classes while keeping every rare label intact.

    Each label contributes at most `max_rows // num_labels` rows; classes
    smaller than that cap are kept whole. Returns the original frame when
    `max_rows` is 0 or the frame already fits.
    """
    if max_rows <= 0 or len(df) <= max_rows:
        return df
    target_each = max(1, max_rows // df["label"].nunique())
    parts = [
        group.sample(n=min(len(group), target_each), random_state=42)
        for _, group in df.groupby("label")
    ]
    result = pd.concat(parts, ignore_index=True)
    if len(result) > max_rows:
        result = result.sample(n=max_rows, random_state=42)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", default=os.getenv("FORMATTING_DATASET_PATH", DEFAULT_DATASET))
    parser.add_argument("--out", default=os.getenv("DISTILBERT_OUT_PATH", DEFAULT_OUT))
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument(
        "--max-rows",
        type=int,
        default=0,
        help="Cap training rows by subsampling majority labels (0 = no cap)",
    )
    parser.add_argument(
        "--checkpoint-dir",
        default=os.getenv("DISTILBERT_CHECKPOINT_DIR", DEFAULT_CHECKPOINT_DIR),
        help="Persistent checkpoint folder; a cancelled run resumes from the latest one",
    )
    parser.add_argument("--upload", action="store_true", help="Upload artifacts to Supabase ml-models bucket")
    args = parser.parse_args()

    df = cap_dataset(load_training_data(args.dataset), args.max_rows)
    if args.max_rows > 0 and len(df) < args.max_rows:
        print(f"Subsampled to {len(df)} rows while preserving all labels.")
    label_map = build_label_map(df)
    print(f"Labels ({len(label_map)}): {list(label_map)}")

    x_train, x_valid, y_train, y_valid = train_test_split(
        df["text"].tolist(),
        df["label"].map(label_map).tolist(),
        test_size=0.15,
        random_state=42,
        stratify=df["label"] if df["label"].nunique() > 1 else None,
    )

    labels_path = os.path.join(os.path.dirname(args.out), "distilbert_labels.json")
    tokenizer_out_dir = os.path.join(os.path.dirname(args.out), "distilbert_tokenizer")
    checkpoint_dir = args.checkpoint_dir
    os.makedirs(checkpoint_dir, exist_ok=True)
    resume_from = find_latest_checkpoint(checkpoint_dir)
    accuracy = train_model(
        x_train,
        y_train,
        x_valid,
        y_valid,
        label_map,
        args.epochs,
        args.batch_size,
        checkpoint_dir,
        resume_from_checkpoint=resume_from,
    )
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    export_onnx(checkpoint_dir, args.out)
    # Persist the tokenizer next to the quantized model so production
    # inference never needs to fetch it from HuggingFace at runtime.
    tokenizer_out = os.path.join(checkpoint_dir, "tokenizer")
    shutil.copytree(tokenizer_out, tokenizer_out_dir, dirs_exist_ok=True)
    print(f"Tokenizer saved to {tokenizer_out_dir}")

    with open(labels_path, "w", encoding="utf-8") as file_handle:
        json.dump({"label2id": label_map, "id2label": {str(v): k for k, v in label_map.items()}}, file_handle)
    print(f"Labels map written to {labels_path}")

    if args.upload:
        from storage import upload_base_onnx_model

        uploaded = upload_base_onnx_model(args.out, labels_path)
        print(f"[{'OK' if uploaded else 'FAILED'}] uploaded base ONNX to Supabase ml-models bucket")

    print(f"[OK] DistilBERT validation accuracy: {accuracy:.4f}")


if __name__ == "__main__":
    main()