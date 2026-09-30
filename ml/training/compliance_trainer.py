"""
Train the Tier 2 compliance models from the pre-trained formatting corpus.

Two artifacts are produced under ml/models/compliance/:

  style_model.pkl  RandomForest that predicts a block's formatting style from
                   the same numeric features used at inference time
                   (compliance_auditor.style_features).
  flow_model.pt    LSTM that predicts the next style in a document, trained on
                   real style sequences harvested from the corpus.

Both read ml/dataset/processed/formatting_examples.csv, the table built from
WikiText-103 plus the other pre-training corpora, so the compliance tier is
trained on the same pre-trained data as the formatting predictor rather than
on rules of thumb.

The run is checkpointed (training/checkpoint.py) after every phase and inside
the two slow phases, so an interrupted run resumes instead of restarting:
feature extraction restarts from the last saved row, and the LSTM restarts
from the last completed epoch. Pass --force to discard progress and retrain.
"""
from __future__ import annotations

import argparse
import json
import os
import pickle
import sys
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.ensemble import RandomForestClassifier

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from grammar.compliance_auditor import FEATURE_NAMES, STYLE_CLASSES, style_features
from training.checkpoint import STATUS_RUNNING, TrainingCheckpoint

OUTPUT_DIR = ROOT_DIR / "models" / "compliance"
DEFAULT_DATASET = ROOT_DIR / "dataset" / "processed" / "formatting_examples.csv"

# Cap the sample so training stays inside a capstone-sized time budget; the
# corpus has over a million rows and the style distribution saturates early.
DEFAULT_SAMPLE_ROWS = 150_000
STYLE_WEIGHT = "sample_weight"
PAD_TOKEN = 0
MAX_SEQUENCE_LENGTH = 64

CHECKPOINT_NAME = "compliance"
# How often the partial feature matrix and the LSTM epoch state are written.
FEATURE_FLUSH_ROWS = 5_000


