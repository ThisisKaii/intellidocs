import argparse
import os
import pickle
from datetime import datetime, timezone
from typing import List, Tuple

import duckdb
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim

# Map format action names to integer indices for LSTM embedding
ACTION_VOCAB = [
    "<PAD>",
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "heading1",
    "heading2",
    "heading3",
    "heading4",
    "heading5",
    "heading6",
    "unordered_list",
    "ordered_list",
    "blockquote",
    "code_block",
    "paragraph",
    "indent",
    "outdent",
]

ACTION_TO_IDX = {action: idx for idx, action in enumerate(ACTION_VOCAB)}
IDX_TO_ACTION = {idx: action for idx, action in enumerate(ACTION_VOCAB)}


class FormattingLSTM(nn.Module):
    """LSTM model for sequential formatting pattern prediction."""

    def __init__(self, vocab_size: int, embed_dim: int = 16, hidden_dim: int = 32):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embed_dim, padding_idx=0)
        self.lstm = nn.LSTM(embed_dim, hidden_dim, batch_first=True)
        self.fc = nn.Linear(hidden_dim, vocab_size)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x shape: (batch_size, sequence_length)
        embeds = self.embedding(x)
        lstm_out, (hn, _) = self.lstm(embeds)
        # Use last hidden state for sequence classification
        last_hidden = hn[-1]
        logits = self.fc(last_hidden)
        return logits


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for training user LSTM model."""
    parser = argparse.ArgumentParser(
        description="Train sequence-based LSTM model on user formatting history."
    )
    parser.add_argument("--user-id", required=True, help="Supabase user_id (UUID)")
    parser.add_argument(
        "--seq-len", type=int, default=5, help="Length of past action sequence"
    )
    parser.add_argument(
        "--epochs", type=int, default=50, help="Training epochs"
    )
    return parser.parse_args()


def load_user_action_sequences(
    conn: duckdb.DuckDBPyConnection, user_id: str, seq_len: int
) -> Tuple[torch.Tensor, torch.Tensor]:
    """Load chronologically ordered user formatting actions from DuckDB and build (input_seq, target_action) pairs."""
    query = """
    SELECT action, event_ts
    FROM behavior_events
    WHERE user_id = ?
    ORDER BY event_ts ASC
    """
    df = conn.execute(query, [user_id]).fetchdf()

    if df.empty or len(df) <= seq_len:
        return torch.tensor([]), torch.tensor([])

    actions = [
        ACTION_TO_IDX.get(act, 0) for act in df["action"] if act in ACTION_TO_IDX
    ]

    if len(actions) <= seq_len:
        return torch.tensor([]), torch.tensor([])

    x_seqs = []
    y_targets = []
    for i in range(len(actions) - seq_len):
        x_seqs.append(actions[i : i + seq_len])
        y_targets.append(actions[i + seq_len])

    return torch.tensor(x_seqs, dtype=torch.long), torch.tensor(
        y_targets, dtype=torch.long
    )


def train_lstm_model(
    x_data: torch.Tensor, y_data: torch.Tensor, epochs: int = 50
) -> FormattingLSTM:
    """Train the PyTorch LSTM model on sequence pairs."""
    model = FormattingLSTM(vocab_size=len(ACTION_VOCAB))
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=0.01)

    model.train()
    for epoch in range(epochs):
        optimizer.zero_grad()
        output = model(x_data)
        loss = criterion(output, y_data)
        loss.backward()
        optimizer.step()

    return model


def save_lstm_model(
    model: FormattingLSTM, user_id: str, output_dir: str = "ml/models/lstm"
) -> str:
    """Save user-specific PyTorch LSTM model weights and metadata to disk."""
    os.makedirs(output_dir, exist_ok=True)
    file_path = os.path.join(output_dir, f"user_{user_id}.pt")

    payload = {
        "state_dict": model.state_dict(),
        "vocab": ACTION_VOCAB,
        "action_to_idx": ACTION_TO_IDX,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }
    torch.save(payload, file_path)
    return file_path


def main() -> None:
    """Main CLI entrypoint for LSTM model training."""
    args = parse_args()
    duckdb_path = os.getenv("DUCKDB_PATH", "db/duckdb/behavior.duckdb")

    if not os.path.exists(duckdb_path):
        print(f"❌ DuckDB database not found at {duckdb_path}")
        return

    conn = duckdb.connect(duckdb_path)
    x_data, y_data = load_user_action_sequences(conn, args.user_id, args.seq_len)
    conn.close()

    if x_data.numel() == 0:
        print(f"❌ Not enough sequence data for user {args.user_id} to train LSTM.")
        return

    model = train_lstm_model(x_data, y_data, epochs=args.epochs)
    output_path = save_lstm_model(model, args.user_id)
    print(f"✅ LSTM sequence model saved to: {output_path}")


if __name__ == "__main__":
    main()