class ComplianceLSTM(nn.Module):
    """
    Predict the next formatting style from the styles that came before it.

    Index 0 of the vocabulary is the padding token, so an unknown style falls
    back to padding and contributes nothing to the prediction.
    """

    def __init__(
        self,
        vocab_size: int,
        hidden_size: int = 64,
        num_layers: int = 1,
        dropout: float = 0.1,
    ) -> None:
        """Build the embedding, LSTM, and output projection layers."""
        super().__init__()
        self.hidden_size = hidden_size
        self.embedding = nn.Embedding(vocab_size, hidden_size, padding_idx=PAD_TOKEN)
        self.lstm = nn.LSTM(
            hidden_size,
            hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.dropout = nn.Dropout(dropout)
        self.output = nn.Linear(hidden_size, vocab_size)

    def forward(self, sequences: torch.Tensor) -> torch.Tensor:
        """Return next-style logits for a batch of style-index sequences."""
        embedded = self.embedding(sequences)
        outputs, _ = self.lstm(embedded)
        return self.output(self.dropout(outputs[:, -1, :]))


def build_vocabulary(sequences: list[list[str]], classes: tuple[str, ...]) -> dict[str, int]:
    """Assign index 0 to padding and give every known style a stable index."""
    vocab = {"__pad__": PAD_TOKEN}
    for style in classes:
        vocab[style] = len(vocab)
    return vocab


def harvest_style_sequences(
    frame: pd.DataFrame, max_sequences: int
) -> list[list[str]]:
    """
    Group consecutive blocks of the same source document into style sequences.

    The corpus is ordered, so rows that follow one another form a plausible
    document outline. Sequences shorter than three steps carry too little signal
    to teach document flow.
    """
    sequences: list[list[str]] = []
    current: list[str] = []

    labels = frame["label"].astype(str).tolist()
    for label in labels:
        if not current or label == current[-1] or len(current) < 64:
            current.append(label)
            continue
        if len(current) >= 3:
            sequences.append(current)
            if len(sequences) >= max_sequences:
                return sequences
        current = [label]

    if len(current) >= 3:
        sequences.append(current)
    return sequences


def encode_sequences(
    sequences: list[list[str]], vocab: dict[str, int]
) -> tuple[torch.Tensor, torch.Tensor]:
    """Turn style sequences into padded input/target tensors."""
    inputs: list[list[int]] = []
    targets: list[int] = []

    for sequence in sequences:
        indices = [vocab.get(style, PAD_TOKEN) for style in sequence]
        for position in range(len(indices) - 1):
            window = indices[max(0, position - MAX_SEQUENCE_LENGTH + 1):position + 1]
            inputs.append(window)
            targets.append(indices[position + 1])

    padded = torch.full(
        (len(inputs), MAX_SEQUENCE_LENGTH), PAD_TOKEN, dtype=torch.long
    )
    for row, window in enumerate(inputs):
        padded[row, MAX_SEQUENCE_LENGTH - len(window):] = torch.tensor(window, dtype=torch.long)

    return padded, torch.tensor(targets, dtype=torch.long)


def build_features_resumable(
    frame: pd.DataFrame,
    checkpoint: TrainingCheckpoint,
    flush_rows: int = FEATURE_FLUSH_ROWS,
) -> pd.DataFrame:
    """
    Build the style feature matrix, checkpointing partial progress.

    Feature extraction is the slowest phase because every row is scanned
    character by character. The partial matrix is written to the checkpoint
    work directory every `flush_rows` rows, so an interrupted run continues
    from the last flush instead of starting over.
    """
    columns = list(FEATURE_NAMES)
    total = len(frame)
    partial_path = checkpoint.work_dir / "features_partial.parquet"
    checkpoint.work_dir.mkdir(parents=True, exist_ok=True)

    start_index = 0
    collected: list[dict[str, float]] = []

    if partial_path.is_file():
        try:
            partial = pd.read_parquet(partial_path)
            if list(partial.columns) == columns and 0 < len(partial) <= total:
                collected = partial.to_dict("records")
                start_index = len(collected)
                print(f"[resume] loaded {start_index:,} cached feature rows")
        except Exception as error:  # noqa: BLE001 - a bad cache just restarts the phase
            print(f"⚠️ Ignoring unreadable feature cache: {error}")
            collected = []
            start_index = 0

    if start_index >= total:
        print(f"[resume] all {total:,} feature rows already extracted")
        return pd.DataFrame(collected, columns=columns)

    texts = frame["text"].astype(str).tolist()
    for index in range(start_index, total):
        collected.append(style_features(texts[index]))

        done = index + 1
        if done % flush_rows == 0 or done == total:
            pd.DataFrame(collected, columns=columns).to_parquet(partial_path, index=False)
            checkpoint.save(
                "features",
                step=done,
                total_steps=total,
                metrics={"rows": done},
                note=f"extracted {done:,}/{total:,} feature rows",
                status=STATUS_RUNNING,
            )
            print(f"  features {done:,}/{total:,} ({100.0 * done / total:.1f}%)")

    features = pd.DataFrame(collected, columns=columns)
    if partial_path.is_file():
        partial_path.unlink()
    return features


def train_style_model(
    features: pd.DataFrame, labels: pd.Series, output_path: Path, trees: int
) -> dict[str, Any]:
    """Fit the RandomForest paragraph-style classifier and persist it."""
    # Balance the classes: 'paragraph' is 80% of the corpus, which would let the
    # model score a high agreement rate by always predicting it.
    counts = labels.value_counts()
    weights = {
        label: float(len(labels) / (len(counts) * count))
        for label, count in counts.items()
    }
    sample_weight = labels.map(weights).astype(float).tolist()

    model = RandomForestClassifier(
        n_estimators=trees,
        max_depth=18,
        min_samples_leaf=3,
        n_jobs=-1,
        class_weight="balanced_subsample",
        random_state=42,
    )
    model.fit(features, labels, sample_weight=sample_weight)
    accuracy = float(model.score(features, labels))

    with open(output_path, "wb") as handle:
        pickle.dump(
            {
                "model": model,
                "classes": [str(item) for item in model.classes_],
                "feature_names": list(FEATURE_NAMES),
                "trained_on": int(len(features)),
            },
            handle,
        )

    print(f"[OK] style_model.pkl  accuracy={accuracy:.4f}  classes={len(model.classes_)}")
    return {"accuracy": accuracy, "classes": [str(item) for item in model.classes_]}


def train_flow_model(
    sequences: list[list[str]],
    output_path: Path,
    epochs: int,
    checkpoint: TrainingCheckpoint,
) -> dict[str, Any]:
    """
    Fit the LSTM next-style model, checkpointing after every epoch.

    Model weights and optimiser state are written to the checkpoint work
    directory each epoch, so a cancelled run resumes at the next epoch rather
    than retraining from scratch.
    """
    vocab = build_vocabulary(sequences, STYLE_CLASSES)
    inputs, targets = encode_sequences(sequences, vocab)
    print(f"Training flow model on {len(inputs):,} transitions, vocab={len(vocab)}...")

    state_path = checkpoint.work_dir / "flow_state.pt"
    model = ComplianceLSTM(vocab_size=len(vocab))
    criterion = nn.CrossEntropyLoss()
    optimiser = torch.optim.Adam(model.parameters(), lr=0.01)
    start_epoch = 0

    if state_path.is_file():
        try:
            state = torch.load(state_path, map_location=torch.device("cpu"))
            if state.get("vocab") == vocab:
                model.load_state_dict(state["state_dict"])
                optimiser.load_state_dict(state["optimiser_state"])
                start_epoch = int(state.get("epochs_done", 0))
                print(f"[resume] continuing LSTM training at epoch {start_epoch + 1}")
            else:
                print("⚠️ Discarding stale LSTM state (vocabulary changed)")
        except Exception as error:  # noqa: BLE001 - a bad cache just restarts the phase
            print(f"⚠️ Ignoring unreadable LSTM state: {error}")

    checkpoint.work_dir.mkdir(parents=True, exist_ok=True)
    accuracy = 0.0

    model.train()
    for epoch in range(start_epoch, epochs):
        optimiser.zero_grad()
        logits = model(inputs)
        loss = criterion(logits, targets)
        loss.backward()
        optimiser.step()
        accuracy = float((logits.argmax(dim=1) == targets).float().mean())
        print(f"  epoch {epoch + 1}/{epochs}  loss={loss.item():.4f}  accuracy={accuracy:.4f}")

        torch.save(
            {
                "state_dict": model.state_dict(),
                "optimiser_state": optimiser.state_dict(),
                "vocab": vocab,
                "epochs_done": epoch + 1,
            },
            state_path,
        )
        checkpoint.save(
            "flow_model",
            step=epoch + 1,
            total_steps=epochs,
            metrics={"loss": round(loss.item(), 4), "accuracy": round(accuracy, 4)},
            note=f"LSTM epoch {epoch + 1}/{epochs}",
            status=STATUS_RUNNING,
        )

    model.eval()
    torch.save(
        {
            "state_dict": model.state_dict(),
            "vocab": vocab,
            "hidden_size": model.hidden_size,
            "num_layers": model.lstm.num_layers,
        },
        output_path,
    )
    if state_path.is_file():
        state_path.unlink()
    print(f"[OK] flow_model.pt  transitions={len(inputs):,}  accuracy={accuracy:.4f}")
    return {
        "transitions": int(len(inputs)),
        "vocab": len(vocab),
        "accuracy": round(accuracy, 4),
    }


def load_corpus(path: Path, sample_rows: int) -> pd.DataFrame:
    """Read the formatting corpus, keeping only styles the model can predict."""
    if not path.exists():
        raise SystemExit(
            f"Missing dataset: {path}\nRun ml/dataset/preprocess.py first."
        )
    print(f"Reading {path}...")
    frame = pd.read_csv(path, usecols=["text", "label"])
    frame = frame[frame["label"].isin(STYLE_CLASSES)]
    frame = frame[frame["text"].astype(str).str.strip().ne("")]
    frame = frame.drop_duplicates(subset=["text", "label"])
    if len(frame) > sample_rows:
        frame = frame.sample(n=sample_rows, random_state=42)
    return frame.reset_index(drop=True)


def save_sequences(sequences: list[list[str]], path: Path) -> None:
    """Persist harvested style sequences so the flow phase can be resumed alone."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(sequences, handle)


def load_sequences(path: Path) -> list[list[str]]:
    """Read previously harvested style sequences, or an empty list."""
    if not path.is_file():
        return []
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (json.JSONDecodeError, OSError) as error:
        print(f"⚠️ Ignoring unreadable sequence cache: {error}")
        return []


def main() -> None:
    """Train both Tier 2 compliance models from the pre-trained corpus."""
    parser = argparse.ArgumentParser(description="Train the compliance Tier 2 models")
    parser.add_argument("--dataset", default=str(DEFAULT_DATASET))
    parser.add_argument("--rows", type=int, default=DEFAULT_SAMPLE_ROWS)
    parser.add_argument("--trees", type=int, default=120)
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--sequences", type=int, default=4000)
    parser.add_argument(
        "--force",
        action="store_true",
        help="discard any existing checkpoint and retrain from scratch",
    )
    args = parser.parse_args()

    checkpoint = TrainingCheckpoint(CHECKPOINT_NAME)
    if args.force:
        checkpoint.clear()
        print("[checkpoint] cleared, training from scratch")
    state = checkpoint.announce()

    if state and state.get("status") == "complete" and not args.force:
        print("Nothing to do: the compliance models are already trained.")
        print("Re-run with --force to retrain them.")
        return

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    try:
        # Phase 1 — corpus sample.
        checkpoint.save("corpus", step=0, total_steps=1, note="loading corpus sample")
        frame = load_corpus(Path(args.dataset), args.rows)
        print(f"Corpus sample: {len(frame):,} rows")
        print(frame["label"].value_counts().to_string())
        checkpoint.save(
            "features", step=0, total_steps=len(frame),
            metrics={"corpus_rows": int(len(frame))},
            note="corpus loaded, extracting features",
            status=STATUS_RUNNING,
        )

        # Phase 2 — feature extraction (resumable, the slowest phase).
        features = build_features_resumable(frame, checkpoint)
        print(f"Feature matrix ready: {features.shape}")

        # Phase 3 — RandomForest style model.
        checkpoint.save("style_model", step=0, total_steps=1, note="fitting RandomForest")
        style_stats = train_style_model(
            features, frame["label"].astype(str), OUTPUT_DIR / "style_model.pkl", args.trees
        )

        # Phase 4 — harvest style sequences for the flow model.
        sequences_path = checkpoint.work_dir / "sequences.json"
        checkpoint.save("sequences", step=0, total_steps=1, note="harvesting sequences")
        sequences = load_sequences(sequences_path)
        if sequences:
            print(f"[resume] reusing {len(sequences)} harvested sequences")
        else:
            sequences = harvest_style_sequences(frame, args.sequences)
            print(f"Harvested {len(sequences)} style sequences")
            save_sequences(sequences, sequences_path)

        # Phase 5 — LSTM flow model (resumable per epoch).
        flow_stats = train_flow_model(
            sequences, OUTPUT_DIR / "flow_model.pt", args.epochs, checkpoint
        )

        metrics = {
            "style_accuracy": style_stats["accuracy"],
            "style_classes": style_stats["classes"],
            "flow_transitions": flow_stats["transitions"],
            "flow_accuracy": flow_stats["accuracy"],
            "corpus_rows": int(len(frame)),
        }
        checkpoint.done(metrics=metrics, note="compliance models trained")
        if sequences_path.is_file():
            sequences_path.unlink()

    except KeyboardInterrupt:
        checkpoint.save(
            "interrupted", note="cancelled by user; re-run to resume",
            status=STATUS_RUNNING,
        )
        print("\n[checkpoint] interrupted. Re-run the same command to resume.")
        raise SystemExit(130)
    except Exception as error:
        checkpoint.failed("error", str(error))
        print(f"[checkpoint] failed: {error}")
        raise

    print("\nTraining complete")
    print(f"  style accuracy  : {style_stats['accuracy']:.4f}")
    print(f"  flow transitions: {flow_stats['transitions']:,}")
    print(f"  flow accuracy   : {flow_stats['accuracy']:.4f}")
    print(f"  artifacts       : {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
